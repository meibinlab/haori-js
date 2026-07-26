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
 * 本テストは、書き戻しが「適用直前に読み直した最新の in-memory」を基準にすることを
 * 検証する。実ブラウザでのタイミング競合そのものは
 * `playwright/concurrent-edit-rollback.spec.cjs` が担保する。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('フォーム書き戻しの鮮度', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
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
    await waitForDomSettled();
    return form;
  };

  /**
   * ワーク開始後・入力欄への書き戻し前に、ユーザー編集相当の割り込みを行います。
   *
   * `Core.setBindingData` は in-memory を同期確定するため、割り込み側も
   * `ElementFragment.setBindingData` で in-memory だけを更新して同じ状態を作る
   * （追加のワークを積まないので、書き戻しが古い値を使えばそのまま最終値になる）。
   *
   * @param form 対象フォーム
   * @param input 編集する入力要素
   * @param apply DOM を編集する処理
   * @param nextBinding 割り込み後のバインドデータ
   */
  const interruptDuringWork = (
    form: HTMLFormElement,
    input: HTMLElement,
    apply: () => void,
    nextBinding: Record<string, unknown>,
  ): void => {
    apply();
    getFrag(input).syncValue();
    getFrag(form).setBindingData(nextBinding);
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
    interruptDuringWork(
      form,
      checkbox,
      () => {
        checkbox.checked = true;
      },
      {flag: true},
    );

    await promise;
    await waitForDomSettled();

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
    interruptDuringWork(
      form,
      input,
      () => {
        input.value = '山田';
      },
      {keyword: '山田'},
    );

    await promise;
    await waitForDomSettled();

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
    interruptDuringWork(
      form,
      checkbox,
      () => {
        checkbox.checked = true;
      },
      {cond: {flag: true}},
    );

    await promise;
    await waitForDomSettled();

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
    await waitForDomSettled();

    expect(checkbox.checked).toBe(true);
    expect(input.value).toBe('佐藤');
  });
});
