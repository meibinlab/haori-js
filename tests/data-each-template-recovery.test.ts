/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-each のテンプレート復旧テスト（改修依頼1）。
 * フラグメント木と DOM の子が同期しない状況（タブ表示＋ネスト data-if＋bind-arg の
 * 特定フローで発生）でも、DOM の要素子からテンプレートを復旧して全行を描画することを
 * 検証する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-each テンプレート復旧（依頼1）', () => {
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

  it('フラグメント子が欠落しても DOM の要素子からテンプレートを復旧して描画する', async () => {
    container.innerHTML = `
      <div id="s" data-bind='{"show":false,"rows":[{"id":1,"label":"A"},{"id":2,"label":"B"}]}'>
        <div data-if="show">
          <table><tbody id="tb" data-each="rows" data-each-key="id" data-each-arg="r">
            <tr><td class="l">{{r.label}}</td></tr>
          </tbody></table>
        </div>
      </div>`;
    const state = container.querySelector('#s') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    // この時点では data-if が false なので tbody の data-each は未実行（template 未設定）。
    const tbody = Fragment.get(
      container.querySelector('#tb') as HTMLElement,
    ) as ElementFragment;
    // 同期ずれを再現: DOM の <tr> は残したままフラグメント子だけ除去する。
    const trFrag = tbody.getChildElementFragments()[0];
    expect(trFrag).toBeTruthy();
    tbody.removeChild(trFrag);
    expect(tbody.getChildElementFragments().length).toBe(0);
    expect((container.querySelector('#tb') as HTMLElement).children.length).toBe(1);

    // data-if を表示にして each を起動 → フォールバックで復旧し全行描画されるはず。
    await Core.setBindingData(state, {
      show: true,
      rows: [{id: 1, label: 'A'}, {id: 2, label: 'B'}],
    });
    await waitForCondition(
      () => container.querySelectorAll('#tb .l').length === 2,
      {description: '2 行描画', maxAttempts: 40, delayMs: 50},
    );

    const labels = Array.from(container.querySelectorAll('#tb .l')).map(
      el => el.textContent,
    );
    expect(labels).toEqual(['A', 'B']);
  });
});
