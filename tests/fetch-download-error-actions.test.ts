/* @vitest-environment jsdom */
/**
 * @fileoverview ダウンロードの保存の失敗と、失敗時のアクション（`data-{event}-error-*`）。
 *
 * 背景: 受信中に接続が切れて保存に失敗すると、`-error-no-message` を宣言しても
 * `ファイルを保存できませんでした` が必ず表示され、`-error-toast` も動かなかった。
 * HTTP の失敗をトーストへ回した画面でも、保存の失敗だけが画面のエラー枠に出ていた。
 *
 * 期待値の根拠は仕様「`data-fetch-download` / `data-{event}-fetch-download`」と
 * 「失敗時のアクション」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';
import Haori from '../src/haori';
import Log from '../src/log';
import {waitForCondition} from './helpers/async';

/** 保存の失敗の表示（仕様の文言） */
const FAILURE = 'ファイルを保存できませんでした';

describe('ダウンロードの保存の失敗と失敗時のアクション', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    // 本文を読み終える前に接続が切れた応答（2xx）を返す。
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const failing = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        blob: () => Promise.reject(new Error('切断されました')),
        text: () => Promise.resolve(''),
      };
      return Promise.resolve(failing as unknown as Response);
    });
    await import('../src/observer');
  });

  afterEach(() => {
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * ボタンを含む HTML をマウントし、ボタンを押して `_fetch` が error になるまで待ちます。
   *
   * @param attributes ボタンに付ける属性
   * @param extra ボタンの後ろに置く HTML
   * @param prepare 走査の後、押す前に行う準備
   * @returns 押したボタン
   */
  const clickAndWaitForError = async (
    attributes: string,
    extra = '',
    prepare?: (button: HTMLElement) => Promise<void> | void,
  ): Promise<HTMLElement> => {
    container = document.createElement('div');
    container.innerHTML =
      '<button id="btn" data-click-fetch="/api/export" ' +
      'data-click-fetch-download="customers.csv" data-click-fetch-state ' +
      `${attributes}>出力</button>${extra}`;
    document.body.appendChild(container);
    await Core.scan(container);
    const button = container.querySelector('#btn') as HTMLElement;
    await prepare?.(button);
    button.click();
    const fragment = Fragment.get(button) as ElementFragment;
    await waitForCondition(
      () =>
        (fragment.getBindingData()?._fetch as {status?: string} | undefined)
          ?.status === 'error',
      {description: 'フェッチ状態が error になる', maxAttempts: 40},
    );
    // 失敗時のアクションは `_fetch` の注入の後に走るため、少し待つ。
    await new Promise(resolve => setTimeout(resolve, 20));
    return button;
  };

  /**
   * 表示されているトーストの文言を返します。
   *
   * @returns トーストの文言の一覧
   */
  const toastTexts = (): string[] =>
    Array.from(document.querySelectorAll('.haori-toast')).map(
      element => element.textContent ?? '',
    );

  it('-error-no-message を宣言すると保存の失敗を表示しない', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「通信の例外と同じく、`-error-no-message` を宣言すれば上の表示を行わず」。
    await clickAndWaitForError('data-click-error-no-message');
    expect(container!.getAttribute('data-message')).toBeNull();
  });

  it('-error-no-message でも前回の表示は消す', async () => {
    // 仕様「失敗時のアクション」の「前回の失敗の表示は、今までどおり消します。」
    await clickAndWaitForError(
      'data-click-error-no-message',
      '',
      async button => {
        await Haori.addErrorMessage(button, '前回の失敗');
        expect(container!.getAttribute('data-message')).toBe('前回の失敗');
      },
    );
    expect(container!.getAttribute('data-message')).toBeNull();
  });

  it('-error-toast を実行し、_fetch.message で保存の失敗を書き分けられる', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「`-error-click` / `-error-close` / `-error-toast` を実行します」と、
    // 「`_fetch.message` は `ファイルを保存できませんでした`」。
    await clickAndWaitForError(
      'data-click-error-no-message ' +
        'data-click-error-toast="{{_fetch.message}}"',
    );
    await waitForCondition(() => toastTexts().length > 0, {
      description: 'トーストが表示される',
      maxAttempts: 40,
    });
    expect(toastTexts()[0]).toContain(FAILURE);
  });

  it('-error-click の対象を押す', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「`-error-click` / `-error-close` / `-error-toast` を実行します」。
    const clicked = vi.fn();
    await clickAndWaitForError(
      'data-click-error-click="#after"',
      '<button id="after" type="button">後</button>',
      () => {
        container!.querySelector('#after')!.addEventListener('click', clicked);
      },
    );
    await waitForCondition(() => clicked.mock.calls.length > 0, {
      description: '対象が押される',
      maxAttempts: 40,
    });
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('宣言が無ければ今までどおり全体エラーとして表示し、トーストは出さない', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「`ファイルを保存できませんでした` を全体エラーとして表示し」と、
    // 「**成功したときの後続のアクション（ダイアログ・トースト・リダイレクトなど）は
    // 実行しません**」。
    await clickAndWaitForError('data-click-toast="出力しました"');
    expect(container!.getAttribute('data-message')).toBe(FAILURE);
    expect(toastTexts()).toHaveLength(0);
  });

  it('-error-status を宣言すると、表示を止めずアクションも実行しない', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「`-error-status` を宣言した場合は、どちらも行いません（保存の失敗には
    // ステータスが無いためです）」。応答のステータス 200 を列挙しても同じ。
    await clickAndWaitForError(
      'data-click-error-status="200" data-click-error-no-message ' +
        'data-click-error-toast="失敗しました"',
    );
    expect(container!.getAttribute('data-message')).toBe(FAILURE);
    expect(toastTexts()).toHaveLength(0);
  });

  it('応答のステータスの組は使わない', async () => {
    // 仕様「失敗時のアクション」の「通信の例外と保存の失敗にはステータスが無いため、
    // ステータスの付かない属性を使います。」
    await clickAndWaitForError(
      'data-click-error-200-no-message ' +
        'data-click-error-200-toast="組のトースト"',
    );
    expect(container!.getAttribute('data-message')).toBe(FAILURE);
    expect(toastTexts()).toHaveLength(0);
  });

  it('-error-bind を宣言しても表示する', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「`-error-bind` は、本文を読めないため使いません」と、「失敗時のアクション」の
    // 「保存の失敗では、応答本文の代わりに `ファイルを保存できませんでした` を
    // 表示します（`-error-bind` は使いません）」。
    await clickAndWaitForError('data-click-error-bind');
    expect(container!.getAttribute('data-message')).toBe(FAILURE);
  });

  it('haori:fetcherror は発火しない', async () => {
    // 仕様「失敗時のアクション」の「[`haori:fetcherror`](#haorifetcherror) を
    // 発火します（保存の失敗では発火しません）。」
    const errors = vi.fn();
    document.addEventListener('haori:fetcherror', errors);
    try {
      await clickAndWaitForError('data-click-error-no-message');
      expect(errors).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('haori:fetcherror', errors);
    }
  });
});
