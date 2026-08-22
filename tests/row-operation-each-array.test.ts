/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 派生配列を描画する `data-each` で、`data-each-array` が宣言した配列へ行操作が
 * 書き戻されることを検証する。
 *
 * 期待値の根拠は仕様「派生配列の書き戻し先（`data-each-array`）」。行と要素の
 * 対応付けは同節の「`data-each-key` の指定が必須です」に従い、キーで行う。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import {waitForIdle} from './helpers/async';

describe('data-each-array による派生配列の行操作', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let errors: string[];

  beforeEach(() => {
    errors = [];
    vi.spyOn(Log, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(arg => String(arg)).join(' '));
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  /**
   * 所有者のバインドデータが持つ `rules` の並びを返します。
   *
   * @returns `id` を並べた文字列
   */
  const stored = (): string => {
    const host = container.querySelector('#st') as HTMLElement;
    const fragment = Fragment.get(host);
    if (!(fragment instanceof ElementFragment)) {
      throw new Error('fragment not found');
    }
    const data = (fragment.getRawBindingData() ?? {}) as Record<
      string,
      unknown
    >;
    return (data.rules as Array<{id?: number}>)
      .map(rule => (rule.id === undefined ? '-' : String(rule.id)))
      .join(',');
  };

  /**
   * 表示されている行の `id` を返します。
   *
   * @returns `id` を並べた文字列
   */
  const shown = (): string =>
    Array.from(container.querySelectorAll('.n'))
      .map(element => element.textContent)
      .join(',');

  /**
   * 3 件のうち 2 件が同じグループになる一覧を描画します。
   *
   * @param buttons 行の中に置くボタンの HTML
   * @returns 描画完了の Promise
   */
  const mountGroup = async (buttons: string): Promise<void> => {
    container.innerHTML = `
      <div id="st" data-bind='{"g":"X","rules":[
        {"id":1,"c":"X"},{"id":2,"c":"Y"},{"id":3,"c":"X"}]}'>
        <div data-each="rules.filter(rule => rule.c === g)" data-each-arg="r"
          data-each-key="id" data-each-array="rules">
          <div><span class="n">{{r.id}}</span>${buttons}</div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
  };

  it('前の行へ移す操作が、表示上の前の行が居た位置へ移す', async () => {
    // 「対象の行を表示上の前後の行が居る位置へ移します」「配列の上で隣り合って
    // いない要素どうしでも、表示された並びのとおりに入れ替わります」。
    await mountGroup(
      '<button type="button" class="up" data-click-row-prev>↑' + '</button>',
    );
    expect(shown()).toBe('1,3');

    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('3,1,2');
    expect(shown()).toBe('3,1');
  });

  it('次の行へ移す操作が、表示上の次の行が居た位置へ移す', async () => {
    await mountGroup(
      '<button type="button" class="down" data-click-row-next>↓' + '</button>',
    );

    (container.querySelectorAll('.down')[0] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('2,3,1');
    expect(shown()).toBe('3,1');
  });

  it('表示上の前の行が無ければ何もしない', async () => {
    // 先頭の行は配列の先頭ではない（配列の位置では「前がある」）。表示に出ていない
    // 要素の順序は変えないので、グループの先頭では動かない。
    container.innerHTML = `
      <div id="st" data-bind='{"g":"X","rules":[
        {"id":1,"c":"Y"},{"id":2,"c":"X"},{"id":3,"c":"X"}]}'>
        <div data-each="rules.filter(rule => rule.c === g)" data-each-arg="r"
          data-each-key="id" data-each-array="rules">
          <div><span class="n">{{r.id}}</span>
            <button type="button" class="up" data-click-row-prev>↑</button></div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    expect(shown()).toBe('2,3');

    (container.querySelectorAll('.up')[0] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('1,2,3');
    expect(shown()).toBe('2,3');
  });

  it('表示上の次の行が無ければ何もしない', async () => {
    // 末尾の行は配列の末尾ではない（配列の位置では「次がある」）。
    container.innerHTML = `
      <div id="st" data-bind='{"g":"X","rules":[
        {"id":1,"c":"X"},{"id":2,"c":"X"},{"id":3,"c":"Y"}]}'>
        <div data-each="rules.filter(rule => rule.c === g)" data-each-arg="r"
          data-each-key="id" data-each-array="rules">
          <div><span class="n">{{r.id}}</span>
            <button type="button" class="down" data-click-row-next>↓
            </button></div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    expect(shown()).toBe('1,2');

    (container.querySelectorAll('.down')[1] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('1,2,3');
    expect(shown()).toBe('1,2');
  });

  it('キーに一致する要素が無い行では何もしない', async () => {
    // 行と要素の対応付けは仕様「編集可能な行への書き込み」と同じ規則で、キーに
    // 一致する要素が無い行は書き込みをスキップする。
    const warnings: string[] = [];
    vi.spyOn(Log, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(arg => String(arg)).join(' '));
    });
    container.innerHTML = `
      <div id="st" data-bind='{"rules":[{"id":1},{"id":2}]}'>
        <div data-each="rules.concat([{&quot;id&quot;:99}])" data-each-arg="r"
          data-each-key="id" data-each-array="rules">
          <div><span class="n">{{r.id}}</span>
            <button type="button" class="up" data-click-row-prev>↑</button>
            <button type="button" class="add" data-click-row-add>追加
            </button></div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    expect(shown()).toBe('1,2,99');

    // 配列に無いキー（99）の行を上へ移そうとする。
    (container.querySelectorAll('.up')[2] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    // 警告には、原因になった操作の宣言を添える。
    expect(
      warnings.some(
        message =>
          message.includes('No array element corresponds to the target row') &&
          message.includes(`${Env.prefix}click-row-prev`),
      ),
    ).toBe(true);
    expect(stored()).toBe('1,2');

    // 追加も同じ。挿入する位置が決まらないため、どこへも挿し込まない。
    (container.querySelectorAll('.add')[2] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('1,2');

    // 隣の行が一致しないだけの操作（増減）は、その隣について警告しない。増減は
    // 隣の行の位置を使わないため、無関係な行の警告になる。
    warnings.length = 0;
    (container.querySelectorAll('.add')[1] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(stored()).toBe('1,2,-');
  });

  it('削除は対象の行に対応する要素を配列から取り除く', async () => {
    await mountGroup(
      '<button type="button" class="del" data-click-row-remove>' +
        '削除</button>',
    );

    (container.querySelectorAll('.del')[0] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('2,3');
    expect(shown()).toBe('3');
  });

  it('表示が 1 行でも配列に 2 件以上あれば削除する', async () => {
    // 「最後の 1 行を残す判定は書き戻し先の配列の件数で行う」。
    container.innerHTML = `
      <div id="st" data-bind='{"g":"X","rules":[
        {"id":1,"c":"X"},{"id":2,"c":"Y"}]}'>
        <div data-each="rules.filter(rule => rule.c === g)" data-each-arg="r"
          data-each-key="id" data-each-array="rules">
          <div><span class="n">{{r.id}}</span>
            <button type="button" class="del" data-click-row-remove>削除
            </button></div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    expect(shown()).toBe('1');

    (container.querySelectorAll('.del')[0] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('2');
    expect(shown()).toBe('');
  });

  it('追加は対象の行に対応する要素の直後へ空の要素を挿し込む', async () => {
    // 「挿入した要素が派生の条件を満たさない場合、配列には入りますが表示には
    // 出ません」。
    await mountGroup(
      '<button type="button" class="add" data-click-row-add>' + '追加</button>',
    );

    (container.querySelectorAll('.add')[0] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('1,-,2,3');
    expect(shown()).toBe('1,3');
  });

  it('セレクタで指定した追加は、表示が 0 件なら配列の末尾へ追加する', async () => {
    // 「セレクタでコンテナを指定した追加で、絞り込みの結果が 0 件のときは、表示から
    // 位置を決められないため宣言した配列の末尾へ追加します」。
    container.innerHTML = `
      <div id="st" data-bind='{"g":"Z","rules":[
        {"id":1,"c":"X"},{"id":2,"c":"Y"}]}'>
        <div id="list" data-each="rules.filter(rule => rule.c === g)"
          data-each-arg="r" data-each-key="id" data-each-array="rules">
          <div><span class="n">{{r.id}}</span></div>
        </div>
        <button type="button" id="add" data-click-row-add="#list">追加</button>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    expect(shown()).toBe('');

    (container.querySelector('#add') as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('1,2,-');
  });

  it('data-each-key が無ければエラーを出して何もしない', async () => {
    container.innerHTML = `
      <div id="st" data-bind='{"g":"X","rules":[
        {"id":1,"c":"X"},{"id":3,"c":"X"}]}'>
        <div data-each="rules.filter(rule => rule.c === g)" data-each-arg="r"
          data-each-array="rules">
          <div><span class="n">{{r.id}}</span>
            <button type="button" class="up" data-click-row-prev>↑</button></div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(
      errors.some(message =>
        message.includes('data-each-array requires data-each-key'),
      ),
    ).toBe(true);
    expect(stored()).toBe('1,3');
    expect(shown()).toBe('1,3');
  });

  it('data-each-array が識別子パスでなければエラーを出して何もしない', async () => {
    // 「値は単純な識別子パスです」。
    container.innerHTML = `
      <div id="st" data-bind='{"g":"X","rules":[
        {"id":1,"c":"X"},{"id":3,"c":"X"}]}'>
        <div data-each="rules.filter(rule => rule.c === g)" data-each-arg="r"
          data-each-key="id" data-each-array="rules.slice()">
          <div><span class="n">{{r.id}}</span>
            <button type="button" class="up" data-click-row-prev>↑</button></div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(
      errors.some(
        message =>
          message.includes('plain identifier path') &&
          message.includes('data-each-array'),
      ),
    ).toBe(true);
    expect(stored()).toBe('1,3');
  });

  it('行スコープ名を根に持つ書き戻し先も解決する', async () => {
    // 「行スコープ名を根に持つ `g.rules`」も指定できる。
    container.innerHTML = `
      <div id="st" data-bind='{"groups":[{"c":"X","rules":[
        {"id":1,"t":"a"},{"id":2,"t":"b"},{"id":3,"t":"a"}]}]}'>
        <div data-each="groups" data-each-arg="g">
          <div>
            <div data-each="g.rules.filter(rule => rule.t === 'a')"
              data-each-arg="r" data-each-key="id" data-each-array="g.rules">
              <div><span class="n">{{r.id}}</span>
                <button type="button" class="up" data-click-row-prev>↑
                </button></div>
            </div>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    expect(shown()).toBe('1,3');

    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    const host = container.querySelector('#st') as HTMLElement;
    const fragment = Fragment.get(host) as ElementFragment;
    const groups = (fragment.getRawBindingData() ?? {}).groups as Array<{
      rules: Array<{id: number}>;
    }>;
    expect(groups[0].rules.map(rule => rule.id).join(',')).toBe('3,1,2');
    expect(shown()).toBe('3,1');
  });

  it('data-derive で作った見出しの下でもグループ内が並び替わる', async () => {
    // 仕様の例と同じ構成（`data-derive` でカテゴリを作り、行はカテゴリで絞り込む）。
    container.innerHTML = `
      <div id="st" data-bind='{"rules":[
        {"id":1,"c":"X"},{"id":2,"c":"Y"},{"id":3,"c":"X"}]}'>
        <div data-derive="rules.map(rule => rule.c)
          .filter((c, index, all) => all.indexOf(c) === index)"
          data-derive-name="categories">
          <div data-each="categories" data-each-arg="g">
            <div>
              <h3 class="head">{{g}}</h3>
              <div data-each="rules.filter(rule => rule.c === g)"
                data-each-arg="r" data-each-key="id" data-each-array="rules">
                <div><span class="n">{{r.id}}</span>
                  <button type="button" class="up" data-click-row-prev>↑
                  </button></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    expect(
      Array.from(container.querySelectorAll('.head')).map(
        element => element.textContent,
      ),
    ).toEqual(['X', 'Y']);
    expect(shown()).toBe('1,3,2');

    // X グループの 2 行目（id=3）を上へ移す。
    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored()).toBe('3,1,2');
    expect(shown()).toBe('3,1,2');
  });
});
