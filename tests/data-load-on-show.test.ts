/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-if による表示（haori:show）を契機に data-load-* が発火することを検証する
 * 統合テストです。ボタンなどネイティブの load イベントが発生しない要素でも、
 * 非表示→表示への遷移時に data-load-* 手続きが1回だけ実行されることを確認します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Procedure from '../src/procedure';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-load-* の data-if 表示連動発火', () => {
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

  it('非表示の data-if 要素が表示に遷移したとき data-load-* が発火する', async () => {
    // #result は data-load-* の出力先。#state の items が読み込まれて
    // ボタンが表示されたタイミングで data-load-* が発火し、#result へ反映される。
    container.innerHTML = `
      <div id="result" data-bind='{"picked":null}'></div>
      <div id="state" data-bind='{"items":[]}'>
        <button
          id="auto"
          type="button"
          data-if="items.length > 0"
          data-load-data="picked={{items[0]?.id}}"
          data-load-bind="#result"
        >自動選択</button>
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const result = container.querySelector('#result') as HTMLElement;
    const button = container.querySelector('#auto') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    // items が空なので data-if は false。要素は非表示で data-load-* は未発火。
    expect(button.hasAttribute('data-if-false')).toBe(true);
    expect(JSON.parse(result.getAttribute('data-bind') as string).picked).toBe(
      null,
    );

    // 後から items を投入する（reactive な data-bind 更新）。
    await Core.setBindingData(state, {items: [{id: 1}, {id: 2}]});

    // 非表示→表示への遷移で data-load-* が発火し、#result へ picked が反映される。
    await waitForCondition(
      () => {
        const bind = result.getAttribute('data-bind');
        return bind !== null && JSON.parse(bind).picked != null;
      },
      {description: 'data-load-* が #result へ picked を反映する'},
    );

    expect(button.hasAttribute('data-if-false')).toBe(false);
    const bind = JSON.parse(result.getAttribute('data-bind') as string);
    expect(String(bind.picked)).toBe('1');
  });

  it('表示状態のまま再評価しても data-load-* を再発火しない', async () => {
    container.innerHTML = `
      <div id="result2" data-bind='{"count":0}'></div>
      <div id="state2" data-bind='{"items":[{"id":1}],"tick":0}'>
        <button
          id="auto2"
          type="button"
          data-if="items.length > 0"
          data-load-data="hit=1"
          data-load-bind="#result2"
        >x</button>
      </div>
    `;
    const state = container.querySelector('#state2') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    const runSpy = vi.spyOn(Procedure.prototype, 'run');

    // 表示状態を保ったまま無関係な値だけを更新して再評価を促す。
    await Core.setBindingData(state, {items: [{id: 1}], tick: 1});
    await waitForDomSettled();
    await Core.setBindingData(state, {items: [{id: 1}], tick: 2});
    await waitForDomSettled();

    // すでに表示済み（遷移なし）のため load Procedure は再発火しない。
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('data-load-* を持たない data-if 要素では load Procedure を起動しない', async () => {
    container.innerHTML = `
      <div id="state3" data-bind='{"flag":false}'>
        <span id="plain" data-if="flag">表示</span>
      </div>
    `;
    const state = container.querySelector('#state3') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    const runSpy = vi.spyOn(Procedure.prototype, 'run');

    await Core.setBindingData(state, {flag: true});
    await waitForDomSettled();

    // data-load-* を持たないため load 種別の Procedure は1件も起動されない。
    expect(runSpy).not.toHaveBeenCalled();
  });
});
