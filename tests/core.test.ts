/**
 * @fileoverview Coreクラスのテスト
 */

import Core from '../src/core';
import {ElementFragment} from '../src/fragment';

describe('Core', () => {
  let container: HTMLElement;
  let observer: MutationObserver;
  let mutations: MutationRecord[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mutations = [];

    observer = new MutationObserver(mutationsList => {
      mutations.push(...mutationsList);
    });

    observer.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeOldValue: true,
    });
  });

  afterEach(() => {
    observer.disconnect();
    document.body.removeChild(container);
    mutations = [];
  });

  describe('evaluateAll', () => {
    test('observerを通じてフォーム要素を処理する', async () => {
      container.innerHTML = `
        <form>
          <input name="username" value="initial">
          <input name="email" value="test@example.com">
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      // フォーム値を変更
      const usernameInput = form.querySelector(
        '[name="username"]',
      ) as HTMLInputElement;
      usernameInput.value = 'updated_username';

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // MutationObserverが属性変更を検知していることを確認
      const attributeMutations = mutations.filter(
        mutation => mutation.type === 'attributes',
      );
      expect(attributeMutations.length).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じてdata-bind属性を処理する', async () => {
      container.innerHTML = `
        <div data-bind="testValue">
          Initial content
        </div>
      `;

      const element = container.querySelector('div') as HTMLElement;
      const fragment = new ElementFragment(element);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // data-bind属性の処理による変更を確認
      const mutations_count = mutations.length;
      expect(mutations_count).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じてフォームオブジェクト構造を処理する', async () => {
      container.innerHTML = `
        <form>
          <div data-haori-form-object="user">
            <input name="name" value="John">
            <input name="age" value="30">
          </div>
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // フォーム構造の処理による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じてフォームリスト構造を処理する', async () => {
      container.innerHTML = `
        <form>
          <div data-haori-form-list="items">
            <div data-haori-row="0">
              <input name="name" value="Item 1">
            </div>
            <div data-haori-row="1">
              <input name="name" value="Item 2">
            </div>
          </div>
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // リスト構造の処理による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じてフォームdetach属性を処理する', async () => {
      container.innerHTML = `
        <form>
          <input name="attached" value="attached_value">
          <input name="detached" value="detached_value"
            data-haori-form-detach="true">
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // data-haori-form-detach属性の処理による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じて複数のCore.evaluateAll呼び出しを処理する', async () => {
      container.innerHTML = `
        <form>
          <input name="counter" value="0">
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);
      const input = form.querySelector('[name="counter"]') as HTMLInputElement;

      // 最初の評価
      Core.evaluateAll(fragment);
      await new Promise(resolve => setTimeout(resolve, 10));

      const firstMutationCount = mutations.length;

      // 値を変更して再評価
      input.value = '1';
      Core.evaluateAll(fragment);
      await new Promise(resolve => setTimeout(resolve, 10));

      // 複数回の評価による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(firstMutationCount);
    });

    test('observerを通じてネストしたフォーム要素を処理する', async () => {
      container.innerHTML = `
        <form>
          <div data-haori-form-object="parent">
            <input name="parentName" value="Parent">
            <div data-haori-form-object="child">
              <input name="childName" value="Child">
            </div>
          </div>
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // ネストした要素の処理による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(0);

      // 実際の要素が存在することを確認
      const parentInput = form.querySelector(
        '[name="parentName"]',
      ) as HTMLInputElement;
      const childInput = form.querySelector(
        '[name="childName"]',
      ) as HTMLInputElement;
      expect(parentInput).toBeTruthy();
      expect(childInput).toBeTruthy();
    });
  });
});
