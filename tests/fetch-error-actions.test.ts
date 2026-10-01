/* @vitest-environment jsdom */
/**
 * @fileoverview 失敗時のアクション（`data-{event}-error-*`）。
 *
 * 背景: 操作の結果として取得先が無くなる画面では、続けて取り直す取得が 404 に
 * なる。このとき「ダイアログを閉じ、一覧を検索し直し、トーストで知らせる」を
 * 宣言する手段が無く、利用者が古い内容のダイアログに取り残されていた。
 * `data-{event}-click-await` は「失敗したら止める」は宣言できるが、「失敗したら
 * これをする」は宣言できない。
 *
 * 期待値の根拠は仕様「失敗時のアクション」と仕様「処理順序」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment from '../src/fragment';
import Haori from '../src/haori';
import Log from '../src/log';
import Procedure from '../src/procedure';
import {waitForCondition, waitForIdle} from './helpers/async';

/** URL の一部と、その応答のステータス（`'network'` は通信の例外） */
type Plan = Record<string, number | 'network'>;

describe('失敗時のアクション（data-{event}-error-*）', () => {
  let container: HTMLElement | null = null;
  /** 起きたことの順序（通信の開始・検索ボタンのクリック・閉じる・トースト） */
  let log: string[] = [];

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    log = [];
    await import('../src/observer');
    vi.spyOn(Haori, 'closeDialog').mockImplementation(async element => {
      log.push(`close:#${element.id}`);
    });
    vi.spyOn(Haori, 'toast').mockImplementation(async (message, level) => {
      log.push(`toast:${level}:${message}`);
    });
  });

  afterEach(() => {
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    document.body.removeAttribute('data-unauthorized-redirect');
    vi.restoreAllMocks();
  });

  /**
   * URL ごとに応答を決めるフェッチのスパイを設定します。
   *
   * @param plan URL の一部と、その応答のステータスの対応
   * @returns 戻り値はありません。
   */
  const stubFetch = (plan: Plan): void => {
    const sink = log;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown) => {
      const url = String(input);
      const key = Object.keys(plan).find(part => url.includes(part)) as string;
      sink.push(`fetch:${key}`);
      const status = plan[key];
      if (status === 'network') {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({message: `応答 ${status}`}), {
        status,
        headers: {'Content-Type': 'application/json'},
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
    // `-error-click` の対象（検索ボタン）が押されたことを、押した時点で記録する。
    const search = container.querySelector('#search');
    search?.addEventListener('click', () => log.push('click:#search'));
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

  /** 失敗時のアクションを一通り宣言した取り直しボタン（属性は差し込む） */
  const reloadButton = (extra: string): string =>
    '<dialog id="dlg" open>' +
    `<button id="reload" type="button" data-click-fetch="/api/reward"${extra}` +
    ' data-click-error-click="#search" data-click-error-close="#dlg"' +
    ' data-click-error-toast="外れました">取り直し</button>' +
    '</dialog>' +
    '<button id="search" type="button">検索</button>';

  describe('実行する場合', () => {
    it('404 なら、クリック → 閉じる → トーストの順に実行する', async () => {
      // 仕様「失敗時のアクション」の「実行の順序」の 4〜6。トーストのレベルは
      // 「省略時は `info` です」。
      stubFetch({'/api/reward': 404});
      await mount(reloadButton(''));

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'click:#search',
        'close:#dlg',
        'toast:info:外れました',
      ]);
    });

    it('-error-close の値を省略すると、最も近い祖先の dialog を閉じる', async () => {
      // 仕様「失敗時のアクション」の「値を省略すると、自要素の祖先方向で最も
      // 近い `<dialog>` を閉じます」。
      stubFetch({'/api/reward': 404});
      await mount(
        '<dialog id="outer" open><div><button id="reload" type="button"' +
          ' data-click-fetch="/api/reward" data-click-error-close>' +
          '取り直し</button></div></dialog>',
      );

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'close:#outer']);
    });

    it('-error-toast-level でトーストのレベルを指定できる', async () => {
      // 仕様「失敗時のアクション」の `data-{event}-error-toast-level`。
      stubFetch({'/api/reward': 500});
      await mount(
        '<button id="reload" type="button" data-click-fetch="/api/reward"' +
          ' data-click-error-toast="失敗" data-click-error-toast-level="warning">' +
          '取り直し</button>',
      );

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'toast:warning:失敗']);
    });

    it('-error-toast は表示直前に評価し、注入した _fetch を参照できる', async () => {
      // 仕様「失敗時のアクション」の「`-error-toast` は表示直前に評価します」
      // 「`data-{event}-fetch-state` の注入先を自要素か祖先にしてください」。
      stubFetch({'/api/reward': 404});
      await mount(
        '<div data-bind="{}"><button id="reload" type="button"' +
          ' data-click-fetch="/api/reward" data-click-fetch-state' +
          ' data-click-error-toast="{{_fetch.statusCode}} で失敗">' +
          '取り直し</button></div>',
      );

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'toast:info:404 で失敗']);
    });

    it('通信の例外でも、-error-status が無ければ実行する', async () => {
      // 仕様「失敗時のアクション」の「通信の例外（ネットワーク断・タイムアウト
      // など）のとき」。
      vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      stubFetch({'/api/reward': 'network'});
      await mount(reloadButton(''));

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'click:#search',
        'close:#dlg',
        'toast:info:外れました',
      ]);
    });

    it('認証ガードを宣言していない 401 では実行する', async () => {
      // 仕様「失敗時のアクション」の「認証ガードを宣言していない 401 / 403 は
      // 失敗として扱います」。
      stubFetch({'/api/reward': 401});
      await mount(reloadButton(''));

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'click:#search',
        'close:#dlg',
        'toast:info:外れました',
      ]);
    });
  });

  describe('-error-status', () => {
    it('列挙したステータスでは実行する', async () => {
      // 仕様「失敗時のアクション」の「列挙したステータスで失敗した場合だけ
      // 実行します」。
      stubFetch({'/api/reward': 410});
      await mount(reloadButton(' data-click-error-status=" 404 & 410 "'));

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'click:#search',
        'close:#dlg',
        'toast:info:外れました',
      ]);
    });

    it('列挙していないステータスでは実行しない', async () => {
      stubFetch({'/api/reward': 500});
      await mount(reloadButton(' data-click-error-status="404&410"'));

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward']);
    });

    it('宣言すると、通信の例外では実行しない', async () => {
      // 仕様「失敗時のアクション」の「ただし `-error-status` を宣言した場合は
      // 実行しません（例外にはステータスが無いためです）」。
      vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      stubFetch({'/api/reward': 'network'});
      await mount(reloadButton(' data-click-error-status="404"'));

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward']);
    });

    it('3 桁の数字でない項目は無視し、警告を記録する', async () => {
      // 仕様「失敗時のアクション」の「3 桁の数字でない項目は無視し、警告を
      // 記録します」。
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      stubFetch({'/api/reward': 404});
      await mount(reloadButton(' data-click-error-status="4xx&404"'));

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'click:#search',
        'close:#dlg',
        'toast:info:外れました',
      ]);
      expect(warn.mock.calls.some(call => call.join(' ').includes('4xx'))).toBe(
        true,
      );
    });

    it('有効な項目が 1 つも無い場合は、どの失敗でも実行しない', async () => {
      // 仕様「失敗時のアクション」の「有効な項目が 1 つも無い場合は、どの
      // 失敗でも実行しません」。
      vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      stubFetch({'/api/reward': 404});
      await mount(reloadButton(' data-click-error-status="4xx"'));

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward']);
    });
  });

  describe('実行しない場合', () => {
    it('取得が成功したときは実行しない', async () => {
      stubFetch({'/api/reward': 200});
      await mount(reloadButton(''));

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward']);
    });

    it('認証ガードで遷移する 401 では実行しない', async () => {
      // 仕様「失敗時のアクション」の「[認証ガード] で遷移する 401 / 403 では
      // 実行しません」。
      const originalLocation = window.location;
      let assignedHref: string | null = null;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          get href() {
            return 'http://localhost/app/page.html';
          },
          set href(value: string) {
            assignedHref = value;
          },
        },
      });
      try {
        document.body.setAttribute('data-unauthorized-redirect', '/login.html');
        stubFetch({'/api/reward': 401});
        await mount(reloadButton(''));

        await clickAndSettle('#reload');

        expect(assignedHref).toBe('/login.html');
        expect(log).toEqual(['fetch:/api/reward']);
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: originalLocation,
        });
      }
    });

    it('確認ダイアログのキャンセルでは実行しない', async () => {
      // 仕様「失敗時のアクション」の「確認ダイアログのキャンセル
      // （`data-{event}-confirm`）」。
      vi.spyOn(Haori, 'confirm').mockResolvedValue(false);
      stubFetch({'/api/reward': 404});
      await mount(reloadButton(' data-click-confirm="取り直しますか"'));

      await clickAndSettle('#reload');

      expect(log).toEqual([]);
    });

    it('-click-await で止めた呼び出し元では実行しない', async () => {
      // 仕様「失敗時のアクション」の「[`data-{event}-click-await`] で後続を
      // 止めた呼び出し元。…失敗した手続き自身が `-error-*` を宣言していれば、
      // その手続きで実行します」。
      stubFetch({'/api/reward': 404, '/api/caller': 200});
      await mount(
        '<button id="caller" type="button" data-click-fetch="/api/caller"' +
          ' data-click-click="#reload" data-click-click-await' +
          ' data-click-error-toast="呼び出し元">保存</button>' +
          '<button id="reload" type="button" data-click-fetch="/api/reward"' +
          ' data-click-error-toast="取り直し">取り直し</button>',
      );

      await clickAndSettle('#caller');

      expect(log).toEqual([
        'fetch:/api/caller',
        'fetch:/api/reward',
        'toast:info:取り直し',
      ]);
    });

    it('-error-click の値を省略するとエラーを記録し、クリックしない', async () => {
      // 仕様「失敗時のアクション」の「`-error-click` の値は必須です。省略すると
      // エラーを記録し、クリックしません」。
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      stubFetch({'/api/reward': 404});
      await mount(
        '<button id="reload" type="button" data-click-fetch="/api/reward"' +
          ' data-click-error-click data-click-error-toast="外れました">' +
          '取り直し</button>',
      );

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'toast:info:外れました']);
      expect(
        error.mock.calls.some(call =>
          call.join(' ').includes('data-click-error-click'),
        ),
      ).toBe(true);
    });

    it('data-poll-* では読まない', async () => {
      // 仕様「失敗時のアクション」の「`data-poll-*` …では読みません」。
      stubFetch({'/api/status': 500});
      await mount(
        '<dialog id="dlg" open><div id="poller" data-poll-fetch="/api/status"' +
          ' data-poll-interval="600000" data-poll-error-toast="失敗"' +
          ' data-poll-error-click="#search" data-poll-error-close="#dlg">' +
          '</div></dialog><button id="search" type="button">検索</button>',
      );
      const poller = container!.querySelector('#poller') as HTMLElement;

      await new Procedure(Fragment.get(poller), 'poll').run();
      await waitForIdle();

      expect(log.filter(entry => !entry.startsWith('fetch:'))).toEqual([]);
    });

    it('非イベントの data-fetch では読まない', async () => {
      // 仕様「失敗時のアクション」の「非イベントの `data-fetch` …では読みません」。
      stubFetch({'/api/auto': 500});
      await mount(
        '<div data-fetch="/api/auto" data-fetch-error-toast="失敗"></div>',
      );
      await waitForCondition(() => log.includes('fetch:/api/auto'), {
        description: '非イベントの取得',
      });
      await waitForIdle();

      expect(log).toEqual(['fetch:/api/auto']);
    });
  });

  describe('手続きは失敗のまま終わる', () => {
    it('バインドへ進まず、本文の表示・_fetch の注入・fetcherror は今までどおり行う', async () => {
      // 仕様「失敗時のアクション」の「実行の順序」の 1〜3 と「処理順 8 以降
      // （バインド・ダイアログ・トースト・リダイレクトなど）へは進みません」。
      const addErrorMessage = vi.spyOn(Haori, 'addErrorMessage');
      stubFetch({'/api/reward': 404});
      await mount(
        '<div id="state" data-bind="{}">' +
          reloadButton(
            ' data-click-bind="#state" data-click-fetch-state="#state"' +
              ' data-click-toast="成功"',
          ) +
          '</div>',
      );
      const fetchErrors: unknown[] = [];
      container!
        .querySelector('#reload')!
        .addEventListener('haori:fetcherror', event =>
          fetchErrors.push((event as CustomEvent).detail.status),
        );

      await clickAndSettle('#reload');

      expect(fetchErrors).toEqual([404]);
      expect(
        addErrorMessage.mock.calls.some(call => call[1] === '応答 404'),
      ).toBe(true);
      const state = Fragment.get(
        container!.querySelector('#state') as HTMLElement,
      ).getBindingData() as {_fetch?: {status: string}; message?: string};
      expect(state._fetch?.status).toBe('error');
      expect(state.message).toBeUndefined();
      expect(log).not.toContain('toast:info:成功');
    });

    it('-click-await で待っている呼び出し元からも失敗に見える', async () => {
      // 仕様「失敗時のアクション」の「`data-{event}-click-await` で待っている
      // 呼び出し元からも失敗に見え、呼び出し元は後続を止めます」。
      stubFetch({'/api/reward': 404, '/api/next': 200});
      await mount(
        '<button id="caller" type="button" data-click-click="#reload, #next"' +
          ' data-click-click-await data-click-toast="保存しました">保存</button>' +
          '<button id="reload" type="button" data-click-fetch="/api/reward"' +
          ' data-click-error-toast="外れました">取り直し</button>' +
          '<button id="next" type="button" data-click-fetch="/api/next">次</button>',
      );

      await clickAndSettle('#caller');

      expect(log).toEqual(['fetch:/api/reward', 'toast:info:外れました']);
    });
  });

  describe('-error-click-await', () => {
    it('宣言した順に完了を待ち、待った対象が失敗したら後続を止める', async () => {
      // 仕様「失敗時のアクション」の「`data-{event}-error-click-await`」。待った
      // 対象が失敗したら、後続の対象をクリックせず、`-error-close` と
      // `-error-toast` も実行しない。
      stubFetch({
        '/api/reward': 404,
        '/api/first': 500,
        '/api/second': 200,
      });
      await mount(
        '<dialog id="dlg" open>' +
          '<button id="reload" type="button" data-click-fetch="/api/reward"' +
          ' data-click-error-click=".after" data-click-error-click-await' +
          ' data-click-error-close="#dlg" data-click-error-toast="外れました">' +
          '取り直し</button></dialog>' +
          '<span class="after" data-click-fetch="/api/first"></span>' +
          '<span class="after" data-click-fetch="/api/second"></span>',
      );

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'fetch:/api/first']);
    });

    it('待った対象が成功したら、閉じる・トーストへ進む', async () => {
      stubFetch({
        '/api/reward': 404,
        '/api/first': 200,
        '/api/second': 200,
      });
      await mount(
        '<dialog id="dlg" open>' +
          '<button id="reload" type="button" data-click-fetch="/api/reward"' +
          ' data-click-error-click=".after" data-click-error-click-await' +
          ' data-click-error-close="#dlg" data-click-error-toast="外れました">' +
          '取り直し</button></dialog>' +
          '<span class="after" data-click-fetch="/api/first"></span>' +
          '<span class="after" data-click-fetch="/api/second"></span>',
      );

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'fetch:/api/first',
        'fetch:/api/second',
        'close:#dlg',
        'toast:info:外れました',
      ]);
    });
  });
});
