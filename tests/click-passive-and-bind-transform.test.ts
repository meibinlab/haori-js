/* @vitest-environment jsdom */
/**
 * @fileoverview
 * - `data-click-passive`: 内側のクリックを外側の data-click-* へ伝播させない境界の検証。
 * - `data-click-bind-transform`: レスポンスをバインド前に式変換する機能の検証。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-click-passive（クリック境界）', () => {
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

  it('passive 境界の内側の input クリックは外側の data-click-* を発火しない', async () => {
    container.innerHTML = `
      <div data-click-data="clicked=1" data-click-bind="#sink">
        <div data-click-passive class="field">
          <input id="inp" name="x" />
        </div>
      </div>
      <div id="sink" data-bind='{"clicked":0}'></div>
    `;
    const input = container.querySelector('#inp') as HTMLElement;
    const sink = container.querySelector('#sink') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    input.click();
    await waitForDomSettled();

    // 外側の data-click は発火しないため clicked は 0 のまま。
    const bind = JSON.parse(sink.getAttribute('data-bind') as string);
    expect(bind.clicked).toBe(0);
  });

  it('passive が無ければ内側 input クリックで外側 data-click-* が発火する（対照）', async () => {
    container.innerHTML = `
      <div data-click-data="clicked=1" data-click-bind="#sink2">
        <div class="field">
          <input id="inp2" name="x" />
        </div>
      </div>
      <div id="sink2" data-bind='{"clicked":0}'></div>
    `;
    const input = container.querySelector('#inp2') as HTMLElement;
    const sink = container.querySelector('#sink2') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    input.click();
    await waitForCondition(
      () =>
        Number(JSON.parse(sink.getAttribute('data-bind') as string).clicked) ===
        1,
      {description: '外側 data-click が発火する'},
    );
  });

  it('passive 境界の内側でも data-click-* を持つ要素自身は発火する', async () => {
    container.innerHTML = `
      <div data-click-passive>
        <button id="inner" type="button"
          data-click-data="hit=1" data-click-bind="#sink3">btn</button>
      </div>
      <div id="sink3" data-bind='{"hit":0}'></div>
    `;
    const button = container.querySelector('#inner') as HTMLElement;
    const sink = container.querySelector('#sink3') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    button.click();
    await waitForCondition(
      () =>
        Number(JSON.parse(sink.getAttribute('data-bind') as string).hit) === 1,
      {description: '内側ボタンの data-click は発火する'},
    );
  });
});

describe('data-click-bind-transform（レスポンス変換）', () => {
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

  it('レスポンス配列を式変換してから bind-arg のキーへ入れ、他キーは保持する', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {id: 10, name: 'a'},
              {id: 11, name: 'b'},
            ]),
            {headers: {'Content-Type': 'application/json'}},
          ),
        ) as unknown as Promise<Response>,
    );
    container.innerHTML = `
      <div id="state" data-bind='{"rules":[], "editingRuleIndex":5}'>
        <button id="load" type="button"
          data-click-fetch="/api/rules"
          data-click-bind="#state"
          data-click-bind-arg="rules"
          data-click-bind-transform="response.map(item => ({...item, id: null}))"
        >load</button>
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const button = container.querySelector('#load') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    button.click();
    await waitForCondition(
      () => {
        const bind = JSON.parse(state.getAttribute('data-bind') as string);
        return Array.isArray(bind.rules) && bind.rules.length === 2;
      },
      {description: 'rules が変換後の配列で入る'},
    );
    const bind = JSON.parse(state.getAttribute('data-bind') as string);
    expect(bind.rules).toEqual([
      {id: null, name: 'a'},
      {id: null, name: 'b'},
    ]);
    // bind-arg は該当キーのみ patch するため editingRuleIndex は保持される。
    expect(bind.editingRuleIndex).toBe(5);
  });
});
