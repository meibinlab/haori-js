/* @vitest-environment jsdom */
/**
 * @fileoverview data-if が false の分岐（data-if-false 属性付き）配下のフォーム
 * 入力を、フォーム値収集（Form.getValues）の対象から除外することの回帰テスト。
 *
 * 背景: data-if が false の要素は DOM から削除されず data-if-false 属性付きで
 * 残るため、同一 name の入力を設定型ごとに data-if で出し分けると、非表示分岐の
 * 入力値もフォーム直列化に混入し送信値が競合する懸念があった。表示中の分岐の値
 * だけを収集することを保証する。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-if false 分岐配下のフォーム値収集除外', () => {
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
   * #plan-form を走査し、収集されたフォーム値を返します。
   *
   * @returns 収集されたフォーム値オブジェクト
   */
  const collect = (): Record<string, unknown> => {
    const form = Fragment.get(
      container.querySelector('#plan-form') as HTMLElement,
    ) as ElementFragment;
    return Form.getValues(form);
  };

  /**
   * 指定 id の要素が非表示（data-if-false 付き）かどうかを返します。
   *
   * @param id 対象要素の id
   * @returns 非表示なら true
   */
  const isHidden = (id: string): boolean =>
    (container.querySelector(`#${id}`) as HTMLElement).hasAttribute(
      'data-if-false',
    );

  it('false 分岐配下の同名入力は収集対象から除外され、true 分岐の値だけが収集される', async () => {
    // mode により同じ name="value" の入力を data-if で出し分ける。
    // fixed 分岐（数値）と ratio 分岐（割合）が同名で共存する。
    container.innerHTML = `
      <form id="plan-form" data-bind='{"mode":"fixed"}'>
        <div id="fixed-block" data-if="mode === 'fixed'">
          <input name="value" value="100">
        </div>
        <div id="ratio-block" data-if="mode === 'ratio'">
          <input name="value" value="0.5">
        </div>
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    // 初期: fixed 分岐のみ表示。ratio 分岐は data-if-false。
    expect(isHidden('fixed-block')).toBe(false);
    expect(isHidden('ratio-block')).toBe(true);

    // 表示中（fixed）の値だけが収集され、非表示（ratio）の値は混入しない。
    expect(collect().value).toBe('100');
    expect(Array.isArray(collect().value)).toBe(false);
  });

  it('mode を切り替えると、新たに表示された分岐の値だけが収集される', async () => {
    container.innerHTML = `
      <form id="plan-form" data-bind='{"mode":"fixed"}'>
        <div id="fixed-block" data-if="mode === 'fixed'">
          <input name="value" value="100">
        </div>
        <div id="ratio-block" data-if="mode === 'ratio'">
          <input name="value" value="0.5">
        </div>
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();
    expect(collect().value).toBe('100');

    // mode を ratio に切り替える（data-bind を直接更新して再評価）。
    const form = container.querySelector('#plan-form') as HTMLElement;
    await Core.setBindingData(form, {mode: 'ratio'});
    await waitForCondition(() => !isHidden('ratio-block'), {
      description: 'ratio 分岐が表示される',
    });

    // 切り替え後は ratio 分岐のみ表示。fixed 分岐は data-if-false。
    expect(isHidden('fixed-block')).toBe(true);
    expect(isHidden('ratio-block')).toBe(false);

    // 表示中（ratio）の値だけが収集される。
    expect(collect().value).toBe('0.5');
    expect(Array.isArray(collect().value)).toBe(false);
  });

  it('false 分岐配下のオブジェクト・リスト構造も丸ごと除外される', async () => {
    // data-form-object 配下の入力も、分岐が非表示なら収集されないこと。
    container.innerHTML = `
      <form id="plan-form" data-bind='{"mode":"a"}'>
        <input name="common" value="shared">
        <div id="a-block" data-if="mode === 'a'">
          <div data-form-object="detail">
            <input name="x" value="ax">
          </div>
        </div>
        <div id="b-block" data-if="mode === 'b'">
          <div data-form-object="detail">
            <input name="x" value="bx">
          </div>
        </div>
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    expect(isHidden('a-block')).toBe(false);
    expect(isHidden('b-block')).toBe(true);

    const values = collect();
    expect(values.common).toBe('shared');
    expect(values.detail).toEqual({x: 'ax'});
  });
});
