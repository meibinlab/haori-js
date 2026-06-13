/* @vitest-environment jsdom */
/**
 * @fileoverview
 * fetch エラー応答のトップレベル JSON 配列形式
 * `[{ "key": "field", "message": "..." }]`（一部のサーバ実装が返す
 * 例外ハンドラ／バリデーションメッセージ等）への対応のテスト。
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

    // 全体エラー（form 自身）は最後に書き込まれるため、これを待機条件に含める。
    await waitForCondition(
      () =>
        nameWrapper.getAttribute('data-message') !== null &&
        form.getAttribute('data-message') !== null,
      {description: 'name フィールドとフォーム全体エラーが付く'},
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

  // 不具合報告（2026-06-14）: 再試行のたびにエラーメッセージが累積する。
  // handleFetchError は描画前に既存メッセージをクリアしないため、
  // 前回応答のメッセージが残り続ける（bootstrap の append 方式では
  // 同一コンテナに積み増され、コアの上書き方式でも前回応答にしか
  // 含まれないフィールドのメッセージが残留する）。
  // 修正により、フェッチ単位でスコープ内の既存メッセージが1度クリアされ、
  // 表示は常に最新の1応答分へ置き換わる。
  it('再試行時に既存メッセージをクリアし、常に最新の1応答へ置き換える', async () => {
    // 連続するエラー応答を順に返すモック。
    const bodies = [
      JSON.stringify([
        {key: 'name', message: '名前は必須です'},
        {key: 'email', message: 'メール形式が不正です'},
        {message: '入力内容に誤りがあります'},
      ]),
      JSON.stringify([{key: 'name', message: '名前は必須です'}]),
    ];
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(bodies[Math.min(call++, bodies.length - 1)], {
            status: 400,
            statusText: 'Bad Request',
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>,
    );

    const {form, nameWrapper, emailWrapper} = await setupAndSubmit();

    // 1回目: name / email / フォーム全体の3箇所に表示される。
    await waitForCondition(
      () =>
        nameWrapper.getAttribute('data-message') !== null &&
        emailWrapper.getAttribute('data-message') !== null &&
        form.getAttribute('data-message') !== null,
      {description: '1回目で3箇所にエラーが付く'},
    );
    expect(emailWrapper.getAttribute('data-message')).toBe(
      'メール形式が不正です',
    );
    expect(form.getAttribute('data-message')).toBe('入力内容に誤りがあります');

    // 2回目: name のみの応答。前回の email / 全体エラーは残ってはならない。
    (form.querySelector('#save') as HTMLElement).click();

    await waitForCondition(
      () =>
        emailWrapper.getAttribute('data-message') === null &&
        form.getAttribute('data-message') === null,
      {description: '2回目で前回の email / 全体エラーがクリアされる'},
    );
    // 最新応答の name エラーは表示されたまま。
    expect(nameWrapper.getAttribute('data-message')).toBe('名前は必須です');
    expect(emailWrapper.getAttribute('data-message-level')).toBeNull();
    expect(form.getAttribute('data-message-level')).toBeNull();
  });
});
