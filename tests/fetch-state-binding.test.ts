/* @vitest-environment jsdom */
/**
 * @fileoverview data-fetch-state によるフェッチ状態（_fetch）注入の回帰テスト。
 *
 * 背景: data-fetch / data-{event}-fetch の成否（成功・HTTP エラー・ネットワーク断）を
 * 画面個別 JavaScript を書かずに data-if/式から参照できるよう、対象要素へ
 * `_fetch`（status/loading/success/error/statusCode/message）を注入する。`_fetch` は
 * data-bind 属性には反映せず（reflectToAttribute=false）、再評価のみ行う。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Env from '../src/env';
import Dev from '../src/dev';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForCondition} from './helpers/async';

describe('data-fetch-state によるフェッチ状態注入', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    await import('../src/observer');
  });

  afterEach(() => {
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * HTML をデタッチ状態のコンテナへ流し込んでから body へ接続し、走査します。
   *
   * デタッチ状態で innerHTML を設定してから接続することで、ライブ
   * MutationObserver と Core.scan の競合（兄弟要素がある場合に自動フェッチが
   * 発火しない事象）を避け、自動フェッチを決定的に起動する。
   *
   * @param html マウントする HTML 文字列
   * @returns 走査完了の Promise
   */
  const mount = async (html: string): Promise<void> => {
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
  };

  /**
   * コンテナ内の指定セレクタ要素のバインディングデータから `_fetch` を取得します。
   *
   * @param selector 対象要素のセレクタ
   * @returns `_fetch` の中身（未注入なら undefined）
   */
  const getFetch = (
    selector: string,
  ): Record<string, unknown> | undefined =>
    (
      Fragment.get(
        container!.querySelector(selector) as HTMLElement,
      ) as ElementFragment
    ).getBindingData()._fetch as Record<string, unknown> | undefined;

  it('成功時は _fetch.success=true / statusCode=200 が注入され、data-bind 属性は汚さない', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }) as Response,
    );
    await mount(
      '<div id="target" data-fetch="http://api.test/list" data-fetch-state></div>',
    );

    await waitForCondition(() => getFetch('#target')?.status === 'success', {
      description: '成功状態が注入される',
    });
    const state = getFetch('#target')!;
    expect(state.success).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.error).toBe(false);
    expect(state.statusCode).toBe(200);
    // _fetch は data-bind 属性へ反映しない（reflectToAttribute=false）。
    const raw =
      (container!.querySelector('#target') as HTMLElement).getAttribute(
        'data-bind',
      ) ?? '';
    expect(raw.includes('_fetch')).toBe(false);
  });

  it('HTTP 500 時は _fetch.error=true / statusCode=500 が注入される', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', {status: 500, statusText: 'Internal Server Error'}),
    );
    await mount(
      '<div id="target" data-fetch="http://api.test/list" data-fetch-state></div>',
    );

    await waitForCondition(() => getFetch('#target')?.status === 'error', {
      description: 'エラー状態が注入される',
    });
    const state = getFetch('#target')!;
    expect(state.error).toBe(true);
    expect(state.success).toBe(false);
    expect(state.statusCode).toBe(500);
  });

  it('data-fetch-state="#panel" で別要素へ _fetch を注入できる', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }) as Response,
    );
    await mount(
      '<div id="panel"></div>' +
        '<div id="target" data-fetch="http://api.test/list" data-fetch-state="#panel"></div>',
    );

    await waitForCondition(() => getFetch('#panel')?.status === 'success', {
      description: '別要素へ成功状態が注入される',
    });
    expect(getFetch('#panel')!.success).toBe(true);
    // 注入先ではない data-fetch 要素には _fetch が載らないこと
    expect(getFetch('#target')).toBeUndefined();
  });
});
