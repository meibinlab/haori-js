/* @vitest-environment jsdom */
/**
 * @fileoverview 非イベントの `data-fetch` と `data-poll-*` で、応答本文の自動表示を
 * 止める宣言（`data-fetch-error-no-message` / `data-poll-error-no-message`）。
 *
 * 背景: 画面を開いたときの取得（非イベントの `data-fetch`）の失敗を `_fetch` で
 * 画面が扱う構成では、失敗の表示を画面が出すため、応答本文の自動表示が重なって
 * いた（要望 BM）。`-error-no-message` はイベントの手続きでしか読まれず、非イベントの
 * 取得・`data-{event}-refetch` での再実行・ポーリングでは止められなかった。
 *
 * 期待値の根拠は仕様「失敗時のアクション」の「対象の手続き」と、仕様「定期実行と
 * 相性の悪い修飾子」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment from '../src/fragment';
import Haori from '../src/haori';
import {waitForCondition, waitForIdle} from './helpers/async';

/** 返す応答 */
type Reply = {status: number; body: string};

/** 注入された `_fetch` のうち、ここで確かめるキー */
type FetchState = {
  status: string;
  statusCode: number | null;
  responseMessage?: string | null;
};

describe('非イベントの取得とポーリングで、応答本文の自動表示を止める', () => {
  let container: HTMLElement | null = null;
  /** 表示したトースト */
  let toasts: string[] = [];
  /** 発火した `haori:fetcherror` のステータス */
  let fetchErrors: number[] = [];
  /** `haori:fetcherror` を記録するリスナー */
  const recordFetchError = (event: Event): void => {
    fetchErrors.push((event as CustomEvent).detail.status);
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    toasts = [];
    fetchErrors = [];
    await import('../src/observer');
    vi.spyOn(Haori, 'toast').mockImplementation(async message => {
      toasts.push(message);
    });
    document.addEventListener('haori:fetcherror', recordFetchError);
  });

  afterEach(() => {
    document.removeEventListener('haori:fetcherror', recordFetchError);
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * 呼ばれた順に応答を返すフェッチのスパイを設定します。
   *
   * @param replies 返す応答。最後の応答は以後の呼び出しでも返す
   * @returns フェッチのスパイ
   */
  const stubFetch = (...replies: Reply[]) => {
    let index = 0;
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return new Response(reply.body, {
        status: reply.status,
        headers: {'Content-Type': 'text/plain'},
      });
    });
  };

  /**
   * HTML をマウントして走査し、落ち着くまで待ちます。
   *
   * @param html マウントする HTML 文字列
   * @returns 待ち合わせの Promise
   */
  const mount = async (html: string): Promise<void> => {
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
    await waitForIdle();
  };

  /**
   * 指定した要素へ注入された `_fetch` を返します。
   *
   * @param selector 注入先のセレクタ
   * @returns 注入された `_fetch`
   */
  const fetchState = (selector: string): FetchState | undefined =>
    (
      Fragment.get(
        container!.querySelector(selector) as HTMLElement,
      ).getBindingData() as {_fetch?: FetchState}
    )._fetch;

  /** 要望 BM の再現条件の状態ホスト（属性は差し込む） */
  const stateHost = (extra = ''): string =>
    '<div id="host-parent"><div id="state" data-fetch="/api/start.json"' +
    ` data-fetch-bind-merge data-fetch-state${extra}>` +
    '<div data-if="available">開くボタン</div></div></div>';

  /**
   * 表示された失敗のメッセージ（`data-message` 属性の値）を返します。
   *
   * @returns 表示された文言
   */
  const shownMessages = (): string[] =>
    Array.from(container!.querySelectorAll('[data-message]')).map(
      element => element.getAttribute('data-message') ?? '',
    );

  describe('非イベントの data-fetch', () => {
    it('data-fetch-error-no-message を宣言すると、本文を表示しない', async () => {
      // 仕様「失敗時のアクション」の「非イベントの `data-fetch` と `data-poll-*`
      // では、応答本文の表示を止める宣言だけを読みます」。
      stubFetch({status: 500, body: 'サーバでエラーが発生しました。'});
      await mount(stateHost(' data-fetch-error-no-message'));

      expect(
        container!.querySelector('#host-parent')!.hasAttribute('data-message'),
      ).toBe(false);
      expect(shownMessages()).toEqual([]);
    });

    it('表示を止めても、_fetch の注入と haori:fetcherror の発火は変わらない', async () => {
      // 仕様「失敗時のアクション」の「実行の順序」の 1 と 3。表示（2）だけを止める。
      stubFetch({status: 500, body: 'サーバでエラーが発生しました。'});
      await mount(stateHost(' data-fetch-error-no-message'));

      expect(fetchState('#state')).toMatchObject({
        status: 'error',
        statusCode: 500,
        responseMessage: 'サーバでエラーが発生しました。',
      });
      expect(fetchErrors).toEqual([500]);
    });

    it('宣言しなければ、今までどおり本文を表示する', async () => {
      // 仕様「エラーハンドリング」の自動表示。
      stubFetch({status: 500, body: 'サーバでエラーが発生しました。'});
      await mount(stateHost());

      expect(shownMessages()).toEqual(['サーバでエラーが発生しました。']);
    });

    it('data-fetch-error-status で列挙したステータスでだけ止める', async () => {
      // 仕様「失敗時のアクション」の「列挙したステータスでだけ止め、ほかの
      // ステータスでは今までどおり表示します」。
      stubFetch({status: 404, body: '見つかりません'});
      await mount(
        stateHost(' data-fetch-error-no-message data-fetch-error-status="404"'),
      );
      expect(shownMessages()).toEqual([]);

      container!.remove();
      stubFetch({status: 500, body: '障害'});
      await mount(
        stateHost(' data-fetch-error-no-message data-fetch-error-status="404"'),
      );
      expect(shownMessages()).toEqual(['障害']);
    });

    it('ステータスごとの組の data-fetch-error-{ステータス}-no-message に従う', async () => {
      // 仕様「失敗時のアクション」の「ステータスごとの組を使う失敗では、その組の
      // `-error-{ステータス}-no-message` の宣言だけに従います」。
      stubFetch({status: 404, body: '見つかりません'});
      await mount(stateHost(' data-fetch-error-404-no-message'));
      expect(shownMessages()).toEqual([]);

      container!.remove();
      stubFetch({status: 500, body: '障害'});
      await mount(stateHost(' data-fetch-error-404-no-message'));
      expect(shownMessages()).toEqual(['障害']);
    });

    it('表示を止める宣言のほかの失敗時のアクションは読まない', async () => {
      // 仕様「失敗時のアクション」の「ほかの属性は読みません」。
      stubFetch({status: 404, body: '見つかりません'});
      await mount(
        stateHost(
          ' data-fetch-error-404-no-message data-fetch-error-404-toast="組"' +
            ' data-fetch-error-toast="組なし"',
        ),
      );

      expect(shownMessages()).toEqual([]);
      expect(toasts).toEqual([]);
    });

    it('読まない属性だけの組は作らず、ステータスの付かない宣言に従う', async () => {
      // 仕様「失敗時のアクション」の「ほかの属性は読みません」。読まない
      // `-error-404-toast` だけでは 404 の組にならない。
      stubFetch({status: 404, body: '見つかりません'});
      await mount(stateHost(' data-fetch-error-404-toast="組"'));

      expect(shownMessages()).toEqual(['見つかりません']);
    });
  });

  describe('data-{event}-refetch での再実行', () => {
    it('再実行される要素の data-fetch-error-no-message が効く', async () => {
      // 仕様「`data-{event}-refetch`」の「再実行される要素の
      // `data-fetch-error-no-message` に従います」。
      stubFetch(
        {status: 200, body: '{"available": true}'},
        {status: 500, body: '障害'},
      );
      await mount(
        stateHost(' data-fetch-error-no-message') +
          '<button id="retry" data-click-refetch="#state"></button>',
      );

      (container!.querySelector('#retry') as HTMLElement).click();
      await waitForCondition(() => fetchState('#state')?.status === 'error', {
        description: '再実行の失敗',
      });
      await waitForIdle();

      expect(shownMessages()).toEqual([]);
    });

    it('止めた応答でも、前回の表示は消す', async () => {
      // 仕様「失敗時のアクション」の「前回の失敗の表示は、今までどおり消します」。
      // フォームの外の表示先は tests/clear-messages-recipient.test.ts で確かめる。
      stubFetch(
        {status: 500, body: '障害'},
        {status: 404, body: '見つかりません'},
      );
      await mount(
        '<form>' +
          stateHost(
            ' data-fetch-error-no-message data-fetch-error-status="404"',
          ) +
          '</form><button id="retry" data-click-refetch="#state"></button>',
      );
      expect(shownMessages()).toEqual(['障害']);

      (container!.querySelector('#retry') as HTMLElement).click();
      await waitForCondition(() => fetchState('#state')?.statusCode === 404, {
        description: '再実行の 404',
      });
      await waitForIdle();

      expect(shownMessages()).toEqual([]);
    });
  });

  describe('data-poll-*', () => {
    it('data-poll-error-no-message を宣言すると、本文を表示しない', async () => {
      // 仕様「定期実行と相性の悪い修飾子」の「応答本文の表示を止める宣言
      // （`data-poll-error-no-message` …）は読みます」。
      const fetchSpy = stubFetch({status: 500, body: '障害'});
      await mount(
        '<div><div id="poller" data-poll-fetch="/api/status"' +
          ' data-poll-interval="600000" data-poll-error-no-message></div></div>',
      );
      await waitForCondition(() => fetchSpy.mock.calls.length > 0, {
        description: '定期実行の取得',
      });
      await waitForIdle();

      // 走査で始まる定期実行の分も発火するため、回数は数えない。
      expect(fetchErrors).toContain(500);
      expect(shownMessages()).toEqual([]);
    });

    it('宣言しなければ、今までどおり本文を表示する', async () => {
      // 仕様「定期取得トリガー (`data-poll-*`)」の「エラーメッセージの振り分けも
      // 通常のイベント属性と同一です」。
      const fetchSpy = stubFetch({status: 500, body: '障害'});
      await mount(
        '<div><div id="poller" data-poll-fetch="/api/status"' +
          ' data-poll-interval="600000"></div></div>',
      );
      await waitForCondition(() => fetchSpy.mock.calls.length > 0, {
        description: '定期実行の取得',
      });
      await waitForIdle();

      expect(shownMessages()).toEqual(['障害']);
    });
  });
});
