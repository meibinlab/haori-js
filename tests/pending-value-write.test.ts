/* @vitest-environment jsdom */
/**
 * @fileoverview 反映待ちの間に起きた値の変化の扱いを検証します。
 *
 * 入力欄への値の反映は描画キューを経由するため、要求してから DOM へ載るまでに間が
 * あります。この間に、
 *
 * - 別の値の反映が要求される（後から来た値が黙って捨てられていた）
 * - 利用者が入力を確定する（待っていた書き込みが利用者の入力を上書きしていた）
 *
 * の 2 つが起こり得ます。どちらも値が黙って失われるため、後勝ち（最後に要求された
 * 値が載る）と、待機中に入った利用者編集の保護を確かめます。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('反映待ちの間に起きた値の変化', () => {
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

  const getFrag = (element: Element): ElementFragment =>
    Fragment.get(element) as ElementFragment;

  /**
   * 入力欄 1 つのフォームを組み立てます。
   *
   * @returns 生成した form 要素
   */
  const mount = async (): Promise<HTMLFormElement> => {
    container.innerHTML = '<form><input name="a" value=""></form>';
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form') as HTMLFormElement;
  };

  it('反映待ちの間に来た値は捨てず、後勝ちで載る', async () => {
    const form = await mount();
    const input = form.querySelector('input') as HTMLInputElement;
    const fragment = getFrag(input);

    // 1 回目の反映が描画キュー待ちのうちに 2 回目を要求する。
    const first = fragment.syncBindingValue('A');
    const second = fragment.syncBindingValue('B');
    await Promise.all([first, second]);
    await waitForDomSettled();

    expect(input.value).toBe('B');
    expect(fragment.getValue()).toBe('B');
    expect(Form.getValues(getFrag(form))).toEqual({a: 'B'});
  });

  it('反映待ちの間の利用者編集を巻き戻さない', async () => {
    const form = await mount();
    const input = form.querySelector('input') as HTMLInputElement;
    const fragment = getFrag(input);

    // 反映を要求した直後（DOM へ載る前）に利用者が入力を確定する。
    const pending = fragment.syncBindingValue('A');
    input.value = 'typed';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await pending;
    await waitForDomSettled();

    expect(input.value).toBe('typed');
    expect(fragment.getValue()).toBe('typed');
    expect(Form.getValues(getFrag(form))).toEqual({a: 'typed'});
  });

  it('反映待ちの間に複数回要求されても最後の値が載る', async () => {
    const form = await mount();
    const input = form.querySelector('input') as HTMLInputElement;
    const fragment = getFrag(input);

    const writes = [
      fragment.syncBindingValue('A'),
      fragment.syncBindingValue('B'),
      fragment.syncBindingValue('C'),
    ];
    await Promise.all(writes);
    await waitForDomSettled();

    expect(input.value).toBe('C');
    expect(fragment.getValue()).toBe('C');
  });

  it('チェック状態も反映待ちの間の利用者操作を巻き戻さない', async () => {
    container.innerHTML = `
      <form><input type="checkbox" name="agreed" value="true" checked></form>`;
    await Core.scan(container);
    await waitForDomSettled();
    const form = container.querySelector('form') as HTMLFormElement;
    const box = form.querySelector('input') as HTMLInputElement;
    const fragment = getFrag(box);

    // 外す反映を要求した直後（DOM へ載る前）に、利用者が自分でチェックし直す。
    const pending = fragment.syncBindingValue(false);
    box.checked = true;
    box.dispatchEvent(new Event('change', {bubbles: true}));
    await pending;
    await waitForDomSettled();

    expect(box.checked).toBe(true);
    expect(Form.getValues(getFrag(form))).toEqual({agreed: true});
  });
});
