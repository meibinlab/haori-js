/* @vitest-environment jsdom */
/**
 * @fileoverview 失敗した応答の本文をバインドする宣言（`data-{event}-error-bind`）。
 *
 * 背景: 一括登録 API は、CSV にエラー行があると 400 で検証結果（`errorCount`・
 * `rows`）を返す。画面はこれを検証の結果と同じ表に出したいが、2xx 以外の応答
 * 本文はバインドされず、自動表示に回っていた（要望 BN）。
 *
 * 期待値の根拠は仕様「失敗時のアクション」の「`data-{event}-error-bind`」と
 * 「実行の順序」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment from '../src/fragment';
import Haori from '../src/haori';
import {waitForIdle} from './helpers/async';

/** 返す応答 */
type Reply = {status: number; body: string; type?: string};

/** 一括登録 API が 400 で返す検証結果 */
const VALIDATION_RESULT = {
  errorCount: 1,
  rows: [{rowNumber: 2, level: 'ERROR', message: '単価が不正です'}],
};

describe('失敗した応答の本文をバインドする（data-{event}-error-bind）', () => {
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
        headers: {'Content-Type': reply.type ?? 'application/json'},
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
   * 指定した要素をクリックし、落ち着くまで待ちます。
   *
   * @param selector クリックする要素のセレクタ
   * @returns 待ち合わせの Promise
   */
  const clickAndSettle = async (selector: string): Promise<void> => {
    (container!.querySelector(selector) as HTMLElement).click();
    await waitForIdle();
  };

  /**
   * `#state` のバインディングデータを返します。
   *
   * @returns バインディングデータ
   */
  const stateData = (): Record<string, unknown> =>
    Fragment.get(
      container!.querySelector('#state') as HTMLElement,
    ).getBindingData() as Record<string, unknown>;

  /**
   * 表示された失敗のメッセージ（`data-message` 属性の値）を返します。
   *
   * @returns 表示された文言
   */
  const shownMessages = (): string[] =>
    Array.from(container!.querySelectorAll('[data-message]')).map(
      element => element.getAttribute('data-message') ?? '',
    );

  /** 要望 BN の再現条件（ボタンの属性は差し込む） */
  const bulkForm = (extra = ''): string =>
    '<div id="state" data-bind="{}">' +
    '<button id="bulk" data-click-fetch="/api/bulk.json"' +
    ' data-click-fetch-method="POST" data-click-fetch-state="#state"' +
    ` data-click-bind="#state" data-click-bind-arg="validateResult"${extra}>` +
    '一括登録</button>' +
    '<div id="summary" data-if="validateResult">' +
    'エラー {{validateResult.errorCount}} 件</div></div>';

  describe('バインドする場合', () => {
    it('宣言すると、失敗した応答の本文を data-{event}-bind と同じ規則でバインドする', async () => {
      // 仕様「失敗時のアクション」の「応答本文を `data-{event}-bind` と同じ規則で
      // バインドします」。
      stubFetch({status: 400, body: JSON.stringify(VALIDATION_RESULT)});
      await mount(bulkForm(' data-click-error-bind'));

      await clickAndSettle('#bulk');

      expect(stateData().validateResult).toEqual(VALIDATION_RESULT);
      expect(container!.querySelector('#summary')!.textContent).toBe(
        'エラー 1 件',
      );
    });

    it('バインドした応答は自動表示しない', async () => {
      // 仕様「失敗時のアクション」の「バインドした応答は画面へ表示しません」。
      stubFetch({status: 400, body: JSON.stringify(VALIDATION_RESULT)});
      await mount(`<form>${bulkForm(' data-click-error-bind')}</form>`);

      await clickAndSettle('#bulk');

      expect(shownMessages()).toEqual([]);
    });

    it('前回の表示は消す', async () => {
      // 仕様「失敗時のアクション」の「前回の失敗の表示は消します」。
      stubFetch(
        {status: 500, body: '障害', type: 'text/plain'},
        {status: 400, body: JSON.stringify(VALIDATION_RESULT)},
      );
      await mount(
        `<form>${bulkForm(
          ' data-click-error-bind data-click-error-status="400"',
        )}</form>`,
      );

      await clickAndSettle('#bulk');
      expect(shownMessages()).toEqual(['障害']);
      await clickAndSettle('#bulk');

      expect(shownMessages()).toEqual([]);
    });

    it('手続きは失敗のまま: _fetch の error・haori:fetcherror・失敗時のトーストは従来どおりで、成功時のトーストは出ない', async () => {
      // 仕様「失敗時のアクション」の「手続きは失敗のまま終わります」。
      stubFetch({status: 400, body: JSON.stringify(VALIDATION_RESULT)});
      await mount(
        bulkForm(
          ' data-click-error-bind data-click-toast="登録しました"' +
            ' data-click-error-toast="{{_fetch.statusCode}} で失敗"',
        ),
      );

      await clickAndSettle('#bulk');

      expect(stateData()._fetch).toMatchObject({
        status: 'error',
        statusCode: 400,
      });
      expect(fetchErrors).toEqual([400]);
      expect(toasts).toEqual(['400 で失敗']);
    });

    it('本文をバインドできなくても、失敗時のアクションは実行する', async () => {
      // 仕様「失敗時のアクション」の「本文をバインドできない場合（JSON として
      // 解析できないなど）は、エラーを記録して次へ進みます」。
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      stubFetch({status: 400, body: '{壊れた JSON'});
      await mount(
        bulkForm(
          ' data-click-error-bind' +
            ' data-click-error-toast="{{_fetch.statusCode}} で失敗"',
        ),
      );

      await clickAndSettle('#bulk');

      expect(stateData()._fetch).toMatchObject({statusCode: 400});
      expect(toasts).toEqual(['400 で失敗']);
      expect(errors).toHaveBeenCalled();
    });

    it('-await で待っている呼び出し元からは失敗に見え、後続を止める', async () => {
      // 仕様「失敗時のアクション」の「`data-{event}-click-await` で待っている
      // 呼び出し元からも失敗に見え、呼び出し元は後続を止めます」。
      stubFetch({status: 400, body: JSON.stringify(VALIDATION_RESULT)});
      await mount(
        bulkForm(' data-click-error-bind') +
          '<button id="caller" data-click-click="#bulk" data-click-click-await' +
          ' data-click-toast="続き"></button>',
      );

      await clickAndSettle('#caller');

      expect(stateData().validateResult).toEqual(VALIDATION_RESULT);
      expect(toasts).toEqual([]);
    });
  });

  describe('バインドしない場合', () => {
    it('宣言しなければ、今までどおりバインドせずに表示する', async () => {
      // 仕様「エラーハンドリング」の自動表示。
      stubFetch({
        status: 400,
        body: JSON.stringify({message: '登録できません'}),
      });
      await mount(`<form>${bulkForm()}</form>`);

      await clickAndSettle('#bulk');

      expect(stateData().validateResult).toBeUndefined();
      expect(shownMessages()).toEqual(['登録できません']);
    });

    it('-error-status で列挙していないステータスでは、バインドせずに表示する', async () => {
      // 仕様「失敗時のアクション」の「`-error-status` を宣言した場合は、列挙した
      // ステータスでだけバインドします」。
      stubFetch({status: 500, body: JSON.stringify({message: '障害'})});
      await mount(
        `<form>${bulkForm(
          ' data-click-error-bind data-click-error-status="400"',
        )}</form>`,
      );

      await clickAndSettle('#bulk');

      expect(stateData().validateResult).toBeUndefined();
      expect(shownMessages()).toEqual(['障害']);
    });

    it('ステータスごとの組の -error-{ステータス}-bind に従う', async () => {
      // 仕様「失敗時のアクション」の「ステータスごとの組」。組を使う失敗では、
      // その組の宣言だけに従う。
      stubFetch(
        {status: 400, body: JSON.stringify(VALIDATION_RESULT)},
        {status: 500, body: JSON.stringify({message: '障害'})},
      );
      await mount(`<form>${bulkForm(' data-click-error-400-bind')}</form>`);

      await clickAndSettle('#bulk');
      expect(stateData().validateResult).toEqual(VALIDATION_RESULT);
      expect(shownMessages()).toEqual([]);

      await clickAndSettle('#bulk');
      expect(shownMessages()).toEqual(['障害']);
    });

    it('非イベントの data-fetch では読まない', async () => {
      // 仕様「失敗時のアクション」の「ほかの属性は読みません」。
      stubFetch({
        status: 400,
        body: JSON.stringify({message: '登録できません'}),
      });
      await mount(
        '<div><div id="state" data-fetch="/api/list.json"' +
          ' data-fetch-arg="view" data-fetch-error-bind></div></div>',
      );

      expect(stateData().view).toBeUndefined();
      expect(shownMessages()).toEqual(['登録できません']);
    });
  });
});
