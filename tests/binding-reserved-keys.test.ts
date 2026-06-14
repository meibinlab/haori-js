/* @vitest-environment jsdom */
/**
 * @fileoverview バインド対象のトップレベルキーが予約名（禁止識別子）と衝突した場合の
 * DOM レンダリング挙動の統合テスト。
 *
 * - 名前空間衝突名（history 等）は明示バインドキーとして利用でき、data-each で描画される。
 * - 実行系・プロトタイプ脱出名（Object 等）は該当キーのみ無視され、他キーは描画される。
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('バインドのトップレベル予約名キー（レンダリング）', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('再バインド可能名（history）をトップレベルキーにしても data-each で描画される', async () => {
    const root = document.createElement('div');
    root.setAttribute(
      'data-bind',
      JSON.stringify({history: [{name: 'A'}, {name: 'B'}]}),
    );
    root.innerHTML = `
      <ul data-each="history">
        <li>{{name}}</li>
      </ul>
    `;
    container.appendChild(root);

    await Core.scan(root);
    await waitForDomSettled();
    await waitForCondition(
      () => container.querySelectorAll('ul li').length === 2,
      {description: 'history rows'},
    );

    const items = Array.from(container.querySelectorAll('ul li')).map(li =>
      li.textContent?.trim(),
    );
    expect(items).toEqual(['A', 'B']);
  });

  it('実行系・脱出名（Object）がトップレベルキーにあっても他キーは描画される', async () => {
    const root = document.createElement('div');
    root.setAttribute(
      'data-bind',
      JSON.stringify({Object: {x: 1}, items: [{name: 'X'}, {name: 'Y'}]}),
    );
    root.innerHTML = `
      <ul data-each="items">
        <li>{{name}}</li>
      </ul>
    `;
    container.appendChild(root);

    await Core.scan(root);
    await waitForDomSettled();
    await waitForCondition(() => container.querySelectorAll('ul li').length === 2, {
      description: 'sibling rows render despite forbidden key',
    });

    const items = Array.from(container.querySelectorAll('ul li')).map(li =>
      li.textContent?.trim(),
    );
    expect(items).toEqual(['X', 'Y']);
  });
});
