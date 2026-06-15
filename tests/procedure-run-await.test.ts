/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-{event}-run が Promise（thenable）を返した場合の検証。
 * 戻り値が thenable のときは完了まで await し、その間 click 手続きの実行ロック
 * （disabled / RUNNING_CLICK_TARGETS）を保持することで、async ハンドラでも
 * 2 度押しによる多重実行（重複送信）を防げることを確認する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

interface RunAwaitWindow {
  __runCount?: number;
  __resolveTick?: (() => void) | null;
  __tick?: () => Promise<void>;
}

describe('data-{event}-run の Promise 戻り値', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  const win = globalThis as unknown as RunAwaitWindow;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();

    // 手動で解決できる遅延 Promise を返す async 風ハンドラ。
    win.__runCount = 0;
    win.__resolveTick = null;
    win.__tick = () => {
      win.__runCount = (win.__runCount ?? 0) + 1;
      return new Promise<void>(resolve => {
        win.__resolveTick = resolve;
      });
    };
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.removeChild(container);
    win.__runCount = 0;
    win.__resolveTick = null;
    win.__tick = undefined;
  });

  it('async run の実行中はロックを保持し、2 度押しでも 1 回しか実行されない', async () => {
    container.innerHTML = `
      <button id="b" data-click-run="return window.__tick()">保存</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    const btn = container.querySelector('#b') as HTMLButtonElement;

    // 1 回目クリック: run が呼ばれ、返した Promise は未解決のまま。
    btn.click();
    expect(win.__runCount).toBe(1);
    // await 中はロック（disabled / マーカー）が保持される。
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.hasAttribute('data-haori-click-lock')).toBe(true);

    // 実行中（数百 ms 相当）に 2 度目クリック → 多重実行されない。
    btn.click();
    await waitForDomSettled();
    expect(win.__runCount).toBe(1);

    // Promise を解決するとロックが解放される。
    win.__resolveTick?.();
    await waitForDomSettled();
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.hasAttribute('data-haori-click-lock')).toBe(false);

    // 解放後の再クリックは正常に実行される。
    btn.click();
    expect(win.__runCount).toBe(2);
    win.__resolveTick?.();
    await waitForDomSettled();
  });

  it('return を書かない単一式の async run でも await されロックを保持する', async () => {
    // 素の関数呼び出し（return 省略）。式として自動 return され戻り値の Promise が
    // 捕捉されるため、多重実行防止ロックが保持される。
    container.innerHTML = `
      <button id="b2" data-click-run="window.__tick()">保存</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    const btn = container.querySelector('#b2') as HTMLButtonElement;

    btn.click();
    expect(win.__runCount).toBe(1);
    // await 中はロックが保持される。
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.hasAttribute('data-haori-click-lock')).toBe(true);

    // 実行中の 2 度目クリックは多重実行されない。
    btn.click();
    await waitForDomSettled();
    expect(win.__runCount).toBe(1);

    // 解決でロック解放、再クリックで再実行可能。
    win.__resolveTick?.();
    await waitForDomSettled();
    expect(btn.hasAttribute('disabled')).toBe(false);
    btn.click();
    expect(win.__runCount).toBe(2);
    win.__resolveTick?.();
    await waitForDomSettled();
  });

  it('複数文（式化不可）の run は明示 return に従って await される', async () => {
    // 複数文は従来の文ブロックとして生成される。本体内で明示的に return した
    // Promise は await され、ロックを保持する。
    container.innerHTML = `
      <button id="b3" data-click-run="const p = window.__tick(); return p;">保存</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    const btn = container.querySelector('#b3') as HTMLButtonElement;

    btn.click();
    expect(win.__runCount).toBe(1);
    expect(btn.hasAttribute('disabled')).toBe(true);

    btn.click();
    await waitForDomSettled();
    expect(win.__runCount).toBe(1);

    win.__resolveTick?.();
    await waitForDomSettled();
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('同期 run（非 thenable）は従来どおり即時にロックが解放される', async () => {
    (win as unknown as {__syncCount?: number}).__syncCount = 0;
    (
      win as unknown as {__syncRun?: () => void}
    ).__syncRun = () => {
      const w = win as unknown as {__syncCount?: number};
      w.__syncCount = (w.__syncCount ?? 0) + 1;
    };
    container.innerHTML = `
      <button id="s" data-click-run="window.__syncRun()">同期</button>`;
    await Core.scan(container);
    await waitForDomSettled();
    const btn = container.querySelector('#s') as HTMLButtonElement;

    btn.click();
    await waitForDomSettled();
    expect((win as unknown as {__syncCount?: number}).__syncCount).toBe(1);
    // 同期完了後はロックが解放されている。
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.hasAttribute('data-haori-click-lock')).toBe(false);
  });
});
