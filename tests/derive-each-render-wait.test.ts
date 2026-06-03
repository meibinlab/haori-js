/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 報告調査: data-derive → data-each 連鎖のテーブル行描画が、外部テスト
 * （waitForRenders 待機）で 0 行になり得るかを検証する。
 * - Q1: 明示的オブジェクトリテラル {key: val} が式評価を通過するか。
 * - Q2: Haori.waitForRenders() が data-derive → data-each の連鎖全体を待機するか。
 * - Q3: 0 件時の data-each-done の付与（0 件完了と n 件完了の区別可否）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Expression from '../src/expression';
import Haori from '../src/haori';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-derive → data-each 連鎖の描画待機（報告調査）', () => {
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

  it('Q1: 明示的オブジェクトリテラル {key: val} を含む式が評価される', () => {
    const result = Expression.evaluate(
      '(items ?? []).map(x => ({id: x.id, label: x.name}))',
      {items: [{id: 1, name: 'A'}, {id: 2, name: 'B'}]},
    );
    expect(result).toEqual([
      {id: 1, label: 'A'},
      {id: 2, label: 'B'},
    ]);
  });

  it('Q1: トップレベルのオブジェクトリテラルも評価される', () => {
    const result = Expression.evaluate('{a: 1, b: total + 1}', {total: 9});
    expect(result).toEqual({a: 1, b: 10});
  });

  it('Q2: waitForRenders() で derive→each 連鎖の行描画まで待機できる', async () => {
    // demandRows を data-derive で配列に整形し、data-each で行描画する連鎖。
    container.innerHTML = `
      <div id="state" data-bind='{"response":{"content":[]}}'>
        <div data-derive="(response?.content ?? []).map(r => ({id: r.id, label: r.label}))" data-derive-name="demandRows">
          <table><tbody data-each="demandRows" data-each-key="id" data-each-arg="row">
            <tr><td class="cell">{{row.label}}</td></tr>
          </tbody></table>
        </div>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    // bind-arg 相当: API レスポンスを state にバインド（Promise を待たず外部テスト相当）。
    void Core.setBindingData(state, {
      response: {
        content: [
          {id: 1, label: '行1'},
          {id: 2, label: '行2'},
          {id: 3, label: '行3'},
        ],
      },
    });
    await Haori.waitForRenders();

    const cells = Array.from(container.querySelectorAll('.cell'));
    expect(cells.map(c => c.textContent)).toEqual(['行1', '行2', '行3']);
  });

  it('Q3: 0 件の derive→each でも data-each-done が付与される', async () => {
    container.innerHTML = `
      <div id="state3" data-bind='{"response":{"content":[{"id":1,"label":"x"}]}}'>
        <div data-derive="(response?.content ?? []).map(r => ({id: r.id, label: r.label}))" data-derive-name="rows3">
          <table><tbody id="tb3" data-each="rows3" data-each-key="id" data-each-arg="row">
            <tr><td class="cell3">{{row.label}}</td></tr>
          </tbody></table>
        </div>
      </div>`;
    const state = container.querySelector('#state3') as HTMLElement;
    const tbody = container.querySelector('#tb3') as HTMLElement;

    await Core.scan(container);
    await waitForCondition(() => tbody.hasAttribute('data-each-done'), {
      description: '初期 1 件で each-done',
      maxAttempts: 60,
      delayMs: 50,
    });
    expect(container.querySelectorAll('.cell3').length).toBe(1);

    // 0 件に更新 → each-done は一旦外れ、0 件描画完了後に再付与されるはず。
    void Core.setBindingData(state, {response: {content: []}});
    await Haori.waitForRenders();

    expect(container.querySelectorAll('.cell3').length).toBe(0);
    // 0 件でも完了マーカーは付く（n 件完了と同じマーカー＝件数では区別不可）。
    expect(tbody.hasAttribute('data-each-done')).toBe(true);
  });
});
