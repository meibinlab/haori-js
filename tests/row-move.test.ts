/* @vitest-environment jsdom */
/**
 * @fileoverview 行移動機能のテスト
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';

describe('Row move functionality', () => {
  let container: HTMLElement;
  let eventDispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // EventDispatcherを起動
    eventDispatcher = new EventDispatcher();
    eventDispatcher.start();
  });

  afterEach(() => {
    eventDispatcher.stop();
    document.body.removeChild(container);
  });

  it('should move row up (data-click-row-prev)', async () => {
    // テストHTML作成
    container.innerHTML = `
      <div data-bind='{"items":[
        {"name":"Item 1"},{"name":"Item 2"},{"name":"Item 3"}
      ]}'>
        <ul data-each="items" data-each-key="name">
          <li>
            <span>{{name}}</span>
            <button data-click-row-prev>↑</button>
          </li>
        </ul>
      </div>
    `;

    // Haoriを初期化
    await Core.scan(container);

    // 少し待機してDOMが構築されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    // 2番目の項目（Item 2）を上に移動
    const buttons = container.querySelectorAll('button[data-click-row-prev]');
    expect(buttons.length).toBe(3);

    // 2番目のボタンをクリック
    const secondButton = buttons[1] as HTMLButtonElement;
    secondButton.click();

    // 少し待機して処理が完了するのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    // 順序を確認
    const items = container.querySelectorAll('li span');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('Item 2');
    expect(items[1].textContent).toBe('Item 1');
    expect(items[2].textContent).toBe('Item 3');
  });

  it('should move row down (data-click-row-next)', async () => {
    // テストHTML作成
    container.innerHTML = `
      <div data-bind='{"items":[
        {"name":"Item 1"},{"name":"Item 2"},{"name":"Item 3"}
      ]}'>
        <ul data-each="items" data-each-key="name">
          <li>
            <span>{{name}}</span>
            <button data-click-row-next>↓</button>
          </li>
        </ul>
      </div>
    `;

    // Haoriを初期化
    await Core.scan(container);

    // 少し待機してDOMが構築されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    // 1番目の項目（Item 1）を下に移動
    const buttons = container.querySelectorAll('button[data-click-row-next]');
    expect(buttons.length).toBe(3);

    // 1番目のボタンをクリック
    const firstButton = buttons[0] as HTMLButtonElement;
    firstButton.click();

    // 少し待機して処理が完了するのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    // 順序を確認
    const items = container.querySelectorAll('li span');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('Item 2');
    expect(items[1].textContent).toBe('Item 1');
    expect(items[2].textContent).toBe('Item 3');
  });

  it('should not move first row up', async () => {
    // テストHTML作成
    container.innerHTML = `
      <div data-bind='{"items":[
        {"name":"Item 1"},{"name":"Item 2"},{"name":"Item 3"}
      ]}'>
        <ul data-each="items" data-each-key="name">
          <li>
            <span>{{name}}</span>
            <button data-click-row-prev>↑</button>
          </li>
        </ul>
      </div>
    `;

    // Haoriを初期化
    await Core.scan(container);

    // 少し待機してDOMが構築されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    // 1番目の項目（Item 1）を上に移動しようとする
    const buttons = container.querySelectorAll('button[data-click-row-prev]');
    const firstButton = buttons[0] as HTMLButtonElement;
    firstButton.click();

    // 少し待機して処理が完了するのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    // 順序が変わらないことを確認
    const items = container.querySelectorAll('li span');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('Item 1');
    expect(items[1].textContent).toBe('Item 2');
    expect(items[2].textContent).toBe('Item 3');
  });

  it('should not move last row down', async () => {
    // テストHTML作成
    container.innerHTML = `
      <div data-bind='{"items":[
        {"name":"Item 1"},{"name":"Item 2"},{"name":"Item 3"}
      ]}'>
        <ul data-each="items" data-each-key="name">
          <li>
            <span>{{name}}</span>
            <button data-click-row-next>↓</button>
          </li>
        </ul>
      </div>
    `;

    // Haoriを初期化
    await Core.scan(container);

    // 少し待機してDOMが構築されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    // 最後の項目（Item 3）を下に移動しようとする
    const buttons = container.querySelectorAll('button[data-click-row-next]');
    const lastButton = buttons[2] as HTMLButtonElement;
    lastButton.click();

    // 少し待機して処理が完了するのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    // 順序が変わらないことを確認
    const items = container.querySelectorAll('li span');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('Item 1');
    expect(items[1].textContent).toBe('Item 2');
    expect(items[2].textContent).toBe('Item 3');
  });

  it('should maintain data integrity after multiple moves', async () => {
    // テストHTML作成
    container.innerHTML = `
      <div data-bind='{"items":[
        {"name":"A"},{"name":"B"},{"name":"C"},{"name":"D"}
      ]}'>
        <ul data-each="items" data-each-key="name">
          <li>
            <span>{{name}}</span>
            <button class="up" data-click-row-prev>↑</button>
            <button class="down" data-click-row-next>↓</button>
          </li>
        </ul>
      </div>
    `;

    // Haoriを初期化
    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 100));

    // D を上に移動 (A, B, C, D) -> (A, B, D, C)
    let buttons = container.querySelectorAll('button.up');
    (buttons[3] as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 100));

    let items = container.querySelectorAll('li span');
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('B');
    expect(items[2].textContent).toBe('D');
    expect(items[3].textContent).toBe('C');

    // D をさらに上に移動 (A, B, D, C) -> (A, D, B, C)
    buttons = container.querySelectorAll('button.up');
    (buttons[2] as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 100));

    items = container.querySelectorAll('li span');
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('D');
    expect(items[2].textContent).toBe('B');
    expect(items[3].textContent).toBe('C');

    // A を下に移動 (A, D, B, C) -> (D, A, B, C)
    buttons = container.querySelectorAll('button.down');
    (buttons[0] as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 100));

    items = container.querySelectorAll('li span');
    expect(items[0].textContent).toBe('D');
    expect(items[1].textContent).toBe('A');
    expect(items[2].textContent).toBe('B');
    expect(items[3].textContent).toBe('C');
  });
});
