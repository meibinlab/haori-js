/* @vitest-environment jsdom */
/**
 * @fileoverview 行操作機能（追加・削除・移動）のテスト
 * formの中とformの外の両方のケースをテスト
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForIdle} from './helpers/async';

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

  it('popstate は start/stop で登録・解除される', () => {
    const mockReload = vi.fn();
    vi.stubGlobal('location', {reload: mockReload});

    eventDispatcher.stop();
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: {__haoriHistoryState__: true},
      }),
    );
    expect(mockReload).not.toHaveBeenCalled();

    eventDispatcher.start();
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: {__haoriHistoryState__: true},
      }),
    );
    expect(mockReload).toHaveBeenCalledTimes(1);

    eventDispatcher.stop();
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: {__haoriHistoryState__: true},
      }),
    );
    expect(mockReload).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
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
      // 最終状態を検証するので `waitForIdle()` で待つ。固定サイクルの
      // `waitForDomSettled()` では余裕がなく、1 サイクル短くなるだけで行が
      // 描き終わらない（`docs/ja/testing.md`「余裕の棚卸し」）。
      await waitForIdle();

      let items = container.querySelectorAll('li');
      expect(items.length).toBe(2);

      const buttons = container.querySelectorAll('button[data-click-row-add]');
      (buttons[0] as HTMLButtonElement).click();
      await waitForIdle();

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
      await waitForIdle();

      let items = container.querySelectorAll('li span');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('A');
      expect(items[1].textContent).toBe('B');
      expect(items[2].textContent).toBe('C');

      const buttons = container.querySelectorAll(
        'button[data-click-row-remove]',
      );
      (buttons[1] as HTMLButtonElement).click();
      await waitForIdle();

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
      await waitForIdle();

      const buttons = container.querySelectorAll('button[data-click-row-prev]');
      (buttons[1] as HTMLButtonElement).click();
      await waitForIdle();

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
      await waitForIdle();

      const buttons = container.querySelectorAll('button[data-click-row-next]');
      (buttons[0] as HTMLButtonElement).click();
      await waitForIdle();

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
      await waitForIdle();

      let items = container.querySelectorAll('div[data-each] > div');
      expect(items.length).toBe(2);

      const buttons = container.querySelectorAll('button[data-click-row-add]');
      (buttons[0] as HTMLButtonElement).click();
      await waitForIdle();

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
      await waitForIdle();

      let items = container.querySelectorAll('div[data-each] > div span');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('A');
      expect(items[1].textContent).toBe('B');
      expect(items[2].textContent).toBe('C');

      const buttons = container.querySelectorAll(
        'button[data-click-row-remove]',
      );
      (buttons[1] as HTMLButtonElement).click();
      await waitForIdle();

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
      await waitForIdle();

      const buttons = container.querySelectorAll('button[data-click-row-prev]');
      (buttons[2] as HTMLButtonElement).click();
      await waitForIdle();

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
      await waitForIdle();

      const buttons = container.querySelectorAll('button[data-click-row-next]');
      (buttons[1] as HTMLButtonElement).click();
      await waitForIdle();

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
      await waitForIdle();

      // 行操作はバインディングデータの更新を経て差分更新で再描画されるため、
      // 描画が確定するまで待ってから確認する。
      //
      // **件数ではなく並びを見る。** この列は 2 件 → 3 件 → 3 件 → 2 件と動くため、
      // 最終件数（2）は初期状態と同じであり、3 つの操作がすべて失敗しても件数の検証は
      // 通ってしまう。
      const rowNames = (): string[] =>
        Array.from(container.querySelectorAll('div[data-each] > div span')).map(
          span => span.textContent ?? '',
        );

      expect(rowNames()).toEqual(['A', 'B']);

      // 追加。仕様「`data-{event}-row-add`」「対象要素が属する行の**直後**に新しい行を追加します。
      // 追加された行の入力欄は空の状態になります」→ A の直後へ空行が入る。
      const addButtons = container.querySelectorAll(
        'button[data-click-row-add]',
      );
      (addButtons[0] as HTMLButtonElement).click();
      await waitForIdle();
      expect(rowNames()).toEqual(['A', '', 'B']);

      // 移動。仕様「`data-{event}-row-prev`」「対象要素が属する行と前の行を入れ替えます」→ 3 行目（B）を
      // 前（空行）と入れ替える。
      const prevButtons = container.querySelectorAll(
        'button[data-click-row-prev]',
      );
      (prevButtons[2] as HTMLButtonElement).click();
      // 移動では件数が変わらないため、件数を条件にすると**操作の前から成立**して
      // まったく待たない。最終状態を待つ（`docs/ja/testing.md`
      // 「待ち合わせの条件は最終状態そのもので書く」）。
      await waitForIdle();
      expect(rowNames()).toEqual(['A', 'B', '']);

      // 削除。仕様「`data-{event}-row-remove`」「対象要素が属する行を削除します」→ 1 行目（A）を消す。
      const removeButtons = container.querySelectorAll(
        'button[data-click-row-remove]',
      );
      (removeButtons[0] as HTMLButtonElement).click();
      await waitForIdle();

      expect(rowNames()).toEqual(['B', '']);
    });
  });
});
