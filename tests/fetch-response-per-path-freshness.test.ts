/* @vitest-environment jsdom */
/**
 * @fileoverview 飛行中に別の供給が挟まったフェッチ応答が、**経路ごとに**解決される
 * ことの回帰テスト。
 *
 * 期待値は仕様書から取っています。
 *
 * - 「`Core.setBindingData(element, data, options?)`」の「適用の可否は**宛先（入力欄と
 *   バインドデータの経路）ごとに**、最後に適用された通し番号と種別との比較で決まります」
 * - 「反映待ちの間に起きた変化」の「最後に供給された値が画面とバインドデータの双方に
 *   残ります」（後勝ち）
 *
 * フェッチ応答が持つ通番は**リクエストを組み立てた操作**のものです。応答が届くまでに
 * 別の供給が入ると、応答は「一部の経路については古い」状態になります。宛先ごとに
 * 判定すれば、後から供給された経路だけが守られ、その供給が触っていない経路には応答が
 * 載ります。要素単位で判定すると、応答が丸ごと捨てられて**取得したはずの値が
 * どこにも現れません**。
 *
 * この形は「一覧を再取得している最中に検索条件の一部だけを更新した」ときに現れます。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {Observer} from '../src/observer';

import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('飛行中の供給が挟まったフェッチ応答の経路ごとの解決', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(async () => {
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    await Observer.init();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    vi.restoreAllMocks();
  });

  it('応答は、後から供給された経路だけを譲り、他の経路へは載る', async () => {
    // 応答は保留しておき、別の供給を挟んでから解決する。
    let release: (() => void) | null = null;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        pending.then(
          () =>
            new Response(
              JSON.stringify({keyword: '応答', category: 'カテゴリ応答'}),
              {headers: {'Content-Type': 'application/json'}},
            ),
        ) as Promise<Response>,
    );

    container.innerHTML =
      `<div id="host" data-bind='{"keyword":"初期","category":"初期カテゴリ"}'>` +
      '<button id="go" type="button" data-click-fetch="/api/search"' +
      ' data-click-bind="#host"></button>' +
      '</div>';
    await Core.scan(container);
    await waitForIdle();

    const host = container.querySelector('#host') as HTMLElement;
    const button = container.querySelector('#go') as HTMLButtonElement;

    // リクエストを組み立てる（この時点の通番を応答が持つ）。
    button.click();
    await waitForIdle();

    // 応答を待っている間に `keyword` だけを供給する。`category` は触らない。
    await Core.setBindingData(host, {
      keyword: '割り込み',
      category: '初期カテゴリ',
    });
    await waitForIdle();

    release!();
    await waitForIdle();

    // `keyword` は後から供給された値が残る（応答は古い）。`category` は割り込みが
    // 触っていない経路なので、応答が載る。
    expect(Core.getBindingData(host)).toMatchObject({
      keyword: '割り込み',
      category: 'カテゴリ応答',
    });
  });
});
