/* @vitest-environment jsdom */
/**
 * @fileoverview 履歴を置き換える遷移（`data-{event}-redirect-replace`）のテスト。
 *
 * 確定・送信を終えた画面が履歴に残ると、「戻る」で到達して同じ操作をもう一度
 * 実行できてしまう。履歴項目を置き換えて遷移することで、その経路そのものを
 * 無くせることを固定する。
 *
 * 期待値の根拠は仕様「`data-{event}-redirect-replace`」と、遷移先の評価タイミングに
 * ついては仕様「バインド後に実行するアクションの評価タイミング」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Haori from '../src/haori';
import Log from '../src/log';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/** 応答本文（`/api/apply` 用） */
const APPLY_RESPONSE = {next: '/apply/complete.html'};

describe('data-{event}-redirect-replace', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let assignedHref: string | null;
  let replacedHref: string | null;
  let originalLocation: Location;
  let search: string;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    assignedHref = null;
    replacedHref = null;
    search = '';
    (window as Window & typeof globalThis & {Haori?: unknown}).Haori = Haori;
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: 'http://localhost',
        get href() {
          return `http://localhost/apply/confirm.html${search}`;
        },
        set href(value: string) {
          assignedHref = value;
        },
        get pathname() {
          return '/apply/confirm.html';
        },
        get search() {
          return search;
        },
        get hash() {
          return '';
        },
        replace(value: string) {
          replacedHref = value;
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify(APPLY_RESPONSE), {
          headers: {'Content-Type': 'application/json'},
        });
      }),
    );
  });

  afterEach(() => {
    dispatcher.stop();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * HTML を配置して初期スキャンを待ちます。
   *
   * @param html 配置する HTML
   * @returns 戻り値はありません。
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  /**
   * ボタンを押して遷移が起きるまで待ちます。
   *
   * @returns 戻り値はありません。
   */
  const clickAndWait = async (): Promise<void> => {
    container.querySelector<HTMLElement>('#go')!.click();
    await waitForCondition(
      () => assignedHref !== null || replacedHref !== null,
      {description: 'redirect'},
    );
  };

  it('履歴を置き換えて遷移する（href への代入は行わない）', async () => {
    await mount(`
      <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
              data-click-redirect-replace="/apply/complete.html"></button>`);
    await clickAndWait();

    expect(replacedHref).toBe('/apply/complete.html');
    expect(assignedHref).toBeNull();
  });

  it('フェッチを伴わない宣言だけでも履歴を置き換えて遷移する', async () => {
    // 遷移だけを宣言したボタン（仕様「`data-{event}-redirect`」の例と同じ形）。
    await mount(`
      <button id="go"
              data-click-redirect-replace="/apply/complete.html"></button>`);
    await clickAndWait();

    expect(replacedHref).toBe('/apply/complete.html');
    expect(assignedHref).toBeNull();
  });

  it('data-{event}-redirect だけのときは履歴を積む（既存の挙動）', async () => {
    await mount(`
      <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
              data-click-redirect="/apply/complete.html"></button>`);
    await clickAndWait();

    expect(assignedHref).toBe('/apply/complete.html');
    expect(replacedHref).toBeNull();
  });

  it('両方を宣言した場合は置き換える方を採用し、警告する', async () => {
    const warnSpy = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    await mount(`
      <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
              data-click-redirect="/pushed.html"
              data-click-redirect-replace="/replaced.html"></button>`);
    await clickAndWait();

    expect(replacedHref).toBe('/replaced.html');
    expect(assignedHref).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('戻り先クエリ名は置き換える遷移にも適用される', async () => {
    search = '?href=%2Fadmin%2Fuser.html';
    await mount(`
      <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
              data-click-redirect-replace="/apply/complete.html"
              data-click-redirect-return-param="href"></button>`);
    await clickAndWait();

    expect(replacedHref).toBe('/admin/user.html');
  });

  it('安全でない戻り先は既定の遷移先へフォールバックする', async () => {
    vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    search = '?href=https%3A%2F%2Fevil.com';
    await mount(`
      <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
              data-click-redirect-replace="/apply/complete.html"
              data-click-redirect-return-param="href"></button>`);
    await clickAndWait();

    expect(replacedHref).toBe('/apply/complete.html');
  });

  it('遷移先は遷移直前に評価するため、応答の値で決められる', async () => {
    await mount(`
      <div id="state">
        <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                data-click-bind="#state"
                data-click-redirect-replace="{{next || '/fallback.html'}}"></button>
      </div>`);
    await clickAndWait();

    expect(replacedHref).toBe('/apply/complete.html');
  });
});
