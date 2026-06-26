/* @vitest-environment jsdom */
/**
 * @fileoverview 同一 name ラジオグループのスカラ収集と双方向 data-if 再評価の
 * 回帰テスト。
 *
 * 背景: ラジオは排他制御で他要素が未チェックになるが、その要素では change が
 * 発火しないため内部値（fragment.value）が古いまま残る。これを「チェック済み」
 * として収集すると同一キーに複数値が集まり配列累積（例: ["none","fixed"]）を
 * 起こし、後退方向（ratio→none 等）で依存欄の data-if が正しく再評価されなく
 * なる不具合があった。
 *
 * 修正方針:
 *   - event_dispatcher: change/input 時に同一フォームスコープの同名ラジオを
 *     併せて syncValue し、内部値を根治する（案B）。
 *   - form.getPartValues: グループ収集で DOM の checked を真とし、未チェック
 *     要素の古い内部値を無視する（案A・最終防衛線）。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('同一 name ラジオのスカラ収集と双方向 data-if 再評価', () => {
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
    container.remove();
  });

  /**
   * 指定セレクタ要素の data-bind を JSON として取得します。
   *
   * @param selector 対象要素のセレクタ
   * @returns パース済みのバインドデータ
   */
  const getBind = (selector: string): Record<string, unknown> =>
    JSON.parse(
      (container.querySelector(selector) as HTMLElement).getAttribute(
        'data-bind',
      ) as string,
    );

  /**
   * 指定 id の data-if 要素が非表示（data-if-false 付き）かどうかを返します。
   *
   * @param id 対象要素の id
   * @returns 非表示なら true
   */
  const isHidden = (id: string): boolean =>
    (container.querySelector(`#${id}`) as HTMLElement).hasAttribute(
      'data-if-false',
    );

  it('別要素のネストキーへ書く構成で、選択値がスカラで上書きされ双方向に切り替わる', async () => {
    // 状態要素（フォームとは別要素）の editingRule.usageConditionMode を
    // ラジオ群の選択でスカラ更新し、依存欄を data-if で出し分ける。
    container.innerHTML = `
      <div id="state" data-bind='{"editingRule":{"usageConditionMode":"none"}}'>
        <span id="fixed-panel" data-if="editingRule.usageConditionMode === 'fixed'">固定</span>
        <span id="ratio-panel" data-if="editingRule.usageConditionMode === 'ratio'">倍率</span>
      </div>
      <form id="rule-form">
        <label><input id="r-none" type="radio" name="usageConditionMode" value="none" checked
          data-change-bind="#state" data-change-bind-arg="editingRule">設定なし</label>
        <label><input id="r-fixed" type="radio" name="usageConditionMode" value="fixed"
          data-change-bind="#state" data-change-bind-arg="editingRule">固定kWh</label>
        <label><input id="r-ratio" type="radio" name="usageConditionMode" value="ratio"
          data-change-bind="#state" data-change-bind-arg="editingRule">容量連動</label>
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const rNone = container.querySelector('#r-none') as HTMLInputElement;
    const rFixed = container.querySelector('#r-fixed') as HTMLInputElement;
    const rRatio = container.querySelector('#r-ratio') as HTMLInputElement;

    // 初期状態: none。両依存欄は非表示。
    expect(isHidden('fixed-panel')).toBe(true);
    expect(isHidden('ratio-panel')).toBe(true);

    // 前進1: none → fixed
    rFixed.click();
    await waitForCondition(
      () =>
        (getBind('#state').editingRule as Record<string, unknown>)
          .usageConditionMode === 'fixed',
      {description: 'fixed 選択でスカラ "fixed" に更新される'},
    );
    expect(
      (getBind('#state').editingRule as Record<string, unknown>)
        .usageConditionMode,
    ).toBe('fixed');
    expect(isHidden('fixed-panel')).toBe(false);
    expect(isHidden('ratio-panel')).toBe(true);

    // 前進2: fixed → ratio
    rRatio.click();
    await waitForCondition(
      () =>
        (getBind('#state').editingRule as Record<string, unknown>)
          .usageConditionMode === 'ratio',
      {description: 'ratio 選択でスカラ "ratio" に更新される'},
    );
    expect(isHidden('fixed-panel')).toBe(true);
    expect(isHidden('ratio-panel')).toBe(false);

    // 後退: ratio → none（不具合時はここで配列累積し data-if が戻らなかった）
    rNone.click();
    await waitForCondition(
      () =>
        (getBind('#state').editingRule as Record<string, unknown>)
          .usageConditionMode === 'none',
      {description: 'none へ戻すとスカラ "none" に更新される'},
    );
    const mode = (getBind('#state').editingRule as Record<string, unknown>)
      .usageConditionMode;
    expect(mode).toBe('none');
    // 配列累積していないこと
    expect(Array.isArray(mode)).toBe(false);
    // 依存欄は双方向に再非表示となること
    expect(isHidden('fixed-panel')).toBe(true);
    expect(isHidden('ratio-panel')).toBe(true);
  });
});
