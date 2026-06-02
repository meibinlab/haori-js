/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-{event}-bind-merge による浅いマージバインドの統合テストです。
 * bind-merge 指定時はバインド先の既存 binding data を保持したまま、
 * 解決済みデータで上書きすることを確認します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-bind-merge（浅いマージバインド）', () => {
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

  it('bind-merge 指定時は既存キー（items）を保持しつつ selectedId を上書きする', async () => {
    // items 読み込み後にボタンが表示され、data-load-* で selectedId を #state へ
    // マージする。bind-merge により items は消えない。
    container.innerHTML = `
      <div id="state" data-bind='{"items":[],"selectedId":null}'>
        <button
          id="auto"
          type="button"
          data-if="items.length > 0 && !selectedId"
          data-load-data="selectedId={{items[0]?.id}}"
          data-load-bind="#state"
          data-load-bind-merge
        >自動選択</button>
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    await Core.setBindingData(state, {
      items: [{id: 1, name: 'A'}, {id: 2, name: 'B'}],
      selectedId: null,
    });

    await waitForCondition(
      () => {
        const bind = state.getAttribute('data-bind');
        return bind !== null && JSON.parse(bind).selectedId != null;
      },
      {description: 'data-load-bind-merge で selectedId が反映される'},
    );

    const bind = JSON.parse(state.getAttribute('data-bind') as string);
    // selectedId は反映され、items は保持される。
    expect(String(bind.selectedId)).toBe('1');
    expect(Array.isArray(bind.items)).toBe(true);
    expect(bind.items).toHaveLength(2);
  });

  it('bind-merge を指定しない場合は従来どおり全置換でキーが消える', async () => {
    container.innerHTML = `
      <div id="src" data-bind='{"value":"x"}'>
        <button
          id="btn"
          type="button"
          data-click-data="picked=1"
          data-click-bind="#dest"
        >set</button>
      </div>
      <div id="dest" data-bind='{"keep":"yes","picked":null}'></div>
    `;
    const dest = container.querySelector('#dest') as HTMLElement;
    const button = container.querySelector('#btn') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    button.click();
    await waitForCondition(
      () => {
        const bind = dest.getAttribute('data-bind');
        return bind !== null && JSON.parse(bind).picked != null;
      },
      {description: 'bind で picked が反映される'},
    );

    const bind = JSON.parse(dest.getAttribute('data-bind') as string);
    // 全置換のため keep は消える（従来挙動）。
    expect(String(bind.picked)).toBe('1');
    expect('keep' in bind).toBe(false);
  });
});
