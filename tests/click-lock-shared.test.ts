/* @vitest-environment jsdom */
/**
 * @fileoverview `data-click-lock` で、別々の要素が click 手続きのロックを共有する
 * ことの検証。
 *
 * 期待値の根拠は仕様「`data-click-lock`」。応答を止めたまま次の要素を押すため、
 * fetch は解決関数を控えるモックにする（遅い応答を模したもの）。従来の方式と CSP
 * モードの両方で流す（`data-click-run` は登録した関数とグローバルの両方に置く）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Haori from '../src/haori';
import {Observer} from '../src/observer';
import {waitForCondition, waitForIdle} from './helpers/async';

/** テストごとに違う関数名を作るための通し番号（登録は取り消せないため） */
let serial = 0;

describe('data-click-lock', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  /** 応答を止めている取得（要求順） */
  let pending: {url: string; resolve: (response: Response) => void}[];
  /** 要求された URL（要求順） */
  let requested: string[];

  beforeEach(() => {
    Observer.getDispatcher()?.stop();
    container = document.createElement('div');
    pending = [];
    requested = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) =>
        new Promise<Response>(resolve => {
          const url = String(input);
          requested.push(url);
          pending.push({url, resolve});
        }) as unknown as Promise<Response>,
    );
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(async () => {
    pending.forEach(entry => entry.resolve(jsonResponse({})));
    await waitForIdle();
    dispatcher.stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    container.remove();
  });

  /**
   * JSON の応答を作ります。
   *
   * @param body 応答の本文
   * @returns 応答
   */
  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      headers: {'Content-Type': 'application/json'},
    });
  }

  /**
   * HTML を組み立ててから走査し、描画の完了まで待ちます。
   *
   * @param html container に設定する HTML
   * @returns 待機完了の Promise
   */
  async function mount(html: string): Promise<void> {
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
    await waitForIdle();
  }

  /**
   * id で要素を取ります。
   *
   * @param id 要素の id
   * @returns 要素
   */
  function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
  }

  /**
   * 指定した URL の取得へ応答を返し、反映の完了まで待ちます。
   *
   * @param url 取得の URL
   * @param body 応答の本文
   * @returns 待機完了の Promise
   */
  async function respond(url: string, body: unknown): Promise<void> {
    const index = pending.findIndex(entry => entry.url.endsWith(url));
    expect(index).toBeGreaterThanOrEqual(0);
    const [entry] = pending.splice(index, 1);
    entry.resolve(jsonResponse(body));
    await waitForIdle();
  }

  /**
   * `data-click-run` から呼べる関数を、登録した関数とグローバルの両方に置きます。
   *
   * @param body 関数の本体
   * @returns 置いた関数の名前
   */
  function defineRun(body: () => unknown): string {
    serial += 1;
    const name = `lockRun${serial}`;
    Haori.handlers.register(name, body);
    vi.stubGlobal(name, body);
    return name;
  }

  it('同じ名前の要素の手続きが応答を待つ間は、もう一方を押しても実行しない', async () => {
    // 仕様「`data-click-lock`」の「同じ名前のどれかの手続きが実行中の間は、同じ
    // 名前のほかの要素を押しても手続きを実行しません」
    await mount(`
      <button id="a" data-click-fetch="/a" data-click-lock="punch">A</button>
      <button id="b" data-click-fetch="/b" data-click-lock="punch"
        data-click-no-disabled>B</button>`);
    byId('a').click();
    byId('b').click();
    await waitForIdle();
    expect(requested).toEqual(['/a']);
  });

  it('data-click-run が返す Promise を待つ間も、同じ名前の要素を実行しない', async () => {
    // 仕様「`data-click-lock`」の「`data-click-run` が返す Promise を待つ間も
    // 含みます」
    let finish = (): void => {};
    const first = defineRun(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const second = vi.fn();
    const secondName = defineRun(second);
    await mount(`
      <button id="a" data-click-run="${first}()" data-click-lock="punch">A</button>
      <button id="b" data-click-run="${secondName}()" data-click-lock="punch"
        data-click-no-disabled>B</button>`);
    byId('a').click();
    await waitForIdle();
    byId('b').click();
    await waitForIdle();
    expect(second).not.toHaveBeenCalled();
    finish();
    await waitForIdle();
  });

  it('先の手続きが終わると、同じ名前の要素をまた実行できる', async () => {
    // 仕様「`data-click-lock`」の「実行中」の範囲は「起点要素のロックと同じです」
    // （仕様「`data-click-no-disabled`」の「「実行中」は手続きが終わるまでです」）
    await mount(`
      <button id="a" data-click-fetch="/a" data-click-lock="punch">A</button>
      <button id="b" data-click-fetch="/b" data-click-lock="punch">B</button>`);
    byId('a').click();
    await waitForCondition(() => requested.length === 1, {
      description: '先の取得の要求',
    });
    await respond('/a', {});
    byId('b').click();
    await waitForIdle();
    expect(requested).toEqual(['/a', '/b']);
  });

  it('ロックの間は同じ名前の要素に disabled を付け、終わると各宣言の評価結果へ揃える', async () => {
    // 仕様「`data-click-lock`」の「ロックを持つ間、同じ名前のすべての要素に
    // `disabled` を付けます」「エンジンが付けた `disabled` は、起点要素と同じく各要素
    // の宣言の評価結果へ揃えます」
    await mount(`
      <div id="state" data-bind='{"status":"勤務中"}'>
        <button id="a" data-click-fetch="/a" data-click-bind="#state"
          data-click-lock="punch"
          data-attr-disabled="{{status !== '勤務中'}}">休憩開始</button>
        <button id="c" data-click-fetch="/c" data-click-lock="punch"
          data-attr-disabled="{{status === '退勤済み'}}">打刻の訂正</button>
        <button id="d" data-click-fetch="/d" data-click-lock="punch">履歴</button>
      </div>`);
    byId('a').click();
    await waitForCondition(() => requested.length === 1, {
      description: '取得の要求',
    });
    expect(
      ['a', 'c', 'd'].map(id => byId(id).hasAttribute('disabled')),
    ).toEqual([true, true, true]);
    await respond('/a', {status: '休憩中'});
    await waitForCondition(() => !byId('c').hasAttribute('disabled'), {
      description: 'ロックの解除',
    });
    expect(
      ['a', 'c', 'd'].map(id => byId(id).hasAttribute('disabled')),
    ).toEqual([true, false, false]);
  });

  it('ロックを取った時点ですでに disabled の要素は、終わっても disabled のまま', async () => {
    // 仕様「`data-click-lock`」の「ロックを取った時点ですでに `disabled` の要素
    // （…静的な `disabled` を持つ要素）。手続きが終わっても、エンジンはこの要素の
    // `disabled` に触りません」
    await mount(`
      <button id="a" data-click-fetch="/a" data-click-lock="punch">A</button>
      <button id="b" data-click-fetch="/b" data-click-lock="punch"
        disabled>B</button>`);
    byId('a').click();
    await waitForCondition(() => requested.length === 1, {
      description: '取得の要求',
    });
    await respond('/a', {});
    expect(byId('a').hasAttribute('disabled')).toBe(false);
    expect(byId('b').hasAttribute('disabled')).toBe(true);
  });

  it('data-click-no-disabled を付けた要素には disabled を付けないが、押しても実行しない', async () => {
    // 仕様「`data-click-lock`」の「`data-click-no-disabled` を付けた要素」には
    // `disabled` を付けず、「同じ名前のほかの要素を押しても手続きを実行しません」
    await mount(`
      <button id="a" data-click-fetch="/a" data-click-lock="punch">A</button>
      <button id="b" data-click-fetch="/b" data-click-lock="punch"
        data-click-no-disabled>B</button>`);
    byId('a').click();
    await waitForCondition(() => requested.length === 1, {
      description: '取得の要求',
    });
    expect(byId('b').hasAttribute('disabled')).toBe(false);
    byId('b').click();
    await waitForIdle();
    expect(requested).toEqual(['/a']);
  });

  it('ロックの間に増えた同じ名前の要素は、disabled は付かないが押しても実行しない', async () => {
    // 仕様「`data-click-lock`」の「ロックの間に増えた要素…`disabled` は付きません
    // が、押しても手続きを実行しません」
    await mount(`
      <div id="area">
        <button id="a" data-click-fetch="/a" data-click-lock="punch">A</button>
      </div>`);
    byId('a').click();
    await waitForCondition(() => requested.length === 1, {
      description: '取得の要求',
    });
    const added = document.createElement('button');
    added.id = 'e';
    added.setAttribute('data-click-fetch', '/e');
    added.setAttribute('data-click-lock', 'punch');
    byId('area').appendChild(added);
    await Core.scan(added);
    await waitForIdle();
    expect(added.hasAttribute('disabled')).toBe(false);
    added.click();
    await waitForIdle();
    expect(requested).toEqual(['/a']);
  });

  it('名前の違う要素と名前の無い要素は、互いにロックしない', async () => {
    // 仕様「`data-click-lock`」の「名前を付けない要素は、起点要素だけのロックの
    // まま変わりません。名前の違う要素どうしは、互いにロックしません」
    await mount(`
      <button id="a" data-click-fetch="/a" data-click-lock="punch">A</button>
      <button id="b" data-click-fetch="/b" data-click-lock="other">B</button>
      <button id="n" data-click-fetch="/n">N</button>`);
    byId('a').click();
    await waitForCondition(() => requested.length === 1, {
      description: '取得の要求',
    });
    expect(byId('b').hasAttribute('disabled')).toBe(false);
    expect(byId('n').hasAttribute('disabled')).toBe(false);
    byId('b').click();
    byId('n').click();
    await waitForIdle();
    expect(requested).toEqual(['/a', '/b', '/n']);
  });

  it('値に書いた式は、その評価結果を名前として共有する', async () => {
    // 仕様「`data-click-lock`」の「値にはほかの属性と同じく `{{式}}` を書け、
    // その評価結果が名前です」
    await mount(`
      <div data-bind='{"n":1}'>
        <button id="a" data-click-fetch="/a" data-click-lock="p{{n}}">A</button>
        <button id="b" data-click-fetch="/b" data-click-lock="p1"
          data-click-no-disabled>B</button>
        <button id="c" data-click-fetch="/c" data-click-lock="p{{n + 1}}">C</button>
      </div>`);
    byId('a').click();
    byId('b').click();
    byId('c').click();
    await waitForIdle();
    expect(requested).toEqual(['/a', '/c']);
  });

  it('値が空の要素どうしは、名前が無いものとして互いにロックしない', async () => {
    // 仕様「`data-click-lock`」の「値が空の場合は名前が無いものとして扱います」
    await mount(`
      <button id="a" data-click-fetch="/a" data-click-lock="">A</button>
      <button id="b" data-click-fetch="/b" data-click-lock="">B</button>`);
    byId('a').click();
    byId('b').click();
    await waitForIdle();
    expect(requested).toEqual(['/a', '/b']);
  });

  it('data-click-click で同じ名前の要素を押すと、完了待ちは失敗として後続を止める', async () => {
    // 仕様「`data-click-lock`」の「押された要素はロックの間なので、手続きを実行
    // しません」と、仕様「`data-{event}-click-await`」の「対象がすでに実行中…の
    // 場合は失敗として扱い、後続を止めます」
    await mount(`
      <button id="a" data-click-click="#m, #z" data-click-click-await
        data-click-lock="punch">A</button>
      <span id="m" data-click-fetch="/m" data-click-lock="punch"
        data-click-no-disabled></span>
      <span id="z" data-click-fetch="/z"></span>`);
    byId('a').click();
    await waitForIdle();
    expect(requested).toEqual([]);
  });

  it('この属性だけを持つ要素の内側を押すと、外側の手続きが起動する', async () => {
    // 仕様「`data-click-lock`」の「この属性しか持たない要素の内側を押すと、外側の
    // `data-click-*` の手続きが起動します」
    await mount(`
      <div data-click-fetch="/outer">
        <span id="s" data-click-lock="punch">押す</span>
      </div>`);
    byId('s').click();
    await waitForIdle();
    expect(requested).toEqual(['/outer']);
  });
});
