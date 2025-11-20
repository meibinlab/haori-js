/* @vitest-environment jsdom */
/**
 * @fileoverview 行操作機能（追加・削除・移動）のテスト
 * formの中とformの外の両方のケースをテスト
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';

describe('Row operations', () => {
  let container: HTMLElement;
  let eventDispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    eventDispatcher = new EventDispatcher();
    eventDispatcher.start();
  });

  afterEach(() => {
    eventDispatcher.stop();
    document.body.removeChild(container);
  });

  describe('Outside form', () => {
    it('should add a new row (data-click-row-add)', async () => {
      container.innerHTML = `
        <div data-bind='{"items":[{"name":"A"},{"name":"B"}]}'>
          <ul data-each="items" data-each-key="name">
            <li>
              <span>{{name}}</span>
              <button data-click-row-add>+</button>
            </li>
          </ul>
        </div>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      let items = container.querySelectorAll('li');
      expect(items.length).toBe(2);

      const buttons = container.querySelectorAll('button[data-click-row-add]');
      (buttons[0] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      items = container.querySelectorAll('li');
      expect(items.length).toBe(3);
    });

    it('should remove a row (data-click-row-remove)', async () => {
      container.innerHTML = `
        <div data-bind='{"items":[{"name":"A"},{"name":"B"},{"name":"C"}]}'>
          <ul data-each="items" data-each-key="name">
            <li>
              <span>{{name}}</span>
              <button data-click-row-remove>-</button>
            </li>
          </ul>
        </div>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      let items = container.querySelectorAll('li span');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('A');
      expect(items[1].textContent).toBe('B');
      expect(items[2].textContent).toBe('C');

      const buttons = container.querySelectorAll(
        'button[data-click-row-remove]'
      );
      (buttons[1] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      items = container.querySelectorAll('li span');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toBe('A');
      expect(items[1].textContent).toBe('C');
    });

    it('should move row up (data-click-row-prev)', async () => {
      container.innerHTML = `
        <div data-bind='{"items":[{"name":"A"},{"name":"B"},{"name":"C"}]}'>
          <ul data-each="items" data-each-key="name">
            <li>
              <span>{{name}}</span>
              <button data-click-row-prev>↑</button>
            </li>
          </ul>
        </div>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      const buttons = container.querySelectorAll('button[data-click-row-prev]');
      (buttons[1] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      const items = container.querySelectorAll('li span');
      expect(items[0].textContent).toBe('B');
      expect(items[1].textContent).toBe('A');
      expect(items[2].textContent).toBe('C');
    });

    it('should move row down (data-click-row-next)', async () => {
      container.innerHTML = `
        <div data-bind='{"items":[{"name":"A"},{"name":"B"},{"name":"C"}]}'>
          <ul data-each="items" data-each-key="name">
            <li>
              <span>{{name}}</span>
              <button data-click-row-next>↓</button>
            </li>
          </ul>
        </div>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      const buttons = container.querySelectorAll('button[data-click-row-next]');
      (buttons[0] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      const items = container.querySelectorAll('li span');
      expect(items[0].textContent).toBe('B');
      expect(items[1].textContent).toBe('A');
      expect(items[2].textContent).toBe('C');
    });
  });

  describe('Inside form', () => {
    it('should add a new row inside form (data-click-row-add)', async () => {
      container.innerHTML = `
        <form data-bind='{"items":[{"name":"A"},{"name":"B"}]}'>
          <div data-each="items" data-each-key="name">
            <div>
              <span>{{name}}</span>
              <button type="button" data-click-row-add>+</button>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      let items = container.querySelectorAll('div[data-each] > div');
      expect(items.length).toBe(2);

      const buttons = container.querySelectorAll('button[data-click-row-add]');
      (buttons[0] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      items = container.querySelectorAll('div[data-each] > div');
      expect(items.length).toBe(3);
    });

    it('should remove a row inside form (data-click-row-remove)', async () => {
      container.innerHTML = `
        <form data-bind='{"items":[{"name":"A"},{"name":"B"},{"name":"C"}]}'>
          <div data-each="items" data-each-key="name">
            <div>
              <span>{{name}}</span>
              <button type="button" data-click-row-remove>-</button>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      let items = container.querySelectorAll('div[data-each] > div span');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('A');
      expect(items[1].textContent).toBe('B');
      expect(items[2].textContent).toBe('C');

      const buttons = container.querySelectorAll(
        'button[data-click-row-remove]'
      );
      (buttons[1] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      items = container.querySelectorAll('div[data-each] > div span');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toBe('A');
      expect(items[1].textContent).toBe('C');
    });

    it('should move row up inside form (data-click-row-prev)', async () => {
      container.innerHTML = `
        <form data-bind='{"items":[{"name":"A"},{"name":"B"},{"name":"C"}]}'>
          <div data-each="items" data-each-key="name">
            <div>
              <span>{{name}}</span>
              <button type="button" data-click-row-prev>↑</button>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      const buttons = container.querySelectorAll('button[data-click-row-prev]');
      (buttons[2] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      const items = container.querySelectorAll('div[data-each] > div span');
      expect(items[0].textContent).toBe('A');
      expect(items[1].textContent).toBe('C');
      expect(items[2].textContent).toBe('B');
    });

    it('should move row down inside form (data-click-row-next)', async () => {
      container.innerHTML = `
        <form data-bind='{"items":[{"name":"A"},{"name":"B"},{"name":"C"}]}'>
          <div data-each="items" data-each-key="name">
            <div>
              <span>{{name}}</span>
              <button type="button" data-click-row-next>↓</button>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      const buttons = container.querySelectorAll('button[data-click-row-next]');
      (buttons[1] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      const items = container.querySelectorAll('div[data-each] > div span');
      expect(items[0].textContent).toBe('A');
      expect(items[1].textContent).toBe('C');
      expect(items[2].textContent).toBe('B');
    });

    it('should handle multiple operations inside form', async () => {
      container.innerHTML = `
        <form data-bind='{"items":[{"name":"A"},{"name":"B"}]}'>
          <div data-each="items" data-each-key="name">
            <div>
              <span>{{name}}</span>
              <button type="button" data-click-row-add>+</button>
              <button type="button" data-click-row-remove>-</button>
              <button type="button" data-click-row-prev>↑</button>
              <button type="button" data-click-row-next>↓</button>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 100));

      // 追加
      let addButtons = container.querySelectorAll('button[data-click-row-add]');
      (addButtons[0] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      let items = container.querySelectorAll('div[data-each] > div');
      expect(items.length).toBe(3);

      // 移動
      let prevButtons = container.querySelectorAll(
        'button[data-click-row-prev]'
      );
      (prevButtons[2] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 削除
      let removeButtons = container.querySelectorAll(
        'button[data-click-row-remove]'
      );
      (removeButtons[0] as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 100));

      items = container.querySelectorAll('div[data-each] > div');
      expect(items.length).toBe(2);
    });
  });
});
