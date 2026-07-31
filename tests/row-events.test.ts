/* @vitest-environment jsdom */
/**
 * @fileoverview
 * `data-each` の行イベント（`haori:rowadd` / `haori:rowremove` / `haori:rowmove`）の
 * テストです。仕様書に記載のあるイベントが実際に発火し、detail の内容と発火順序が
 * 仕様どおりであることを固定します。
 *
 * いずれも行要素で発火し、`bubbles: true` によって `data-each` コンテナで購読できます。
 * `rowremove` は行が DOM から外れる前に発火します（外れた後では祖先へ伝播しません）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/** 購読で記録したイベントの内容。 */
interface RecordedEvent {
  /** `haori:` を除いたイベント名。 */
  type: string;
  /** イベントの detail。 */
  detail: Record<string, unknown>;
  /** 発火時点で行が DOM に繋がっていたか。 */
  connected: boolean;
  /** 発火時点の行の表示文字列。 */
  text: string;
}

describe('data-each の行イベント', () => {
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
   * 行イベントをコンテナで購読して記録します。
   *
   * @param target 購読する要素（`data-each` コンテナ）
   * @returns 記録されたイベントの配列（購読中に追記される）
   */
  function record(target: HTMLElement): RecordedEvent[] {
    const events: RecordedEvent[] = [];
    for (const name of ['rowadd', 'rowremove', 'rowmove']) {
      target.addEventListener(`haori:${name}`, (event: Event) => {
        const row = event.target as HTMLElement;
        events.push({
          type: name,
          detail: (event as CustomEvent).detail,
          connected: row.isConnected,
          text: (row.textContent ?? '').trim(),
        });
      });
    }
    return events;
  }

  it('初期描画で行ごとに rowadd が発火する', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"rows":[]}'>
        <ul data-each="rows" data-each-key="id" data-each-arg="row">
          <li class="row">{{row.label}}</li>
        </ul>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;
    const list = container.querySelector('ul') as HTMLElement;
    const events = record(list);

    await Core.scan(container);
    await waitForDomSettled();

    await Core.setBindingData(state, {
      rows: [
        {id: 1, label: 'A'},
        {id: 2, label: 'B'},
      ],
    });
    await waitForCondition(() => events.length >= 2, {
      description: 'rowadd 発火',
    });

    expect(events.map(event => event.type)).toEqual(['rowadd', 'rowadd']);
    expect(events[0].detail).toEqual({
      key: '1',
      index: 0,
      item: {id: 1, label: 'A'},
    });
    expect(events[1].detail).toEqual({
      key: '2',
      index: 1,
      item: {id: 2, label: 'B'},
    });
    // 発火時点で行は DOM に繋がっており、内容の補間も終わっていること。
    expect(events.map(event => event.connected)).toEqual([true, true]);
    expect(events.map(event => event.text)).toEqual(['A', 'B']);
  });

  it('行の削除で rowremove が DOM から外れる前に発火する', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"rows":[{"id":1},{"id":2},{"id":3}]}'>
        <ul data-each="rows" data-each-key="id" data-each-arg="row">
          <li class="row">{{row.id}}</li>
        </ul>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;
    const list = container.querySelector('ul') as HTMLElement;

    await Core.scan(container);
    await waitForCondition(
      () => container.querySelectorAll('.row').length === 3,
      {description: '3 行描画'},
    );

    const events = record(list);
    await Core.setBindingData(state, {rows: [{id: 1}, {id: 3}]});
    await waitForCondition(
      () => events.some(event => event.type === 'rowremove'),
      {description: 'rowremove 発火'},
    );

    const removed = events.filter(event => event.type === 'rowremove');
    expect(removed).toHaveLength(1);
    expect(removed[0].detail).toEqual({key: '2', index: 1});
    // コンテナで購読できる（= 伝播する）のは、外れる前に発火するためである。
    expect(removed[0].connected).toBe(true);
  });

  it('並べ替えで rowmove が移動元と移動先のインデックスを伴って発火する', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"rows":[{"id":1},{"id":2},{"id":3}]}'>
        <ul data-each="rows" data-each-key="id" data-each-arg="row">
          <li class="row">{{row.id}}</li>
        </ul>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;
    const list = container.querySelector('ul') as HTMLElement;

    await Core.scan(container);
    await waitForCondition(
      () => container.querySelectorAll('.row').length === 3,
      {description: '3 行描画'},
    );

    const events = record(list);
    // 3 を先頭へ移す（1, 2, 3 → 3, 1, 2）。
    await Core.setBindingData(state, {rows: [{id: 3}, {id: 1}, {id: 2}]});
    await waitForCondition(
      () =>
        Array.from(container.querySelectorAll('.row'))
          .map(row => row.textContent)
          .join(',') === '3,1,2',
      {description: '並べ替え反映'},
    );

    const moved = events.filter(event => event.type === 'rowmove');
    expect(moved.length).toBeGreaterThan(0);
    // 移動した行だけが対象で、追加・削除は発生しない。
    expect(events.every(event => event.type === 'rowmove')).toBe(true);
    for (const event of moved) {
      expect(event.detail.from).not.toBe(event.detail.to);
      expect(typeof event.detail.key).toBe('string');
    }
    // 先頭へ移した行は to=0 で発火する。
    expect(moved[0].detail.to).toBe(0);
    expect(moved[0].detail.key).toBe('3');
  });

  it('data-each-before / -after は行のインデックスに含めない', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"rows":[{"id":1},{"id":2}]}'>
        <ul data-each="rows" data-each-key="id" data-each-arg="row">
          <li data-each-before class="fixed">見出し</li>
          <li class="row">{{row.id}}</li>
          <li data-each-after class="fixed">合計</li>
        </ul>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;
    const list = container.querySelector('ul') as HTMLElement;

    await Core.scan(container);
    await waitForCondition(
      () => container.querySelectorAll('.row').length === 2,
      {description: '2 行描画'},
    );

    const events = record(list);
    // 2 を先頭へ移す（1, 2 → 2, 1）。
    await Core.setBindingData(state, {rows: [{id: 2}, {id: 1}]});
    await waitForCondition(
      () =>
        Array.from(container.querySelectorAll('.row'))
          .map(row => row.textContent)
          .join(',') === '2,1',
      {description: '並べ替え反映'},
    );

    const moved = events.filter(event => event.type === 'rowmove');
    expect(moved.length).toBeGreaterThan(0);
    // 固定要素（data-each-before）を含めた並びでは from/to が 1 ずれる。
    expect(moved[0].detail.key).toBe('2');
    expect(moved[0].detail.from).toBe(1);
    expect(moved[0].detail.to).toBe(0);
  });
});
