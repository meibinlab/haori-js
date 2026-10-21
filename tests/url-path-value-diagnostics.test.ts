/* @vitest-environment jsdom */
/**
 * @fileoverview URL のパスに埋め込んだ値の診断（開発モード）のテスト。
 *
 * `data-fetch`・`data-{event}-fetch`・`data-import` の URL に埋め込んだ値は URL
 * エンコードしないため、値が `/` や `..` を含むと送り先が別のパスへ変わります。
 * 開発モードでそれを警告することを確かめます。
 *
 * 期待値の根拠は仕様「9. URL に埋め込む値」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import {AttributeContents} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('URL のパスに埋め込んだ値の診断', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    Dev.enable();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ),
    );
  });

  afterEach(() => {
    dispatcher.stop();
    Dev.disable();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    container.remove();
  });

  /**
   * 値を 1 つバインドした要素の中に HTML を置き、初期スキャンを待ちます。
   *
   * @param bind バインドする値
   * @param inner 中に置く HTML
   */
  const mount = async (
    bind: Record<string, unknown>,
    inner: string,
  ): Promise<void> => {
    container.innerHTML = `<div data-bind='${JSON.stringify(bind)}'>${inner}</div>`;
    await Core.scan(container);
    await waitForDomSettled();
  };

  /** この診断の警告だけを抜き出します。 */
  const pathWarnings = (): string[] =>
    (warn.mock.calls as unknown[][])
      .map(args => args.map(arg => String(arg)).join(' '))
      .filter(message => message.includes('URL path'));

  /**
   * 警告済みの「URL のパスに埋め込んだ値」の記録を取り出します。
   *
   * 私有の静的メンバーですが、本番で増えないことは外からの挙動では確かめられない
   * ため、テストからのみ直接参照します。
   *
   * @returns 警告済みの記録
   */
  const warnedPaths = (): Set<string> =>
    (AttributeContents as unknown as {WARNED_URL_PATH_VALUES: Set<string>})
      .WARNED_URL_PATH_VALUES;

  // 仕様「9. URL に埋め込む値」の「式の中で `encodeURIComponent` を通してください」と
  // 「`/`・`?`・`#` はエンコードされて、パスの 1 区切りの中に収まります」。
  it('式の中で encodeURIComponent を通した値は警告しない', async () => {
    await mount(
      {id: 'a/b?c#d'},
      '<div data-fetch="/api/users/{{encodeURIComponent(id)}}/profile"></div>',
    );

    expect(pathWarnings()).toEqual([]);
  });

  // 仕様「9. URL に埋め込む値」の「値が `/`・`\`・`?`・`#` のどれかを含む。または値
  // そのものが `.` か `..` である（`%2e` で書いたものを含む）」。
  it.each([
    ['../admin'],
    ['a/b'],
    ['a\\b'],
    ['a?x=1'],
    ['a#x'],
    ['..'],
    ['.'],
    ['%2e%2E'],
    ['.%2e'],
    ['%2E'],
  ])('パスに埋め込んだ値 %s を警告する', async id => {
    await mount({id}, '<div data-fetch="/api/users/{{id}}/profile"></div>');

    const messages = pathWarnings();
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('/api/users/{{id}}/profile');
    expect(messages[0]).toContain(id);
  });

  it.each([['123'], ['a..b'], ['%2e%2e%2e'], ['a.b']])(
    '値 %s は警告しない',
    async id => {
      await mount({id}, '<div data-fetch="/api/users/{{id}}/profile"></div>');

      expect(pathWarnings()).toEqual([]);
    },
  );

  // 仕様「9. URL に埋め込む値」の「値の前に、書いた文字がある（URL の先頭に置いた
  // `{{url}}` や `{{base}}/items` は、URL そのものを渡す書き方なので対象外）」。
  it('URL の先頭に置いた値は警告しない', async () => {
    await mount(
      {url: '/api/a/../b', base: '/api/v1'},
      '<div data-fetch="{{url}}"></div><div data-fetch="{{base}}/items"></div>',
    );

    expect(pathWarnings()).toEqual([]);
  });

  it('先頭の値の後ろのパスに埋め込んだ値は警告する', async () => {
    await mount(
      {base: '/api/v1', id: 'a/b'},
      '<div data-fetch="{{base}}/items/{{id}}"></div>',
    );

    expect(pathWarnings().length).toBe(1);
    expect(pathWarnings()[0]).toContain('a/b');
  });

  // 仕様「9. URL に埋め込む値」の「値より前（書いた文字と、先に埋め込んだ値）に `?` も
  // `#` も無い」。
  it('クエリの部分に埋め込んだ値は警告しない', async () => {
    await mount(
      {q: 'a/b', h: 'c/d'},
      '<div data-fetch="/api/search?q={{q}}"></div>' +
        '<div data-fetch="/api/page#{{h}}"></div>',
    );

    expect(pathWarnings()).toEqual([]);
  });

  it('先に埋め込んだ値が ? を含めば、後の値は警告しない', async () => {
    await mount(
      {a: 'x?y', b: 'c/d'},
      '<div data-fetch="/api/{{a}}{{b}}"></div>',
    );

    const messages = pathWarnings();
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('x?y');
    expect(messages[0]).not.toContain('c/d');
  });

  it('data-{event}-fetch も警告する', async () => {
    await mount(
      {id: '../admin'},
      '<button data-click-fetch="/api/users/{{id}}">x</button>',
    );
    container
      .querySelector('button')!
      .dispatchEvent(new Event('click', {bubbles: true}));
    await waitForDomSettled();

    expect(pathWarnings().length).toBe(1);
  });

  it('data-import も警告する', async () => {
    await mount(
      {page: '../upload/x'},
      '<div data-import="/parts/{{page}}.html"></div>',
    );

    expect(pathWarnings().length).toBe(1);
  });

  it('URL を持つ属性ではない属性は警告しない', async () => {
    await mount(
      {id: '../admin'},
      '<a href="/users/{{id}}">x</a><div data-fetch-data="/users/{{id}}"></div>',
    );

    expect(pathWarnings()).toEqual([]);
  });

  it('接頭辞の無い属性は警告しない', async () => {
    await mount({id: '../admin'}, '<div my-fetch="/api/users/{{id}}"></div>');

    expect(pathWarnings()).toEqual([]);
  });

  // 仕様「9. URL に埋め込む値」の「属性・式・値の組ごとに一度だけ警告します」。
  it('同じ属性・式・値は一度だけ警告する', async () => {
    await mount(
      {id: 'once/value'},
      '<div data-fetch="/api/once/{{id}}"></div>' +
        '<div data-fetch="/api/once/{{id}}"></div>',
    );
    const bound = container.firstElementChild as HTMLElement;
    await Core.setBindingData(bound, {id: 'once/value', other: 1});
    await waitForDomSettled();

    expect(pathWarnings().length).toBe(1);
  });

  it('開発モードでなければ警告しない', async () => {
    Dev.disable();
    const before = warnedPaths().size;
    await mount({id: '../admin'}, '<div data-fetch="/api/users/{{id}}"></div>');

    expect(pathWarnings()).toEqual([]);
    // 警告済みの記録も本番では増やさない（値の種類だけ増え続けることを避ける）。
    expect(warnedPaths().size).toBe(before);
  });
});
