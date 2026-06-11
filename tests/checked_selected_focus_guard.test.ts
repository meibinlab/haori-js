/* @vitest-environment jsdom */
/**
 * @fileoverview checked / selected のフォーカス中スキップ（value と挙動統一）の
 * 回帰テスト。改修依頼第2回 #5 の修正に対応する。
 *
 * 操作中（select / radio / checkbox がフォーカス中）の要素には、再評価で
 * checked / selected を再適用しない。フォーカスが外れた要素には宣言状態を反映する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

describe('checked / selected のフォーカス中スキップ', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
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

  it('#5: フォーカス中の select は change 起因の再評価で選択が巻き戻らない', async () => {
    const ran: string[] = [];
    (window as unknown as Record<string, unknown>).__onRun = (v: string) =>
      ran.push(v);

    // option の data-attr-selected は select の name(materialId) と別キー
    // (selectedId) を参照する。0.16.0 ではユーザー選択が再評価で巻き戻っていた。
    container.innerHTML = `
      <div id="wrap" data-bind='{"selectedId":"a"}'>
        <form id="f">
          <select id="s" name="materialId"
            data-change-run="window.__onRun(event.target.value)">
            <option value="a" data-attr-selected="{{selectedId === 'a'}}">A</option>
            <option value="b" data-attr-selected="{{selectedId === 'b'}}">B</option>
          </select>
        </form>
      </div>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const select = container.querySelector('#s') as HTMLSelectElement;
    expect(select.value).toBe('a');

    // 実ブラウザ同様、ユーザーは select にフォーカスして選択する。
    select.focus();
    select.value = 'b';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    expect(ran, 'data-change-run が発火する').toContain('b');
    expect(select.value, 'フォーカス中は選択が巻き戻らない').toBe('b');
  });

  it('フォーカスが外れている select には宣言状態を反映する', async () => {
    container.innerHTML = `
      <div id="wrap" data-bind='{"sel":"a"}'>
        <select id="s">
          <option value="a" data-attr-selected="{{sel === 'a'}}">A</option>
          <option value="b" data-attr-selected="{{sel === 'b'}}">B</option>
        </select>
      </div>
    `;
    const wrap = container.querySelector('#wrap') as HTMLElement;
    const select = container.querySelector('#s') as HTMLSelectElement;
    await Core.scan(container);
    await waitForDomSettled();
    expect(select.value).toBe('a');

    // フォーカスしていない状態で宣言状態を更新 → 反映される
    await Core.setBindingData(wrap, {sel: 'b'});
    await waitForDomSettled();
    expect(select.value).toBe('b');
  });

  it('フォーカス中の checkbox は再評価でチェック状態が巻き戻らない', async () => {
    container.innerHTML = `
      <div id="wrap" data-bind='{"flag":false,"tick":0}'>
        <input id="cb" type="checkbox" value="x" data-attr-checked="{{flag}}">
      </div>
    `;
    const wrap = container.querySelector('#wrap') as HTMLElement;
    const cb = container.querySelector('#cb') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();
    expect(cb.checked).toBe(false);

    // ユーザーがフォーカスしてチェック
    cb.focus();
    cb.checked = true;
    cb.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // flag は更新していない別キー更新で再評価 → フォーカス中は巻き戻さない
    await Core.setBindingData(wrap, {flag: false, tick: 1});
    await waitForDomSettled();
    expect(cb.checked, 'フォーカス中はチェックが巻き戻らない').toBe(true);
  });

  it('フォーカスが外れている checkbox には宣言状態を反映する', async () => {
    container.innerHTML = `
      <div id="wrap" data-bind='{"flag":false}'>
        <input id="cb" type="checkbox" value="x" data-attr-checked="{{flag}}">
      </div>
    `;
    const wrap = container.querySelector('#wrap') as HTMLElement;
    const cb = container.querySelector('#cb') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();
    expect(cb.checked).toBe(false);

    await Core.setBindingData(wrap, {flag: true});
    await waitForDomSettled();
    expect(cb.checked).toBe(true);
  });
});
