/* @vitest-environment jsdom */
/**
 * @fileoverview CSP モードで `*-run` 系の本文を式として評価するテスト
 *
 * 期待値の根拠は仕様「CSP モードでの `*-run`」です。テストの中で CSP モードを
 * 有効にするため、どちらの設定でも流します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import Haori from '../src/haori';
import Log from '../src/log';
import Procedure from '../src/procedure';
import {waitForDomSettled, waitForIdle} from './helpers/async';

/** テストごとに違う名前を作るための通し番号 */
let serial = 0;

/**
 * テストごとに違う関数名を返します（登録は取り消せないため）。
 *
 * @param base 名前の元
 * @returns 名前
 */
function uniqueName(base: string): string {
  serial += 1;
  return `${base}${serial}`;
}

describe('CSP モードでの *-run', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let previousCsp: boolean;

  beforeEach(() => {
    previousCsp = Env.csp;
    Env.setCsp(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    Env.setCsp(previousCsp);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * HTML をマウントして走査し、イベントの購読を始めます。
   *
   * @param html マウントする HTML
   * @returns 待ち合わせの Promise
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();
  };

  /**
   * 要素をクリックし、手続きが落ち着くまで待ちます。
   *
   * @param selector 要素のセレクタ
   * @returns 待ち合わせの Promise
   */
  const click = async (selector: string): Promise<void> => {
    (container.querySelector(selector) as HTMLElement).click();
    await waitForIdle();
  };

  /**
   * 属性を付けたボタンのフラグメントを作ります（手続きを直接動かすため）。
   *
   * @param attrs 属性
   * @returns フラグメント
   */
  const fragmentWith = (attrs: Record<string, string>): ElementFragment => {
    const element = document.createElement('button');
    for (const [name, value] of Object.entries(attrs)) {
      element.setAttribute(name, value);
    }
    container.appendChild(element);
    return Fragment.get(element) as ElementFragment;
  };

  /**
   * warn ログのうち、文字列を含むものがあるかを返します。
   *
   * @param warn warn ログのスパイ
   * @param text 探す文字列
   * @returns あれば true
   */
  const warned = (warn: ReturnType<typeof vi.spyOn>, text: string): boolean =>
    warn.mock.calls.some(call =>
      call.some((part: unknown) => String(part).includes(text)),
    );

  describe('式として評価する', () => {
    it('登録した関数を、要素のスコープの値を引数にして呼べる', async () => {
      // 仕様「CSP モードでの `*-run`」の「本文が 1 つの式として書ける場合は、haori の式として評価します」「要素のスコープ、登録した関数です」
      const name = uniqueName('save');
      const received: unknown[] = [];
      Haori.handlers.register(name, (...args) => {
        received.push(...args);
      });
      await mount(`
        <div data-bind='{"row": {"id": 7}}'>
          <button id="b" type="button" data-click-run="${name}(row.id, 'x')"></button>
        </div>`);
      await click('#b');
      expect(received).toEqual([7, 'x']);
    });

    it('従来の本文の引数 event を参照でき、同じ名前のスコープのキーより先に使う', async () => {
      // 仕様「CSP モードでの `*-run`」の「従来の本文の引数（`event` / …）」「同じ名前があれば、この順に先のものを使います」
      const name = uniqueName('record');
      const received: unknown[] = [];
      Haori.handlers.register(name, value => {
        received.push(value);
      });
      await mount(`
        <div data-bind='{"event": "scope"}'>
          <button id="b" type="button" data-click-run="${name}(event.type)"></button>
        </div>`);
      await click('#b');
      expect(received).toEqual(['click']);
    });

    it('スコープのキーに隠れた登録した関数は使わず、開発モードで warn を出す', async () => {
      // 仕様「CSP モードでの `*-run`」の「同じ名前があれば、この順に先のものを使います。登録した関数がスコープのキーに隠れる場合は、開発モードで `warn` ログを出します」
      vi.spyOn(Dev, 'isEnabled').mockReturnValue(true);
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const record = uniqueName('record');
      const shadowed = uniqueName('shadowed');
      const received: unknown[] = [];
      Haori.handlers.register(record, value => {
        received.push(value);
      });
      Haori.handlers.register(shadowed, () => 'handler');
      await mount(`
        <div data-bind='{"${shadowed}": "scope"}'>
          <button id="b" type="button" data-click-run="${record}(${shadowed})"></button>
        </div>`);
      await click('#b');
      expect(received).toEqual(['scope']);
      expect(warned(warn, shadowed)).toBe(true);
    });

    it.each([
      ['開発モードでない', false, true],
      ['登録した関数と同じ名前のキーが無い', true, false],
    ])('%s場合は warn を出さない', async (_label, dev, collide) => {
      // 仕様「CSP モードでの `*-run`」の「登録した関数がスコープのキーに隠れる場合は、開発モードで `warn` ログを出します」
      vi.spyOn(Dev, 'isEnabled').mockReturnValue(dev);
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const record = uniqueName('record');
      const other = uniqueName('other');
      Haori.handlers.register(record, () => undefined);
      Haori.handlers.register(other, () => undefined);
      const key = collide ? other : uniqueName('plainKey');
      await mount(`
        <div data-bind='{"${key}": 1}'>
          <button id="b" type="button" data-click-run="${record}(${key})"></button>
        </div>`);
      await click('#b');
      expect(warn).not.toHaveBeenCalled();
    });

    it('式の値が false なら既定動作を抑止する', async () => {
      // 仕様「CSP モードでの `*-run`」の「**戻り値**は従来の本文と同じ扱いです」
      const name = uniqueName('deny');
      Haori.handlers.register(name, () => false);
      await mount(
        `<a id="a" href="#moved" data-click-run="${name}()">link</a>`,
      );
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      container.querySelector('#a')!.dispatchEvent(event);
      await waitForIdle();
      expect(event.defaultPrevented).toBe(true);
    });

    it('式の値の Promise は完了まで待つ（その間はボタンを無効にする）', async () => {
      // 仕様「CSP モードでの `*-run`」の「`data-click-run="save(row)"` の Promise は完了まで待ちます」
      const name = uniqueName('pending');
      let finish: () => void = () => undefined;
      Haori.handlers.register(
        name,
        () =>
          new Promise<void>(resolve => {
            finish = resolve;
          }),
      );
      await mount(
        `<button id="b" type="button" data-click-run="${name}()"></button>`,
      );
      const button = container.querySelector('#b') as HTMLButtonElement;
      button.click();
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(button.disabled).toBe(true);
      finish();
      await waitForIdle();
      expect(button.disabled).toBe(false);
    });

    it('before-run は fetchUrl と fetchOptions を参照でき、返した fetchUrl で送る', async () => {
      // 仕様「CSP モードでの `*-run`」の「従来の本文の引数（`event` / `fetchUrl` / `fetchOptions` / `response`）」「**戻り値**は従来の本文と同じ扱いです」
      const name = uniqueName('override');
      const received: unknown[] = [];
      Haori.handlers.register(name, (url, options) => {
        received.push(url, options);
        return {fetchUrl: 'https://example.com/override'};
      });
      const fragment = fragmentWith({
        'data-click-fetch': 'https://example.com/original',
        'data-click-before-run': `${name}(fetchUrl, fetchOptions)`,
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        );
      vi.stubGlobal('fetch', fetchMock);
      await new Procedure(fragment, 'click').run();
      expect(received[0]).toBe('https://example.com/original');
      expect(received[1]).toEqual(expect.any(Object));
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        'https://example.com/override',
      );
    });

    it('after-run は response を参照できる', async () => {
      // 仕様「CSP モードでの `*-run`」の「従来の本文の引数（`event` / `fetchUrl` / `fetchOptions` / `response`）」
      const name = uniqueName('inspect');
      const received: unknown[] = [];
      Haori.handlers.register(name, response => {
        received.push(response);
      });
      const fragment = fragmentWith({
        'data-click-fetch': 'https://example.com/api',
        'data-click-after-run': `${name}(response)`,
      });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('{}', {headers: {'Content-Type': 'application/json'}}),
          ),
      );
      await new Procedure(fragment, 'click').run();
      expect(received).toHaveLength(1);
      expect(received[0]).toBeInstanceOf(Response);
    });

    it('data-each-rendered-run も式として評価する', async () => {
      // 仕様「CSP モードでの `*-run`」の「本文が 1 つの式として書ける場合は、haori の式として評価します」
      const name = uniqueName('rendered');
      const received: unknown[] = [];
      Haori.handlers.register(name, count => {
        received.push(count);
      });
      await mount(`
        <div data-bind='{"items": [{"id": 1}, {"id": 2}]}'>
          <ul data-each="items" data-each-key="id" data-each-arg="row"
            data-each-rendered-run="${name}(items.length)">
            <li>{{row.id}}</li>
          </ul>
        </div>`);
      await Haori.waitForRenders();
      expect(received).toEqual([2]);
    });
  });

  describe('評価しない本文', () => {
    it.each([
      ['return を書いた本文', 'return false'],
      ['複数の文', 'first(); second()'],
      ['if 文', 'if (ok) first()'],
      ['this を使う本文', 'first(this)'],
    ])('%s は評価せず warn を出す', async (_label, body) => {
      // 仕様「CSP モードでの `*-run`」の「1 つの式として読めない本文（`return false`、`;` で区切った複数の文、`if` 文など）」「**`this` は使えません**」
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const calls: string[] = [];
      Haori.handlers.register('first', () => calls.push('first'));
      Haori.handlers.register('second', () => calls.push('second'));
      await mount(`
        <div data-bind='{"ok": true}'>
          <button id="b" type="button" data-click-run="${body}"></button>
        </div>`);
      await click('#b');
      expect(calls).toEqual([]);
      expect(warned(warn, 'data-click-run-handler')).toBe(true);
    });

    it('{{...}} を含む本文は評価せず warn を出す', async () => {
      // 仕様「CSP モードでの `*-run`」の「`{{...}}` を含む本文。値をコードへ埋め込む書き方は、CSP モードでは使えません」
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const name = uniqueName('embedded');
      const calls: unknown[] = [];
      Haori.handlers.register(name, value => calls.push(value));
      await mount(`
        <div data-bind='{"ruleI": 2}'>
          <button id="b" type="button" data-click-run="${name}({{ruleI}})"></button>
        </div>`);
      await click('#b');
      expect(calls).toEqual([]);
      expect(warned(warn, '{{...}}')).toBe(true);
    });
  });
});
