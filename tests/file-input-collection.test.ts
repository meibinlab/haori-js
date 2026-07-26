/* @vitest-environment jsdom */
/**
 * @fileoverview `input[type=file]` のフォーム値収集と multipart 送信の検証。
 *
 * 改修要望「フォーム値収集で input[type=file] を File/Blob として収集してほしい」
 * に対応する以下を検証します。
 * - `Form.getValues` が File（`multiple` 時は File[]）を収集すること
 * - `multipart/form-data` 指定時に File が実体のまま FormData へ載ること
 * - multipart 以外で File を送ろうとした場合に警告すること
 * - file input へ値を書き戻そうとしても例外にならないこと
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

/**
 * jsdom の file input へ選択済みファイルを設定します。
 * `files` は読み取り専用のため FileList 相当のオブジェクトを差し込みます。
 *
 * @param input 対象の file input
 * @param files 設定する File の配列
 */
function setFiles(input: HTMLInputElement, files: File[]): void {
  const fileList = {
    ...files,
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      yield* files;
    },
  };
  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => fileList as unknown as FileList,
  });
}

describe('input[type=file] のフォーム値収集と送信', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    container.remove();
  });

  /**
   * HTML を組み立ててから container を body へ追加します。
   *
   * @param html container に設定する HTML
   */
  function mount(html: string): void {
    container.innerHTML = html;
    document.body.appendChild(container);
  }

  describe('値収集', () => {
    it('単一選択の file input を File として収集する', async () => {
      mount(`
        <form id="f">
          <input type="file" name="csvFile">
          <input type="text" name="memo" value="MEMO">
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      const file = new File(['a,b,c'], 'customers.csv', {type: 'text/csv'});
      setFiles(input, [file]);

      const form = container.querySelector('#f') as HTMLElement;
      const values = Form.getValues(Fragment.get(form) as ElementFragment);

      expect(values.csvFile).toBe(file);
      expect(values.memo).toBe('MEMO');
    });

    it('未選択の file input は null を収集する', async () => {
      mount(`
        <form id="f">
          <input type="file" name="csvFile">
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const form = container.querySelector('#f') as HTMLElement;
      const values = Form.getValues(Fragment.get(form) as ElementFragment);

      expect(values.csvFile).toBeNull();
    });

    it('multiple 指定の file input を File の配列として収集する', async () => {
      mount(`
        <form id="f">
          <input type="file" name="docs" multiple>
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      const first = new File(['1'], 'a.png', {type: 'image/png'});
      const second = new File(['2'], 'b.png', {type: 'image/png'});
      setFiles(input, [first, second]);

      const form = container.querySelector('#f') as HTMLElement;
      const values = Form.getValues(Fragment.get(form) as ElementFragment);

      expect(values.docs).toEqual([first, second]);
    });

    it('data-form-list と multiple の併用でも 1 次元配列として収集する', async () => {
      mount(`
        <form id="f">
          <input type="file" name="docs" multiple data-form-list>
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      const first = new File(['1'], 'a.png', {type: 'image/png'});
      const second = new File(['2'], 'b.png', {type: 'image/png'});
      setFiles(input, [first, second]);

      const form = container.querySelector('#f') as HTMLElement;
      const values = Form.getValues(Fragment.get(form) as ElementFragment);

      // 二重配列（[[File, File]]）にならないこと。
      expect(values.docs).toEqual([first, second]);
    });

    it('multiple 指定で未選択の場合は空配列を収集する', async () => {
      mount(`
        <form id="f">
          <input type="file" name="docs" multiple>
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const form = container.querySelector('#f') as HTMLElement;
      const values = Form.getValues(Fragment.get(form) as ElementFragment);

      expect(values.docs).toEqual([]);
    });

    it('change 後の内部値はファイル名を保持し擬似パスを持たない', async () => {
      mount(`
        <form id="f">
          <input type="file" name="csvFile">
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      setFiles(input, [new File(['x'], 'customers.csv', {type: 'text/csv'})]);
      const fragment = Fragment.get(input) as ElementFragment;
      fragment.syncValue();

      // `C:\fakepath\...` の擬似パスではなくファイル名を保持する
      // （data-if での選択有無判定に使えるようにするため）。
      expect(fragment.getValue()).toBe('customers.csv');
    });
  });

  describe('multipart 送信', () => {
    it('File が実体のまま FormData へ載る', async () => {
      const requests: {url: string; body: unknown}[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (input: RequestInfo | URL, init?: RequestInit) => {
          requests.push({url: String(input), body: init?.body});
          return Promise.resolve(
            new Response('{}', {
              headers: {'Content-Type': 'application/json'},
            }),
          );
        },
      );

      mount(`
        <form id="f">
          <input type="file" name="csvFile">
          <input type="text" name="memo" value="MEMO">
        </form>
        <button
          id="send"
          data-click-form="#f"
          data-click-fetch="/api/customer-imports.json"
          data-click-fetch-method="POST"
          data-click-fetch-content-type="multipart/form-data"
        >決定</button>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      const file = new File(['a,b,c'], 'customers.csv', {type: 'text/csv'});
      setFiles(input, [file]);

      const button = container.querySelector('#send') as HTMLElement;
      button.click();
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(requests.length).toBe(1);
      const body = requests[0].body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('csvFile')).toBe(file);
      expect(body.get('memo')).toBe('MEMO');
    });

    it('multiple の File 配列が個別のエントリとして載る', async () => {
      const requests: {body: unknown}[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_input: RequestInfo | URL, init?: RequestInit) => {
          requests.push({body: init?.body});
          return Promise.resolve(
            new Response('{}', {
              headers: {'Content-Type': 'application/json'},
            }),
          );
        },
      );

      mount(`
        <form id="f">
          <input type="file" name="docs" multiple>
        </form>
        <button
          id="send"
          data-click-form="#f"
          data-click-fetch="/api/upload.json"
          data-click-fetch-method="POST"
          data-click-fetch-content-type="multipart/form-data"
        >送信</button>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      const first = new File(['1'], 'a.png', {type: 'image/png'});
      const second = new File(['2'], 'b.png', {type: 'image/png'});
      setFiles(input, [first, second]);

      (container.querySelector('#send') as HTMLElement).click();
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(requests.length).toBe(1);
      const body = requests[0].body as FormData;
      expect(body.getAll('docs')).toEqual([first, second]);
    });

    it('data-form-object 配下の File は送信できないため警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ),
      );

      mount(`
        <form id="f">
          <div data-form-object="detail">
            <input type="file" name="csvFile">
          </div>
        </form>
        <button
          id="send"
          data-click-form="#f"
          data-click-fetch="/api/customer-imports.json"
          data-click-fetch-method="POST"
          data-click-fetch-content-type="multipart/form-data"
        >決定</button>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      setFiles(input, [new File(['x'], 'customers.csv', {type: 'text/csv'})]);

      (container.querySelector('#send') as HTMLElement).click();
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 100));

      // multipart 指定でもネスト配下の File は JSON 文字列化され送信できない。
      const messages = warn.mock.calls.map(call => call.join(' '));
      expect(messages.some(message => message.includes('form-object'))).toBe(
        true,
      );
    });

    it('トップレベルとネストの File が混在しても警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ),
      );

      mount(`
        <form id="f">
          <input type="file" name="topFile">
          <div data-form-object="detail">
            <input type="file" name="nestedFile">
          </div>
        </form>
        <button
          id="send"
          data-click-form="#f"
          data-click-fetch="/api/customer-imports.json"
          data-click-fetch-method="POST"
          data-click-fetch-content-type="multipart/form-data"
        >決定</button>`);
      await Core.scan(container);
      await waitForDomSettled();

      const inputs = container.querySelectorAll('input[type=file]');
      setFiles(inputs[0] as HTMLInputElement, [
        new File(['a'], 'top.csv', {type: 'text/csv'}),
      ]);
      setFiles(inputs[1] as HTMLInputElement, [
        new File(['b'], 'nested.csv', {type: 'text/csv'}),
      ]);

      (container.querySelector('#send') as HTMLElement).click();
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 100));

      // トップレベルに File があっても、ネスト配下の File の欠落を見逃さないこと。
      const messages = warn.mock.calls.map(call => call.join(' '));
      expect(messages.some(message => message.includes('form-object'))).toBe(
        true,
      );
    });

    it('multipart 以外で File を送ろうとすると警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ),
      );

      mount(`
        <form id="f">
          <input type="file" name="csvFile">
        </form>
        <button
          id="send"
          data-click-form="#f"
          data-click-fetch="/api/customer-imports.json"
          data-click-fetch-method="POST"
        >決定</button>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      setFiles(input, [new File(['x'], 'customers.csv', {type: 'text/csv'})]);

      (container.querySelector('#send') as HTMLElement).click();
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 100));

      const messages = warn.mock.calls.map(call => call.join(' '));
      expect(
        messages.some(message => message.includes('multipart/form-data')),
      ).toBe(true);
    });
  });

  describe('値の書き戻し', () => {
    it('バインドデータからの反映は静かにスキップされる', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

      mount(`
        <form id="f">
          <input type="file" name="csvFile">
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const form = container.querySelector('#f') as HTMLElement;
      // 双方向バインディングではファイル名が書き戻される。正常系で警告を出さず、
      // かつ例外にもならないこと（file input へ値は設定できないため無視する）。
      await Core.setBindingData(form, {csvFile: 'other.csv'});
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      expect(input.value).toBe('');
      const messages = warn.mock.calls.map(call => call.join(' '));
      expect(
        messages.some(message => message.includes('input[type=file]')),
      ).toBe(false);
    });

    it('setValue で直接値を設定しようとした場合は警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

      mount(`
        <form id="f">
          <input type="file" name="csvFile">
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      const fragment = Fragment.get(input) as ElementFragment;
      // 明らかな誤用（外部スクリプトからの直接設定）は警告して無視する。
      await fragment.setValue('other.csv');
      await waitForDomSettled();

      expect(input.value).toBe('');
      const messages = warn.mock.calls.map(call => call.join(' '));
      expect(
        messages.some(message => message.includes('input[type=file]')),
      ).toBe(true);
    });

    it('history クエリで File がファイル名へ正規化される', async () => {
      const pushed: string[] = [];
      vi.spyOn(window.history, 'pushState').mockImplementation(
        (_data: unknown, _unused: string, url?: string | URL | null) => {
          pushed.push(String(url));
        },
      );

      mount(`
        <form id="hf">
          <input type="file" name="csvFile">
        </form>
        <button
          id="go"
          data-click-history="/list"
          data-click-history-form="#hf"
          data-click-reset-before="#hf2"
        >履歴</button>
        <form id="hf2"><input type="text" name="dummy"></form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      setFiles(input, [new File(['x'], 'customers.csv', {type: 'text/csv'})]);

      (container.querySelector('#go') as HTMLElement).click();
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 100));

      // reset-before のスナップショット経路でも `%7B%7D` にならないこと。
      expect(pushed.length).toBeGreaterThan(0);
      expect(pushed[0]).not.toContain('%7B%7D');
      expect(pushed[0]).toContain('customers.csv');
    });

    it('双方向バインディングでバインドデータが File で壊れない', async () => {
      mount(`
        <form id="f">
          <input type="file" name="csvFile">
          <input type="text" name="memo" value="M">
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector(
        'input[type=file]',
      ) as HTMLInputElement;
      setFiles(input, [new File(['x'], 'customers.csv', {type: 'text/csv'})]);
      input.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();

      // File をそのままバインドすると JSON 化で `{}` に潰れて data-bind 属性が
      // 壊れるため、ファイル名へ正規化されること。
      const form = container.querySelector('#f') as HTMLElement;
      const data = (
        Fragment.get(form) as ElementFragment
      ).getRawBindingData() as Record<string, unknown>;
      expect(data.csvFile).toBe('customers.csv');
      expect(data.memo).toBe('M');
      expect(form.getAttribute('data-bind')).not.toContain('{}');
    });

    it('null の反映（クリア）は警告せずに受け付ける', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

      mount(`
        <form id="f">
          <input type="file" name="csvFile">
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const form = container.querySelector('#f') as HTMLElement;
      await Core.setBindingData(form, {csvFile: null});
      await waitForDomSettled();

      const messages = warn.mock.calls.map(call => call.join(' '));
      expect(
        messages.some(message => message.includes('input[type=file]')),
      ).toBe(false);
    });
  });
});
