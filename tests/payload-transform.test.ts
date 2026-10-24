/* @vitest-environment jsdom */
/**
 * @fileoverview `data-{event}-payload-transform`（非イベント:
 * `data-fetch-payload-transform`）の検証。
 *
 * 送信データを式で変換してから送ること、フォームへ写す値は変換しないこと、
 * 変換できない場合は送らないことを確かめます。
 *
 * 期待値の根拠は仕様「`data-{event}-payload-transform`（非イベント:
 * `data-fetch-payload-transform`）」。
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Haori from '../src/haori';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('data-{event}-payload-transform', () => {
  /** 表示したトーストの文言 */
  let toasts: string[] = [];
  let fetch: MockInstance<typeof globalThis.fetch>;
  let error: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setRuntime('embedded');
    toasts = [];
    await import('../src/observer');
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Haori, 'toast').mockImplementation(async message => {
      toasts.push(message);
    });
    fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response('{}', {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        }),
    );
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Env.setRuntime('embedded');
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
   * 送信を待ち、最後の送信のパスとクエリ、本文を返します。
   *
   * @returns 送信のパスとクエリ、本文
   */
  const lastRequest = async (): Promise<{url: string; body: unknown}> => {
    await waitForCondition(() => fetch.mock.calls.length > 0, {
      description: '送信される',
    });
    const [url, init] = fetch.mock.calls.at(-1) as [string, RequestInit];
    // 送信先は相対・絶対のどちらでも来るため、パスとクエリだけを比べる。
    const parsed = new URL(String(url), window.location.href);
    return {url: parsed.pathname + parsed.search, body: init?.body};
  };

  /** 需要電力の行を持つフォーム（2 行目が空） */
  const demandForm = (id: string): string => `
<form id="${id}" data-bind='{"items":[{"m":"2026-01","kw":"10"},{"m":"2026-02","kw":""}]}'>
  <div data-form-list="items" data-each="items" data-each-arg="r" data-each-key="m">
    <div>
      <input type="hidden" name="m" data-attr-value="{{r.m}}">
      <input type="number" name="kw" data-attr-value="{{r.kw}}">
    </div>
  </div>
</form>`;

  it('変換した送信データを JSON の本文で送る', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「送信する前に、送信データへ**式を適用して
    // 変換**します。式の中では送信データ全体を `payload` として参照でき、戻り値を
    // 送ります」「`data-{event}-form` から収集し、`data-{event}-data` を重ねた後の
    // ものです」
    await render(`${demandForm('a-form')}
<button id="a1" type="button" data-click-fetch="/api/a" data-click-fetch-method="PUT"
  data-click-form="#a-form" data-click-data='{"contractId": 5}'
  data-click-payload-transform="({...payload, items: payload.items.filter(r => r.kw != null)})">保存</button>`);
    await click('a1');
    const {body} = await lastRequest();
    expect(JSON.parse(String(body))).toEqual({
      contractId: 5,
      items: [{m: '2026-01', kw: 10}],
    });
  });

  it('宣言しなければ、すべての行を送る', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「`type="number"` の空欄は `null` で
    // 収集されます」
    await render(`${demandForm('b-form')}
<button id="b1" type="button" data-click-fetch="/api/b" data-click-fetch-method="PUT"
  data-click-form="#b-form">保存</button>`);
    await click('b1');
    const {body} = await lastRequest();
    expect(JSON.parse(String(body))).toEqual({
      items: [
        {m: '2026-01', kw: 10},
        {m: '2026-02', kw: null},
      ],
    });
  });

  it('GET では変換した送信データをクエリへ載せる', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「送信データを本文（JSON・
    // `application/x-www-form-urlencoded`・`multipart/form-data`）や GET の
    // クエリへ直す前です」
    await render(`
<button id="c1" type="button" data-click-fetch="/api/c" data-click-data='{"q":"x","page":2}'
  data-click-payload-transform="({q: payload.q})">検索</button>`);
    await click('c1');
    const {url} = await lastRequest();
    expect(url).toBe('/api/c?q=x');
  });

  it('data-{event}-before-run は変換した後の送信データを受け取る', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「`data-{event}-before-run` が受け取る
    // `fetchOptions` は、変換した後の送信データから組み立てたものです」
    const bodies: unknown[] = [];
    Haori.handlers.register('payloadTransformBefore', (...args: unknown[]) => {
      bodies.push((args[1] as RequestInit | null)?.body);
      return true;
    });
    await render(`
<button id="d1" type="button" data-click-fetch="/api/d" data-click-fetch-method="POST"
  data-click-data='{"a":1}' data-click-payload-transform="({b: payload.a + 1})"
  data-click-before-run-handler="payloadTransformBefore">送信</button>`);
    await click('d1');
    await lastRequest();
    expect(bodies.map(body => JSON.parse(String(body)))).toEqual([{b: 2}]);
  });

  it('非イベントの data-fetch-payload-transform も変換して送る', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の見出しと、仕様「`data-fetch`」の
    // 「`data-fetch-payload-transform`: 送信データの変換」
    await render(`
<div data-fetch="/api/e" data-fetch-data='{"a":1}'
  data-fetch-payload-transform="({b: payload.a + 1})"></div>`);
    const {url} = await lastRequest();
    expect(url).toBe('/api/e?b=2');
  });

  it('入力欄の手続きでは、変換する前の値をフォームへ写す', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「入力欄の値をフォームへ写す処理
    // （[双方向バインディングの自動更新](#双方向バインディングの自動更新)）は、
    // 変換する前の収集値を写します」
    await render(`
<form id="f-form" data-bind='{"q":""}'>
  <input id="f1" name="q" data-change-fetch="/api/f" data-change-bind="#f-sink"
    data-change-payload-transform="({k: 'fixed'})">
</form>
<div id="f-sink"></div>`);
    const input = document.getElementById('f1') as HTMLInputElement;
    input.value = '入力';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    const {url} = await lastRequest();
    expect(url).toBe('/api/f?k=fixed');
    await waitForIdle();
    const bound = JSON.parse(
      document.getElementById('f-form')!.getAttribute('data-bind')!,
    );
    expect(bound.q).toBe('入力');
    expect(bound.k).toBeUndefined();
  });

  it('入力欄の手続きで変換できずに止まっても、入力した値はフォームへ写す', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「入力欄の手続きでは、入力した値の
    // フォームへのコミットは行います」
    await render(`
<form id="p-form" data-bind='{"q":""}'>
  <input id="p1" name="q" data-change-fetch="/api/p" data-change-bind="#p-sink"
    data-change-payload-transform="null">
</form>
<div id="p-sink"></div>`);
    const input = document.getElementById('p1') as HTMLInputElement;
    input.value = '入力';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForCondition(
      () =>
        JSON.parse(
          document.getElementById('p-form')!.getAttribute('data-bind')!,
        ).q === '入力',
      {description: '入力した値がフォームへ写る'},
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('haori:fetchstart の payload は変換した後の送信データ', async () => {
    // 仕様「`haori:fetchstart`」の「[`data-{event}-payload-transform`]
    // (#data-event-payload-transform非イベント-data-fetch-payload-transform) を
    // 宣言した場合は、変換した後の送信データです」
    const payloads: unknown[] = [];
    document.addEventListener('haori:fetchstart', event => {
      payloads.push((event as CustomEvent).detail.payload);
    });
    await render(`
<button id="g1" type="button" data-click-fetch="/api/g" data-click-data='{"a":1}'
  data-click-payload-transform="({b: payload.a + 1})">送信</button>`);
    await click('g1');
    await lastRequest();
    expect(payloads).toContainEqual({b: 2});
    expect(payloads).not.toContainEqual({a: 1});
  });

  it('demo ランタイムの情報ログの payload は変換した後の送信データ', async () => {
    // 仕様「demo ランタイムでの通信の正規化」の「ログの `payload` は
    // `haori:fetchstart` の `payload` と同じです」
    Env.setRuntime('demo');
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await render(`
<button id="h1" type="button" data-click-fetch="/api/h" data-click-fetch-method="POST"
  data-click-data='{"a":1}' data-click-payload-transform="({b: payload.a + 1})">送信</button>`);
    await click('h1');
    const {url} = await lastRequest();
    expect(url).toBe('/api/h?b=2');
    const logged = (info.mock.calls as unknown[][])
      .filter(args =>
        args.some(arg => String(arg).includes('demo fetch normalization')),
      )
      .flatMap(args =>
        args.filter(
          (arg): arg is {payload: unknown} =>
            typeof arg === 'object' && arg !== null && 'payload' in arg,
        ),
      );
    expect(logged.map(entry => entry.payload)).toEqual([{b: 2}]);
  });

  it('未解決参照を含むなら送らず、後続のアクションも実行せず、error ログも出さない', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「[未解決参照](#未解決参照の診断)を
    // 含む場合」「送信しません。手続きはそこで失敗として終わり、後続のアクション
    // （`data-{event}-toast` など）も実行しません」「未解決参照は
    // [未解決参照の診断](#未解決参照の診断)で知らせ、この `error` ログは出しません」
    await render(`
<button id="i1" type="button" data-click-fetch="/api/i" data-click-data='{"a":1}'
  data-click-payload-transform="({...payload, b: missingName})"
  data-click-toast="保存しました">送信</button>`);
    await click('i1');
    await waitForIdle();
    expect(fetch).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
    expect(
      (error.mock.calls as unknown[][]).some(args =>
        args.some(arg => String(arg).includes('payload-transform')),
      ),
    ).toBe(false);
  });

  it('評価できない式なら送らず、後続のアクションも実行しない', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「式が評価できない場合」
    await render(`
<button id="j1" type="button" data-click-fetch="/api/j" data-click-data='{"a":1}'
  data-click-payload-transform="payload.items.filter(r => r)"
  data-click-toast="保存しました">送信</button>`);
    await click('j1');
    await waitForIdle();
    expect(fetch).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it.each([
    ['null', 'null'],
    ['配列', '[payload]'],
    ['文字列', "'a'"],
  ])('戻り値が %s なら送らず、error ログを出す', async (_label, expression) => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「戻り値が配列ではないオブジェクトに
    // ならない場合（`null`・配列・文字列など）は、送信しません」「戻り値が
    // オブジェクトにならない場合は `error` ログを出します」
    await render(`
<button id="k1" type="button" data-click-fetch="/api/k" data-click-data='{"a":1}'
  data-click-payload-transform="${expression}"
  data-click-toast="保存しました">送信</button>`);
    await click('k1');
    await waitForIdle();
    expect(fetch).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
    expect(
      (error.mock.calls as unknown[][]).some(args =>
        args.some(arg => String(arg).includes('payload-transform')),
      ),
    ).toBe(true);
  });

  it('要素のスコープの名前は参照しない', async () => {
    // 仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「式から参照できるのは `payload` だけです
    // （要素のスコープは参照しません）」
    await render(`
<div data-bind='{"scoped":1}'>
  <button id="l1" type="button" data-click-fetch="/api/l" data-click-data='{"a":1}'
    data-click-payload-transform="({b: scoped})">送信</button>
</div>`);
    await click('l1');
    await waitForIdle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'application/x-www-form-urlencoded',
      (body: unknown) => (body as URLSearchParams).toString(),
      'b=2',
    ],
    [
      'multipart/form-data',
      (body: unknown) =>
        new URLSearchParams(
          Array.from((body as FormData).entries()) as [string, string][],
        ).toString(),
      'b=2',
    ],
  ])(
    '%s の本文も変換した後の送信データから作る',
    async (type, read, expected) => {
      // 仕様「`data-{event}-payload-transform`（非イベント:
      // `data-fetch-payload-transform`）」の「送信データを本文（JSON・
      // `application/x-www-form-urlencoded`・`multipart/form-data`）や GET の
      // クエリへ直す前です」
      await render(`
<button id="m1" type="button" data-click-fetch="/api/m" data-click-fetch-method="POST"
  data-click-fetch-content-type="${type}"
  data-click-data='{"a":1}' data-click-payload-transform="({b: payload.a + 1})">送信</button>`);
      await click('m1');
      const {body} = await lastRequest();
      expect(read(body)).toBe(expected);
    },
  );

  /**
   * file input にファイルを選んだ状態にします。
   *
   * @param input 対象の file input
   * @returns 戻り値はありません。
   */
  const selectFile = (input: Element): void => {
    const file = new File(['a'], 'a.csv', {type: 'text/csv'});
    // `files` は読み取り専用のため、FileList 相当のオブジェクトを差し込む。
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () =>
        ({
          0: file,
          length: 1,
          item: () => file,
          [Symbol.iterator]: function* () {
            yield file;
          },
        }) as unknown as FileList,
    });
  };

  /**
   * 出た警告のうち、文言を含むものがあるかを返します。
   *
   * @param text 警告の文言
   * @returns 含むものがあれば true
   */
  const warned = (text: string): boolean =>
    (warn.mock.calls as unknown[][]).some(args =>
      args.some(arg => String(arg).includes(text)),
    );

  it('変換で File を除いた送信には、File を送れない警告を出さない', async () => {
    // 仕様「`input[type=file]` の値収集」の「multipart 以外（JSON・
    // `application/x-www-form-urlencoded`・GET のクエリ）で File を含む送信を
    // 行おうとした場合も、`[object File]` や `{}` になって原因が分かりにくいため
    // **警告を出力**します」。送るのは仕様「`data-{event}-payload-transform`
    // （非イベント: `data-fetch-payload-transform`）」の「戻り値を送ります」
    await render(`
<form id="n-form"><input type="text" name="title" value="t"><input type="file" name="file"></form>
<button id="n1" type="button" data-click-fetch="/api/n" data-click-fetch-method="POST"
  data-click-form="#n-form" data-click-payload-transform="({title: payload.title})">送信</button>`);
    selectFile(document.querySelector('#n-form input[type="file"]')!);
    await click('n1');
    const {body} = await lastRequest();
    expect(JSON.parse(String(body))).toEqual({title: 't'});
    expect(warned('A File value cannot be sent')).toBe(false);
  });

  it('変換で入れ子の File を除いた multipart の送信には、入れ子の警告を出さない', async () => {
    // 仕様「`input[type=file]` の値収集」の「`data-form-object` /
    // `data-form-list` コンテナ配下の file input は、FormData 構築時に JSON
    // 文字列化され `{}` になるため送信できません。この構成を検出した場合は警告を
    // 出力します」。送るのは仕様「`data-{event}-payload-transform`（非イベント:
    // `data-fetch-payload-transform`）」の「戻り値を送ります」
    await render(`
<form id="o-form">
  <input type="file" name="top">
  <div data-form-object="detail"><input type="file" name="file"></div>
</form>
<button id="o1" type="button" data-click-fetch="/api/o" data-click-fetch-method="POST"
  data-click-fetch-content-type="multipart/form-data"
  data-click-form="#o-form" data-click-payload-transform="({top: payload.top})">送信</button>`);
    // 直下の File は残し、入れ子の File だけを変換で除く。
    document
      .querySelectorAll('#o-form input[type="file"]')
      .forEach(input => selectFile(input));
    await click('o1');
    await lastRequest();
    expect(warned('nested under')).toBe(false);
  });
});
