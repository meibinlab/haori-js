/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 依頼3: 外部テストから data-each の描画完了を確実に待機する手段を検証する。
 * - data-each-done 属性が「全行の描画完了後」に付与され、更新開始時に外れること。
 * - Haori.waitForRenders() / Queue.waitForIdle() が描画完了まで待てること。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';
import Queue from '../src/queue';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('依頼3: data-each 描画完了の待機手段', () => {
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

  it('data-each-done は全行描画完了後に付与され、更新開始で外れる', async () => {
    const rows = Array.from({length: 25}, (_, i) => ({id: i, label: `M${i}`}));
    container.innerHTML = `
      <div id="state" data-bind='{"rows":[]}'>
        <table><tbody id="tb" data-each="rows" data-each-key="id" data-each-arg="row">
          <tr><td class="lbl">{{row.label}}</td></tr>
        </tbody></table>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;
    const tbody = container.querySelector('#tb') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    void Core.setBindingData(state, {rows});

    // data-each-done が付くまで待つ＝描画完了の検知手段として使える。
    await waitForCondition(() => tbody.hasAttribute('data-each-done'), {
      description: 'data-each-done 付与',
      maxAttempts: 60,
      delayMs: 50,
    });

    // 付与時点で全 25 行が補間済みで存在する。
    const labels = Array.from(container.querySelectorAll('.lbl'));
    expect(labels.length).toBe(25);
    expect(labels.every(el => el.textContent !== '' && !el.textContent!.includes('{{'))).toBe(true);
  });

  it('Haori.waitForRenders() で描画完了まで待機できる', async () => {
    const rows = Array.from({length: 25}, (_, i) => ({id: i, label: `R${i}`}));
    container.innerHTML = `
      <div id="state2" data-bind='{"rows":[]}'>
        <table><tbody data-each="rows" data-each-key="id" data-each-arg="row">
          <tr><td class="lbl2">{{row.label}}</td></tr>
        </tbody></table>
      </div>`;
    const state = container.querySelector('#state2') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    // バインドの Promise を待たずに（外部テスト相当）、waitForRenders で待機する。
    void Core.setBindingData(state, {rows});
    await Haori.waitForRenders();

    expect(container.querySelectorAll('.lbl2').length).toBe(25);
  });

  it('Queue.waitForIdle() は空キューでは即時解決する', async () => {
    await expect(Queue.waitForIdle()).resolves.toBeUndefined();
  });
});
