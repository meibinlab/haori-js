/* @vitest-environment jsdom */
/**
 * @fileoverview 改行区切りの値を配列で収集する宣言（`data-value-type="lines"`）。
 *
 * 期待値は仕様「`data-value-type`」の次の記述から取っている。
 *
 * - 「`lines` は、値を改行（`\n` / `\r\n`）で分け、各行の前後の空白を除き、
 *   **空の行は捨てた配列**です。未入力は空の配列です。GET のクエリでは同じ名前の
 *   キーの繰り返し（空の配列ではキーを送りません）、JSON の本文では配列になります」
 * - 「**`lines` は `<textarea>` にだけ宣言できます。**」
 * - 「**`lines` の欄へバインドの配列を書くときは、改行でつないで書きます。** `null` と、
 *   配列の `null` の要素は空として扱います。ただし欄の内容が同じ配列を表している
 *   場合（空の行や前後の空白だけが違う場合）は書き換えません」
 * - 「**宣言しない限り従来どおりです。**」
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('data-value-type="lines"', () => {
  let container: HTMLElement;
  let requests: Array<{url: string; init?: RequestInit}>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await import('../src/observer');
    container = document.createElement('div');
    document.body.appendChild(container);
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({url: String(input), init});
        return Promise.resolve(
          new Response('{"count":1}', {
            status: 200,
            headers: {'Content-Type': 'application/json'},
          }),
        );
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Dev.set(false);
    container.remove();
  });

  /**
   * HTML を走査します。
   *
   * @param html 走査する HTML
   */
  async function mount(html: string): Promise<void> {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForIdle();
  }

  /**
   * 入力欄の値を変えて change を発火します。
   *
   * @param element 対象の入力欄
   * @param value 入力する値
   */
  function type(
    element: HTMLTextAreaElement | HTMLInputElement,
    value: string,
  ): void {
    element.value = value;
    element.dispatchEvent(new Event('change', {bubbles: true}));
  }

  /**
   * フォームの収集値を返します。
   *
   * @returns 収集値
   */
  function collect(): Record<string, unknown> {
    return Form.getValues(
      Fragment.get(
        container.querySelector('#f') as HTMLElement,
      ) as ElementFragment,
    );
  }

  it('改行で分け、前後の空白を除き、空の行を捨てた配列を収集する', async () => {
    await mount(
      '<form id="f"><textarea name="k" data-value-type="lines"></textarea></form>',
    );
    const area = container.querySelector('textarea') as HTMLTextAreaElement;
    area.value = 'a\r\n\n b \n';

    expect(collect()).toEqual({k: ['a', 'b']});
  });

  it('未入力は空の配列になる', async () => {
    await mount(
      '<form id="f"><textarea name="k" data-value-type="lines"></textarea></form>',
    );

    expect(collect()).toEqual({k: []});
  });

  it('入力欄自身の change の取得（GET）は、その時点の値を同じ名前のキーの繰り返しで送る', async () => {
    await mount(
      '<form id="f"><textarea name="k" data-value-type="lines" ' +
        'data-change-fetch="/api/count"></textarea></form>',
    );
    type(
      container.querySelector('textarea') as HTMLTextAreaElement,
      'a\n\n b ',
    );
    await waitForCondition(() => requests.length > 0);

    const url = new URL(requests[0].url, 'http://localhost/');
    expect(url.searchParams.getAll('k')).toEqual(['a', 'b']);
  });

  it('空の配列は GET のクエリにキーを送らない', async () => {
    await mount(
      '<form id="f"><textarea name="k" data-value-type="lines" ' +
        'data-change-fetch="/api/count"></textarea></form>',
    );
    type(container.querySelector('textarea') as HTMLTextAreaElement, '\n \n');
    await waitForCondition(() => requests.length > 0);

    const url = new URL(requests[0].url, 'http://localhost/');
    expect(url.searchParams.has('k')).toBe(false);
  });

  it('JSON の本文では配列になる', async () => {
    await mount(
      '<form id="f"><textarea name="k" data-value-type="lines">a\nb</textarea></form>' +
        '<button id="save" type="button" data-click-form="#f" ' +
        'data-click-fetch="/api/save" data-click-fetch-method="POST"></button>',
    );
    (container.querySelector('#save') as HTMLElement).click();
    await waitForCondition(() => requests.length > 0);

    expect(JSON.parse(String(requests[0].init?.body))).toEqual({k: ['a', 'b']});
  });

  it('バインドの配列は改行でつないで欄に書く', async () => {
    await mount(
      '<form id="f"><textarea name="k" data-value-type="lines"></textarea></form>',
    );
    const form = container.querySelector('#f') as HTMLElement;
    await Core.setBindingData(form, {k: ['x', 'y']});
    await waitForIdle();

    expect(
      (container.querySelector('textarea') as HTMLTextAreaElement).value,
    ).toBe('x\ny');
  });

  it('バインドの null と、配列の null の要素は空として書く', async () => {
    await mount(
      '<form id="f"><textarea name="k" data-value-type="lines">a</textarea></form>',
    );
    const form = container.querySelector('#f') as HTMLElement;
    const area = container.querySelector('textarea') as HTMLTextAreaElement;
    await Core.setBindingData(form, {k: ['x', null, 'y']});
    await waitForIdle();
    expect(area.value).toBe('x\ny');

    await Core.setBindingData(form, {k: null});
    await waitForIdle();
    expect(area.value).toBe('');
  });

  it('入力をコミットしても、同じ配列を後から供給しても、利用者が書いた空の行と空白は書き換えない', async () => {
    await mount(
      '<form id="f"><textarea name="k" data-value-type="lines"></textarea>' +
        '<span id="shown">{{k.join("/")}}</span></form>',
    );
    const area = container.querySelector('textarea') as HTMLTextAreaElement;
    type(area, 'a\n\n b ');
    const shown = container.querySelector('#shown') as HTMLElement;
    await waitForCondition(() => shown.textContent === 'a/b');
    await waitForIdle();

    expect(area.value).toBe('a\n\n b ');

    // 同じ配列を後から供給しても書き換えない。
    await Core.setBindingData(container.querySelector('#f') as HTMLElement, {
      k: ['a', 'b'],
    });
    await waitForIdle();
    expect(area.value).toBe('a\n\n b ');
  });

  it('textarea 以外へ宣言した場合は無視し、文字列で収集する', async () => {
    Dev.set(true);
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    await mount(
      '<form id="f"><input name="k" data-value-type="lines" value="a"></form>',
    );

    expect(collect()).toEqual({k: 'a'});
    expect(
      warn.mock.calls.some(call =>
        String(call[1]).includes('lines は <textarea> にのみ指定できます'),
      ),
    ).toBe(true);
  });

  it('宣言の無い textarea は今までどおり 1 つの文字列で収集する', async () => {
    await mount('<form id="f"><textarea name="k"></textarea></form>');
    const area = container.querySelector('textarea') as HTMLTextAreaElement;
    area.value = 'a\nb';

    expect(collect()).toEqual({k: 'a\nb'});
  });
});
