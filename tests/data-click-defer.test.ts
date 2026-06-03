/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-click-defer の検証（改修依頼4）。
 * 指定時は Haori の click 処理（Procedure）をクリックイベントの同期実行中ではなく
 * 次フレーム/次マクロタスクへ遅延し、Bootstrap など他ライブラリの同期 click ハンドラを
 * 先に完了させる。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Procedure from '../src/procedure';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-click-defer', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    vi.restoreAllMocks();
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

  it('指定時は Procedure をクリック同期中に実行せず、後で実行する', async () => {
    container.innerHTML = `
      <div id="t" data-bind='{}'></div>
      <button id="b" data-click-defer data-click-data="x=1" data-click-bind="#t">go</button>`;
    await Core.scan(container);
    await waitForDomSettled();

    const runSpy = vi.spyOn(Procedure.prototype, 'run');
    (container.querySelector('#b') as HTMLElement).click();
    // クリックイベントの同期実行直後は、まだ Procedure が起動していない（遅延）。
    expect(runSpy).not.toHaveBeenCalled();

    // 次フレーム後に起動される。
    await waitForCondition(() => runSpy.mock.calls.length > 0, {
      description: 'deferred run',
    });
    expect(runSpy).toHaveBeenCalled();
  });

  it('未指定時は Procedure をクリック同期中に起動する', async () => {
    container.innerHTML = `
      <div id="t2" data-bind='{}'></div>
      <button id="b2" data-click-data="x=1" data-click-bind="#t2">go</button>`;
    await Core.scan(container);
    await waitForDomSettled();

    const runSpy = vi.spyOn(Procedure.prototype, 'run');
    (container.querySelector('#b2') as HTMLElement).click();
    // 遅延しないため、同期実行中に起動済み。
    expect(runSpy).toHaveBeenCalled();
  });
});
