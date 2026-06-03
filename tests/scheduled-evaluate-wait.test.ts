/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 報告調査(続): 新規 each 行に nested data-fetch がある場合、行初期化後の
 * 再評価が Queue 外の setTimeout(…,100) (scheduleEvaluateAll) で行われ、
 * Haori.waitForRenders()（=Queue.waitForIdle）が早期解決しないかを検証する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';
import {waitForDomSettled} from './helpers/async';

describe('nested fetch を含む each 行と waitForRenders（報告調査）', () => {
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

  it('各行に nested data-fetch があっても waitForRenders で fetch 反映まで待てる', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const id = url.split('/').pop();
        return Promise.resolve(
          new Response(JSON.stringify({detail: `D${id}`}), {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as Promise<Response>;
      });

    container.innerHTML = `
      <div id="state" data-bind='{"rows":[]}'>
        <table><tbody id="tb" data-each="rows" data-each-key="id" data-each-arg="row">
          <tr>
            <td class="lbl">{{row.label}}</td>
            <td>
              <span
                data-fetch="http://api.test/detail/{{row.id}}"
                data-fetch-bind
                class="detail"
              >{{detail}}</span>
            </td>
          </tr>
        </tbody></table>
      </div>`;
    const state = container.querySelector('#state') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    // 外部テスト相当: バインドの Promise を待たず waitForRenders で待機。
    void Core.setBindingData(state, {
      rows: [
        {id: 1, label: '行1'},
        {id: 2, label: '行2'},
      ],
    });
    await Haori.waitForRenders();

    // 行自体が描画されていること。
    const labels = Array.from(container.querySelectorAll('.lbl')).map(
      el => el.textContent,
    );
    expect(labels).toEqual(['行1', '行2']);

    // 各行の nested fetch 結果も反映されていること（ここが scheduleEvaluateAll 依存）。
    expect(fetchSpy).toHaveBeenCalled();
    const details = Array.from(container.querySelectorAll('.detail')).map(
      el => el.textContent,
    );
    expect(details).toEqual(['D1', 'D2']);
  });
});
