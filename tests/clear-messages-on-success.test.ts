/* @vitest-environment jsdom */
/**
 * @fileoverview 成功の応答で前回の失敗の表示を消す宣言（`data-{event}-clear-messages`）。
 *
 * 期待値は仕様「`data-{event}-clear-messages`」の「取得が成功したときに、
 * **前回の失敗の表示を消します**」「**入力欄の値・バインドデータ・`data-each` の
 * 複製には触れません。**」「`data-{event}-fetch-download` では保存に成功した後
 * です」「宣言しない手続きは、従来どおり成功の応答では消しません」と、仕様
 * 「エラーハンドリング」の「**成功の応答では、既存のメッセージを消しません。**」
 * から取っている。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('data-{event}-clear-messages', () => {
  let container: HTMLElement;
  let responses: Response[];

  beforeEach(async () => {
    vi.restoreAllMocks();
    await import('../src/observer');
    container = document.createElement('div');
    document.body.appendChild(container);
    responses = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => Promise.resolve(responses.shift()) as Promise<Response>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  /** 1 回目に返す失敗の応答（全体エラー）。 */
  const failure = (): Response =>
    new Response('条件が多すぎます', {
      status: 400,
      statusText: 'Bad Request',
      headers: {'Content-Type': 'text/plain'},
    });

  /**
   * 検索フォームとボタンを走査します。
   *
   * @param attributes ボタンに付ける属性
   * @returns フォームとボタン
   */
  async function mount(
    attributes: string,
  ): Promise<{form: HTMLFormElement; button: HTMLElement}> {
    container.innerHTML =
      '<form id="f"><input name="q" value=""></form>' +
      '<div id="result"></div>' +
      '<button id="go" type="button" data-click-form="#f" ' +
      `data-click-fetch="/api/search" data-click-fetch-state ${attributes}>` +
      '検索</button>';
    await Core.scan(container);
    await waitForIdle();
    return {
      form: container.querySelector('#f') as HTMLFormElement,
      button: container.querySelector('#go') as HTMLElement,
    };
  }

  /**
   * ボタンを押し、手続きの結果が `_fetch` に入るまで待ちます。
   *
   * @param button 押すボタン
   * @param status 待つ状態
   */
  async function press(
    button: HTMLElement,
    status: 'success' | 'error',
  ): Promise<void> {
    button.click();
    const fragment = Fragment.get(button) as ElementFragment;
    await waitForCondition(
      () =>
        (fragment.getBindingData()?._fetch as {status?: string} | undefined)
          ?.status === status,
    );
    await waitForIdle();
  }

  it('失敗の後の成功で、全体エラーが消え、入力した値は残る', async () => {
    responses.push(
      failure(),
      new Response('{"items":[]}', {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    );
    const {form, button} = await mount(
      'data-click-bind="#result" data-click-clear-messages',
    );
    const input = form.querySelector('input') as HTMLInputElement;
    input.value = 'りんご';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    await press(button, 'error');
    expect(form.getAttribute('data-message')).toBe('条件が多すぎます');

    await press(button, 'success');
    expect(form.hasAttribute('data-message')).toBe(false);
    expect(input.value).toBe('りんご');
  });

  it('宣言が無ければ、成功の応答でも前回の全体エラーは残る', async () => {
    responses.push(
      failure(),
      new Response('{"items":[]}', {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    );
    const {form, button} = await mount('data-click-bind="#result"');

    await press(button, 'error');
    await press(button, 'success');
    expect(form.getAttribute('data-message')).toBe('条件が多すぎます');
  });

  it('ダウンロードの保存に成功した後も消える', async () => {
    // jsdom は Blob の URL を作れないため、生成と解放を差し替える。
    (URL as unknown as {createObjectURL: () => string}).createObjectURL = () =>
      'blob:test/1';
    (URL as unknown as {revokeObjectURL: () => void}).revokeObjectURL =
      () => {};
    let saved = 0;
    const onSave = (event: Event) => {
      if ((event.target as HTMLElement).closest?.('a[download]')) {
        saved++;
      }
    };
    document.addEventListener('click', onSave);
    try {
      responses.push(
        failure(),
        new Response('a,b\n', {
          status: 200,
          headers: {'Content-Type': 'text/csv'},
        }),
      );
      const {form, button} = await mount(
        'data-click-fetch-download="customers.csv" data-click-clear-messages',
      );

      await press(button, 'error');
      expect(form.getAttribute('data-message')).toBe('条件が多すぎます');

      await press(button, 'success');
      expect(saved).toBe(1);
      expect(form.hasAttribute('data-message')).toBe(false);
    } finally {
      document.removeEventListener('click', onSave);
    }
  });
});
