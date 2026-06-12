/* @vitest-environment jsdom */
/**
 * @fileoverview
 * fetch エラー応答のトップレベル JSON 配列形式
 * `[{ "key": "field", "message": "..." }]`（meibinlab-spring-boot-wrapper の
 * GlobalExceptionHandler / ValidationMessage 等）への対応のテスト。
 * - key を持つ要素はフィールド別エラーへ振り分ける
 * - 同一 key は改行連結する
 * - key を持たない要素はフォーム全体エラーとする
 * - ステータスコードに依存しない（400 だけでなく 409 等でも振り分く）
 * - プレーンテキストのエラーボディはフォーム全体エラーとして表示する
 */
import {describe, it, beforeEach, afterEach, expect, vi} from 'vitest';
import Core from '../src/core';
import {waitForDomSettled, waitForCondition} from './helpers/async';

describe('fetch エラー応答: トップレベル JSON 配列形式', () => {
  let container: HTMLElement;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await import('../src/observer');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  function mockErrorResponse(
    body: string,
    status: number,
    contentType = 'application/json',
  ): void {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(body, {
            status,
            statusText: status === 409 ? 'Conflict' : 'Bad Request',
            headers: {'Content-Type': contentType},
          }),
        ) as unknown as Promise<Response>,
    );
  }

  async function setupAndSubmit(): Promise<{
    form: HTMLFormElement;
    nameWrapper: HTMLElement;
    emailWrapper: HTMLElement;
  }> {
    container.innerHTML = `
      <form id="f">
        <div id="name-wrap"><input type="text" name="name" value=""></div>
        <div id="email-wrap"><input type="text" name="email" value=""></div>
        <button id="save" type="button"
          data-click-fetch="/api/save" data-click-method="post"
          data-click-form="#f"></button>
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();
    (container.querySelector('#save') as HTMLElement).click();
    return {
      form: container.querySelector('#f') as HTMLFormElement,
      nameWrapper: container.querySelector('#name-wrap') as HTMLElement,
      emailWrapper: container.querySelector('#email-wrap') as HTMLElement,
    };
  }

  it('key を持つ要素はフィールドへ振り分け、同一 key は改行連結し、key 無しは全体エラーにする', async () => {
    mockErrorResponse(
      JSON.stringify([
        {key: 'name', message: '名前は必須です'},
        {key: 'name', message: '2文字以上で入力してください'},
        {key: 'email', message: 'メール形式が不正です'},
        {message: '入力内容に誤りがあります'},
      ]),
      400,
    );
    const {form, nameWrapper, emailWrapper} = await setupAndSubmit();

    await waitForCondition(
      () => nameWrapper.getAttribute('data-message') !== null,
      {description: 'name フィールドにエラーが付く'},
    );

    expect(nameWrapper.getAttribute('data-message')).toBe(
      '名前は必須です\n2文字以上で入力してください',
    );
    expect(nameWrapper.getAttribute('data-message-level')).toBe('error');
    expect(emailWrapper.getAttribute('data-message')).toBe(
      'メール形式が不正です',
    );
    // key 無しはフォーム全体エラー（フォーム自身に付与）
    expect(form.getAttribute('data-message')).toBe('入力内容に誤りがあります');
  });

  it('ステータスが 409 でも配列形式を振り分ける（ステータス非依存）', async () => {
    mockErrorResponse(
      JSON.stringify([{key: 'name', message: '同じ名前が既に存在します'}]),
      409,
    );
    const {nameWrapper} = await setupAndSubmit();

    await waitForCondition(
      () => nameWrapper.getAttribute('data-message') !== null,
      {description: '409 でも name フィールドにエラーが付く'},
    );
    expect(nameWrapper.getAttribute('data-message')).toBe(
      '同じ名前が既に存在します',
    );
  });

  it('プレーンテキストのエラーボディはフォーム全体エラーとして表示する', async () => {
    mockErrorResponse('処理に失敗しました', 409, 'text/plain');
    const {form} = await setupAndSubmit();

    await waitForCondition(() => form.getAttribute('data-message') !== null, {
      description: 'text/plain ボディが全体エラーになる',
    });
    expect(form.getAttribute('data-message')).toBe('処理に失敗しました');
  });
});
