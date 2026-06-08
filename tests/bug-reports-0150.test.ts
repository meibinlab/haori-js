/* @vitest-environment jsdom */
/**
 * @fileoverview バグ報告（0.15.0）の再現テスト。
 * - バグ1: data-click-confirm が fetch なしのボタンでスキップされる。
 * - バグ2: data-click-click が bind による再描画完了前に発火し、古い URL でフェッチする。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Haori from '../src/haori';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('バグ1: data-click-confirm（fetch なし）', () => {
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

  it('fetch なし（data-click-data + bind）でも confirm が呼ばれ、false なら実行しない', async () => {
    const confirmSpy = vi
      .spyOn(Haori, 'confirm')
      .mockResolvedValue(false);

    container.innerHTML = `
      <div id="dialog-state" data-bind='{"rules":[{"x":1},{"x":2},{"x":3}]}'>
        <button id="del" type="button"
          data-click-confirm="このルールを削除しますか？"
          data-click-data='{"rules": {{rules.filter((r, i) => i !== 1)}} }'
          data-click-bind="#dialog-state" data-click-bind-merge>削除</button>
      </div>
    `;
    const state = container.querySelector('#dialog-state') as HTMLElement;
    const button = container.querySelector('#del') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    button.click();
    await waitForCondition(() => confirmSpy.mock.calls.length > 0, {
      description: 'confirm が呼ばれる',
    });
    // confirm が false を返したので削除は実行されない（rules は 3 件のまま）。
    await waitForDomSettled();
    const bind = JSON.parse(state.getAttribute('data-bind') as string);
    expect(confirmSpy).toHaveBeenCalledWith('このルールを削除しますか？');
    expect(bind.rules).toHaveLength(3);
  });
});

describe('バグ2: data-click-click の再描画前発火', () => {
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

  it('data-click-click はターゲットが新しい id で再描画された後に発火する', async () => {
    const fetchedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : String(input);
      fetchedUrls.push(url);
      if (url.includes('/rules.json')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ruleId: 10}]), {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>;
      }
      // アイテム本体: id=1 を返す
      return Promise.resolve(
        new Response(JSON.stringify({id: 1, name: 'item1'}), {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>;
    });

    container.innerHTML = `
      <div id="dialog-state" data-bind='{"id":null,"rules":[]}'>
        <span hidden id="load-rules-btn"
          data-click-fetch="{{'/api/items/' + id + '/rules.json'}}"
          data-click-bind="#dialog-state" data-click-bind-arg="rules"></span>
      </div>
      <div data-bind='{"id":1}'>
        <button id="edit" type="button"
          data-click-fetch="{{'/api/items/' + id + '.json'}}"
          data-click-bind="#dialog-state"
          data-click-click="#load-rules-btn"></button>
      </div>
    `;
    const button = container.querySelector('#edit') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    button.click();
    await waitForCondition(
      () => fetchedUrls.some(u => u.includes('/rules.json')),
      {description: 'rules.json のフェッチが発生する'},
    );

    const rulesUrl = fetchedUrls.find(u => u.includes('/rules.json'));
    // 期待: id=1 で再描画後に発火 → /api/items/1/rules.json
    expect(rulesUrl).toContain('/api/items/1/rules.json');
    expect(fetchedUrls.some(u => u.includes('/items/null/'))).toBe(false);
  });

  it('（data-each 行内の起点）data-click-click が新しい id で発火する', async () => {
    const fetchedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : String(input);
        fetchedUrls.push(url);
        if (url.includes('/rules.json')) {
          return Promise.resolve(
            new Response(JSON.stringify([{ruleId: 10}]), {
              headers: {'Content-Type': 'application/json'},
            }),
          ) as unknown as Promise<Response>;
        }
        return Promise.resolve(
          new Response(JSON.stringify({id: 1, name: 'item1'}), {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>;
      },
    );

    container.innerHTML = `
      <div id="dialog-state" data-bind='{"id":null,"rules":[]}'>
        <span hidden id="load-rules-btn"
          data-click-fetch="{{'/api/items/' + id + '/rules.json'}}"
          data-click-bind="#dialog-state" data-click-bind-arg="rules"></span>
      </div>
      <div data-bind='{"items":[{"id":1},{"id":2}]}'>
        <div data-each="items" data-each-key="id">
          <button class="edit" type="button"
            data-click-fetch="{{'/api/items/' + id + '.json'}}"
            data-click-bind="#dialog-state"
            data-click-click="#load-rules-btn"></button>
        </div>
      </div>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const firstEdit = container.querySelector('.edit') as HTMLElement;
    firstEdit.click();
    await waitForCondition(
      () => fetchedUrls.some(u => u.includes('/rules.json')),
      {description: 'rules.json のフェッチが発生する'},
    );
    const rulesUrl = fetchedUrls.find(u => u.includes('/rules.json'));
    expect(rulesUrl).toContain('/api/items/1/rules.json');
    expect(fetchedUrls.some(u => u.includes('/items/null/'))).toBe(false);
  });
});

describe('バグ1（data-each 行内）: data-click-confirm', () => {
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

  it('data-each 行内の削除ボタンでも confirm が呼ばれ、false なら削除しない', async () => {
    const confirmSpy = vi.spyOn(Haori, 'confirm').mockResolvedValue(false);

    container.innerHTML = `
      <div id="dialog-state" data-bind='{"rules":[{"x":1},{"x":2},{"x":3}]}'>
        <div data-each="rules" data-each-index="ruleI">
          <button class="del" type="button"
            data-click-confirm="このルールを削除しますか？"
            data-click-data='{"rules": {{rules.filter((r, i) => i !== ruleI)}} }'
            data-click-bind="#dialog-state" data-click-bind-merge>削除</button>
        </div>
      </div>
    `;
    const state = container.querySelector('#dialog-state') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    const firstDel = container.querySelector('.del') as HTMLElement;
    firstDel.click();
    await waitForCondition(() => confirmSpy.mock.calls.length > 0, {
      description: 'confirm が呼ばれる',
    });
    await waitForDomSettled();
    const bind = JSON.parse(state.getAttribute('data-bind') as string);
    expect(confirmSpy).toHaveBeenCalledWith('このルールを削除しますか？');
    expect(bind.rules).toHaveLength(3);
  });
});
