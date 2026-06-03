/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-{event}-run（フェッチを伴わない任意 JS 実行）の統合テスト。
 * - クリックで属性値の JS を実行すること。
 * - {{...}} がレンダリング時に展開され、展開後の文字列が実行されること。
 * - 本体が false を返したとき event.preventDefault() が呼ばれること（DOM0/jQuery 準拠）。
 * - false 以外の戻り値では既定動作を抑止しないこと。
 * - 評価エラーは Log.error で報告し、例外を投げないこと。
 * - change など click 以外のイベントでも data-{event}-run が機能すること。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Log from '../src/log';

declare global {
  // テスト用の記録領域。
  var __runLog: number[] | undefined;
}

describe('data-{event}-run（任意 JS 実行）', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    globalThis.__runLog = [];
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.removeChild(container);
    globalThis.__runLog = undefined;
    vi.restoreAllMocks();
  });

  /** 同期ディスパッチ後に手続きの同期プレフィックスが走るのを待つ。 */
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));

  it('クリックで data-click-run の JS を実行する', async () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-click-run', 'globalThis.__runLog.push(11)');
    container.appendChild(btn);
    await Core.scan(container);
    await tick();

    btn.click();
    await tick();

    expect(globalThis.__runLog).toEqual([11]);
  });

  it('{{...}} はレンダリング時に展開され、展開後の値で実行される', async () => {
    container.innerHTML = `
      <div data-bind='{"ruleI": 2}'>
        <button id="b" type="button"
          data-click-run="globalThis.__runLog.push({{ruleI}})"></button>
      </div>`;
    await Core.scan(container);
    await tick();

    (container.querySelector('#b') as HTMLButtonElement).click();
    await tick();

    expect(globalThis.__runLog).toEqual([2]);
  });

  it('本体が false を返すと event.preventDefault() が呼ばれる', async () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-click-run', 'globalThis.__runLog.push(22); return false');
    container.appendChild(btn);
    await Core.scan(container);
    await tick();

    const event = new Event('click', {bubbles: true, cancelable: true});
    btn.dispatchEvent(event);

    // run は同期プレフィックスで実行されるため、ディスパッチ直後に反映される。
    expect(event.defaultPrevented).toBe(true);
    expect(globalThis.__runLog).toEqual([22]);
  });

  it('false 以外（return なし）では既定動作を抑止しない', async () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-click-run', 'globalThis.__runLog.push(33)');
    container.appendChild(btn);
    await Core.scan(container);
    await tick();

    const event = new Event('click', {bubbles: true, cancelable: true});
    btn.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(globalThis.__runLog).toEqual([33]);
  });

  it('評価エラーは Log.error で報告し、例外を投げない', async () => {
    const errorSpy = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    const btn = document.createElement('button');
    btn.type = 'button';
    // 存在しない関数呼び出しで実行時エラーを起こす。
    btn.setAttribute('data-click-run', 'noSuchFunctionAtAll()');
    container.appendChild(btn);
    await Core.scan(container);
    await tick();

    expect(() => btn.click()).not.toThrow();
    await tick();

    const logged = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
    expect(logged).toContain('Run script execution error');
  });

  it('change イベントでも data-change-run が機能する', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-change-run', 'globalThis.__runLog.push(44)');
    container.appendChild(input);
    await Core.scan(container);
    await tick();

    input.dispatchEvent(new Event('change', {bubbles: true}));
    await tick();

    expect(globalThis.__runLog).toEqual([44]);
  });
});
