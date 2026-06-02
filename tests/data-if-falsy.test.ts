/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-if の非表示判定が JavaScript の falsy 準拠であることを検証するテストです。
 * `0` や空文字列 `''` は非表示、空配列 `[]` などのオブジェクトは表示されることを確認します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import {waitForDomSettled} from './helpers/async';

describe('data-if の falsy 判定', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  /**
   * 指定 id の要素が非表示（data-if-false 付き）かどうかを返します。
   *
   * @param id 要素 id
   * @return 非表示なら true
   */
  const isHidden = (id: string): boolean =>
    (container.querySelector(`#${id}`) as HTMLElement).hasAttribute(
      'data-if-false',
    );

  it('数値 0（items.length）は非表示、要素があれば表示になる', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"items":[]}'>
        <p id="len" data-if="items.length">件あり</p>
      </div>
    `;
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    // items.length === 0 → falsy → 非表示
    expect(isHidden('len')).toBe(true);

    await Core.setBindingData(root, {items: [{id: 1}]});
    await waitForDomSettled();

    // items.length === 1 → truthy → 表示
    expect(isHidden('len')).toBe(false);
  });

  it('空文字列は非表示、非空文字列は表示になる（存在チェック）', async () => {
    container.innerHTML = `
      <div id="root2" data-bind='{"message":""}'>
        <p id="msg" data-if="message">{{message}}</p>
      </div>
    `;
    const root = container.querySelector('#root2') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    expect(isHidden('msg')).toBe(true);

    await Core.setBindingData(root, {message: 'こんにちは'});
    await waitForDomSettled();

    expect(isHidden('msg')).toBe(false);
  });

  it('空配列・空オブジェクトは truthy として表示される', async () => {
    container.innerHTML = `
      <div id="root3" data-bind='{"list":[],"obj":{}}'>
        <p id="arr" data-if="list">配列あり</p>
        <p id="o" data-if="obj">オブジェクトあり</p>
      </div>
    `;
    const root = container.querySelector('#root3') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    // [] も {} も JavaScript では truthy なので表示
    expect(isHidden('arr')).toBe(false);
    expect(isHidden('o')).toBe(false);
  });
});
