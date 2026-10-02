/* @vitest-environment jsdom */
/**
 * @fileoverview ステータスごとの失敗時のアクション（`data-{event}-error-{ステータス}-*`）
 * と、トーストのレベルの式（`data-{event}-toast-level` / `-error-toast-level`）。
 *
 * 背景: 取り直しの失敗を「404 なら閉じて検索し直す」「それ以外は閉じずにサーバの
 * メッセージを出す」に分けたい画面で、失敗時のアクションを 1 組しか宣言できず、
 * 中継の隠しボタンを置いて `data-click-if` で振り分けていた。また、トーストの
 * レベルは式の使えない生値で、ステータスで色を変えるにも中継ボタンが要った。
 *
 * 期待値の根拠は仕様「失敗時のアクション」、仕様「`data-{event}-toast`」、
 * 仕様「バインド後に実行するアクションの評価タイミング」。
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

/** URL の一部と、その応答（数値はステータス、`'network'` は通信の例外） */
type Plan = Record<
  string,
  number | 'network' | {status: number; json: unknown}
>;

describe('ステータスごとの失敗時のアクションと、トーストのレベルの式', () => {
  let container: HTMLElement | null = null;
  /** 起きたことの順序（通信の開始・クリック・閉じる・トースト） */
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
    vi.restoreAllMocks();
  });

  /**
   * URL ごとに応答を決めるフェッチのスパイを設定します。
   *
   * 数値を指定した URL は、本文が `応答 {ステータス}` のプレーンテキストを返します。
   *
   * @param plan URL の一部と、その応答の対応
   * @returns 戻り値はありません。
   */
  const stubFetch = (plan: Plan): void => {
    const sink = log;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown) => {
      const url = String(input);
      const key = Object.keys(plan).find(part => url.includes(part)) as string;
      sink.push(`fetch:${key}`);
      const reply = plan[key];
      if (reply === 'network') {
        throw new TypeError('Failed to fetch');
      }
      if (typeof reply === 'object') {
        return new Response(JSON.stringify(reply.json), {
          status: reply.status,
          headers: {'Content-Type': 'application/json'},
        });
      }
      return new Response(`応答 ${reply}`, {
        status: reply,
        headers: {'Content-Type': 'text/plain'},
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
    // `-error-*-click` の対象（検索ボタン）が押されたことを、押した時点で記録する。
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

  /**
   * `_fetch` を自要素へ注入する取り直しボタンを、ダイアログの中に置きます。
   *
   * @param attrs 取り直しボタンへ差し込む属性
   * @returns マウントする HTML 文字列
   */
  const reloadButton = (attrs: string): string =>
    '<dialog id="dlg" open><div data-bind="{}">' +
    '<button id="reload" type="button" data-click-fetch="/api/reward"' +
    ` data-click-fetch-state ${attrs}>取り直し</button>` +
    '</div></dialog>' +
    '<button id="search" type="button">検索</button>';

  /** 起票の画面と同じ宣言（404 なら閉じて検索し直す。それ以外はメッセージを出す） */
  const rewardDeclaration =
    'data-click-error-404-click="#search"' +
    ' data-click-error-404-close="#dlg"' +
    ' data-click-error-404-toast="外れました"' +
    ' data-click-error-404-no-message' +
    ' data-click-error-no-message' +
    ` data-click-error-toast="{{_fetch.responseMessage ?? '取得できませんでした'}}"` +
    ' data-click-error-toast-level="error"';

  describe('トーストのレベルの式', () => {
    it('-toast-level は表示直前に評価し、応答の値でレベルを変えられる', async () => {
      // 仕様「`data-{event}-toast`」の「メッセージと同じく**表示直前**に評価する
      // ため、式を書けます」。
      stubFetch({
        '/api/save': {
          status: 200,
          json: {notice: '保存しました', warned: true},
        },
      });
      await mount(
        '<div id="state"><button id="save" type="button"' +
          ' data-click-fetch="/api/save" data-click-bind="#state"' +
          ' data-click-toast="{{notice}}"' +
          ` data-click-toast-level="{{warned ? 'warning' : 'success'}}">` +
          '保存</button></div>',
      );

      await clickAndSettle('#save');

      expect(log).toEqual(['fetch:/api/save', 'toast:warning:保存しました']);
    });

    it('評価結果が 4 つの値のどれでもなければ info で表示する', async () => {
      // 仕様「`data-{event}-toast`」の「評価結果がこの 4 つの文字列のどれとも
      // 一致しない場合は、`info` で表示します」。
      stubFetch({'/api/save': {status: 200, json: {level: 'danger'}}});
      await mount(
        '<div id="state"><button id="save" type="button"' +
          ' data-click-fetch="/api/save" data-click-bind="#state"' +
          ' data-click-toast="保存しました"' +
          ' data-click-toast-level="{{level}}">保存</button></div>',
      );

      await clickAndSettle('#save');

      expect(log).toEqual(['fetch:/api/save', 'toast:info:保存しました']);
    });

    it.each([
      [409, 'warning'],
      [404, 'error'],
    ])(
      '-error-toast-level は表示直前に評価し、_fetch.statusCode を参照できる（%i）',
      async (status, level) => {
        // 仕様「失敗時のアクション」の「`-error-toast` と `-error-toast-level`
        // （ステータスごとの組の `-toast` / `-toast-level` を含む）は表示直前に
        // 評価します」。
        stubFetch({'/api/reward': status});
        await mount(
          reloadButton(
            'data-click-error-toast="失敗"' +
              ` data-click-error-toast-level="{{_fetch.statusCode === 409 ? 'warning' : 'error'}}"`,
          ),
        );

        await clickAndSettle('#reload');

        expect(log).toEqual(['fetch:/api/reward', `toast:${level}:失敗`]);
      },
    );
  });

  describe('ステータスごとの組', () => {
    it('失敗したステータスの組があれば、その組を実行する', async () => {
      // 仕様「失敗時のアクション」の「取得が失敗したステータスの組を 1 つでも
      // 宣言していれば、**その組の属性だけを使います**」と「実行の順序」。
      stubFetch({'/api/reward': 404});
      await mount(reloadButton(rewardDeclaration));

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'click:#search',
        'close:#dlg',
        'toast:info:外れました',
      ]);
    });

    it('組の無いステータスでは、ステータスの付かない属性を使う', async () => {
      // 仕様「失敗時のアクション」の「`-error-status` は、組の無い失敗で
      // ステータスの付かない属性を使うかどうかだけを決めます」。
      stubFetch({'/api/reward': 500});
      await mount(reloadButton(rewardDeclaration));

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'toast:error:応答 500']);
    });

    it('通信の例外では、ステータスの付かない属性を使う', async () => {
      // 仕様「失敗時のアクション」の「通信の例外にはステータスが無いため、
      // ステータスの付かない属性を使います」。
      stubFetch({'/api/reward': 'network'});
      await mount(reloadButton(rewardDeclaration));

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'toast:error:取得できませんでした',
      ]);
    });

    it('組に無い属性を、ステータスの付かない属性で補わない', async () => {
      // 仕様「失敗時のアクション」の「組に無い属性を、ステータスの付かない
      // 属性で補うこともしません」。
      stubFetch({'/api/reward': 404});
      await mount(
        reloadButton(
          'data-click-error-404-close="#dlg"' +
            ' data-click-error-click="#search" data-click-error-toast="汎用"',
        ),
      );

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'close:#dlg']);
    });

    it.each([
      [404, ['toast:info:404 の組']],
      [409, ['toast:info:汎用']],
      [500, []],
    ])(
      '-error-status は組の無い失敗にだけ効く（%i）',
      async (status, toasts) => {
        // 仕様「失敗時のアクション」の「組を宣言したステータスでは、
        // `-error-status` に列挙していなくても組を実行します」。
        stubFetch({'/api/reward': status});
        await mount(
          reloadButton(
            'data-click-error-404-toast="404 の組"' +
              ' data-click-error-status="409" data-click-error-toast="汎用"',
          ),
        );

        await clickAndSettle('#reload');

        expect(log).toEqual(['fetch:/api/reward', ...toasts]);
      },
    );

    it('組の -toast と -toast-level は表示直前に評価する', async () => {
      // 仕様「失敗時のアクション」の「（ステータスごとの組の `-toast` /
      // `-toast-level` を含む）は表示直前に評価します」。
      stubFetch({'/api/reward': 404});
      await mount(
        reloadButton(
          'data-click-error-404-toast="{{_fetch.statusCode}} で外れました"' +
            ` data-click-error-404-toast-level="{{_fetch.statusCode === 404 ? 'warning' : 'error'}}"`,
        ),
      );

      await clickAndSettle('#reload');

      expect(log).toEqual([
        'fetch:/api/reward',
        'toast:warning:404 で外れました',
      ]);
    });

    it('組の -click-await は、待った対象が失敗したら後続を止める', async () => {
      // 仕様「失敗時のアクション」の「意味はステータスの付かない属性と同じです」
      // と「`data-{event}-error-click-await`」の「待った対象が失敗したら、後続の
      // 対象をクリックせず、`-error-close` と `-error-toast` も実行しません」。
      stubFetch({'/api/reward': 404, '/api/first': 500, '/api/second': 200});
      await mount(
        '<dialog id="dlg" open>' +
          '<button id="reload" type="button" data-click-fetch="/api/reward"' +
          ' data-click-error-404-click=".after" data-click-error-404-click-await' +
          ' data-click-error-404-close="#dlg"' +
          ' data-click-error-404-toast="外れました">取り直し</button></dialog>' +
          '<span class="after" data-click-fetch="/api/first"></span>' +
          '<span class="after" data-click-fetch="/api/second"></span>',
      );

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'fetch:/api/first']);
    });

    it.each([
      ['3 桁でないステータス', 'data-click-error-0404-toast="誤り"'],
      ['6 つ以外の後ろの名前', 'data-click-error-404-message="誤り"'],
    ])('%sは組として扱わない', async (_label, attr) => {
      // 仕様「失敗時のアクション」の「`{ステータス}` は 3 桁の HTTP ステータス
      // です。後ろに付けられるのは `-click` / `-click-await` / `-close` /
      // `-toast` / `-toast-level` / `-no-message` の 6 つ」。
      stubFetch({'/api/reward': 404});
      await mount(reloadButton(`${attr} data-click-error-toast="汎用"`));

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'toast:info:汎用']);
    });

    it('別のイベントの組は読まない', async () => {
      // 仕様「失敗時のアクション」の属性名 `data-{event}-error-{ステータス}-*`。
      // `data-input-` は `data-click-` と同じ長さのため、接頭を見ずに後ろだけを
      // 見ると取り違える。
      stubFetch({'/api/reward': 404});
      await mount(
        reloadButton(
          'data-input-error-404-toast="別のイベント"' +
            ' data-click-error-toast="汎用"',
        ),
      );

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'toast:info:汎用']);
    });

    it('組に -click が無ければ、値の省略としてエラーを記録しない', async () => {
      // 仕様「失敗時のアクション」の「`-error-click` の値は必須です。省略すると
      // エラーを記録し」は、属性を宣言した場合の規則。組に `-click` を書かな
      // ければ、クリックもエラーの記録もしない。
      const error = vi.spyOn(Log, 'error');
      stubFetch({'/api/reward': 404});
      await mount(reloadButton('data-click-error-404-toast="外れました"'));

      await clickAndSettle('#reload');

      expect(log).toEqual(['fetch:/api/reward', 'toast:info:外れました']);
      expect(error).not.toHaveBeenCalled();
    });

    it('組の -click-await で待てない対象の警告には、組の属性名を書く', async () => {
      // 仕様「`data-{event}-click-await`」の「警告を記録し」。意味はステータスの
      // 付かない属性と同じ（仕様「失敗時のアクション」）。
      const warn = vi.spyOn(Log, 'warn');
      stubFetch({'/api/reward': 404, '/api/first': 200});
      await mount(
        '<button id="reload" type="button" data-click-fetch="/api/reward"' +
          ' data-click-error-404-click=".after"' +
          ' data-click-error-404-click-await>取り直し</button>' +
          '<button class="after" type="button" disabled' +
          ' data-click-fetch="/api/first"></button>',
      );

      await clickAndSettle('#reload');

      expect(
        warn.mock.calls.some(call =>
          String(call[1]).startsWith('data-click-error-404-click-await は'),
        ),
      ).toBe(true);
    });

    it('data-poll-* では読まない', async () => {
      // 仕様「定期実行と相性の悪い修飾子」の「[失敗時のアクション]（…と、
      // ステータスごとの組の `data-poll-error-{ステータス}-*`）は読みません」。
      stubFetch({'/api/status': 500});
      await mount(
        '<div id="poller" data-poll-fetch="/api/status"' +
          ' data-poll-interval="600000" data-poll-error-500-toast="失敗">' +
          '</div>',
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
        '<div data-fetch="/api/auto" data-fetch-error-500-toast="失敗"></div>',
      );
      await waitForCondition(() => log.includes('fetch:/api/auto'), {
        description: '非イベントの取得',
      });
      await waitForIdle();

      expect(log).toEqual(['fetch:/api/auto']);
    });
  });

  describe('組の -no-message', () => {
    it('組の -no-message を宣言すると、そのステータスでは本文を表示しない', async () => {
      // 仕様「失敗時のアクション」の「ステータスごとの組を使う失敗では、その組の
      // `-error-{ステータス}-no-message` の宣言だけに従います」。
      const addErrorMessage = vi.spyOn(Haori, 'addErrorMessage');
      stubFetch({'/api/reward': 404});
      await mount(
        reloadButton(
          'data-click-error-404-toast="外れました"' +
            ' data-click-error-404-no-message',
        ),
      );

      await clickAndSettle('#reload');

      expect(addErrorMessage).not.toHaveBeenCalled();
      expect(log).toEqual(['fetch:/api/reward', 'toast:info:外れました']);
    });

    it('組で宣言しなければ、ステータスの付かない -no-message があっても表示する', async () => {
      // 同上。ステータスの付かない `-error-no-message` は使わない。
      const addErrorMessage = vi.spyOn(Haori, 'addErrorMessage');
      stubFetch({'/api/reward': 404});
      await mount(
        reloadButton(
          'data-click-error-404-toast="外れました" data-click-error-no-message',
        ),
      );

      await clickAndSettle('#reload');

      expect(addErrorMessage.mock.calls.map(call => call[1])).toEqual([
        '応答 404',
      ]);
    });

    it('組の無いステータスでは、ステータスの付かない -no-message に従う', async () => {
      // 仕様「失敗時のアクション」の「`-error-status` は、組の無い失敗で
      // ステータスの付かない属性を使うかどうかだけを決めます」。組の無い失敗は、
      // 今までどおり `-error-no-message` に従う。
      const addErrorMessage = vi.spyOn(Haori, 'addErrorMessage');
      stubFetch({'/api/reward': 500});
      await mount(reloadButton(rewardDeclaration));

      await clickAndSettle('#reload');

      expect(addErrorMessage).not.toHaveBeenCalled();
    });
  });
});
