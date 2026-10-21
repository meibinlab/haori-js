/* @vitest-environment jsdom */
/**
 * @fileoverview 値がコードになる属性の遮断のテスト。
 *
 * 1. URL 属性の `{{ }}` の評価結果が `javascript:` / `vbscript:` なら属性を削除する
 * 2. イベントハンドラ属性（`on*`、`data-attr-on*`）は `{{ }}` を評価しない
 *
 * 期待値の根拠は仕様「プレースホルダ解決規則」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import {AttributeContents} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('値がコードになる属性の遮断', () => {
  let container: HTMLElement;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    Dev.enable();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Dev.disable();
    vi.restoreAllMocks();
    container.remove();
  });

  /**
   * HTML を配置して初期スキャンを待ちます。
   *
   * @param html 配置する HTML
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  /** 指定した語を含む警告だけを抜き出します。 */
  const warningsWith = (word: string): string[] =>
    (warn.mock.calls as unknown[][])
      .map(args => args.map(arg => String(arg)).join(' '))
      .filter(message => message.includes(word));

  /** `data-bind` を 1 つ持つ要素の中に要素を置いた HTML を返します。 */
  const scoped = (bind: Record<string, unknown>, inner: string): string =>
    `<div data-bind='${JSON.stringify(bind)}'>${inner}</div>`;

  /**
   * 警告済みの「イベントハンドラ属性に書いた `{{`」の記録を取り出します。
   *
   * 私有の静的メンバーですが、本番で増えないことは外からの挙動では確かめられない
   * ため、テストからのみ直接参照します。
   *
   * @returns 警告済みの記録
   */
  const warnedHandlers = (): Set<string> =>
    (
      AttributeContents as unknown as {
        WARNED_EVENT_HANDLER_PLACEHOLDERS: Set<string>;
      }
    ).WARNED_EVENT_HANDLER_PLACEHOLDERS;

  describe('URL 属性', () => {
    // 仕様「プレースホルダ解決規則」の「式（`{{ }}`）を含む宣言で、評価した結果の
    // スキームが `javascript:` か `vbscript:` のときは属性を削除します。開発モードでは
    // 警告します」。
    it.each([
      ['href', '<a id="t" href="{{u}}">x</a>'],
      ['src', '<img id="t" data-attr-src="{{u}}">'],
      ['action', '<form id="t" action="{{u}}"></form>'],
      ['formaction', '<button id="t" formaction="{{u}}">x</button>'],
      ['xlink:href', '<a id="t" xlink:href="{{u}}">x</a>'],
      ['poster', '<video id="t" poster="{{u}}"></video>'],
      ['data', '<object id="t" data="{{u}}"></object>'],
      ['cite', '<blockquote id="t" cite="{{u}}"></blockquote>'],
      ['background', '<div id="t" background="{{u}}"></div>'],
    ])('%s の javascript: を削除する（回帰）', async (name, inner) => {
      await mount(scoped({u: 'javascript:alert(1)'}, inner));

      expect(container.querySelector('#t')!.hasAttribute(name)).toBe(false);
      expect(warningsWith('javascript:alert(1)').length).toBe(1);
    });

    it('data-attr-href の javascript: も削除する（回帰）', async () => {
      await mount(
        scoped(
          {u: 'javascript:alert(1)'},
          '<a id="t" data-attr-href="{{u}}">x</a>',
        ),
      );

      expect(container.querySelector('#t')!.hasAttribute('href')).toBe(false);
    });

    it('vbscript: も削除する（回帰）', async () => {
      await mount(
        scoped({u: 'vbscript:msgbox(1)'}, '<a id="t" href="{{u}}">x</a>'),
      );

      expect(container.querySelector('#t')!.hasAttribute('href')).toBe(false);
    });

    // 仕様「プレースホルダ解決規則」の「判定の前に、ブラウザが URL を読むときと同じく、
    // 先頭の空白・制御文字と途中のタブ・改行を除いて読みます。大文字と小文字は区別
    // しません」。
    it('先頭の空白・制御文字、途中のタブ・改行、大文字を混ぜても削除する（回帰）', async () => {
      await mount(
        scoped(
          {u: ' \u0001JaVa\tScR\nip\rT:alert(1)'},
          '<a id="t" href="{{u}}">x</a>',
        ),
      );

      expect(container.querySelector('#t')!.hasAttribute('href')).toBe(false);
    });

    it('文字列埋め込みで組み立てた javascript: も削除する（回帰）', async () => {
      await mount(
        scoped(
          {a: 'java', b: 'script:alert(1)'},
          '<a id="t" href="{{a}}{{b}}">x</a>',
        ),
      );

      expect(container.querySelector('#t')!.hasAttribute('href')).toBe(false);
    });

    it('開発モードでなくても削除する（回帰）', async () => {
      Dev.disable();
      await mount(
        scoped({u: 'javascript:alert(1)'}, '<a id="t" href="{{u}}">x</a>'),
      );

      expect(container.querySelector('#t')!.hasAttribute('href')).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    // 仕様「プレースホルダ解決規則」の「式を含まない宣言（`href="javascript:void(0)"`
    // など）は、開発者が書いたコードなのでそのまま残します」。
    it('式を含まない javascript: はそのまま残す', async () => {
      await mount(
        scoped(
          {u: 1},
          '<a id="t" href="javascript:void(0)" title="{{u}}">x</a>',
        ),
      );

      expect(container.querySelector('#t')!.getAttribute('href')).toBe(
        'javascript:void(0)',
      );
    });

    // 仕様「プレースホルダ解決規則」の「`data:` と `blob:` は削除しません」。
    it.each([
      ['data:', 'data:image/png;base64,iVBORw0KGgo='],
      ['blob:', 'blob:http://localhost/0b6e0c3a'],
      ['https:', 'https://example.com/a'],
      ['相対 URL', '/items/1'],
    ])('%s は削除しない', async (_label, u) => {
      await mount(scoped({u}, '<img id="t" data-attr-src="{{u}}">'));

      expect(container.querySelector('#t')!.getAttribute('src')).toBe(u);
    });

    it('URL 属性ではない属性の javascript: は削除しない', async () => {
      await mount(
        scoped({u: 'javascript:alert(1)'}, '<p id="t" title="{{u}}"></p>'),
      );

      expect(container.querySelector('#t')!.getAttribute('title')).toBe(
        'javascript:alert(1)',
      );
    });
  });

  describe('イベントハンドラ属性', () => {
    // 仕様「プレースホルダ解決規則」の「`data-bind` と、イベントハンドラ属性（名前が
    // `on` で始まる属性。`onclick`、`onchange` など。`data-attr-on*` を含む）は、
    // `{{ }}` を評価せず、書いたとおりの文字のまま扱います」。
    it('onclick の {{ }} を評価しない（回帰）', async () => {
      await mount(
        scoped({c: 'alert(1)'}, '<button id="t" onclick="{{c}}">x</button>'),
      );

      expect(container.querySelector('#t')!.getAttribute('onclick')).toBe(
        '{{c}}',
      );
    });

    it('文字列埋め込みも評価しない（回帰）', async () => {
      await mount(
        scoped(
          {name: "'); alert(1); ('"},
          `<button id="t" onchange="show('{{name}}')">x</button>`,
        ),
      );

      expect(container.querySelector('#t')!.getAttribute('onchange')).toBe(
        "show('{{name}}')",
      );
    });

    // 仕様「プレースホルダ解決規則」の「`data-attr-onclick="..."` は、書いた文字を
    // そのまま `onclick` へ写します」。
    it('data-attr-onclick は評価せず書いた文字を onclick へ写す（回帰）', async () => {
      await mount(
        scoped(
          {c: 'alert(1)'},
          '<button id="t" data-attr-onclick="{{c}}">x</button>',
        ),
      );

      expect(container.querySelector('#t')!.getAttribute('onclick')).toBe(
        '{{c}}',
      );
    });

    it('data-attr-onclick の式を含まない値はそのまま写す', async () => {
      await mount(
        scoped(
          {c: 1},
          '<button id="t" data-attr-onclick="doIt()" title="{{c}}">x</button>',
        ),
      );

      expect(container.querySelector('#t')!.getAttribute('onclick')).toBe(
        'doIt()',
      );
      expect(warningsWith('event handler')).toEqual([]);
    });

    // 仕様「プレースホルダ解決規則」の「開発モードでは、イベントハンドラ属性に `{{` を
    // 書いた宣言を、属性と値の組ごとに一度だけ警告します」。
    it('{{ を書いた宣言を属性と値の組ごとに一度だけ警告する', async () => {
      await mount(
        scoped(
          {c: 'a'},
          '<button onclick="{{probeOnce}}">x</button>' +
            '<button onclick="{{probeOnce}}">y</button>' +
            '<button data-attr-onclick="{{probeAlias}}">z</button>',
        ),
      );
      const bound = container.firstElementChild as HTMLElement;
      await Core.setBindingData(bound, {c: 'b'});
      await waitForDomSettled();

      expect(warningsWith('{{probeOnce}}').length).toBe(1);
      expect(warningsWith('{{probeAlias}}').length).toBe(1);
    });

    it('開発モードでなければ警告しない', async () => {
      Dev.disable();
      const before = warnedHandlers().size;
      await mount(
        scoped({c: 'a'}, '<button onclick="{{probeProduction}}">x</button>'),
      );

      expect(warn).not.toHaveBeenCalled();
      // 警告済みの記録も本番では増やさない（宣言の種類だけ増え続けることを避ける）。
      expect(warnedHandlers().size).toBe(before);
    });
  });
});
