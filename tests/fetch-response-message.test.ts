/* @vitest-environment jsdom */
/**
 * @fileoverview 応答本文の文言（`_fetch.responseMessage`）と、応答本文の自動表示を
 * 止める宣言（`data-{event}-error-no-message`）。
 *
 * 背景: 一覧の行のボタンの操作が 409 で失敗したとき、サーバが本文で返す理由を
 * トーストで伝えたい。しかし `_fetch.message` は `statusText`（`"Conflict"`）で、
 * 本文を参照する手段が無かった。また本文は押したボタンの中へ自動表示され、
 * 行のボタンが横に伸びていた。
 *
 * 期待値の根拠は仕様「`data-fetch-state` / `data-{event}-fetch-state`」、
 * 仕様「失敗時のアクション」、仕様「エラーハンドリング」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment from '../src/fragment';
import Haori from '../src/haori';
import Log from '../src/log';
import {waitForCondition, waitForIdle} from './helpers/async';

/** 返す応答（`'network'` は通信の例外） */
type Reply =
  | {status: number; body: string; type?: string; statusText?: string}
  | 'network';

/** 注入された `_fetch` のうち、ここで確かめるキー */
type FetchState = {
  status: string;
  statusCode: number | null;
  message: string | null;
  responseMessage?: string | null;
};

