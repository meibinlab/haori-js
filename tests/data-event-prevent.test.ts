/* @vitest-environment jsdom */
/**
 * @fileoverview data-{event}-prevent 属性の統合テストです。
 * クリックの同期区間でネイティブのデフォルト動作（type="submit" の送信や
 * <a href> 遷移）を抑止できること、オプトインであること、data-click-defer と
 * 併用してもデフォルト動作を止められることを検証します。
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import EventDispatcher from '../src/event_dispatcher';
import Env from '../src/env';

describe('data-{event}-prevent', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // data-click-fetch が走ってもネットワークへ出ないようにモックする
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      }),
    );
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  /**
   * クリックを発火し、デフォルト動作が抑止されたか（dispatchEvent が false か）を返す。
   *
   * @param element クリック対象
   * @returns デフォルト動作が抑止された場合 true
   */
  const clickAndCheckPrevented = (element: HTMLElement): boolean => {
    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    const notPrevented = element.dispatchEvent(event);
    return !notPrevented;
  };

  it('data-click-prevent を持つ submit ボタンはネイティブ送信を抑止する', () => {
    const form = document.createElement('form');
    const button = document.createElement('button');
    button.type = 'submit';
    button.setAttribute('data-click-prevent', '');
    button.setAttribute('data-click-fetch', '/api/save');
    form.appendChild(button);
    container.appendChild(form);

    expect(clickAndCheckPrevented(button)).toBe(true);
  });

  it('data-click-prevent が無ければデフォルト動作は抑止しない（オプトイン）', () => {
    const button = document.createElement('button');
    // ネットワークを伴わない同期アクションでオプトインの有無のみを検証する
    button.setAttribute('data-click-run', 'true');
    container.appendChild(button);

    expect(clickAndCheckPrevented(button)).toBe(false);
  });

  it('data-click-defer と併用してもデフォルト動作を抑止する', () => {
    const button = document.createElement('button');
    button.type = 'submit';
    button.setAttribute('data-click-prevent', '');
    button.setAttribute('data-click-defer', '');
    button.setAttribute('data-click-fetch', '/api/save');
    container.appendChild(button);

    expect(clickAndCheckPrevented(button)).toBe(true);
  });

  it('data-click-prevent のみでも（onclick=return false 相当）抑止できる', () => {
    const anchor = document.createElement('a');
    anchor.setAttribute('href', '#go');
    anchor.setAttribute('data-click-prevent', '');
    container.appendChild(anchor);

    expect(clickAndCheckPrevented(anchor)).toBe(true);
  });

  it('カスタムプレフィックス（data-prefix）でも委譲と prevent が機能する', () => {
    const envRef = Env as unknown as {_prefix: string};
    const original = envRef._prefix;
    envRef._prefix = 'hr-';
    try {
      const button = document.createElement('button');
      button.type = 'submit';
      button.setAttribute('hr-click-prevent', '');
      button.setAttribute('hr-click-fetch', '/api/save');
      container.appendChild(button);
      expect(clickAndCheckPrevented(button)).toBe(true);
    } finally {
      envRef._prefix = original;
    }
  });

  it('change イベントの prevent はキャンセル不可で無害（例外なし）', () => {
    const input = document.createElement('input');
    input.setAttribute('data-change-prevent', '');
    container.appendChild(input);
    // change はキャンセル不可なので preventDefault は無意味だが害もない
    const event = new Event('change', {bubbles: true, cancelable: false});
    expect(() => input.dispatchEvent(event)).not.toThrow();
  });
});
