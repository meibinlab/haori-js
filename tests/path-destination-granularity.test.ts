/* @vitest-environment jsdom */
/**
 * @fileoverview バインドデータの宛先の粒度を固定するテスト。
 *
 * 宛先は**経路単位**です（`docs/ja/値の供給と権威解決の設計書.md`）。粒度がずれると、
 * 更新が「必要より広い範囲」を弾いたり、「必要より狭い範囲」だけを弾いたりします。
 * 割り込みの組み合わせを網羅するテスト（`tests/interleaving-authority.test.ts`）は
 * 終状態しか見ないため、粒度そのものはここで押さえます。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様 1927 行「最後に供給された値が残る」（後勝ち）
 * - 仕様 1937 行「`change` / `input` による双方向バインディングのコミット」は値の
 *   供給ではないため、確定した編集を持つ宛先へは通番によらず適用しない
 * - 仕様 1931 行「解除の範囲は共通の規則で決まります」
 *
 * 配列は、行の追加・削除・並べ替えが無い（各位置のリストキーが変わらない）ときだけ
 * 要素ごとの宛先へ降ります。`data-each-key` の宣言があればそれをリストキーに使い、
 * 宣言が無ければ添字を使います（`Core.createListKey()`）。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';

import {waitForIdle} from './helpers/async';

describe('バインドデータの宛先の粒度', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
  });

  /**
   * 要素のバインドデータ（内部値）を返します。
   *
   * @param element 対象要素
   * @returns バインドデータ
   */
  const raw = (element: HTMLElement): Record<string, unknown> =>
    (Fragment.get(element) as ElementFragment).getRawBindingData() ?? {};

  it('葉の経路ごとに独立して判定する（隣のキーは巻き込まれない）', async () => {
    container.innerHTML = '<div data-bind=\'{"a":"A0","b":"B0"}\'></div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForIdle();

    // 新しい供給で `a` だけを進める。
    const newer = ElementFragment.nextSequence();
    await Core.setBindingData(element, {a: 'A2', b: 'B0'}, {sequence: newer});
    await waitForIdle();

    // 古い供給が両方のキーを運んでくる。`a` は棄却され、`b` は適用される。
    const older = newer - 1;
    await Core.setBindingData(element, {a: 'A1', b: 'B1'}, {sequence: older});
    await waitForIdle();

    expect(raw(element)).toEqual({a: 'A2', b: 'B1'});
  });

  it('入れ子のオブジェクトも葉の経路ごとに判定する', async () => {
    container.innerHTML = '<div data-bind=\'{"r":{"x":"X0","y":"Y0"}}\'></div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForIdle();

    const newer = ElementFragment.nextSequence();
    await Core.setBindingData(
      element,
      {r: {x: 'X2', y: 'Y0'}},
      {sequence: newer},
    );
    await waitForIdle();

    await Core.setBindingData(
      element,
      {r: {x: 'X1', y: 'Y1'}},
      {sequence: newer - 1},
    );
    await waitForIdle();

    expect(raw(element)).toEqual({r: {x: 'X2', y: 'Y1'}});
  });

  it('変化していない経路は判定も記録もしない（後の古い供給を弾かない）', async () => {
    container.innerHTML = '<div data-bind=\'{"a":"A0","b":"B0"}\'></div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForIdle();

    // `b` は同じ値なので、この供給は `b` の宛先を進めない。
    const newer = ElementFragment.nextSequence();
    await Core.setBindingData(element, {a: 'A2', b: 'B0'}, {sequence: newer});
    await waitForIdle();

    // したがって古い供給でも `b` は載る（`a` だけが弾かれる）。
    await Core.setBindingData(
      element,
      {a: 'A1', b: 'B1'},
      {sequence: newer - 1},
    );
    await waitForIdle();

    expect(raw(element)).toEqual({a: 'A2', b: 'B1'});
  });

  it('行数が変わる配列は配列全体が 1 つの宛先になる', async () => {
    container.innerHTML =
      '<div data-bind=\'{"rows":[{"id":1,"v":"a"},{"id":2,"v":"b"}]}\'></div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForIdle();

    // 要素数が変わるため要素同士の対応が取れない。配列全体が 1 つの宛先になる。
    const newer = ElementFragment.nextSequence();
    await Core.setBindingData(
      element,
      {rows: [{id: 1, v: 'a2'}]},
      {sequence: newer},
    );
    await waitForIdle();

    // 古い供給は配列ごと棄却される（要素単位で部分的に混ざらない）。
    await Core.setBindingData(
      element,
      {
        rows: [
          {id: 1, v: 'a1'},
          {id: 2, v: 'b1'},
        ],
      },
      {sequence: newer - 1},
    );
    await waitForIdle();

    expect(raw(element)).toEqual({rows: [{id: 1, v: 'a2'}]});
  });

  it('行数が変わらない配列は要素ごとの宛先へ降りる', async () => {
    container.innerHTML =
      '<div data-bind=\'{"rows":[{"id":1,"v":"a"},{"id":2,"v":"b"}]}\'></div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForIdle();

    const newer = ElementFragment.nextSequence();
    await Core.setBindingData(
      element,
      {
        rows: [
          {id: 1, v: 'a2'},
          {id: 2, v: 'b'},
        ],
      },
      {sequence: newer},
    );
    await waitForIdle();

    // 1 行目は棄却、2 行目は適用（要素ごとに独立して判定する）。
    await Core.setBindingData(
      element,
      {
        rows: [
          {id: 1, v: 'a1'},
          {id: 2, v: 'b1'},
        ],
      },
      {sequence: newer - 1},
    );
    await waitForIdle();

    expect(raw(element)).toEqual({
      rows: [
        {id: 1, v: 'a2'},
        {id: 2, v: 'b1'},
      ],
    });
  });

  it('data-each-key を宣言した配列では、並べ替えを要素の入れ替えとして扱う', async () => {
    container.innerHTML =
      '<div data-bind=\'{"rows":[{"id":1,"v":"a"},{"id":2,"v":"b"}]}\'>' +
      `<ul data-each="rows" data-each-key="id" data-each-arg="r">` +
      '<li>{{r.v}}</li>' +
      '</ul>' +
      '</div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForIdle();

    // 並べ替えでリストキーの並びが変わるため、要素同士の対応が取れない。
    // 配列全体が 1 つの宛先になり、古い供給は配列ごと棄却される。
    const newer = ElementFragment.nextSequence();
    await Core.setBindingData(
      element,
      {
        rows: [
          {id: 2, v: 'b'},
          {id: 1, v: 'a'},
        ],
      },
      {sequence: newer},
    );
    await waitForIdle();

    await Core.setBindingData(
      element,
      {
        rows: [
          {id: 1, v: 'a1'},
          {id: 2, v: 'b1'},
        ],
      },
      {sequence: newer - 1},
    );
    await waitForIdle();

    expect(raw(element)).toEqual({
      rows: [
        {id: 2, v: 'b'},
        {id: 1, v: 'a'},
      ],
    });
  });

  it('data-each-arg スコープ内の入れ子の宣言でも data-each-key を見つける', async () => {
    // 入れ子の `data-each` は上位の行スコープの名前で書かれる（`r.items`）。宣言を
    // 絶対経路（`rows.items`）へ直して照合しないと、リストキーが添字へ退き、並べ替えを
    // 「同じ位置の値の変化」と誤って扱う。そうなると、位置ごとに変化した経路だけが
    // 宛先として記録され、**誰も供給していない混ざり方**が残る（仕様 755 / 1945 行）。
    //
    // `v` は並べ替えの前後で同じ値にしてある。添字で対応させると `v` の経路は
    // 「変化していない」と判定されて記録されず、後から届いた古い供給の `v` だけが
    // 載ってしまう。
    container.innerHTML =
      '<div data-bind=\'{"rows":[{"id":1,"items":[{"k":"x","v":"1"},{"k":"y","v":"1"}]}]}\'>' +
      `<ul data-each="rows" data-each-key="id" data-each-arg="r">` +
      `<ol data-each="r.items" data-each-key="k" data-each-arg="it">` +
      '<li>{{it.v}}</li>' +
      '</ol>' +
      '</ul>' +
      '</div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForIdle();

    // 入れ子の配列を並べ替える。`k` をリストキーとして見つけられれば並びの変化を
    // 検出し、配列全体を 1 つの宛先として扱う。
    const newer = ElementFragment.nextSequence();
    await Core.setBindingData(
      element,
      {
        rows: [
          {
            id: 1,
            items: [
              {k: 'y', v: '1'},
              {k: 'x', v: '1'},
            ],
          },
        ],
      },
      {sequence: newer},
    );
    await waitForIdle();

    await Core.setBindingData(
      element,
      {
        rows: [
          {
            id: 1,
            items: [
              {k: 'x', v: '1b'},
              {k: 'y', v: '2b'},
            ],
          },
        ],
      },
      {sequence: newer - 1},
    );
    await waitForIdle();

    expect(raw(element)).toEqual({
      rows: [
        {
          id: 1,
          items: [
            {k: 'y', v: '1'},
            {k: 'x', v: '1'},
          ],
        },
      ],
    });
  });
});
