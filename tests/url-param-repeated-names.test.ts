/* @vitest-environment jsdom */
/**
 * @fileoverview 同じ名前の URL パラメータが複数ある場合の `data-url-param` を検証します。
 *
 * 取り込みが同じ名前を上書きしていたため、最後の 1 つしか残らず、複数選択の条件が
 * 1 件に潰れていました。`data-{event}-history-form` は配列を同じ名前の繰り返しで書き、
 * その直後に読み直すため、既定の選択のまま検索するだけで起きていました（課題 53）。
 *
 * 期待値の根拠は仕様「`data-url-param`」の「同じ名前のパラメータが複数ある場合」と、
 * 仕様「`data-{event}-history`」の「URL 組み立て規則」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Url from '../src/url';
import {waitForIdle} from './helpers/async';

describe('同じ名前の URL パラメータと data-url-param', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    history.replaceState(null, '', '/');
  });

  /**
   * URL を差し替えてから HTML を走査し、落ち着くまで待ちます。
   *
   * @param url 開く URL
   * @param html 走査する HTML
   * @returns 走査の完了 Promise
   */
  const open = async (url: string, html: string): Promise<void> => {
    history.replaceState(null, '', url);
    container.innerHTML = html;
    await Core.scan(container);
    await waitForIdle();
  };

  /**
   * 指定した要素を押し、手続きと反映が落ち着くまで待ちます。
   *
   * @param selector 押す要素のセレクタ
   * @returns 待ち合わせの Promise
   */
  const click = async (selector: string): Promise<void> => {
    (container.querySelector(selector) as HTMLElement).click();
    await waitForIdle();
    await new Promise(resolve => setTimeout(resolve, 30));
    await waitForIdle();
  };

  /**
   * 検索フォームの画面を組み立てる HTML を返します。
   *
   * @param defaultSelected 複数選択の P・Q にマークアップの `selected` を書くか
   * @returns HTML
   */
  const searchPage = (defaultSelected: boolean): string => {
    const selected = defaultSelected ? ' selected' : '';
    return `
      <form id="f" data-url-param>
        <input id="txt" name="txt">
        <select id="msel" name="msel" multiple>
          <option value="P"${selected}>P</option>
          <option value="Q"${selected}>Q</option>
          <option value="R">R</option>
        </select>
      </form>
      <button id="search" type="button" data-click-history-form="#f">検索</button>
      <button id="collect" type="button" data-click-form="#f" data-click-bind="#out">写す</button>
      <div id="out" data-bind='{}'></div>
      <div id="u" data-url-param data-url-arg="u"></div>`;
  };

  /**
   * 複数選択の `<select>` で選ばれている値を返します。
   *
   * @returns 選択中の値
   */
  const selectedValues = (): string[] =>
    Array.from(
      (container.querySelector('#msel') as HTMLSelectElement).selectedOptions,
    ).map(option => option.value);

  /**
   * フォームの収集値（送信データに相当）を写し、その `msel` を返します。
   *
   * @returns 収集値の `msel`
   */
  const collectedMsel = async (): Promise<unknown> => {
    await click('#collect');
    const out = container.querySelector('#out') as HTMLElement;
    return JSON.parse(out.getAttribute('data-bind') ?? '{}').msel;
  };

  /**
   * `data-url-arg` で取り込んだ値を返します。
   *
   * @returns `#u` のバインドデータの `u`
   */
  const urlArg = (): Record<string, unknown> => {
    const u = container.querySelector('#u') as HTMLElement;
    return JSON.parse(u.getAttribute('data-bind') ?? '{}').u;
  };

  it('同じ名前が複数あれば出現順の配列、1 つなら文字列として読む', () => {
    history.replaceState(null, '', '/page?msel=P&name=Taro&msel=Q');

    // 仕様「`data-url-param`」の「名前が 1 つなら文字列、同じ名前が複数あれば
    // 出現順の配列として取り込みます」。
    expect(Url.readParams()).toEqual({msel: ['P', 'Q'], name: 'Taro'});
  });

  it('名前が __proto__ のパラメータは取り込まない', () => {
    history.replaceState(null, '', '/page?__proto__=a&__proto__=b&name=Taro');

    const params = Url.readParams();

    // 仕様「`data-url-param`」の「名前が `__proto__` のパラメータは取り込みません」。
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect(Object.keys(params)).toEqual(['name']);
  });

  it('同じ名前が複数ある URL で開くと、すべて選択され、収集値と取り込んだ値も配列になる', async () => {
    await open('/page?msel=P&msel=Q', searchPage(false));

    // 仕様「`data-url-param`」の「複数選択の `<select>` とチェックボックスグループは、
    // 配列の値をすべて選択します」。
    expect(selectedValues()).toEqual(['P', 'Q']);
    expect(await collectedMsel()).toEqual(['P', 'Q']);
    expect(urlArg().msel).toEqual(['P', 'Q']);
  });

  it('既定の選択のまま検索しても、選択と収集値が変わらない', async () => {
    await open('/page', searchPage(true));

    await click('#search');

    // 仕様「`data-url-param`」の「書いた URL を読み直すと、同じ配列に戻ります」。
    expect(new URLSearchParams(window.location.search).getAll('msel')).toEqual([
      'P',
      'Q',
    ]);
    expect(selectedValues()).toEqual(['P', 'Q']);
    expect(await collectedMsel()).toEqual(['P', 'Q']);
    expect(urlArg().msel).toEqual(['P', 'Q']);
  });

  it('利用者が選んで検索すると、取り込んだ値も同じ配列になる', async () => {
    await open('/page', searchPage(false));
    const select = container.querySelector('#msel') as HTMLSelectElement;
    select.options[0].selected = true;
    select.options[1].selected = true;
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    await click('#search');

    expect(selectedValues()).toEqual(['P', 'Q']);
    expect(urlArg().msel).toEqual(['P', 'Q']);
  });

  it('名前が 1 つだけなら、取り込む値は文字列のまま（対照）', async () => {
    await open('/page?txt=Taro&msel=P', searchPage(false));

    // 仕様「`data-url-param`」の「文字列（名前が 1 つ）の場合は、その値だけを選択します」。
    expect(urlArg()).toEqual({txt: 'Taro', msel: 'P'});
    expect((container.querySelector('#txt') as HTMLInputElement).value).toBe(
      'Taro',
    );
    expect(selectedValues()).toEqual(['P']);
    expect(await collectedMsel()).toEqual(['P']);
  });

  it('同じ名前が複数ある URL で開くと、チェックボックスグループもすべてチェックされる', async () => {
    await open(
      '/page?tags=a&tags=c',
      `<form id="g" data-url-param>
        <input type="checkbox" name="tags" value="a">
        <input type="checkbox" name="tags" value="b">
        <input type="checkbox" name="tags" value="c">
      </form>`,
    );

    // 仕様「`data-url-param`」の「複数選択の `<select>` とチェックボックスグループは、
    // 配列の値をすべて選択します」。
    const checked = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[name="tags"]'),
    )
      .filter(input => input.checked)
      .map(input => input.value);
    expect(checked).toEqual(['a', 'c']);
  });

  it('単一値の欄へ同じ名前が複数届くと、カンマで連結した文字列を書く', async () => {
    await open('/page?txt=a&txt=b', searchPage(false));

    // 仕様「`data-url-param`」の「単一値の欄（テキスト系の `<input>`、`<textarea>`、
    // 単一選択の `<select>`）へ配列が届いた場合は、カンマで連結した文字列（`"P,Q"`）を
    // 書きます」。
    expect((container.querySelector('#txt') as HTMLInputElement).value).toBe(
      'a,b',
    );
  });

  it('ベース URL と history-data にある同じ名前を、フォームの配列で置き換える', async () => {
    await open(
      '/page',
      `${searchPage(true)}
      <button id="withBase" type="button" data-click-history="/page?txt=old&msel=Z"
        data-click-history-form="#f">ベース URL に同じ名前</button>
      <button id="withData" type="button" data-click-history-data="txt=old&msel=Z"
        data-click-history-form="#f">history-data に同じ名前</button>`,
    );

    for (const button of ['#withBase', '#withData']) {
      history.replaceState(null, '', '/page');
      await click(button);

      // 仕様「`data-{event}-history`」の「後から書いた値が勝つ。配列も、同じ名前の
      // 既存のパラメータをすべて消してから書く」。
      const params = new URLSearchParams(window.location.search);
      expect(params.getAll('msel')).toEqual(['P', 'Q']);
      expect(params.getAll('txt')).toEqual(['']);
      expect(selectedValues()).toEqual(['P', 'Q']);
      expect(urlArg().msel).toEqual(['P', 'Q']);
    }
  });

  it('空の配列は同じ名前を消し、読み直しても入力欄は今の値を保つ', async () => {
    await open(
      '/page',
      `${searchPage(false)}
      <button id="withBase" type="button" data-click-history="/page?msel=Z"
        data-click-history-form="#f">ベース URL に同じ名前</button>`,
    );

    await click('#withBase');

    // 仕様「`data-{event}-history`」の「空の配列は、同じ名前のパラメータを消して何も
    // 書かない」。
    expect(new URLSearchParams(window.location.search).has('msel')).toBe(false);
    // 仕様「`data-url-param`」の「URL に無いキーの入力欄は、今の値を保ちます」。
    expect(selectedValues()).toEqual([]);
    expect(await collectedMsel()).toEqual([]);
  });

  it('URL からキーが消えても、入力欄は今の選択を保つ', async () => {
    await open(
      '/page?msel=P&msel=Q',
      `${searchPage(false)}
      <button id="other" type="button" data-click-history="/page?other=1">別の URL</button>`,
    );

    await click('#other');

    // 仕様「`data-url-param`」の「URL に無いキーの入力欄は、今の値を保ちます」。
    expect(window.location.search).toBe('?other=1');
    expect(selectedValues()).toEqual(['P', 'Q']);
  });
});
