/* @vitest-environment jsdom */
/**
 * @fileoverview カスタムイベント起動（data-on / data-on-*）の回帰テスト。
 * 改修依頼第2回 #2 に対応する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Log from '../src/log';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('カスタムイベント起動（data-on）', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let ran: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    ran = [];
    (window as unknown as Record<string, unknown>).__onCustom = (v: string) =>
      ran.push(v);
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    container.remove();
  });

  it('window へ dispatch されたカスタムイベントで data-on-run が起動する', async () => {
    container.innerHTML = `
      <div data-on="appReady"
        data-on-run="window.__onCustom('win')"></div>
    `;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();

    window.dispatchEvent(new CustomEvent('appReady'));
    await waitForCondition(() => ran.length > 0, {description: 'run 起動'});
    expect(ran).toEqual(['win']);
  });

  it('document へ dispatch されたカスタムイベントでも起動する（二重発火しない）', async () => {
    container.innerHTML = `
      <div data-on="appReady"
        data-on-run="window.__onCustom('doc')"></div>
    `;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();

    document.dispatchEvent(
      new CustomEvent('appReady', {bubbles: true}),
    );
    await waitForCondition(() => ran.length > 0, {description: 'run 起動'});
    // window キャプチャ1本で受けるため二重発火しない
    expect(ran).toEqual(['doc']);
  });

  it('data-on-fetch + data-on-bind が起動する', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({loaded: true}), {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>,
    );
    container.innerHTML = `
      <div data-on="appReady"
        data-on-fetch="/api/init.json" data-on-bind="#target"></div>
      <div id="target" data-bind='{}'></div>
    `;
    const target = container.querySelector('#target') as HTMLElement;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();

    window.dispatchEvent(new CustomEvent('appReady'));
    await waitForCondition(
      () => {
        const bind = JSON.parse(target.getAttribute('data-bind') as string);
        return bind.loaded === true;
      },
      {description: 'fetch→bind 完了'},
    );
    expect(
      JSON.parse(target.getAttribute('data-bind') as string).loaded,
    ).toBe(true);
  });

  it('複数要素が同じイベントを購読していればすべて起動する', async () => {
    container.innerHTML = `
      <div data-on="ready" data-on-run="window.__onCustom('a')"></div>
      <div data-on="ready" data-on-run="window.__onCustom('b')"></div>
    `;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();

    window.dispatchEvent(new CustomEvent('ready'));
    await waitForCondition(() => ran.length >= 2, {description: '両方起動'});
    expect(ran.sort()).toEqual(['a', 'b']);
  });

  it('data-on に組み込みイベント名を書くと警告し購読しない', async () => {
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    container.innerHTML = `
      <div data-on="click" data-on-run="window.__onCustom('builtin')"></div>
    `;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();

    expect(warn).toHaveBeenCalled();
    // click を dispatch しても data-on 経由では起動しない
    window.dispatchEvent(new CustomEvent('click'));
    await waitForDomSettled();
    expect(ran).toEqual([]);
  });

  it('data-import 等で後挿入された data-on も購読される', async () => {
    container.innerHTML = `<div id="host"></div>`;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();

    // 後から data-on 要素を挿入（MutationObserver で購読追加）
    const host = container.querySelector('#host') as HTMLElement;
    host.innerHTML = `
      <div data-on="lateReady" data-on-run="window.__onCustom('late')"></div>
    `;
    await Core.scan(host);
    // MutationObserver の発火を待つ
    await new Promise(resolve => setTimeout(resolve, 0));

    window.dispatchEvent(new CustomEvent('lateReady'));
    await waitForCondition(() => ran.length > 0, {description: '後挿入で起動'});
    expect(ran).toEqual(['late']);
  });

  it('stop() 後はカスタムイベントで起動しない', async () => {
    container.innerHTML = `
      <div data-on="ready" data-on-run="window.__onCustom('x')"></div>
    `;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();
    dispatcher.stop();

    window.dispatchEvent(new CustomEvent('ready'));
    await waitForDomSettled();
    expect(ran).toEqual([]);
  });
});
