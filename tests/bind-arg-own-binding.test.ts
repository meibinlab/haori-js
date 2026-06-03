/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-*-bind-arg が「バインド先自身の binding（own）」のみを基底に bindArg キーを
 * 更新することを検証する（改修依頼: 並行/リアクティブ bind-arg の原子性）。
 * - 継承キーを own の data-bind に混入させない。
 * - 連続した bind-arg バインドで各キーが保持され、互いに上書きしない。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-*-bind-arg の own-binding 原子更新', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: any) => {
      const u = String(url);
      const body = u.includes('/a') ? {av: 1} : {bv: 2};
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>;
    });
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it('継承キーを混入させず、連続 bind-arg で両キーを保持する', async () => {
    container.innerHTML = `
      <div id="outer" data-bind='{"inheritedKey":"X"}'>
        <div id="state"></div>
        <button id="ba" data-click-fetch="/a" data-click-bind="#state" data-click-bind-arg="alpha">A</button>
        <button id="bb" data-click-fetch="/b" data-click-bind="#state" data-click-bind-arg="beta">B</button>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    (container.querySelector('#ba') as HTMLElement).click();
    await waitForCondition(() => {
      const b = state.getAttribute('data-bind');
      return b !== null && JSON.parse(b).alpha != null;
    }, {description: 'alpha bound'});

    (container.querySelector('#bb') as HTMLElement).click();
    await waitForCondition(() => {
      const b = state.getAttribute('data-bind');
      return b !== null && JSON.parse(b).beta != null;
    }, {description: 'beta bound'});

    const own = JSON.parse(state.getAttribute('data-bind') as string);
    // 両 bind-arg キーが保持される（互いに上書きしない）。
    expect(own.alpha).toEqual({av: 1});
    expect(own.beta).toEqual({bv: 2});
    // 継承キーは own に混入しない。
    expect('inheritedKey' in own).toBe(false);
  });
});
