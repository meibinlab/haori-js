/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 報告調査(続): 新規 each 行に nested data-fetch がある場合に、
 * `Haori.waitForRenders()`（= `Queue.waitForIdle`）が行内の取得反映より先に
 * 解決してしまわないかを検証する。
 *
 * **この構成では `Core.scheduleEvaluateAll()`（Queue 外の `setTimeout(…, 100)`）は
 * 走りません。** カバレッジで確認済みです。同関数が走るのは、新規行の子孫がまだ
 * マウントされておらず、かつマウントに依存する属性を持つ場合だけで
 * （`Core.needsScheduledEvaluateAll()`）、この構成では行の初期化が終わった時点で
 * すべてマウント済みになります。当初のファイル説明はここを取り違えていたため、
 * 事実に合わせて書き直しました。**Queue 外の再評価そのものを対象にしたテストは
 * まだありません。**
 *
 * 期待値の根拠は仕様「Queue クラス」と仕様「`data-fetch`」。
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

    // 各行の nested fetch 結果も反映されていること。
    expect(fetchSpy).toHaveBeenCalled();
    const details = Array.from(container.querySelectorAll('.detail')).map(
      el => el.textContent,
    );
    expect(details).toEqual(['D1', 'D2']);
  });
});
