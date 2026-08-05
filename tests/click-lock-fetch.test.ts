/* @vitest-environment jsdom */
/**
 * @fileoverview
 * click 手続きの多重実行防止ロックが、フェッチの応答が返るまで保たれることの検証。
 *
 * 期待値の根拠は仕様「`data-click-no-disabled`」の「通常、`click` 手続きの実行中は
 * 起点要素に `disabled` 属性が付与され、二重実行を防ぎます」と、仕様
 * 「`data-{event}-run`」の「`click` 手続きでは await の間も多重実行防止ロック（対象
 * 要素の `disabled` 付与・`RUNNING_CLICK_TARGETS` 登録）を保持するため、**async
 * ハンドラ（保存 POST 等）でも 2 度押しによる重複送信を防げます**」。フェッチの
 * 応答待ちも「実行中」であるため、ロックは応答が返るまで保たれる。
 *
 * 応答を保留したまま観測するため、fetch は解決関数を控えるモックにする。ネット
 * ワークの遅延を模したもので、内部メソッドを直接呼ぶ人工的な状態は作らない。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {nextTask, waitForDomSettled, waitForIdle} from './helpers/async';

/** 保留中のフェッチを解決・失敗させる操作 */
interface PendingFetch {
  /** 応答を返して解決する */
  resolve: (response: Response) => void;
  /** 通信失敗として拒否する */
  reject: (error: Error) => void;
}

