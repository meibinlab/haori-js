/* @vitest-environment jsdom */
/**
 * @fileoverview 登録した関数を `*-run` 系の宣言から呼ぶテスト
 *
 * 期待値の根拠は仕様「登録した関数（`Haori.handlers`）」です。CSP モードでも従来の
 * 方式でも同じに動くため、どちらの設定でも流します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
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

describe('登録した関数（Haori.handlers）', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    vi.restoreAllMocks();
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

  describe('登録', () => {
    it('登録した名前は has で true になる', () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「`Haori.handlers.has(名前)` で登録済みかを確かめられます」
      const name = uniqueName('registered');
      expect(Haori.handlers.has(name)).toBe(false);
      Haori.handlers.register(name, () => undefined);
      expect(Haori.handlers.has(name)).toBe(true);
    });

    it('同じ名前で登録し直すと置き換える', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「同じ名前で登録し直すと置き換えます」
      const name = uniqueName('replaced');
      const calls: string[] = [];
      Haori.handlers.register(name, () => calls.push('old'));
      Haori.handlers.register(name, () => calls.push('new'));
      await mount(
        `<button id="b" type="button" data-click-run-handler="${name}"></button>`,
      );
      await click('#b');
      expect(calls).toEqual(['new']);
    });

    it('名前が空か関数でなければ登録しない', () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「`Haori.handlers.register(名前, 関数)` で登録します」
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      const name = uniqueName('notFunction');
      Haori.handlers.register(' ', () => undefined);
      Haori.handlers.register(name, 1 as unknown as () => unknown);
      expect(Haori.handlers.has(' ')).toBe(false);
      expect(Haori.handlers.has('')).toBe(false);
      expect(Haori.handlers.has(name)).toBe(false);
      expect(error).toHaveBeenCalledTimes(2);
    });

    it('名前が文字列でなければ登録しない', () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「`Haori.handlers.register(名前, 関数)` で登録します」
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      expect(() =>
        Haori.handlers.register(1 as unknown as string, () => undefined),
      ).not.toThrow();
      expect(Haori.handlers.has('1')).toBe(false);
      expect(error).toHaveBeenCalledTimes(1);
    });
  });

  describe('data-{event}-run-handler', () => {
    it('this は宣言を書いた要素、引数は event の後ろに -args の値が並ぶ', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「**`this` は宣言を書いた要素です**」「従来の本文へ渡していた引数の後ろに、`-args` の値を並べます」
      const name = uniqueName('edit');
      const received: unknown[] = [];
      Haori.handlers.register(name, function (this: Element, ...args) {
        received.push(this, ...args);
      });
      await mount(`
        <div data-bind='{"ruleI": 2}'>
          <button id="b" type="button" data-click-run-handler="${name}"
            data-click-run-args="[ruleI, '#form']"></button>
        </div>`);
      await click('#b');
      expect(received[0]).toBe(container.querySelector('#b'));
      expect(received[1]).toBeInstanceOf(MouseEvent);
      expect(received.slice(2)).toEqual([2, '#form']);
    });

    it('-args は呼ぶたびに今のスコープで評価する', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「要素のスコープで呼ぶたびに評価します」
      const name = uniqueName('count');
      const received: unknown[] = [];
      Haori.handlers.register(name, (_event, value) => {
        received.push(value);
      });
      await mount(`
        <div id="scope" data-bind='{"n": 1}'>
          <button id="b" type="button" data-click-run-handler="${name}"
            data-click-run-args="[n]"></button>
        </div>`);
      await click('#b');
      await Core.setBindingData(container.querySelector('#scope')!, {n: 5});
      await waitForIdle();
      await click('#b');
      expect(received).toEqual([1, 5]);
    });

    it('-args が無ければ従来の引数だけを渡す', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「従来の本文へ渡していた引数の後ろに、`-args` の値を並べます」
      const name = uniqueName('plain');
      const lengths: number[] = [];
      Haori.handlers.register(name, (...args) => {
        lengths.push(args.length);
      });
      await mount(
        `<button id="b" type="button" data-click-run-handler="${name}"></button>`,
      );
      await click('#b');
      expect(lengths).toEqual([1]);
    });

    it('宣言より後に登録した関数も呼べる', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「宣言より後に登録した関数も呼べます」
      const name = uniqueName('late');
      const calls: string[] = [];
      await mount(
        `<button id="b" type="button" data-click-run-handler="${name}"></button>`,
      );
      Haori.handlers.register(name, () => calls.push('late'));
      await click('#b');
      expect(calls).toEqual(['late']);
    });

    it('登録していない名前は warn を出して呼ばない', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「登録していない名前は `warn` ログを出して呼びません」
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const name = uniqueName('missing');
      await mount(
        `<button id="b" type="button" data-click-run-handler="${name}"></button>`,
      );
      await click('#b');
      expect(
        warn.mock.calls.some(call =>
          call.some(part => String(part).includes(name)),
        ),
      ).toBe(true);
    });

    it.each([
      ['配列にならない', "'x'"],
      ['未解決参照を含む', '[missingKey]'],
    ])('-args が%s場合は warn を出して呼ばない', async (_label, args) => {
      // 仕様「登録した関数（`Haori.handlers`）」の「**配列にならない場合と未解決参照を含む場合は、`warn` ログを出して関数を呼びません。**」
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const name = uniqueName('badArgs');
      const calls: unknown[] = [];
      Haori.handlers.register(name, () => calls.push(1));
      await mount(`
        <button id="b" type="button" data-click-run-handler="${name}"
          data-click-run-args="${args}"></button>`);
      await click('#b');
      expect(calls).toEqual([]);
      expect(
        warn.mock.calls.some(call =>
          call.some(part => String(part).includes('data-click-run-args')),
        ),
      ).toBe(true);
    });

    it('false を返すと既定動作を抑止する', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「本文の戻り値と同じ扱いです（`false` での中断や既定動作の抑止」
      const name = uniqueName('prevent');
      Haori.handlers.register(name, () => false);
      await mount(
        `<a id="a" href="#moved" data-click-run-handler="${name}">link</a>`,
      );
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      container.querySelector('#a')!.dispatchEvent(event);
      await waitForIdle();
      expect(event.defaultPrevented).toBe(true);
    });

    it.each([
      ['開発モードで -handler だけを書いた', true, false],
      ['開発モードでないときに両方を書いた', false, true],
    ])('%s場合は warn を出さない', async (_label, dev, withBody) => {
      // 仕様「登録した関数（`Haori.handlers`）」の「本文は実行せず、開発モードでは `warn` ログを出します」
      vi.spyOn(Dev, 'isEnabled').mockReturnValue(dev);
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const name = uniqueName('quiet');
      Haori.handlers.register(name, () => undefined);
      const body = withBody ? ' data-click-run="1"' : '';
      await mount(
        `<button id="b" type="button" data-click-run-handler="${name}"${body}></button>`,
      );
      await click('#b');
      expect(warn).not.toHaveBeenCalled();
    });

    it('本文の属性と両方あれば -handler を使い、開発モードでは warn を出す', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「**本文の属性と両方書いた場合は `-handler` を使います。** 本文は実行せず、開発モードでは `warn` ログを出します」
      vi.spyOn(Dev, 'isEnabled').mockReturnValue(true);
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const name = uniqueName('both');
      const calls: string[] = [];
      Haori.handlers.register(name, () => calls.push('handler'));
      (globalThis as Record<string, unknown>).__bodyRan = false;
      await mount(`
        <button id="b" type="button" data-click-run-handler="${name}"
          data-click-run="globalThis.__bodyRan = true"></button>`);
      await click('#b');
      expect(calls).toEqual(['handler']);
      expect((globalThis as Record<string, unknown>).__bodyRan).toBe(false);
      expect(
        warn.mock.calls.some(call =>
          call.some(part => String(part).includes('data-click-run-handler')),
        ),
      ).toBe(true);
    });
  });

  describe('data-{event}-before-run-handler', () => {
    it('fetchUrl と fetchOptions を受け取り、返した fetchUrl で送る', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「`fetchUrl`, `fetchOptions`」「`fetchUrl` / `fetchOptions` / `response` の上書き」
      const name = uniqueName('before');
      const received: unknown[] = [];
      Haori.handlers.register(name, function (this: Element, ...args) {
        received.push(this, ...args);
        return {fetchUrl: 'https://example.com/override'};
      });
      const fragment = fragmentWith({
        'data-click-fetch': 'https://example.com/original',
        'data-click-before-run-handler': name,
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        );
      vi.stubGlobal('fetch', fetchMock);
      await new Procedure(fragment, 'click').run();
      expect(received[0]).toBe(fragment.getTarget());
      expect(received[1]).toBe('https://example.com/original');
      expect(received[2]).toEqual(expect.any(Object));
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        'https://example.com/override',
      );
      vi.unstubAllGlobals();
    });

    it('false を返すと以後の処理を止める', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「本文の戻り値と同じ扱いです（`false` での中断」
      const name = uniqueName('stop');
      Haori.handlers.register(name, () => false);
      const fragment = fragmentWith({
        'data-click-before-run-handler': name,
        'data-click-dialog': 'OK',
      });
      const dialog = vi.spyOn(Haori, 'dialog').mockResolvedValue();
      await new Procedure(fragment, 'click').run();
      expect(dialog).not.toHaveBeenCalled();
    });
  });

  describe('data-{event}-after-run-handler', () => {
    it('response を受け取り、false を返すと後続を止める', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「`response`」「`false` での中断」
      const name = uniqueName('after');
      const received: unknown[] = [];
      Haori.handlers.register(name, (...args) => {
        received.push(...args);
        return false;
      });
      const fragment = fragmentWith({
        'data-click-fetch': 'https://example.com/api',
        'data-click-after-run-handler': name,
        'data-click-dialog': 'OK',
      });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('{}', {headers: {'Content-Type': 'application/json'}}),
          ),
      );
      const dialog = vi.spyOn(Haori, 'dialog').mockResolvedValue();
      await new Procedure(fragment, 'click').run();
      expect(received).toHaveLength(1);
      expect(received[0]).toBeInstanceOf(Response);
      expect(dialog).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('data-each-rendered-run-handler', () => {
    it('this は data-each のコンテナで、引数は無い', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「`data-each-rendered-run-handler` では `data-each` のコンテナ」「なし」
      const name = uniqueName('rendered');
      const received: unknown[][] = [];
      Haori.handlers.register(name, function (this: Element, ...args) {
        received.push([this, ...args]);
      });
      await mount(`
        <div data-bind='{"items": [{"id": 1}, {"id": 2}]}'>
          <ul id="list" data-each="items" data-each-key="id" data-each-arg="row"
            data-each-rendered-run-handler="${name}">
            <li>{{row.id}}</li>
          </ul>
        </div>`);
      await Haori.waitForRenders();
      expect(received).toEqual([[container.querySelector('#list')]]);
    });
  });

  describe('関数が投げた例外', () => {
    it.each([
      ['data-click-run-handler', 'click'],
      ['data-each-rendered-run-handler', 'rendered'],
    ])(
      '%s の関数が投げた例外は error に出し、外へ投げない',
      async (attr, kind) => {
        // 仕様「登録した関数（`Haori.handlers`）」の「`data-{event}-run-handler` と `data-each-rendered-run-handler` では `error` ログに出し、外へは投げません」
        const error = vi
          .spyOn(Log, 'error')
          .mockImplementation(() => undefined);
        const name = uniqueName('throws');
        Haori.handlers.register(name, () => {
          throw new Error('boom');
        });
        if (kind === 'click') {
          await mount(
            `<button id="b" type="button" ${attr}="${name}"></button>`,
          );
          await click('#b');
        } else {
          await mount(`
          <div data-bind='{"items": [{"id": 1}]}'>
            <ul data-each="items" data-each-key="id" data-each-arg="row"
              ${attr}="${name}"><li>{{row.id}}</li></ul>
          </div>`);
          await Haori.waitForRenders();
        }
        expect(
          error.mock.calls.some(call =>
            call.some(part => String(part).includes('boom')),
          ),
        ).toBe(true);
      },
    );
  });

  describe('data-on-run-handler', () => {
    it('カスタムイベントで登録した関数を呼ぶ', async () => {
      // 仕様「登録した関数（`Haori.handlers`）」の「`data-intersect-*` と `data-on-*` でも同じく書けます」
      const name = uniqueName('onEvent');
      const received: unknown[] = [];
      Haori.handlers.register(name, event => {
        received.push((event as Event).type);
      });
      await mount(
        `<div data-on="app.refresh" data-on-run-handler="${name}"></div>`,
      );
      window.dispatchEvent(new CustomEvent('app.refresh'));
      await waitForIdle();
      expect(received).toEqual(['app.refresh']);
    });
  });
});
