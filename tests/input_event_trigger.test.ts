/* @vitest-environment jsdom */
/**
 * @fileoverview input イベント起動（data-input-*）の回帰テスト。
 *
 * data-input-* を持つ入力は input イベント（1文字ごと）で手続きを起動でき、
 * 自動フォーム検出により双方向バインディングへ即時反映される。
 * data-input-* を持たない入力は input イベントで何も起動しない（オプトイン）。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('input イベント起動（data-input-*）', () => {
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

  it('data-input-form 付き入力は input イベントでフォームへ双方向反映する', async () => {
    container.innerHTML = `
      <form id="f" data-bind='{"q":""}'>
        <input id="inp" name="q" data-input-form>
      </form>
    `;
    const form = container.querySelector('#f') as HTMLFormElement;
    const input = container.querySelector('#inp') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();

    input.value = 'ab';
    input.dispatchEvent(new Event('input', {bubbles: true}));

    await waitForCondition(
      () => {
        const bind = JSON.parse(form.getAttribute('data-bind') as string);
        return bind.q === 'ab';
      },
      {description: 'input でフォームバインドが更新される'},
    );
    const bind = JSON.parse(form.getAttribute('data-bind') as string);
    expect(bind.q).toBe('ab');
  });

  it('data-input-* を持たない入力は input イベントで反映しない（オプトイン）', async () => {
    container.innerHTML = `
      <form id="f" data-bind='{"q":""}'>
        <input id="inp" name="q">
      </form>
    `;
    const form = container.querySelector('#f') as HTMLFormElement;
    const input = container.querySelector('#inp') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();

    input.value = 'xy';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await waitForDomSettled();

    const bind = JSON.parse(form.getAttribute('data-bind') as string);
    expect(bind.q).toBe('');
  });

  it('1文字ごとの連続 input で逐次反映される', async () => {
    container.innerHTML = `
      <form id="f" data-bind='{"q":""}'>
        <input id="inp" name="q" data-input-form>
      </form>
    `;
    const form = container.querySelector('#f') as HTMLFormElement;
    const input = container.querySelector('#inp') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();

    for (const text of ['a', 'ab', 'abc']) {
      input.value = text;
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }
    await waitForCondition(
      () => {
        const bind = JSON.parse(form.getAttribute('data-bind') as string);
        return bind.q === 'abc';
      },
      {description: '最終的に最後の入力値で確定する'},
    );
    const bind = JSON.parse(form.getAttribute('data-bind') as string);
    expect(bind.q).toBe('abc');
  });
});
