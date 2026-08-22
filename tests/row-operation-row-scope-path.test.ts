/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 行スコープ名を根に持つ `data-each`（`data-each="g.rules"`）の行操作が、行データの
 * 実体である親配列の要素へ書き戻されることを検証する。
 *
 * 期待値の根拠は仕様「行操作の共通仕様（`data-{event}-row-*`）」の「行スコープ名を根に
 * 持つ `data-each`」。行データは描画のたびに親配列から作り直す仮想スコープ（仕様
 * 「`data-derive` / `data-derive-name`」の「どちらも描画のたびに作り直される仮想スコープ」）
 * なので、行自身へ書き戻しても次の描画で消える。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import {waitForIdle} from './helpers/async';

describe('行スコープ名を根に持つ data-each の行操作', () => {
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
   * 所有者のバインドデータを返します。
   *
   * @returns 所有者のバインドデータ
   */
  const ownerData = (): Record<string, unknown> => {
    const host = container.querySelector('#st') as HTMLElement;
    const fragment = Fragment.get(host);
    if (!(fragment instanceof ElementFragment)) {
      throw new Error('fragment not found');
    }
    return (fragment.getRawBindingData() ?? {}) as Record<string, unknown>;
  };

  /**
   * 表示されている行の名前を返します。
   *
   * @returns 名前の並び
   */
  const shown = (): string =>
    Array.from(container.querySelectorAll('.n'))
      .map(element => element.textContent)
      .join(',');

  /**
   * 指定したグループの要素データの名前を返します。
   *
   * @param groupIndex グループの位置
   * @returns 名前の並び
   */
  const stored = (groupIndex: number): string => {
    const groups = ownerData().groups as Array<{rules: Array<{n: string}>}>;
    return groups[groupIndex].rules.map(rule => rule.n).join(',');
  };

  it('行スコープ名を根に持つ配列の並び替えが所有者へ届く', async () => {
    container.innerHTML = `
      <div id="st" data-bind='{"groups":[
        {"c":"X","rules":[{"n":"a"},{"n":"b"},{"n":"c"}]},
        {"c":"Y","rules":[{"n":"p"},{"n":"q"}]}]}'>
        <div data-each="groups" data-each-arg="g">
          <div class="grp">
            <span class="head">{{g.c}}</span>
            <div data-each="g.rules" data-each-arg="r">
              <div><span class="n">{{r.n}}</span>
                <button type="button" class="up"
                  data-click-row-prev>up</button></div>
            </div>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    expect(shown()).toBe('a,b,c,p,q');

    // 1 番目のグループの 2 行目を上へ移す。
    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored(0)).toBe('b,a,c');
    // 別のグループは動かない。
    expect(stored(1)).toBe('p,q');
    expect(shown()).toBe('b,a,c,p,q');
  });

  it('2 番目のグループでも自分のグループだけが並び替わる', async () => {
    container.innerHTML = `
      <div id="st" data-bind='{"groups":[
        {"c":"X","rules":[{"n":"a"},{"n":"b"}]},
        {"c":"Y","rules":[{"n":"p"},{"n":"q"}]}]}'>
        <div data-each="groups" data-each-arg="g">
          <div class="grp">
            <div data-each="g.rules" data-each-arg="r">
              <div><span class="n">{{r.n}}</span>
                <button type="button" class="down"
                  data-click-row-next>down</button></div>
            </div>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    // 2 番目のグループの 1 行目を下へ移す。
    (container.querySelectorAll('.down')[2] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored(0)).toBe('a,b');
    expect(stored(1)).toBe('q,p');
  });

  it('data-each-key を指定しても所有者へ届く', async () => {
    container.innerHTML = `
      <div id="st" data-bind='{"groups":[
        {"c":"X","rules":[{"n":"a","id":1},{"n":"b","id":2}]}]}'>
        <div data-each="groups" data-each-arg="g" data-each-key="c">
          <div class="grp">
            <div data-each="g.rules" data-each-arg="r" data-each-key="id">
              <div><span class="n">{{r.n}}</span>
                <button type="button" class="up"
                  data-click-row-prev>up</button></div>
            </div>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    expect(stored(0)).toBe('b,a');
  });

  it('行の追加と削除も所有者へ届く', async () => {
    container.innerHTML = `
      <div id="st" data-bind='{"groups":[
        {"c":"X","rules":[{"n":"a"},{"n":"b"}]}]}'>
        <div data-each="groups" data-each-arg="g">
          <div class="grp">
            <div data-each="g.rules" data-each-arg="r">
              <div><span class="n">{{r.n}}</span>
                <button type="button" class="add"
                  data-click-row-add>add</button>
                <button type="button" class="del"
                  data-click-row-remove>del</button></div>
            </div>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    (container.querySelectorAll('.add')[0] as HTMLElement).click();
    await waitForIdle();
    expect(errors).toEqual([]);
    const added = ownerData().groups as Array<{rules: unknown[]}>;
    expect(added[0].rules).toHaveLength(3);

    (container.querySelectorAll('.del')[0] as HTMLElement).click();
    await waitForIdle();
    expect(errors).toEqual([]);
    const removed = ownerData().groups as Array<{rules: unknown[]}>;
    expect(removed[0].rules).toHaveLength(2);
  });

  it('中間のコンテナ自身が行でも祖先の行スコープ名を解決する', async () => {
    // `data-each` の直下の唯一の子が `data-each` の形（仕様「`data-each`」の
    // 「テンプレートは最初の子要素だけ」）では、中間のコンテナがそのまま行になる。
    // 内側から見て一致する行スコープ名は、その中間のコンテナが属するコンテナの
    // 宣言なので、遡るときに中間のコンテナ自身を飛ばしてはいけない。
    container.innerHTML = `
      <div id="st" data-bind='{"groups":[
        {"rules":[{"n":"a"}],"tags":[{"t":"x"},{"t":"y"}]}]}'>
        <div data-each="groups" data-each-arg="g">
          <div data-each="g.rules" data-each-arg="r">
            <div class="row"><span class="n">{{r.n}}</span>
              <div data-each="g.tags" data-each-arg="t"><div><span
                class="t">{{t.t}}</span><button type="button" class="up"
                data-click-row-prev>up</button></div></div>
            </div>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    const tags = (): string =>
      Array.from(container.querySelectorAll('.t'))
        .map(element => element.textContent)
        .join(',');
    expect(tags()).toBe('x,y');

    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(errors).toEqual([]);
    const groups = ownerData().groups as Array<{tags: Array<{t: string}>}>;
    expect(groups[0].tags.map(tag => tag.t).join(',')).toBe('y,x');
    expect(tags()).toBe('y,x');
  });

  it('派生配列は従来どおり書き戻せないと報告する', async () => {
    // 書き戻し先が一意に決まらないため、行操作は拒否する（仕様
    // 「行操作の共通仕様（`data-{event}-row-*`）」の「対象は所有者のバインドデータが
    // 持つ配列です」）。
    container.innerHTML = `
      <div id="st" data-bind='{"rules":[{"n":"a","c":"X"},{"n":"b","c":"X"}]}'>
        <div data-each="rules.filter(r => r.c === 'X')" data-each-arg="r">
          <div><span class="n">{{r.n}}</span>
            <button type="button" class="up" data-click-row-prev>up</button></div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(
      errors.some(message =>
        message.includes('Row operations require a plain identifier path'),
      ),
    ).toBe(true);
    const rules = ownerData().rules as Array<{n: string}>;
    expect(rules.map(rule => rule.n).join(',')).toBe('a,b');
  });

  it('行スコープ名の外側が派生配列なら書き戻さない', async () => {
    // 外側が書き戻せない場合、内側の行の位置も一意に決まらない。
    container.innerHTML = `
      <div id="st" data-bind='{"groups":[
        {"c":"X","rules":[{"n":"a"},{"n":"b"}]}]}'>
        <div data-each="groups.filter(g => g.c === 'X')" data-each-arg="g">
          <div class="grp">
            <div data-each="g.rules" data-each-arg="r">
              <div><span class="n">{{r.n}}</span>
                <button type="button" class="up"
                  data-click-row-prev>up</button></div>
            </div>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    const shownNames = (): string =>
      Array.from(container.querySelectorAll('.n'))
        .map(element => element.textContent)
        .join(',');
    expect(shownNames()).toBe('a,b');

    (container.querySelectorAll('.up')[1] as HTMLElement).click();
    await waitForIdle();

    expect(stored(0)).toBe('a,b');
    // 画面も動かさない。行データへ書き戻すと DOM だけが入れ替わり、画面と
    // バインドデータが食い違ったまま残る。
    expect(shownNames()).toBe('a,b');
    expect(container.querySelector(`[${Env.prefix}row]`)).not.toBeNull();
  });
});
