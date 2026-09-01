/* @vitest-environment jsdom */
/**
 * @fileoverview 宣言の属性を外部が書き換えたときの反映のテスト。
 *
 * 監視から取り込む書き換えは、DOM が新しい宣言・内部の属性マップが古い宣言という
 * 状態で届きます。属性の反映と並べて属性ごとの処理を走らせると 1 つ前の宣言で判定
 * するため、反映が 1 手遅れます（1 回だけ書き換えた場合は反映されません）。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「監視対象」の「宣言の属性（`data-if` / `data-each` など）が書き換えられた
 *   場合、その属性の処理は**更新後の宣言**で行います」
 * - 同節の「取り込みと処理の順序が逆になると、1 つ前の宣言で判定した結果が反映され、
 *   **書き換えの反映が 1 手遅れます**」
 * - 仕様「data-if の動作」の「非表示時: `data-if-false` 属性を付与」
 * - 仕様「`data-each`」の「`data-row`: 各行に自動付与されるキー」
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Env from '../src/env';
import {Observer} from '../src/observer';

import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('宣言の属性の書き換え', () => {
  beforeEach(async () => {
    Env.setRuntime('embedded');
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    await Observer.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
  });

  /**
   * 検証用の一覧を組み立てて初期描画を待ちます。
   *
   * 監視が 1 つの追加ノードとして取り込めるよう、`document` から切り離した状態で
   * 組み立ててから差し込みます（既存の `tests/external-bind-attribute.test.ts` と
   * 同じ形）。
   *
   * @returns 一覧のコンテナ要素
   */
  const render = async (): Promise<HTMLElement> => {
    const host = document.createElement('div');
    host.setAttribute(
      `${Env.prefix}bind`,
      '{"show":true,"items":[{"id":1},{"id":2},{"id":3}]}',
    );
    host.innerHTML =
      '<ul id="list" data-if="show" data-each="items" data-each-arg="r"' +
      ' data-each-key="id">' +
      '<li class="row">{{r.id}}</li>' +
      '</ul>';
    document.body.appendChild(host);
    await waitForIdle();
    return document.getElementById('list') as HTMLElement;
  };

  /** 描かれている行のラベル */
  const rowLabels = (): string[] =>
    Array.from(document.querySelectorAll(`.row[${Env.prefix}row]`)).map(
      row => row.textContent ?? '',
    );

  it('data-each の宣言の書き換えが即座に反映される（回帰）', async () => {
    const list = await render();
    expect(rowLabels()).toEqual(['1', '2', '3']);

    list.setAttribute(`${Env.prefix}each`, 'items.filter(x => x.id > 1)');
    await waitForIdle();

    expect(rowLabels()).toEqual(['2', '3']);
  });

  it('data-if の宣言の書き換えが即座に反映される（回帰）', async () => {
    const list = await render();
    expect(list.hasAttribute(`${Env.prefix}if-false`)).toBe(false);

    list.setAttribute(`${Env.prefix}if`, 'false');
    await waitForIdle();

    expect(list.hasAttribute(`${Env.prefix}if-false`)).toBe(true);
  });

  it('書き換えを繰り返しても 1 手遅れない（回帰）', async () => {
    const list = await render();

    list.setAttribute(`${Env.prefix}if`, 'false');
    await waitForIdle();
    expect(list.hasAttribute(`${Env.prefix}if-false`)).toBe(true);

    list.setAttribute(`${Env.prefix}if`, 'true');
    await waitForIdle();
    expect(list.hasAttribute(`${Env.prefix}if-false`)).toBe(false);

    list.setAttribute(`${Env.prefix}if`, 'false');
    await waitForIdle();
    expect(list.hasAttribute(`${Env.prefix}if-false`)).toBe(true);
  });

  it('data-each の書き換えを繰り返しても 1 手遅れない（回帰）', async () => {
    const list = await render();

    list.setAttribute(`${Env.prefix}each`, 'items.filter(x => x.id === 1)');
    await waitForIdle();
    expect(rowLabels()).toEqual(['1']);

    list.setAttribute(`${Env.prefix}each`, 'items');
    await waitForIdle();
    expect(rowLabels()).toEqual(['1', '2', '3']);
  });

  it('data-bind の書き換えは従来どおり反映される（対照）', async () => {
    const list = await render();
    const host = list.parentElement as HTMLElement;

    host.setAttribute(`${Env.prefix}bind`, '{"show":true,"items":[{"id":9}]}');
    await waitForIdle();

    expect(rowLabels()).toEqual(['9']);
  });
});
