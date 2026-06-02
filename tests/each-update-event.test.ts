/* @vitest-environment jsdom */
/**
 * @fileoverview
 * haori:eachupdate イベントが「data-each の全行の描画完了後」に発火することを保証する
 * 回帰テストです。イベント発火時点で全行が DOM に存在し、{{...}} が補間済みであることを
 * 確認します。外部からの描画完了検知の契約として固定します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('haori:eachupdate 発火タイミングの保証', () => {
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

  it('eachupdate 発火時点で全行が DOM に存在し補間済みである（25行）', async () => {
    const rows = Array.from({length: 25}, (_, i) => ({id: i, label: `M${i}`}));
    container.innerHTML = `
      <div id="state" data-bind='{"rows":[]}'>
        <table><tbody>
          <tr data-each="rows" data-each-key="id" data-each-arg="row">
            <td class="lbl">{{row.label}}</td>
            <td><input name="value" type="number"></td>
          </tr>
        </tbody></table>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;
    const tbody = container.querySelector('tbody') as HTMLElement;

    // eachupdate 発火時点の DOM スナップショットを記録する。
    const snapshots: Array<{total: number; rendered: number; allFilled: boolean}> =
      [];
    tbody.addEventListener('haori:eachupdate', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const labels = Array.from(container.querySelectorAll('.lbl'));
      snapshots.push({
        total: detail.total,
        rendered: labels.length,
        allFilled: labels.every(
          el => el.textContent !== '' && !el.textContent!.includes('{{'),
        ),
      });
    });

    await Core.scan(container);
    await waitForDomSettled();

    await Core.setBindingData(state, {rows});
    await waitForCondition(
      () => container.querySelectorAll('.lbl').length === 25,
      {description: '25 行描画', maxAttempts: 40, delayMs: 50},
    );

    // total=25 の eachupdate が発火し、その時点で 25 行すべてが補間済みであること。
    const completed = snapshots.find(s => s.total === 25);
    expect(completed, 'total=25 の eachupdate が発火していない').toBeTruthy();
    expect(completed!.rendered).toBe(25);
    expect(completed!.allFilled).toBe(true);
  });

  it('eachupdate の detail は added / removed / order / total を提供する', async () => {
    container.innerHTML = `
      <div id="state2" data-bind='{"rows":[{"id":1},{"id":2}]}'>
        <table><tbody>
          <tr data-each="rows" data-each-key="id" data-each-arg="r" class="row"><td>{{r.id}}</td></tr>
        </tbody></table>
      </div>`;
    const state = container.querySelector('#state2') as HTMLElement;
    const tbody = container.querySelector('tbody') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    const events: Array<Record<string, unknown>> = [];
    tbody.addEventListener('haori:eachupdate', (e: Event) => {
      events.push((e as CustomEvent).detail);
    });

    // 1 を削除し 3, 4 を追加する。
    await Core.setBindingData(state, {rows: [{id: 2}, {id: 3}, {id: 4}]});
    await waitForCondition(() => events.length > 0, {
      description: 'eachupdate 発火',
    });

    const detail = events[events.length - 1];
    expect(detail.total).toBe(3);
    expect(detail.order).toEqual(['2', '3', '4']);
    expect(detail.added).toEqual(['3', '4']);
    expect(detail.removed).toEqual(['1']);
  });
});
