/* @vitest-environment jsdom */
/**
 * @fileoverview 値が後から入った入力欄の、外部ライブラリ連携への再同期を検証します。
 *
 * `data-each` で選択肢を描画する `<select>` では、`init` が描画の確定で呼ばれていた
 * ため、フォームの初期値の反映が `init` より後になっていました。`init` の時点の選択を
 * 自分の管理へ取り込む連携（`<option>` を移すものなど）は、後から入った値を知る手段が
 * ありませんでした（課題 44）。
 *
 * 期待値の根拠は仕様「`data-enhance`」の契機の表（「Haori が入力欄へ値を書き、値が
 * 実際に変わったとき」に `refresh`）。
 *
 * 課題 44 の修正は、値が入った時点の `refresh` だけでした。`<option>` を引き取る連携
 * では、書き込みで変わる `<option>` が無いため `refresh` が呼ばれず、初期値が
 * ウィジェットに出ないままでした（課題 54）。`data-each` で選択肢を描く `<select>` も、
 * `init` を初期値の反映の後に呼ぶようにしています（仕様「`data-enhance`」の
 * 「`data-each` で選択肢を描画する `<select>` も同じです」）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';
import {waitForDomSettled} from './helpers/async';

describe('後から入った値の連携への再同期', () => {
  let container: HTMLElement;
  let log: string[];

  beforeEach(() => {
    vi.restoreAllMocks();
    log = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    Haori.enhancers.register('recorder', {
      init(element) {
        log.push(`init:${describeSelect(element as HTMLSelectElement)}`);
        return {};
      },
      refresh(element) {
        log.push(`refresh:${describeSelect(element as HTMLSelectElement)}`);
      },
    });
  });

  afterEach(() => {
    container.remove();
  });

  /**
   * 連携から見た `<select>` の状態を文字列にします。
   *
   * @param select 対象の `<select>`
   * @returns 選択肢と選択値
   */
  const describeSelect = (select: HTMLSelectElement): string =>
    `[${Array.from(select.options)
      .map(option => option.value)
      .join(',')}]=${select.value}`;

  /**
   * 指定した HTML を走査して待ち合わせます。
   *
   * @param html 走査する HTML
   * @returns 走査の完了 Promise
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  it('data-each で選択肢を描く select でも、init の時点で初期値が入っている', async () => {
    await mount(`
      <form data-bind='{"plans":["a","b"],"plan":"b"}'>
        <select name="plan" data-enhance="recorder" data-each="plans" data-each-arg="p">
          <option value="{{p}}">{{p}}</option>
        </select>
      </form>`);

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('b');
    // 仕様「`data-enhance`」の「描画の確定では `init` を呼ばず、フォームの初期値が
    // 入った後の走査の最後に呼びます」。
    expect(log[0]).toBe('init:[a,b]=b');
    // 連携が最後に見た状態が、画面の選択と一致する。
    expect(log.at(-1)).toMatch(/:\[a,b\]=b$/);
  });

  it('静的な選択肢では init の時点で値が入っており、再同期は起きない（対照）', async () => {
    await mount(`
      <form data-bind='{"plan":"b"}'>
        <select name="plan" data-enhance="recorder">
          <option value="a">a</option>
          <option value="b">b</option>
        </select>
      </form>`);

    expect(log).toEqual(['init:[a,b]=b']);
  });

  it('複数選択の select でも、init の時点で初期値が入っている', async () => {
    await mount(`
      <form data-bind='{"plans":["a","b","c"],"plan":["b","c"]}'>
        <select name="plan" multiple data-enhance="recorder"
          data-each="plans" data-each-arg="p">
          <option value="{{p}}">{{p}}</option>
        </select>
      </form>`);

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(
      Array.from(select.selectedOptions).map(option => option.value),
    ).toEqual(['b', 'c']);
    expect(log[0]).toBe('init:[a,b,c]=b');
    expect(log.at(-1)).toMatch(/:\[a,b,c\]=b$/);
  });

  describe('<option> を引き取る連携', () => {
    /** 連携が見た `<option>` の記録 */
    let seen: string[];

    /**
     * 連携から見た `<option>` を、選択中のものに `:selected` を付けて文字列にします。
     *
     * @param select 対象の `<select>`
     * @returns `<option>` の一覧
     */
    const describeOptions = (select: HTMLSelectElement): string =>
      `[${Array.from(select.options)
        .map(option => option.value + (option.selected ? ':selected' : ''))
        .join(',')}]`;

    beforeEach(() => {
      seen = [];
      Haori.enhancers.register('grabber', {
        init(element) {
          const select = element as HTMLSelectElement;
          seen.push(`init:${describeOptions(select)}`);
          // Choices.js のように `<option>` を自分の管理へ引き取る。
          select.innerHTML = '';
          return {};
        },
        refresh(element) {
          seen.push(`refresh:${describeOptions(element as HTMLSelectElement)}`);
        },
      });
    });

    afterEach(() => {
      history.replaceState(null, '', '/');
    });

    it('URL から取り込んだ初期値を init で受け取れる', async () => {
      history.replaceState(null, '', '/page?sel=Y');
      await mount(`
        <div data-bind='{"opts":["X","Y"]}'>
          <form data-url-param>
            <div data-external>
              <select name="sel" multiple data-enhance="grabber"
                data-each="opts" data-each-arg="o">
                <option value="{{o}}">{{o}}</option>
              </select>
            </div>
          </form>
        </div>`);

      // 仕様「`data-enhance`」の「連携が `init` の時点の選択を自分の管理へ取り込む
      // 実装（`<option>` を移すものなど）でも、初期値を受け取れます」。
      expect(seen[0]).toBe('init:[X,Y:selected]');
    });

    it('フォームの data-bind の初期値を init で受け取れる', async () => {
      await mount(`
        <div data-bind='{"opts":["X","Y"]}'>
          <form data-bind='{"sel":["Y"]}'>
            <div data-external>
              <select name="sel" multiple data-enhance="grabber"
                data-each="opts" data-each-arg="o">
                <option value="{{o}}">{{o}}</option>
              </select>
            </div>
          </form>
        </div>`);

      expect(seen[0]).toBe('init:[X,Y:selected]');
    });
  });

  it('行の中で選択肢を描く select にも、行の追加で init が 1 回ずつ呼ばれる（対照）', async () => {
    await mount(`
      <div id="host" data-bind='{"plans":["a","b"],"rows":[{"id":1}]}'>
        <div data-each="rows" data-each-arg="r" data-each-key="id">
          <select class="row-plan" data-enhance="recorder" data-each="plans" data-each-arg="p">
            <option value="{{p}}">{{p}}</option>
          </select>
        </div>
      </div>`);
    expect(log.filter(entry => entry.startsWith('init:'))).toHaveLength(1);

    await Core.setBindingData(container.querySelector('#host') as HTMLElement, {
      plans: ['a', 'b'],
      rows: [{id: 1}, {id: 2}],
    });
    await waitForDomSettled();

    // 仕様「`data-enhance`」の契機の表の「`data-each` の新規行 … `init`（未適用の
    // 要素だけ）」。
    expect(log.filter(entry => entry.startsWith('init:'))).toHaveLength(2);
    expect(container.querySelectorAll('.row-plan')).toHaveLength(2);
  });

  it('連携の init は、同じフォームの他の欄の初期値が入った後に呼ばれる', async () => {
    const seen: string[] = [];
    Haori.enhancers.register('peeker', {
      init() {
        seen.push(
          (container.querySelector('#other') as HTMLInputElement).value,
        );
        return {};
      },
    });

    await mount(`
      <form data-bind='{"first":"A","other":"B"}'>
        <input name="first" data-enhance="peeker">
        <input id="other" name="other">
      </form>`);

    // 仕様「`data-enhance`」の「`init` は、置き場所によらず描画と初期値の反映の
    // 後に呼ばれます」。
    expect(seen).toEqual(['B']);
  });

  it('バインドで値を変えたときも、連携へ知らせる', async () => {
    await mount(`
      <form id="f" data-bind='{"plan":"a"}'>
        <select name="plan" data-enhance="recorder">
          <option value="a">a</option>
          <option value="b">b</option>
        </select>
      </form>`);
    log.length = 0;

    await Core.setBindingData(container.querySelector('#f') as HTMLElement, {
      plan: 'b',
    });
    await waitForDomSettled();

    expect(log).toEqual(['refresh:[a,b]=b']);
  });
});