describe('応答本文の文言と、自動表示を止める宣言', () => {
  let container: HTMLElement | null = null;
  /** 表示したトースト（`レベル:文言`） */
  let toasts: string[] = [];

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    toasts = [];
    await import('../src/observer');
    vi.spyOn(Haori, 'toast').mockImplementation(async (message, level) => {
      toasts.push(`${level}:${message}`);
    });
  });

  afterEach(() => {
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
      if (reply === 'network') {
        throw new TypeError('Failed to fetch');
      }
      return new Response(reply.body === '' ? null : reply.body, {
        status: reply.status,
        statusText: reply.statusText ?? '',
        headers: {'Content-Type': reply.type ?? 'application/json'},
      });
    });
  };

  /**
   * HTML をマウントして走査します。
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
   * 指定した要素をクリックし、処理が落ち着くまで待ちます。
   *
   * @param selector クリックする要素のセレクタ
   * @returns 待ち合わせの Promise
   */
  const clickAndSettle = async (selector: string): Promise<void> => {
    (container!.querySelector(selector) as HTMLElement).click();
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

  /** 本文の文言をトーストへ出す、行の差し戻しボタン（属性は差し込む） */
  const revertButton = (extra = ''): string =>
    '<button id="revert" type="button" data-click-fetch="/api/alerts/1"' +
    ' data-click-fetch-state' +
    ` data-click-error-toast="{{_fetch.responseMessage ?? '代わり'}}"${extra}>` +
    '差し戻す</button>';

  describe('_fetch.responseMessage', () => {
    it('プレーン文字列の本文は、前後の空白を除いた本文になり、message は statusText のまま', async () => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「本文が JSON
      // 以外の場合は、前後の空白を除いた本文です」「`message` は `statusText`
      // （`"Conflict"` など）のままで、意味は変わりません」。
      stubFetch({
        status: 409,
        statusText: 'Conflict',
        type: 'text/plain',
        body: '  この行は差し戻せません。\n',
      });
      await mount(revertButton());

      await clickAndSettle('#revert');

      expect(fetchState('#revert')).toMatchObject({
        status: 'error',
        message: 'Conflict',
        responseMessage: 'この行は差し戻せません。',
      });
      expect(toasts).toEqual(['info:この行は差し戻せません。']);
    });

    it('JSON の message と messages を、表示する順に改行で連結する', async () => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「表示する順に
      // 改行（`\n`）で連結した文字列」。
      stubFetch({
        status: 409,
        body: JSON.stringify({message: '全体', messages: ['一', '二']}),
      });
      await mount(revertButton());

      await clickAndSettle('#revert');

      expect(fetchState('#revert')?.responseMessage).toBe('全体\n一\n二');
    });

    it('フィールドへ振り分ける errors の文言も含める', async () => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「フィールドへ
      // 振り分ける文言（`errors` など）も含みます」。配列は自動表示と同じく改行で
      // 連結する（仕様「エラーハンドリング」）。
      stubFetch({
        status: 400,
        body: JSON.stringify({
          message: '全体',
          errors: {code: ['短い', '使えない文字'], name: '必須'},
        }),
      });
      await mount(revertButton());

      await clickAndSettle('#revert');

      expect(fetchState('#revert')?.responseMessage).toBe(
        '全体\n短い\n使えない文字\n必須',
      );
    });

    it('トップレベルの配列は、自動表示と同じくキーごとにまとめてから全体の文言を並べる', async () => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「自動表示と
      // 同じ規則で取り出します」。仕様「エラーハンドリング」の「同一 `key` が
      // 複数あれば改行で連結します」。
      stubFetch({
        status: 409,
        body: JSON.stringify([
          {key: 'code', message: '一'},
          {message: '全体'},
          {key: 'code', message: '二'},
        ]),
      });
      await mount(revertButton());

      await clickAndSettle('#revert');

      expect(fetchState('#revert')?.responseMessage).toBe('一\n二\n全体');
    });

    it('key: 値 の形式の文言も含める', async () => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「`key: 値` の
      // 各形式から、自動表示と同じ規則で取り出します」。
      stubFetch({
        status: 400,
        body: JSON.stringify({code: '重複', tags: ['多い', '長い']}),
      });
      await mount(revertButton());

      await clickAndSettle('#revert');

      expect(fetchState('#revert')?.responseMessage).toBe('重複\n多い\n長い');
    });

    it.each([
      ['空の本文', {type: 'text/plain', body: ''}],
      ['空白だけの本文', {type: 'text/plain', body: ' \n '}],
      ['文言を取り出せない JSON', {body: '{}'}],
      ['解析できない JSON', {body: '{壊れた'}],
    ] as const)(
      '%s では null になり、自動表示はステータスを出す',
      async (_label, reply) => {
        // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「次の場合は
        // `null` です。自動表示はこの場合 `${status} ${statusText}` を表示
        // しますが、`responseMessage` には入れません」。
        const addErrorMessage = vi.spyOn(Haori, 'addErrorMessage');
        stubFetch({status: 409, statusText: 'Conflict', ...reply});
        await mount(revertButton());

        await clickAndSettle('#revert');

        // statusCode も確かめる。本文の処理が例外で終わると通信の例外の経路へ
        // 流れ、statusCode が null のまま responseMessage も null になるため。
        expect(fetchState('#revert')).toMatchObject({
          status: 'error',
          statusCode: 409,
          responseMessage: null,
        });
        expect(addErrorMessage.mock.calls.map(call => call[1])).toEqual([
          '409 Conflict',
        ]);
        expect(toasts).toEqual(['info:代わり']);
      },
    );

    it('通信の例外では null になる', async () => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「ネットワーク断
      // などの例外…では `null` です」。
      vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      stubFetch('network');
      await mount(revertButton());

      await clickAndSettle('#revert');

      expect(fetchState('#revert')).toMatchObject({
        status: 'error',
        responseMessage: null,
      });
    });

    it('失敗の後に成功すると null に戻る', async () => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「HTTP エラー
      // 以外の状態（`loading` / `success`…）では `null` です」。
      stubFetch(
        {status: 409, type: 'text/plain', body: '差し戻せません'},
        {status: 200, body: '{}'},
      );
      await mount(revertButton());
      await clickAndSettle('#revert');
      expect(fetchState('#revert')?.responseMessage).toBe('差し戻せません');

      await clickAndSettle('#revert');

      expect(fetchState('#revert')).toMatchObject({
        status: 'success',
        responseMessage: null,
      });
    });

    it('取得の開始時（loading）は null になる', async () => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「HTTP エラー
      // 以外の状態（`loading` …）では `null` です」。
      let release: (response: Response) => void = () => undefined;
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response('差し戻せません', {
            status: 409,
            headers: {'Content-Type': 'text/plain'},
          }),
        )
        .mockImplementationOnce(
          () => new Promise<Response>(resolve => (release = resolve)),
        );
      await mount(revertButton());
      await clickAndSettle('#revert');

      (container!.querySelector('#revert') as HTMLElement).click();
      await waitForCondition(
        () => fetchState('#revert')?.status === 'loading',
        {
          description: '2 回目の取得の開始',
        },
      );

      expect(fetchState('#revert')?.responseMessage).toBeNull();
      release(new Response('{}', {status: 200}));
      await waitForIdle();
    });
  });

  describe('data-{event}-error-no-message', () => {
    it('宣言すると本文を表示せず、文言はトーストで出せる', async () => {
      // 仕様「失敗時のアクション」の「`-error-no-message` を宣言した場合は表示
      // しません」「表示を止めても `_fetch.responseMessage` で参照できます」。
      const addErrorMessage = vi.spyOn(Haori, 'addErrorMessage');
      stubFetch({status: 409, type: 'text/plain', body: '差し戻せません'});
      await mount(revertButton(' data-click-error-no-message'));

      await clickAndSettle('#revert');

      expect(addErrorMessage).not.toHaveBeenCalled();
      expect(container!.querySelector('[data-message]')).toBeNull();
      expect(toasts).toEqual(['info:差し戻せません']);
    });

    it('前回の表示は今までどおり消す', async () => {
      // 仕様「失敗時のアクション」の「前回の失敗の表示は、今までどおり消します」。
      const clearMessages = vi.spyOn(Haori, 'clearMessages');
      stubFetch({status: 409, type: 'text/plain', body: '差し戻せません'});
      await mount(revertButton(' data-click-error-no-message'));

      await clickAndSettle('#revert');

      expect(clearMessages).toHaveBeenCalled();
    });

    it('フィールドへ振り分ける文言も表示しない', async () => {
      // 仕様「エラーハンドリング」の「失敗時のアクションを実行する失敗に限り、
      // 上の表示を行いません」。フィールドへの振り分けは addErrorMessage では
      // なく addMessage を通るため、addMessage を見る。
      const addMessage = vi.spyOn(Haori, 'addMessage');
      stubFetch({status: 400, body: JSON.stringify({errors: {code: '重複'}})});
      await mount(
        '<form><input name="code">' +
          revertButton(' data-click-error-no-message') +
          '</form>',
      );

      await clickAndSettle('#revert');

      expect(addMessage).not.toHaveBeenCalled();
      expect(container!.querySelector('[data-message]')).toBeNull();
      expect(fetchState('#revert')?.responseMessage).toBe('重複');
    });

    it('宣言しなければ、今までどおり本文を表示する', async () => {
      // 仕様「失敗時のアクション」の「`-error-*` を宣言しても表示します」。
      const addErrorMessage = vi.spyOn(Haori, 'addErrorMessage');
      stubFetch({status: 409, type: 'text/plain', body: '差し戻せません'});
      await mount(revertButton());

      await clickAndSettle('#revert');

      expect(addErrorMessage.mock.calls.map(call => call[1])).toEqual([
        '差し戻せません',
      ]);
    });

    it('-error-status で列挙していないステータスでは、今までどおり表示する', async () => {
      // 仕様「失敗時のアクション」の「列挙したステータスでだけ止め、ほかの
      // ステータスでは今までどおり表示します」。
      const addErrorMessage = vi.spyOn(Haori, 'addErrorMessage');
      stubFetch(
        {status: 409, type: 'text/plain', body: '差し戻せません'},
        {status: 500, type: 'text/plain', body: '障害'},
      );
      await mount(
        revertButton(
          ' data-click-error-no-message data-click-error-status="409"',
        ),
      );

      await clickAndSettle('#revert');
      expect(addErrorMessage).not.toHaveBeenCalled();
      await clickAndSettle('#revert');

      expect(addErrorMessage.mock.calls.map(call => call[1])).toEqual(['障害']);
    });
    // 非イベントの data-fetch と data-poll-* での宣言は
    // tests/fetch-error-no-message-non-event.test.ts で確かめる。
  });
});
