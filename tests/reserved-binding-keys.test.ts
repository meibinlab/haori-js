/* @vitest-environment jsdom */
/**
 * @fileoverview 予約キー（`_` 始まり）がバインドデータの差し替えで落ちないことの
 * 回帰テスト。
 *
 * `_fetch` / `_poll` は `data-bind` 属性へ書き出しません。属性に現れない以上、
 * 宣言を取り込む側も、外部から属性を書き換える側も、この値を運びようがありません。
 * したがって宣言データの差し替えでは予約キーを引き継ぎます。引き継がないと、
 * 注入した状態が次の取り込みで消え、取得失敗が「まだ何も起きていない」状態と
 * 区別できなくなります。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「HTTP エラー応答
 *   （4xx/5xx）で `status="error"`」
 * - 同節の「`_fetch` は内部バインディングデータにのみ設定し、`data-bind` 属性へは
 *   書き出しません」
 * - 仕様「`data-bind`」の「予約キー（`_` 始まり）は宣言の取り込みで落としません」
 * - 差し替えの経路は仕様「`data-bind`」の「他のスクリプトやライブラリがこの属性を
 *   書き換えた場合も、監視（MutationObserver）経由で取り込み」と、
 *   仕様「data-if の動作」の「子要素を再評価 (evaluateAll)。未スキャンの子は
 *   `scan` で初期化する」
 * - 仕様「`data-bind`」の「予約キーは宣言データとして外へ出しません」
 *
 * この文書は `_fetch` を代表に取り、差し替えの**経路**を軸にしています。予約キー
 * そのものの軸（`_poll`）は [tests/poll.test.ts](poll.test.ts) の「`data-poll-bind`
 * の全置換のあとも `_poll` が残る」で押さえています。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';

import {waitForIdle} from './helpers/async';

describe('予約キーの引き継ぎ', () => {
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
   * HTML をデタッチ状態のコンテナへ流し込んでから接続し、走査します。
   *
   * デタッチ状態で `innerHTML` を設定してから接続することで、ライブ
   * `MutationObserver` と `Core.scan` の競合を避け、自動フェッチを決定的に
   * 起動します（`tests/fetch-state-binding.test.ts` と同じ手順）。
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
   * 500 応答を返すフェッチへ差し替えます。
   */
  const mockServerError = (): void => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response('{"message":"取得に失敗しました"}', {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {'Content-Type': 'application/json'},
        }),
    );
  };

  /**
   * 指定要素のバインディングデータを取り出します。
   *
   * @param selector 対象要素のセレクタ
   * @returns バインディングデータ
   */
  const bindingData = (selector: string): Record<string, unknown> =>
    (
      Fragment.get(
        container!.querySelector(selector) as HTMLElement,
      ) as ElementFragment
    ).getBindingData();

  /**
   * 注入された `_fetch` を取り出します。
   *
   * @param selector 対象要素のセレクタ
   * @returns `_fetch` の中身（未注入なら undefined）
   */
  const fetchState = (
    selector: string,
  ): Record<string, unknown> | undefined =>
    bindingData(selector)._fetch as Record<string, unknown> | undefined;

  it('data-if 配下の注入先でも 500 で _fetch.error が立つ（回帰）', async () => {
    // `data-if` が真になると未スキャンの子を `scan` で初期化するため、フェッチ
    // 開始後にもう一度 `data-bind` を取り込む。取り込みで `_fetch` が落ちると、
    // 状態は「まだ何も起きていない」に戻り、失敗が 0 件と区別できなくなる。
    mockServerError();
    await mount(
      `<div data-bind='{"shown":true}'>` +
        '<div data-if="shown">' +
        `<div id="target" data-fetch="http://api.test/list" data-fetch-state` +
        ` data-bind='{}'>` +
        '<p id="error" data-if="_fetch?.error">取得に失敗しました</p>' +
        '<p id="empty" data-if="!_fetch?.loading && !_fetch?.error">' +
        '該当なし</p>' +
        '</div></div></div>',
    );
    await waitForIdle();

    const state = fetchState('#target');
    expect(state?.status).toBe('error');
    expect(state?.error).toBe(true);
    expect(state?.statusCode).toBe(500);
    const error = container!.querySelector('#error') as HTMLElement;
    const empty = container!.querySelector('#empty') as HTMLElement;
    expect(error.hasAttribute(`${Env.prefix}if-false`)).toBe(false);
    expect(empty.hasAttribute(`${Env.prefix}if-false`)).toBe(true);
  });

  it('data-if 配下で data-each を内包しても error が立つ（回帰）', async () => {
    // 報告の受け入れ条件の 4 行目（`data-if` の配下でさらに `data-each` を内包）。
    mockServerError();
    await mount(
      `<div data-bind='{"shown":true}'>` +
        '<div data-if="shown">' +
        `<div id="target" data-fetch="http://api.test/list" data-fetch-state` +
        ` data-bind='{"groups":[]}'>` +
        '<p id="error" data-if="_fetch?.error">取得に失敗しました</p>' +
        '<ul data-each="groups" data-each-key="id"><li>{{name}}</li></ul>' +
        '</div></div></div>',
    );
    await waitForIdle();

    expect(fetchState('#target')?.error).toBe(true);
    const error = container!.querySelector('#error') as HTMLElement;
    expect(error.hasAttribute(`${Env.prefix}if-false`)).toBe(false);
  });

  it('data-if 配下のネットワーク断でも error が立つ（回帰）', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「ネットワーク断・
    // タイムアウト等の例外で `status="error"`（`statusCode` は `null`、`message` に
    // 例外メッセージ）」。HTTP エラーとは別の注入経路を通る。
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('ネットワーク断');
    });
    try {
      await mount(
        `<div data-bind='{"shown":true}'>` +
          '<div data-if="shown">' +
          `<div id="target" data-fetch="http://api.test/list"` +
          ` data-fetch-state data-bind='{}'></div></div></div>`,
      );
    } catch {
      // 自動フェッチの例外は走査の Promise へ伝播する（この修正の対象外）。
    }
    await waitForIdle();

    const state = fetchState('#target');
    expect(state?.error).toBe(true);
    expect(state?.statusCode).toBeNull();
    expect(state?.message).toBe('ネットワーク断');
  });

  it('data-if 配下の data-click-fetch-state でも error が立つ（回帰）', async () => {
    // イベント起点（仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「`data-{event}-fetch-state`」）でも注入先は同じ経路で差し替えられる。
    mockServerError();
    await mount(
      `<div data-bind='{"shown":true}'>` +
        '<div data-if="shown">' +
        `<div id="target" data-bind='{}'>` +
        '<button type="button" data-click-fetch="http://api.test/list"' +
        ' data-click-fetch-state="#target">再取得</button>' +
        '</div></div></div>',
    );
    await waitForIdle();

    (container!.querySelector('button') as HTMLElement).click();
    await waitForIdle();

    expect(fetchState('#target')?.error).toBe(true);
  });

  it('外部からの data-bind 書き換えでも _fetch が残る（回帰）', async () => {
    mockServerError();
    await mount(
      `<div id="target" data-fetch="http://api.test/list" data-fetch-state` +
        ` data-bind='{"keyword":"初期"}'></div>`,
    );
    await waitForIdle();
    expect(fetchState('#target')?.status).toBe('error');

    // 外部スクリプトによる書き換え（監視経由の取り込み）。
    (container!.querySelector('#target') as HTMLElement).setAttribute(
      'data-bind',
      '{"keyword":"外部"}',
    );
    await waitForIdle();

    expect(bindingData('#target').keyword).toBe('外部');
    expect(fetchState('#target')?.status).toBe('error');
  });

  it('Core.setBindingData での差し替えでも _fetch が残る（回帰）', async () => {
    mockServerError();
    await mount(
      `<div id="target" data-fetch="http://api.test/list" data-fetch-state` +
        ` data-bind='{"keyword":"初期"}'></div>`,
    );
    await waitForIdle();
    expect(fetchState('#target')?.status).toBe('error');

    await Core.setBindingData(
      container!.querySelector('#target') as HTMLElement,
      {keyword: '供給'},
    );
    await waitForIdle();

    expect(bindingData('#target').keyword).toBe('供給');
    expect(fetchState('#target')?.status).toBe('error');
  });

  it('注入した _fetch は送信ペイロードへ混じらない', async () => {
    // 引き継ぐようにしたぶん `_fetch` は内部データに残り続ける。外へ出さない境界を
    // 固定する。仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「収集は DOM の入力欄から行うため、送信ペイロードにも含まれません」。
    const bodies: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_url: unknown, init?: RequestInit) => {
        if (init?.body) {
          bodies.push(String(init.body));
        }
        return new Response('{"message":"取得に失敗しました"}', {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {'Content-Type': 'application/json'},
        });
      },
    );
    await mount(
      `<form id="target" data-fetch="http://api.test/list" data-fetch-state` +
        ` data-fetch-method="POST" data-bind='{"keyword":"あ"}'>` +
        '<input name="keyword" value="あ">' +
        '<button type="button" data-click-fetch="http://api.test/save"' +
        ' data-click-fetch-method="POST" data-click-form="#target">送信' +
        '</button></form>',
    );
    await waitForIdle();
    expect(fetchState('#target')?.status).toBe('error');

    (container!.querySelector('button') as HTMLElement).click();
    await waitForIdle();

    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some(body => body.includes('_fetch'))).toBe(false);
  });

  it('data-{event}-copy はコピー先へ _fetch を運ばない', async () => {
    // 仕様「`data-bind`」の「予約キーは宣言データとして外へ出しません」。
    // コピー先で `_fetch` を参照する条件が、別の要素のフェッチ結果で動いてしまう。
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response('{"message":"取得に失敗しました"}', {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {'Content-Type': 'application/json'},
        }),
    );
    await mount(
      `<div id="dest" data-bind='{"keyword":""}'></div>` +
        '<button id="source" type="button" data-fetch="http://api.test/list"' +
        ` data-fetch-state data-bind='{"keyword":"あ"}'` +
        ' data-click-copy="#dest">コピー</button>',
    );
    await waitForIdle();
    expect(fetchState('#source')?.status).toBe('error');

    (container!.querySelector('#source') as HTMLElement).click();
    await waitForIdle();

    expect(bindingData('#dest').keyword).toBe('あ');
    expect(fetchState('#dest')).toBeUndefined();
  });

  it('data-{event}-copy-source で指定したコピー元でも運ばない', async () => {
    // 仕様「`data-{event}-copy-source`」の「それ以外の要素の場合は、その要素
    // **自身の**バインディングデータを使用します」。コピー元の解決経路が
    // 発火元自身のときとは分かれているため、両方を押さえる。
    mockServerError();
    await mount(
      `<div id="dest" data-bind='{"keyword":""}'></div>` +
        `<div id="source" data-fetch="http://api.test/list" data-fetch-state` +
        ` data-bind='{"keyword":"あ"}'></div>` +
        '<button id="run" type="button" data-click-copy="#dest"' +
        ' data-click-copy-source="#source">コピー</button>',
    );
    await waitForIdle();
    expect(fetchState('#source')?.status).toBe('error');

    (container!.querySelector('#run') as HTMLElement).click();
    await waitForIdle();

    expect(bindingData('#dest').keyword).toBe('あ');
    expect(fetchState('#dest')).toBeUndefined();
  });

  it('予約キーでない値は差し替えで消える（対照）', async () => {
    mockServerError();
    await mount(
      `<div id="target" data-fetch="http://api.test/list" data-fetch-state` +
        ` data-bind='{"keyword":"初期","note":"残さない"}'></div>`,
    );
    await waitForIdle();

    await Core.setBindingData(
      container!.querySelector('#target') as HTMLElement,
      {keyword: '供給'},
    );
    await waitForIdle();

    expect(bindingData('#target').note).toBeUndefined();
  });
});
