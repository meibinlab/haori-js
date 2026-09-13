/* @vitest-environment jsdom */
/**
 * @fileoverview 値が後から入った入力欄の、外部ライブラリ連携への再同期を検証します。
 *
 * `data-each` で選択肢を描画する `<select>` では、`init` が描画の確定で呼ばれるため、
 * フォームの初期値の反映が `init` より後になります。`init` の時点の選択を自分の管理へ
 * 取り込む連携（`<option>` を移すものなど）は、後から入った値を知る手段がありません
 * でした（課題 44）。
 *
 * 期待値の根拠は仕様「`data-enhance`」の契機の表（「Haori が入力欄へ値を書き、値が
 * 実際に変わったとき」に `refresh`）。
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

  it('data-each で選択肢を描く select では、値が入った後に refresh が呼ばれる', async () => {
    await mount(`
      <form data-bind='{"plans":["a","b"],"plan":"b"}'>
        <select name="plan" data-enhance="recorder" data-each="plans" data-each-arg="p">
          <option value="{{p}}">{{p}}</option>
        </select>
      </form>`);

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('b');
    // 連携が最後に見た状態が、画面の選択と一致する。
    expect(log.at(-1)).toBe('refresh:[a,b]=b');
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

  it('複数選択の select でも、値が入った後に refresh が呼ばれる', async () => {
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
    expect(log.at(-1)).toBe('refresh:[a,b,c]=b');
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
