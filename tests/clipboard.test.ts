/* @vitest-environment jsdom */
/**
 * @fileoverview `data-{event}-clipboard` の検証。
 *
 * 押した時点で値を評価してクリップボードへ書き、書き終わってから後続のアクションへ
 * 進むこと、書けなかった場合は手続きを止めることを確かめます。
 *
 * 期待値の根拠は仕様「`data-{event}-clipboard`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Haori from '../src/haori';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('data-{event}-clipboard', () => {
  /** 表示したトーストの文言 */
  let toasts: string[] = [];
  /** 表示したトーストのレベル */
  let levels: unknown[] = [];
  /** 起きた順の記録 */
  let order: string[] = [];
  let writeText: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;
  /** テストの前の `navigator.clipboard` の記述子 */
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  /**
   * `navigator.clipboard` を差し替えます。
   *
   * @param value 差し替える値。undefined なら取り除く
   * @returns 戻り値はありません。
   */
  const setClipboard = (value: unknown): void => {
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
    });
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setRuntime('embedded');
    toasts = [];
    levels = [];
    order = [];
    await import('../src/observer');
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Haori, 'toast').mockImplementation(async (message, level) => {
      toasts.push(message);
      levels.push(level);
    });
    writeText = vi.fn(async (text: string) => {
      order.push(`write:${text}`);
    });
    setClipboard({writeText});
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (original) {
      Object.defineProperty(navigator, 'clipboard', original);
    } else {
      delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
    document.body.innerHTML = '';
  });

  /**
   * 描画して落ち着くまで待ちます。
   *
   * @param html 描画する HTML
   * @returns 落ち着いたら解決する Promise
   */
  const render = async (html: string): Promise<void> => {
    // 走査は呼び出しごとに新しい要素から始める（走査済みの `body` の中身を
    // 差し替えても、フラグメントは作り直されない）。
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    await Core.scan(root);
    await waitForIdle();
  };

  /**
   * 要素をクリックして落ち着くまで待ちます。
   *
   * @param id 要素の id
   * @returns 落ち着いたら解決する Promise
   */
  const click = async (id: string): Promise<void> => {
    (document.getElementById(id) as HTMLElement).click();
    await waitForIdle();
    await waitForIdle();
  };

  /**
   * 警告の文言を返します。
   *
   * @returns 警告の文言
   */
  const warnings = (): string[] =>
    (warn.mock.calls as unknown[][]).map(args =>
      args.map(arg => String(arg)).join(' '),
    );

  it('押すと値をクリップボードへ書き、書き終わってからトーストを出す', async () => {
    // 仕様「`data-{event}-clipboard`」の「値をクリップボードへ書きます」「書き込みが
    // 終わってから後続のアクションへ進むため、`data-{event}-toast` で書いたことを
    // 知らせられます」
    let finish: () => void = () => undefined;
    writeText.mockImplementation(
      (text: string) =>
        new Promise<void>(resolve => {
          order.push(`write:${text}`);
          finish = resolve;
        }),
    );
    await render(`
<div data-bind='{"customerId":"C-001"}'>
  <button id="a1" type="button" data-click-clipboard="{{customerId}}"
    data-click-toast="コピーしました">コピー</button>
</div>`);
    await click('a1');
    expect(order).toEqual(['write:C-001']);
    expect(toasts).toEqual([]);
    finish();
    await waitForCondition(() => toasts.length > 0, {
      description: 'トーストが出る',
    });
    expect(toasts).toEqual(['コピーしました']);
  });

  it('値の 0 は "0" として書く', async () => {
    // 仕様「`data-{event}-clipboard`」の「数値は `0` も含めてそのまま文字列にします
    // （`0` は `"0"` を書きます）」
    await render(`
<div data-bind='{"n":0}'>
  <button id="b1" type="button" data-click-clipboard="{{n}}"
    data-click-toast="コピーしました">コピー</button>
</div>`);
    await click('b1');
    await waitForCondition(() => toasts.length > 0, {
      description: 'トーストが出る',
    });
    expect(writeText).toHaveBeenCalledWith('0');
  });

  it('テンプレートの中の式は、文字列へつないで書く', async () => {
    // 仕様「`data-{event}-clipboard`」の「値には `{{式}}` を書けます」「属性の値と
    // 同じく文字列にします」
    await render(`
<div data-bind='{"id":7}'>
  <button id="b2" type="button" data-click-clipboard="No.{{id}}"
    data-click-toast="コピーしました">コピー</button>
</div>`);
    await click('b2');
    await waitForCondition(() => toasts.length > 0, {
      description: 'トーストが出る',
    });
    expect(writeText).toHaveBeenCalledWith('No.7');
  });

  it.each([
    ['null', '{{v}}', '{"v":null}'],
    ['undefined', '{{v.x}}', '{"v":{}}'],
    ['false', '{{v}}', '{"v":false}'],
    ['空文字', '{{v}}', '{"v":""}'],
    ['NaN', '{{v / 0 * 0}}', '{"v":1}'],
  ])(
    '評価した値が %s なら書かず、トーストも出さない',
    async (_label, template, bind) => {
      // 仕様「`data-{event}-clipboard`」の「`null` / `undefined` / `false` / `NaN`
      // は空文字になり」「評価した値が空文字の場合と、[未解決参照](#未解決参照の診断)
      // を含む場合」「後続のアクション（`data-{event}-confirm` / `data-{event}-fetch`
      // / `data-{event}-toast` など）は実行しません」
      await render(`
<div data-bind='${bind}'>
  <button id="c1" type="button" data-click-clipboard="${template}"
    data-click-toast="コピーしました">コピー</button>
</div>`);
      await click('c1');
      await waitForIdle();
      expect(writeText).not.toHaveBeenCalled();
      expect(toasts).toEqual([]);
    },
  );

  it('未解決参照を含むなら書かず、トーストも出さない', async () => {
    // 仕様「`data-{event}-clipboard`」の「評価した値が空文字の場合と、
    // [未解決参照](#未解決参照の診断)を含む場合」
    await render(`
<div data-bind='{"other":1}'>
  <button id="d1" type="button" data-click-clipboard="ID: {{missingId}}"
    data-click-toast="コピーしました">コピー</button>
</div>`);
    await click('d1');
    await waitForIdle();
    expect(writeText).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it('書き込みが拒まれたらトーストを出さず、warn ログを出す', async () => {
    // 仕様「`data-{event}-clipboard`」の「書き込みが拒まれた場合（権限が無い、
    // ページにフォーカスが無いなど）。開発モードで `warn` ログを出します」
    writeText.mockImplementation(async () => {
      throw new Error('denied');
    });
    await render(`
<div data-bind='{"id":"E-1"}'>
  <button id="e1" type="button" data-click-clipboard="{{id}}"
    data-click-toast="コピーしました">コピー</button>
</div>`);
    await click('e1');
    await waitForCondition(
      () => warnings().some(text => text.includes('denied')),
      {description: 'warn ログが出る'},
    );
    await waitForIdle();
    expect(toasts).toEqual([]);
  });

  it('書き込みが同期に例外を投げてもトーストを出さず、warn ログを出す', async () => {
    // 仕様「`data-{event}-clipboard`」の「書き込みが拒まれた場合」
    writeText.mockImplementation(() => {
      throw new Error('sync-denied');
    });
    await render(`
<div data-bind='{"id":"E-2"}'>
  <button id="e2" type="button" data-click-clipboard="{{id}}"
    data-click-toast="コピーしました">コピー</button>
</div>`);
    await click('e2');
    await waitForIdle();
    expect(warnings().some(text => text.includes('sync-denied'))).toBe(true);
    expect(toasts).toEqual([]);
  });

  it.each([
    ['navigator.clipboard が無い', undefined],
    ['writeText が無い', {}],
  ])('%s ならトーストを出さず、warn ログを出す', async (_label, value) => {
    // 仕様「`data-{event}-clipboard`」の「`navigator.clipboard` が無い場合（HTTPS や
    // `localhost` のような安全なコンテキストでないページなど）。開発モードで `warn`
    // ログを出します」
    setClipboard(value);
    await render(`
<div data-bind='{"id":"F-1"}'>
  <button id="f1" type="button" data-click-clipboard="{{id}}"
    data-click-toast="コピーしました">コピー</button>
</div>`);
    await click('f1');
    await waitForIdle();
    expect(warnings().some(text => text.includes('navigator.clipboard'))).toBe(
      true,
    );
    expect(toasts).toEqual([]);
  });

  it('書けなかったら取得もしない', async () => {
    // 仕様「`data-{event}-clipboard`」の「後続のアクション（`data-{event}-confirm` /
    // `data-{event}-fetch` / `data-{event}-toast` など）は実行しません」
    writeText.mockImplementation(async () => {
      throw new Error('denied');
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{}'));
    const confirm = vi.spyOn(Haori, 'confirm').mockResolvedValue(true);
    await render(`
<div data-bind='{"id":"G-1"}'>
  <button id="g1" type="button" data-click-clipboard="{{id}}"
    data-click-confirm="送りますか" data-click-fetch="/api/g">コピー</button>
</div>`);
    await click('g1');
    await waitForIdle();
    expect(writeText).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('書き込みは run の直後に、押した処理の中で同期に始める', async () => {
    // 仕様「`data-{event}-clipboard`」の「[処理順序](#処理順序)の
    // `data-{event}-run` の直後、`data-{event}-confirm` より前です。書き込みは
    // `await` を挟まずに始めます」
    Haori.handlers.register('clipboardOrderRun', () => {
      order.push('run');
    });
    await render(`
<div data-bind='{"id":"H-1"}'>
  <button id="h1" type="button" data-click-run-handler="clipboardOrderRun"
    data-click-clipboard="{{id}}">コピー</button>
</div>`);
    (document.getElementById('h1') as HTMLElement).click();
    expect(order).toEqual(['run', 'write:H-1']);
  });

  it('確認ダイアログは書き終わってから出す', async () => {
    // 仕様「処理順序」の「[`data-{event}-clipboard`](#data-event-clipboard) は `run`
    // の直後に、同じく同期タイミングで書き込みを始め、その完了を待ってから
    // 3（confirm）へ進みます」
    let finish: () => void = () => undefined;
    writeText.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const confirm = vi.spyOn(Haori, 'confirm').mockResolvedValue(false);
    await render(`
<div data-bind='{"id":"I-1"}'>
  <button id="i1" type="button" data-click-clipboard="{{id}}"
    data-click-confirm="よろしいですか">コピー</button>
</div>`);
    await click('i1');
    expect(confirm).not.toHaveBeenCalled();
    finish();
    await waitForCondition(() => confirm.mock.calls.length > 0, {
      description: '確認ダイアログが出る',
    });
  });

  it('run が返した Promise と書き込みの両方が終わってからトーストを出す', async () => {
    // 仕様「`data-{event}-clipboard`」の「`data-{event}-run` が Promise を返した
    // 場合は、その完了と書き込みの完了の両方を待ってから次へ進みます」
    let finishRun: () => void = () => undefined;
    Haori.handlers.register(
      'clipboardSlowRun',
      () =>
        new Promise<void>(resolve => {
          finishRun = resolve;
        }),
    );
    await render(`
<div data-bind='{"id":"J-1"}'>
  <button id="j1" type="button" data-click-run-handler="clipboardSlowRun"
    data-click-clipboard="{{id}}" data-click-toast="コピーしました">コピー</button>
</div>`);
    await click('j1');
    expect(writeText).toHaveBeenCalledWith('J-1');
    expect(toasts).toEqual([]);
    finishRun();
    await waitForCondition(() => toasts.length > 0, {
      description: 'トーストが出る',
    });
  });

  it('入力欄の手続きが書けずに止まっても、入力した値はフォームへ写す', async () => {
    // 仕様「双方向バインディングの自動更新」の「クリップボードへ書けなかったこと
    // （`data-{event}-clipboard`）、確認のキャンセル（`data-{event}-confirm`）で
    // 止まった場合、止まるのは手続きのアクション（`-run` / `-click` など）だけで、
    // フォームへのコミットは止まらずに進んだ場合と同じく行います」
    await render(`
<form id="k-form" data-bind='{"q":"","empty":""}'>
  <input id="k1" name="q" data-change-clipboard="{{empty}}">
</form>`);
    const input = document.getElementById('k1') as HTMLInputElement;
    input.value = '入力';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForCondition(
      () =>
        JSON.parse(
          document.getElementById('k-form')!.getAttribute('data-bind')!,
        ).q === '入力',
      {description: '入力した値がフォームへ写る'},
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  describe('書けなかったことを知らせる（-clipboard-error-toast）', () => {
    /** 失敗の文言とレベルを宣言した属性 */
    const errorAttrs =
      'data-click-toast="コピーしました"' +
      ' data-click-clipboard-error-toast="コピーできませんでした"' +
      ' data-click-clipboard-error-toast-level="error"';

    it.each([
      ['評価した値が空文字の', '{"v":""}', '{{v}}', () => undefined],
      ['未解決参照を含む', '{"other":1}', '{{missingId}}', () => undefined],
      [
        'navigator.clipboard が無い',
        '{"v":"X"}',
        '{{v}}',
        () => setClipboard(undefined),
      ],
      [
        '書き込みが拒まれた',
        '{"v":"X"}',
        '{{v}}',
        () =>
          writeText.mockImplementation(async () => {
            throw new Error('denied');
          }),
      ],
    ])(
      '%s場合は、失敗の文言のトーストを指定したレベルで出す',
      async (_label, bind, template, arrange) => {
        // 仕様「`data-{event}-clipboard`」の「`data-{event}-clipboard-error-toast`
        // を宣言すると、上の「止める場合」のどれかで止まったときに、その文言の
        // トーストを表示します」「レベルは `data-{event}-clipboard-error-toast-level`
        // （`info` / `warning` / `error` / `success`）で指定し」「後続のアクションは
        // 実行しません」
        arrange();
        await render(`
<div data-bind='${bind}'>
  <button id="m1" type="button" data-click-clipboard="${template}"
    ${errorAttrs}>コピー</button>
</div>`);
        await click('m1');
        await waitForCondition(() => toasts.length > 0, {
          description: '失敗のトーストが出る',
        });
        await waitForIdle();
        expect(toasts).toEqual(['コピーできませんでした']);
        expect(levels).toEqual(['error']);
      },
    );

    it('レベルを省略すると info で出す', async () => {
      // 仕様「`data-{event}-clipboard`」の「省略時は `info` です」
      await render(`
<div data-bind='{"v":""}'>
  <button id="m2" type="button" data-click-clipboard="{{v}}"
    data-click-clipboard-error-toast="コピーできませんでした">コピー</button>
</div>`);
      await click('m2');
      await waitForCondition(() => toasts.length > 0, {
        description: '失敗のトーストが出る',
      });
      expect(levels).toEqual(['info']);
    });

    it('レベルが 4 つのどれとも一致しなければ info で出す', async () => {
      // 仕様「`data-{event}-clipboard`」の「評価結果の扱いは
      // [`data-{event}-toast`](#data-event-toast) と同じです」、仕様
      // 「`data-{event}-toast`」の「評価結果がこの 4 つの文字列のどれとも一致しない
      // 場合は、`info` で表示します」
      await render(`
<div data-bind='{"v":""}'>
  <button id="m8" type="button" data-click-clipboard="{{v}}"
    data-click-clipboard-error-toast="コピーできませんでした"
    data-click-clipboard-error-toast-level="danger">コピー</button>
</div>`);
      await click('m8');
      await waitForCondition(() => toasts.length > 0, {
        description: '失敗のトーストが出る',
      });
      expect(levels).toEqual(['info']);
    });

    it('文言の評価結果が falsy なら出さない', async () => {
      // 仕様「`data-{event}-clipboard`」の「評価結果の扱いは
      // [`data-{event}-toast`](#data-event-toast) と同じです」、仕様
      // 「`data-{event}-toast`」の「評価結果が falsy（`null` / `undefined` /
      // `false` / 空文字 / `0`）または未解決参照のときは**表示しません**」
      await render(`
<div data-bind='{"v":"","msg":0}'>
  <button id="m9" type="button" data-click-clipboard="{{v}}"
    data-click-clipboard-error-toast="{{msg}}">コピー</button>
</div>`);
      await click('m9');
      await waitForIdle();
      expect(toasts).toEqual([]);
    });

    it('書けた場合は出さない', async () => {
      // 仕様「`data-{event}-clipboard`」の「書けた場合と、
      // `data-{event}-clipboard` より前で止まった場合（`data-{event}-validate` /
      // `data-{event}-if`）は表示しません」
      await render(`
<div data-bind='{"v":"OK"}'>
  <button id="m3" type="button" data-click-clipboard="{{v}}"
    ${errorAttrs}>コピー</button>
</div>`);
      await click('m3');
      await waitForCondition(() => toasts.length > 0, {
        description: '成功のトーストが出る',
      });
      await waitForIdle();
      expect(toasts).toEqual(['コピーしました']);
    });

    it('data-{event}-if が偽で止まった場合は出さない', async () => {
      // 仕様「`data-{event}-clipboard`」の「`data-{event}-clipboard` より前で
      // 止まった場合（`data-{event}-validate` / `data-{event}-if`）は表示しません」
      await render(`
<div data-bind='{"v":""}'>
  <button id="m4" type="button" data-click-if="{{false}}"
    data-click-clipboard="{{v}}" ${errorAttrs}>コピー</button>
</div>`);
      await click('m4');
      await waitForIdle();
      expect(toasts).toEqual([]);
    });

    it('文言とレベルは表示直前に評価する', async () => {
      // 仕様「`data-{event}-clipboard`」の「どちらも式を書けます。表示直前に評価
      // します」
      const holder = (): HTMLElement => document.getElementById('m5-holder')!;
      writeText.mockImplementation(async () => {
        holder().setAttribute(
          'data-bind',
          '{"v":"X","msg":"後の文言","lv":"warning"}',
        );
        await waitForIdle();
        throw new Error('denied');
      });
      await render(`
<div id="m5-holder" data-bind='{"v":"X","msg":"前の文言","lv":"success"}'>
  <button id="m5" type="button" data-click-clipboard="{{v}}"
    data-click-clipboard-error-toast="{{msg}}"
    data-click-clipboard-error-toast-level="{{lv}}">コピー</button>
</div>`);
      await click('m5');
      await waitForCondition(() => toasts.length > 0, {
        description: '失敗のトーストが出る',
      });
      expect(toasts).toEqual(['後の文言']);
      expect(levels).toEqual(['warning']);
    });

    it('書けなかった場合に、取得の失敗時のアクション（-error-toast）は実行しない', async () => {
      // 仕様「`data-{event}-clipboard`」の「[失敗時のアクション](#失敗時のアクション)
      // （`data-{event}-error-toast` など）は、取得の失敗にだけ使います。書けなかった
      // 場合には実行しません」
      await render(`
<div data-bind='{"v":""}'>
  <button id="m6" type="button" data-click-clipboard="{{v}}"
    data-click-fetch="/api/m6" data-click-error-toast="取得できませんでした"
    data-click-clipboard-error-toast="コピーできませんでした">コピー</button>
</div>`);
      await click('m6');
      await waitForCondition(() => toasts.length > 0, {
        description: '失敗のトーストが出る',
      });
      await waitForIdle();
      expect(toasts).toEqual(['コピーできませんでした']);
    });

    it('書けた後で取得が失敗した場合は出さない', async () => {
      // 仕様「`data-{event}-clipboard`」の「書けた場合と、`data-{event}-clipboard`
      // より前で止まった場合（`data-{event}-validate` / `data-{event}-if`）は表示
      // しません」
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () => new Response('{}', {status: 500}),
      );
      await render(`
<div data-bind='{"v":"OK"}'>
  <button id="m7" type="button" data-click-clipboard="{{v}}"
    data-click-fetch="/api/m7" data-click-error-no-message
    data-click-error-toast="取得できませんでした"
    data-click-clipboard-error-toast="コピーできませんでした">コピー</button>
</div>`);
      await click('m7');
      await waitForCondition(() => toasts.length > 0, {
        description: '取得の失敗のトーストが出る',
      });
      await waitForIdle();
      expect(toasts).toEqual(['取得できませんでした']);
    });
  });
});
