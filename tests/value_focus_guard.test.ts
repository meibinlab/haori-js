/* @vitest-environment jsdom */
/**
 * @fileoverview value="{{式}}" のフォーカス中再適用スキップの回帰テスト。
 *
 * フォーカス中（ユーザー編集中）の入力には、別要素起因の再評価で式の評価結果を
 * 強制再適用しない。フォーカスが外れている入力には従来どおり再適用する。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';
import {waitForDomSettled} from './helpers/async';

describe('value="{{式}}" のフォーカス中再適用スキップ', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('フォーカス中の入力には再評価で value を再適用しない', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"x":"server"}'>
        <input id="inp" value="{{x}}">
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const input = container.querySelector('#inp') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();
    expect(input.value).toBe('server');

    // ユーザーがフォーカスして入力中（未コミット）
    input.focus();
    expect(document.activeElement).toBe(input);
    input.value = 'typing...';

    // 別要素起因の再評価相当（同じ x で再描画してもフォーカス中は巻き戻さない）
    await Core.setBindingData(state, {x: 'server'});
    await waitForDomSettled();

    expect(input.value).toBe('typing...');
  });

  it('フォーカスが外れている入力には再評価で value を再適用する', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"x":"old"}'>
        <input id="inp" value="{{x}}">
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const input = container.querySelector('#inp') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();
    expect(input.value).toBe('old');

    // フォーカスしていない状態でバインド値を更新 → 反映される
    await Core.setBindingData(state, {x: 'new'});
    await waitForDomSettled();

    expect(input.value).toBe('new');
  });

  it('フォーカスを外した後の再評価では最新のバインド値が反映される', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"x":"server"}'>
        <input id="inp" value="{{x}}">
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const input = container.querySelector('#inp') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();

    input.focus();
    input.value = 'typing...';
    await Core.setBindingData(state, {x: 'server2'});
    await waitForDomSettled();
    // フォーカス中は据え置き
    expect(input.value).toBe('typing...');

    // フォーカスを外して再評価 → 最新値が反映
    input.blur();
    await Core.setBindingData(state, {x: 'server3'});
    await waitForDomSettled();
    expect(input.value).toBe('server3');
  });
});
