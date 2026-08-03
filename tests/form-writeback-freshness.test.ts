/* @vitest-environment jsdom */
/**
 * @fileoverview フォーム入力欄への書き戻しが最新のバインドデータを使うことの回帰テスト。
 *
 * `Core.setBindingData` のワークは、`data-bind` 属性の書き込み（Queue =
 * requestAnimationFrame バッチ）を待ってから入力欄へ書き戻す。この待機中に別の
 * 入力操作でバインドデータが更新されると、ワーク開始時点のスナップショットを使う
 * 実装ではその編集を古い収集値で上書きし、値が巻き戻る。さらに巻き戻された内部値を
 * 後続の入力操作が再収集して確定させるため、誤った値が最終的に残る。
 *
 * 本テストは、書き戻しが「適用直前に読み直した最新の in-memory」を基準にし、かつ
 * **宛先である入力欄が、自分へ最後に適用された値より古い供給を受け付けない**ことを
 * 検証する（`ElementFragment.canApplyValue()`）。実ブラウザでのタイミング競合その
 * ものは `playwright/concurrent-edit-rollback.spec.cjs` が担保する。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForIdle} from './helpers/async';

describe('フォーム書き戻しの鮮度', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // `change` を受け取るのは `EventDispatcher` だけ。起動しないと、割り込みで
    // 発火したイベントを誰も受け取らず、内部値の同期もユーザー編集の記録も起き
    // ないため、この観点を何も検証していないことになる。
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
  });

  const getFrag = (el: HTMLElement): ElementFragment =>
    Fragment.get(el) as ElementFragment;

  /**
   * フォームを組み立ててスキャン完了まで待ちます。
   *
   * @param html フォームの innerHTML
   * @param bind form 要素へ設定する data-bind 属性値
   * @returns 生成した form 要素
   */
  const mountForm = async (
    html: string,
    bind: string,
    formArg?: string,
  ): Promise<HTMLFormElement> => {
    const form = document.createElement('form');
    form.setAttribute('data-bind', bind);
    if (formArg) {
      form.setAttribute('data-form-arg', formArg);
    }
    form.innerHTML = html;
    container.appendChild(form);
    await Core.scan(container);
    await waitForIdle();
    return form;
  };

  /**
   * ワーク開始後・入力欄への書き戻し前に、利用者の編集を割り込ませます。
   *
   * 割り込みは**利用者が実際に行える経路**（`change` イベントによる確定）で起こし
   * ます。以前はここで `ElementFragment.setBindingData()` を直接呼んで in-memory
   * だけを進めていましたが、それは `data-bind` 属性へのミラーを伴わない
   * ——仕様「`data-bind`」が定める「更新のたびに属性へミラーする」を満たさない——
   * 状態を人工的に作るもので、実際には起こりません。検証したいのは仕様「ユーザー編集と宣言バインドの権威」
   * 「反映を要求した時点より後の編集は保護する」であり、実イベントで足ります。
   *
   * @param input 編集する入力要素
   * @param apply DOM を編集する処理
   */
  const interruptDuringWork = (input: HTMLElement, apply: () => void): void => {
    apply();
    input.dispatchEvent(new Event('change', {bubbles: true}));
  };

  it('チェックボックスの ON が古い収集値で巻き戻らない', async () => {
    const form = await mountForm(
      '<input id="cb" type="checkbox" name="flag" value="true">',
      '{"flag":false}',
    );
    const checkbox = form.querySelector('#cb') as HTMLInputElement;

    const promise = Core.setBindingData(form, {flag: false});
    // ワークはマイクロタスクで開始し、data-bind 属性の書き込み待ちに入る。
    await Promise.resolve();
    interruptDuringWork(checkbox, () => {
      checkbox.checked = true;
    });

    await promise;
    await waitForIdle();

    expect(checkbox.checked).toBe(true);
    expect(getFrag(checkbox).getValue()).toBe(true);
  });

  it('テキスト入力の編集が古い収集値で巻き戻らない', async () => {
    const form = await mountForm(
      '<input id="q" type="text" name="keyword">',
      '{"keyword":""}',
    );
    const input = form.querySelector('#q') as HTMLInputElement;

    const promise = Core.setBindingData(form, {keyword: ''});
    await Promise.resolve();
    interruptDuringWork(input, () => {
      input.value = '山田';
    });

    await promise;
    await waitForIdle();

    expect(input.value).toBe('山田');
    expect(getFrag(input).getValue()).toBe('山田');
  });

  it('data-form-arg 付きフォームでも巻き戻らない', async () => {
    const form = await mountForm(
      '<input id="cb" type="checkbox" name="flag" value="true">',
      '{"cond":{"flag":false}}',
      'cond',
    );
    const checkbox = form.querySelector('#cb') as HTMLInputElement;

    const promise = Core.setBindingData(form, {cond: {flag: false}});
    await Promise.resolve();
    interruptDuringWork(checkbox, () => {
      checkbox.checked = true;
    });

    await promise;
    await waitForIdle();

    expect(checkbox.checked).toBe(true);
    expect(getFrag(checkbox).getValue()).toBe(true);
  });

  it('割り込みがなければ渡したバインドデータがそのまま入力欄へ反映される', async () => {
    const form = await mountForm(
      '<input id="cb" type="checkbox" name="flag" value="true">' +
        '<input id="q" type="text" name="keyword">',
      '{"flag":false,"keyword":""}',
    );
    const checkbox = form.querySelector('#cb') as HTMLInputElement;
    const input = form.querySelector('#q') as HTMLInputElement;

    await Core.setBindingData(form, {flag: true, keyword: '佐藤'});
    await waitForIdle();

    expect(checkbox.checked).toBe(true);
    expect(input.value).toBe('佐藤');
  });
});
