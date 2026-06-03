/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 依頼4: data-click-no-disabled の検証。
 * 指定時は click 処理中にボタンへ native `disabled` を付与しない（Bootstrap など他の
 * click ハンドラ・CSS との共存のため）。内部の多重実行ガードは維持されることを確認する。
 *
 * 注意: click 手続きの実行ロックはごく短時間（同期フレーム）しか保持されないため、
 * disabled の有無は btn.click() 直後の同期チェックで検証する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

describe('data-click-no-disabled', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ) as unknown as Promise<Response>,
    );
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it('未指定時はクリック直後にボタンへ disabled が付与される', async () => {
    container.innerHTML = `
      <div id="t" data-bind='{}'></div>
      <button id="b" data-click-fetch="/x" data-click-bind="#t">実行</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    const btn = container.querySelector('#b') as HTMLButtonElement;

    btn.click();
    // クリック直後（同期）にロックと disabled が付与される。
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.hasAttribute('data-haori-click-lock')).toBe(true);

    await waitForDomSettled();
    // 完了後は解除される。
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.hasAttribute('data-haori-click-lock')).toBe(false);
  });

  it('指定時はクリック直後も disabled を付与しないが、ロックは効く', async () => {
    container.innerHTML = `
      <div id="t2" data-bind='{}'></div>
      <button id="b2" data-click-no-disabled data-click-fetch="/x" data-click-bind="#t2">実行</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    const btn = container.querySelector('#b2') as HTMLButtonElement;

    btn.click();
    // disabled は付与されないが、再入防止のロックマーカーは付く。
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.hasAttribute('data-haori-click-lock')).toBe(true);

    // ロック中の同期再クリックは内部ガードで多重実行されない。
    btn.click();
    await waitForDomSettled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // 完了後はロックマーカーが解除され、disabled は一度も付かない。
    expect(btn.hasAttribute('data-haori-click-lock')).toBe(false);
    expect(btn.hasAttribute('disabled')).toBe(false);
  });
});