describe('click 手続きのロックとフェッチの完了', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let pending: PendingFetch[];

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    pending = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve, reject) => {
          pending.push({resolve, reject});
        }) as unknown as Promise<Response>,
    );
  });

  afterEach(async () => {
    // 保留中の通信を残したまま次のテストへ移ると、後続の待機に紛れ込む。
    pending.forEach(item =>
      item.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ),
    );
    await waitForIdle();
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.removeChild(container);
    // 失敗して途中で抜けた場合もグローバルを残さない。
    delete (globalThis as unknown as {__runGate?: () => Promise<void>})
      .__runGate;
  });

  /**
   * ボタンとバインド先を用意します。
   *
   * @param extraAttributes ボタンへ追加する属性
   * @returns 用意したボタン要素
   */
  const setup = async (extraAttributes = ''): Promise<HTMLButtonElement> => {
    container.innerHTML = `
      <div id="t" data-bind='{}'></div>
      <button id="b" ${extraAttributes} data-click-fetch="/save"
              data-click-method="post" data-click-bind="#t">保存</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('#b') as HTMLButtonElement;
  };

  it('応答が返るまで disabled とロックマーカーが保たれる', async () => {
    const button = await setup();

    button.click();
    await nextTask();

    expect(pending.length).toBe(1);
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(true);
  });

  it('応答が返る前の 2 度目のクリックで重複送信しない', async () => {
    const button = await setup();

    button.click();
    await nextTask();
    button.click();
    await nextTask();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('タスク境界と描画フレームを越えてもロックが保たれる', async () => {
    // 「同期フレームだけロックが効く」状態を確実に捕まえるため、複数のタスク境界と
    // 描画フレーム（requestAnimationFrame）を越えて観測する。
    const button = await setup();

    button.click();
    for (let count = 0; count < 3; count += 1) {
      await nextTask();
      expect(button.hasAttribute('disabled')).toBe(true);
    }
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('応答が返った直後の反映中も 2 度目のクリックで重複送信しない', async () => {
    // 仕様「`data-click-no-disabled`」の「「実行中」は手続きが終わるまでです」の
    // 「応答が返り、その反映（バインド・メッセージ表示など）が終わるまで」。
    const button = await setup();

    button.click();
    await nextTask();
    pending[0].resolve(
      new Response('{"saved":true}', {
        headers: {'Content-Type': 'application/json'},
      }),
    );
    // 応答を返した直後（反映は始まったばかり）に押す。
    await Promise.resolve();
    button.click();

    await waitForIdle();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('HTTP エラー応答でもロックは解除される', async () => {
    const button = await setup();

    button.click();
    await nextTask();
    pending[0].resolve(
      new Response('{"message":"保存できません"}', {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      }),
    );
    await waitForIdle();

    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(false);
  });

  it('run と fetch を併用したとき fetch の完了までロックが保たれる', async () => {
    // 仕様「`data-{event}-run`」の「`click` 手続きでは await の間も多重実行防止
    // ロック…を保持する」「`data-click-fetch` と併用した場合は run の完了後に
    // fetch が直列実行されます」。run が終わってもフェッチが残る間は解除しない。
    let releaseRun: (() => void) | null = null;
    (globalThis as unknown as {__runGate?: () => Promise<void>}).__runGate =
      () => new Promise<void>(resolve => (releaseRun = resolve));
    container.innerHTML = `
      <div id="t" data-bind='{}'></div>
      <button id="rf" data-click-run="return __runGate()"
              data-click-fetch="/save" data-click-method="post"
              data-click-bind="#t">保存</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    const button = container.querySelector('#rf') as HTMLButtonElement;

    button.click();
    await nextTask();

    // run の完了前はフェッチが始まっていない（直列実行）。
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(button.hasAttribute('disabled')).toBe(true);

    (releaseRun as unknown as () => void)();
    await nextTask();

    // run が終わり、フェッチの応答待ちに入ってもロックは保たれる。
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute('disabled')).toBe(true);

    button.click();
    await nextTask();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('ロックは起点要素ごとで、別のボタンは同時に実行できる', async () => {
    // 仕様「`data-click-no-disabled`」の「`click` 手続きの実行中は**起点要素に**
    // `disabled` 属性が付与され」。ロックの範囲は起点要素であり、別の要素の手続きを
    // 止めない（過剰にロックしていないことの確認）。
    container.innerHTML = `
      <div id="t" data-bind='{}'></div>
      <button id="b1" data-click-fetch="/a" data-click-bind="#t">A</button>
      <button id="b2" data-click-fetch="/b" data-click-bind="#t">B</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    const first = container.querySelector('#b1') as HTMLButtonElement;
    const second = container.querySelector('#b2') as HTMLButtonElement;

    first.click();
    await nextTask();
    second.click();
    await nextTask();

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(first.hasAttribute('disabled')).toBe(true);
    expect(second.hasAttribute('disabled')).toBe(true);
  });

  it('data-click-copy でも反映が終わるまでロックが保たれる', async () => {
    container.innerHTML = `
      <div id="src" data-bind='{"zip":"100-0001"}'></div>
      <div id="dst" data-bind='{"zip":""}'></div>
      <button id="c" data-click-copy="#dst" data-click-copy-source="#src"
              data-click-copy-params="zip">コピー</button>`;
    await Core.scan(container);
    await waitForIdle();
    const button = container.querySelector('#c') as HTMLButtonElement;
    const destination = container.querySelector('#dst') as HTMLElement;

    button.click();
    await nextTask();

    // コピーの反映は完了していない。
    expect(destination.getAttribute('data-bind')).toBe('{"zip":""}');
    expect(button.hasAttribute('disabled')).toBe(true);

    await waitForIdle();
    expect(destination.getAttribute('data-bind')).toContain('100-0001');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('応答が返るとロックが解除され、次のクリックを受け付ける', async () => {
    const button = await setup();

    button.click();
    await nextTask();
    pending[0].resolve(
      new Response('{}', {headers: {'Content-Type': 'application/json'}}),
    );
    await waitForIdle();

    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(false);

    button.click();
    await nextTask();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('通信が失敗してもロックは解除される', async () => {
    const button = await setup();

    button.click();
    await nextTask();
    pending[0].reject(new Error('network down'));
    await waitForIdle();

    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(false);
  });

  it('フェッチを伴わない click でも反映が終わるまでロックが保たれる', async () => {
    // 仕様「`data-click-no-disabled`」の「`click` 手続きの実行中は…二重実行を
    // 防ぎます」は、フェッチを伴わない手続きにも及ぶ。`data-click-reset` の反映は
    // 複数のタスクにまたがるため、その間もロックが保たれることを確認する。
    container.innerHTML = `
      <form id="f" data-bind='{"a":"初期"}'>
        <input name="a" value="初期">
      </form>
      <button id="r" data-click-reset="#f">リセット</button>`;
    await Core.scan(container);
    await waitForIdle();
    const button = container.querySelector('#r') as HTMLButtonElement;
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = '編集';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    button.click();
    await nextTask();

    // リセットは完了していない（入力欄はまだ編集値のまま）。
    expect(input.value).toBe('編集');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(true);

    await waitForIdle();
    expect(input.value).toBe('初期');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('data-click-no-disabled でも応答前の 2 度目のクリックで重複送信しない', async () => {
    const button = await setup('data-click-no-disabled');

    button.click();
    await nextTask();

    // 仕様「`data-click-no-disabled`」の「本属性を付けると `disabled` を付与せず、
    // Haori 内部のマーカーで多重実行のみを防止します」。
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(true);

    button.click();
    await nextTask();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
