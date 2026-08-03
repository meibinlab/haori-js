/* @vitest-environment jsdom */
/**
 * @fileoverview 同一要素の別の属性を書いている最中でも `data-bind` 属性へミラーする
 * ことの回帰テスト。
 *
 * 期待値は仕様 1803 行「`data-bind` は宣言と実行時データの両方を担う属性で、Haori
 * 自身も**更新のたびに**最新の in-memory 値をこの属性へミラーします」から取っている。
 *
 * `MutationObserver` の無限ループ対策として、Haori は自身が書き込んでいる属性への
 * 書き込みを行わない。この記録が要素ごとの真偽値 1 つだと、キュー待ちの書き込みが
 * ある間はその要素の**別の属性**への書き込みまで捨ててしまい、`data-bind` 属性と
 * in-memory が食い違ったまま残る（`ElementFragment.selfWritingAttributes` 参照）。
 *
 * 現れ方の代表例が、`{{式}}` を含む `data-fetch` の既定 self-bind である。
 * 評価結果の URL を `data-fetch` 属性へ書き込んでいる最中に応答のバインドが走るため、
 * 応答のミラーが捨てられる。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';
import {expectConsistent} from './helpers/invariants';

describe('別の属性の書き込み中の data-bind ミラー', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('data-fetch の URL に式を含む既定 self-bind でも応答が data-bind 属性へミラーされる', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ok: true}), {
        headers: {'Content-Type': 'application/json'},
      }),
    );

    container.innerHTML =
      '<div data-bind=\'{"base":"users","id":"42"}\' ' +
      "data-fetch='/api/{{base}}/{{id}}'></div>";
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForDomSettled();

    const fragment = Fragment.get(element) as ElementFragment;
    expect(fragment.getRawBindingData()).toEqual({ok: true});
    expect(JSON.parse(element.getAttribute('data-bind') as string)).toEqual({
      ok: true,
    });
    expectConsistent(container);
  });

  it('同じ属性の書き込みを待っている間の更新でも後から来た値が data-bind 属性へ載る', async () => {
    container.innerHTML = '<div data-bind=\'{"v":0}\'></div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForDomSettled();

    // `data-bind` 属性の書き込みを await せずに、同じ属性へ届く更新を重ねる。
    // 仕様 1941 行「別の値の反映が要求されたら、後から来た値が載ります（後勝ち）。
    // 先の書き込みの完了を待ってから改めて反映する」。
    const first = Core.setAttribute(element, 'data-bind', '{"v":1}');
    const second = Core.setBindingData(element, {v: 2});
    await Promise.all([first, second]);
    await waitForDomSettled();

    const fragment = Fragment.get(element) as ElementFragment;
    expect(fragment.getRawBindingData()).toEqual({v: 2});
    expect(JSON.parse(element.getAttribute('data-bind') as string)).toEqual({
      v: 2,
    });
    expectConsistent(container);
  });

  it('別の属性の書き込みを待っている間の更新でも data-bind 属性へミラーされる', async () => {
    container.innerHTML = '<div data-bind=\'{"v":0}\'></div>';
    const element = container.querySelector('div') as HTMLElement;
    await Core.scan(element);
    await waitForDomSettled();

    // `title` の書き込みを await せずに `data-bind` を更新し、片方の属性の書き込みを
    // 待っている間にもう片方のミラーが走る状態を作る。
    const titleWrite = Core.setAttribute(element, 'title', 'x');
    const bindUpdate = Core.setBindingData(element, {v: 1});
    await Promise.all([titleWrite, bindUpdate]);
    await waitForDomSettled();

    expect(element.getAttribute('title')).toBe('x');
    expect(JSON.parse(element.getAttribute('data-bind') as string)).toEqual({
      v: 1,
    });
    expectConsistent(container);
  });
});
