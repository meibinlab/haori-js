/* @vitest-environment jsdom */
/**
 * @fileoverview 同じキーで収集するラジオボタンへのエラーを 1 回だけ表示するテスト。
 *
 * 期待値は仕様「エラーハンドリング」の「**ラジオボタンへは、1 件のエラーを 1 回
 * だけ渡します。** `key` に一致した要素のうち、ラジオボタンは最初の 1 つにだけ
 * メッセージを渡します」「haori 単体では、最初のラジオの親要素に付きます。
 * チェックボックスと、ほかの入力欄への振り分けは変わりません」「同じ `key` に
 * 複数の文（配列）を返した場合は改行でつないだ 1 件になり（上の擬似コード）、
 * 最初のラジオへ 1 回だけ渡します」から取っている。
 *
 * 修正前は、キーに一致したラジオのそれぞれへ渡していたため、haori 単体では
 * ラジオごとの親要素に同じ文が付き、haori-bootstrap では 1 つの枠に同じ文が
 * ラジオの数だけ並んでいた。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('ラジオボタンへのエラーの振り分け', () => {
  let container: HTMLElement;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await import('../src/observer');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & {Haori?: unknown}).Haori;
    container.remove();
  });

  /**
   * 400 の JSON 配列を返すフェッチを設定します。
   *
   * @param entries 応答本文の要素
   */
  function mockErrors(entries: Array<{key: string; message: string}>): void {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(JSON.stringify(entries), {
            status: 400,
            statusText: 'Bad Request',
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>,
    );
  }

  /**
   * フォームを走査して保存ボタンを押します。
   *
   * @param fields フォームの中の入力欄の HTML
   */
  async function submit(fields: string): Promise<void> {
    container.innerHTML =
      `<form id="f">${fields}` +
      '<button id="save" type="button" data-click-fetch="/api/save" ' +
      'data-click-fetch-method="POST" data-click-form="#f"></button></form>';
    await Core.scan(container);
    await waitForIdle();
    (container.querySelector('#save') as HTMLElement).click();
  }

  /** 受け入れ条件 1 の構成（ラジオ 2 つを別々の `.form-check` に置く）。 */
  const RADIOS =
    '<div><div class="form-check" id="wa"><input type="radio" name="t" value="a"></div>' +
    '<div class="form-check" id="wb"><input type="radio" name="t" value="b"></div></div>';

  it('同じ name のラジオへのエラーは、最初のラジオの親要素にだけ付く（回帰）', async () => {
    mockErrors([{key: 't', message: '選んでください。'}]);
    await submit(RADIOS);
    const first = container.querySelector('#wa') as HTMLElement;
    await waitForCondition(() => first.getAttribute('data-message') !== null);
    await waitForIdle();

    expect(first.getAttribute('data-message')).toBe('選んでください。');
    expect(
      (container.querySelector('#wb') as HTMLElement).hasAttribute(
        'data-message',
      ),
    ).toBe(false);
  });

  it('表示の実装へは、同じ name のラジオへのエラーを 1 回だけ渡す（回帰）', async () => {
    // haori-bootstrap のように表示を差し替えた実装は、グループの置き場へ渡された
    // 回数だけ文を並べる。
    const shown: HTMLElement[] = [];
    (window as Window & {Haori?: unknown}).Haori = {
      addErrorMessage: (target: HTMLElement) => {
        shown.push(target);
        return Promise.resolve();
      },
      clearMessages: () => Promise.resolve(),
      closeDialog: Haori.closeDialog.bind(Haori),
      confirm: Haori.confirm.bind(Haori),
      dialog: Haori.dialog.bind(Haori),
      openDialog: Haori.openDialog.bind(Haori),
      toast: Haori.toast.bind(Haori),
    };
    mockErrors([{key: 't', message: '選んでください。'}]);
    await submit(RADIOS);
    await waitForCondition(() => shown.length > 0);
    await waitForIdle();

    expect(shown).toHaveLength(1);
    expect(shown[0]).toBe(container.querySelector('#wa input'));
  });

  it('同じ key の複数の文は、改行でつないだ 1 件として 1 回だけ付く', async () => {
    mockErrors([
      {key: 't', message: '選んでください。'},
      {key: 't', message: '戻し先を確かめてください。'},
    ]);
    await submit(RADIOS);
    const first = container.querySelector('#wa') as HTMLElement;
    await waitForCondition(() => first.getAttribute('data-message') !== null);
    await waitForIdle();

    expect(first.getAttribute('data-message')).toBe(
      '選んでください。\n戻し先を確かめてください。',
    );
    expect(
      (container.querySelector('#wb') as HTMLElement).hasAttribute(
        'data-message',
      ),
    ).toBe(false);
  });

  it('同じ name のチェックボックスへは、今までどおりそれぞれに付く', async () => {
    mockErrors([{key: 'c', message: '選び直してください。'}]);
    await submit(
      '<div id="ca"><input type="checkbox" name="c" value="a"></div>' +
        '<div id="cb"><input type="checkbox" name="c" value="b"></div>',
    );
    const second = container.querySelector('#cb') as HTMLElement;
    await waitForCondition(() => second.getAttribute('data-message') !== null);
    await waitForIdle();

    expect(
      (container.querySelector('#ca') as HTMLElement).getAttribute(
        'data-message',
      ),
    ).toBe('選び直してください。');
    expect(second.getAttribute('data-message')).toBe('選び直してください。');
  });

  it('name の違う欄への振り分けは変わらない', async () => {
    mockErrors([
      {key: 'n', message: '名前は必須です'},
      {key: 't', message: '選んでください。'},
    ]);
    await submit(`<div id="wn"><input name="n"></div>${RADIOS}`);
    const first = container.querySelector('#wa') as HTMLElement;
    await waitForCondition(() => first.getAttribute('data-message') !== null);
    await waitForIdle();

    expect(
      (container.querySelector('#wn') as HTMLElement).getAttribute(
        'data-message',
      ),
    ).toBe('名前は必須です');
    expect(first.getAttribute('data-message')).toBe('選んでください。');
  });
});
