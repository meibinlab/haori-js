/* @vitest-environment jsdom */
/**
 * @fileoverview ブラウザストレージ連携（`data-store`）のテスト。
 *
 * `data-store` を宣言した要素のバインドデータと、ストレージ上のレコード
 * （1 キー = 1 JSON オブジェクト）を双方向にミラーする。復元は優先属性として
 * `data-bind` の直後に処理されるため、`data-if` の条件・`data-each` の配列・
 * 入力欄の初期値として機能する（初期 `data-bind` と同じ扱い）。
 *
 * ここでは復元・保存・破棄・無効条件・異常系・`data-url-param` との優先順を固定する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import Log from '../src/log';
import Queue from '../src/queue';
import {waitForDomSettled} from './helpers/async';

/**
 * ストレージのレコードを読み取ります。
 *
 * @param key ストレージキー
 * @param kind ストレージ種別
 * @returns レコード。存在しない場合は null
 */
const readRecord = (
  key: string,
  kind: 'session' | 'local' = 'session',
): Record<string, unknown> | null => {
  const storage = kind === 'local' ? localStorage : sessionStorage;
  const text = storage.getItem(key);
  return text === null ? null : (JSON.parse(text) as Record<string, unknown>);
};

/**
 * ストレージへレコードを書き込みます（前の画面が保存した状態の再現）。
 *
 * @param key ストレージキー
 * @param record レコード
 * @param kind ストレージ種別
 */
const writeRecord = (
  key: string,
  record: Record<string, unknown>,
  kind: 'session' | 'local' = 'session',
): void => {
  const storage = kind === 'local' ? localStorage : sessionStorage;
  storage.setItem(key, JSON.stringify(record));
};

describe('data-store によるブラウザストレージ連携', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    dispatcher.stop();
    Dev.disable();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
  });

  /**
   * 入力欄の編集を確定します（利用者の操作と同じ経路）。
   *
   * @param input 対象の入力要素
   * @param value 入力する値
   * @returns 反映完了の Promise
   */
  const edit = async (
    input: HTMLInputElement | HTMLSelectElement,
    value: string,
  ): Promise<void> => {
    input.value = value;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);
    await Queue.wait();
  };

  /**
   * 対象要素をスキャンして描画の安定を待ちます。
   *
   * @param html 対象の HTML
   * @param cycles 待機サイクル数
   * @returns 完了の Promise
   */
  const render = async (html: string, cycles = 3): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled(cycles);
    await Queue.wait();
  };

  describe('復元', () => {
    it('保存済みのキーが初期バインドへ載る', async () => {
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div id="state" data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      expect(container.querySelector('#label')!.textContent).toBe('あかね');
    });

    it('復元値が data-if の条件として機能する', async () => {
      writeRecord('apply', {agreed: true});
      await render(`
        <div data-bind='{"agreed":false}'
          data-store="apply" data-store-params="agreed">
          <p id="msg" data-if="agreed">同意済み</p>
        </div>`);

      const message = container.querySelector('#msg') as HTMLElement;
      expect(message.hasAttribute('data-if-false')).toBe(false);
      expect(message.style.display).not.toBe('none');
    });

    it('復元値が data-each の配列として機能する', async () => {
      writeRecord('apply', {rows: [{name: '契約1'}, {name: '契約2'}]});
      await render(
        `
        <div data-bind='{"rows":[]}'
          data-store="apply" data-store-params="rows">
          <div id="list" data-each="rows"><div><span>{{name}}</span></div></div>
        </div>`,
        5,
      );

      const rows = container.querySelectorAll('#list > div');
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toBe('契約1');
      expect(rows[1].textContent).toBe('契約2');
    });

    it('フォームに宣言すると入力欄へ入る（text / select / checkbox）', async () => {
      writeRecord('apply', {
        customer: {name: 'あかね', kind: 'gas', active: true},
      });
      await render(`
        <form id="f" data-store="apply" data-store-arg="customer">
          <input id="name" name="name" type="text">
          <select id="kind" name="kind">
            <option value=""></option>
            <option value="power">電力</option>
            <option value="gas">ガス</option>
          </select>
          <input id="active" name="active" type="checkbox" value="true">
        </form>`);

      expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
        'あかね',
      );
      expect(
        (container.querySelector('#kind') as HTMLSelectElement).value,
      ).toBe('gas');
      expect(
        (container.querySelector('#active') as HTMLInputElement).checked,
      ).toBe(true);
    });

    it('data-form-arg と同名のキーを指定すると入力欄へ入る', async () => {
      writeRecord('apply', {customer: {name: '下書き', zip: '1000001'}});
      await render(`
        <div id="state" data-bind='{"customer":{"name":"既定"}}'>
          <form id="f" data-form-arg="customer"
            data-store="apply" data-store-params="customer">
            <input id="name" name="name" type="text">
            <span id="zip">{{customer.zip}}</span>
          </form>
        </div>`);

      // 保存済みの下書きが祖先の既定値より優先される。
      expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
        '下書き',
      );
      expect(container.querySelector('#zip')!.textContent).toBe('1000001');
    });

    it('params と arg を併用するとレコードのネスト配下から取り出す', async () => {
      writeRecord('apply', {
        step2: {contracts: [{no: 1}], memo: '対象外'},
      });
      await render(`
        <div data-bind='{"contracts":[]}' data-store="apply"
          data-store-arg="step2" data-store-params="contracts">
          <span id="count">{{contracts.length}}</span>
          <span id="memo">{{memo}}</span>
        </div>`);

      expect(container.querySelector('#count')!.textContent).toBe('1');
      // params で選んでいないキーは復元しない。
      expect(container.querySelector('#memo')!.textContent).toBe('');
    });

    it('レコードが無い場合は data-bind の既定値を保つ', async () => {
      await render(`
        <div data-bind='{"customer":{"name":"既定"}}'
          data-store="apply" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      expect(container.querySelector('#label')!.textContent).toBe('既定');
    });

    it('レコードに無いキーだけ既定値を保つ（キー単位の差し替え）', async () => {
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div data-bind='{"customer":{"name":"既定"},"step":1}'
          data-store="apply" data-store-params="customer&step">
          <span id="name">{{customer.name}}</span>
          <span id="step">{{step}}</span>
        </div>`);

      expect(container.querySelector('#name')!.textContent).toBe('あかね');
      expect(container.querySelector('#step')!.textContent).toBe('1');
    });

    it('復元対象が無い場合はバインドデータを作らない', async () => {
      await render(`
        <div id="plain" data-store="apply" data-store-params="customer"></div>`);

      const plain = container.querySelector('#plain') as HTMLElement;
      expect(Core.getBindingData(plain)).toBeNull();
    });

    it('data-store-type="local" は localStorage を読む', async () => {
      writeRecord('apply', {customer: {name: 'ローカル'}}, 'local');
      await render(`
        <div data-bind='{"customer":{}}' data-store="apply"
          data-store-type="local" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      expect(container.querySelector('#label')!.textContent).toBe('ローカル');
    });

    it('壊れた JSON は警告して既定値を保つ', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      sessionStorage.setItem('apply', '{"customer":');
      await render(`
        <div data-bind='{"customer":{"name":"既定"}}'
          data-store="apply" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      expect(container.querySelector('#label')!.textContent).toBe('既定');
      expect(warn).toHaveBeenCalled();
    });

    it('オブジェクトでないレコードは警告して既定値を保つ', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      sessionStorage.setItem('apply', '[1,2,3]');
      await render(`
        <div data-bind='{"customer":{"name":"既定"}}'
          data-store="apply" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      expect(container.querySelector('#label')!.textContent).toBe('既定');
      expect(warn).toHaveBeenCalled();
    });

    it('arg で指定したキーがオブジェクトでなければ警告して復元しない', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      writeRecord('apply', {step2: 'テキスト'});
      await render(`
        <div data-bind='{"contracts":[]}' data-store="apply"
          data-store-arg="step2">
          <span id="count">{{contracts.length}}</span>
        </div>`);

      expect(container.querySelector('#count')!.textContent).toBe('0');
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('保存', () => {
    it('入力の確定でフォーム値が保存される', async () => {
      await render(`
        <form id="f" data-store="apply" data-store-arg="customer">
          <input id="name" name="name" type="text">
        </form>`);

      await edit(container.querySelector('#name') as HTMLInputElement, 'あおい');

      expect(readRecord('apply')).toEqual({customer: {name: 'あおい'}});
    });

    it('data-form-arg 構成でも同名キーで保存される', async () => {
      await render(`
        <div id="state" data-bind='{"customer":{"id":7,"name":"あかね"}}'>
          <form id="f" data-form-arg="customer"
            data-store="apply" data-store-params="customer">
            <input id="name" name="name" type="text">
          </form>
        </div>`);

      await edit(container.querySelector('#name') as HTMLInputElement, 'あおい');

      // 入力欄に無い id も祖先の値を土台にするため残る。
      expect(readRecord('apply')).toEqual({
        customer: {id: 7, name: 'あおい'},
      });
    });

    it('他の画面が保存したキーを壊さない（部分更新）', async () => {
      writeRecord('apply', {customer: {name: 'あかね'}, receipt: {no: 'A-1'}});
      await render(`
        <div id="state" data-bind='{"contracts":[]}'
          data-store="apply" data-store-params="contracts">
        </div>`);

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {contracts: [{no: 1}]},
      );
      await waitForDomSettled(3);

      expect(readRecord('apply')).toEqual({
        customer: {name: 'あかね'},
        receipt: {no: 'A-1'},
        contracts: [{no: 1}],
      });
    });

    it('arg 指定時もレコードのスロット内の他キーを保持する', async () => {
      writeRecord('apply', {step2: {memo: '既存'}});
      await render(`
        <div id="state" data-bind='{"contracts":[]}' data-store="apply"
          data-store-arg="step2" data-store-params="contracts">
        </div>`);

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {contracts: [{no: 1}]},
      );
      await waitForDomSettled(3);

      expect(readRecord('apply')).toEqual({
        step2: {memo: '既存', contracts: [{no: 1}]},
      });
    });

    it('宣言していないキーは保存されない', async () => {
      await render(`
        <div id="state" data-bind='{"customer":{},"secret":"x"}'
          data-store="apply" data-store-params="customer">
        </div>`);

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {customer: {name: 'あかね'}, secret: 'x'},
      );
      await waitForDomSettled(3);

      expect(readRecord('apply')).toEqual({customer: {name: 'あかね'}});
    });

    it('予約キー（_ 始まり）は保存されない', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      await render(`
        <div id="state" data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer&_fetch">
        </div>`);

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {customer: {name: 'あかね'}, _fetch: {loading: true}},
      );
      await waitForDomSettled(3);

      expect(readRecord('apply')).toEqual({customer: {name: 'あかね'}});
      expect(warn).toHaveBeenCalled();
    });

    it('値が変わらない更新では書き込まない', async () => {
      await render(`
        <div id="state" data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer">
        </div>`);

      const state = container.querySelector('#state') as HTMLElement;
      const value = {name: 'あかね'};
      await Core.setBindingData(state, {customer: value});
      await waitForDomSettled(3);

      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      // 同じ参照での再設定（参照同一性の速い経路）。
      await Core.setBindingData(state, {customer: value});
      await waitForDomSettled(3);
      expect(setItem).not.toHaveBeenCalled();

      // 内容が同じで参照だけが異なる再設定。
      await Core.setBindingData(state, {customer: {name: 'あかね'}});
      await waitForDomSettled(3);
      expect(setItem).not.toHaveBeenCalled();

      // 内容が変われば書き込む。
      await Core.setBindingData(state, {customer: {name: 'あおい'}});
      await waitForDomSettled(3);
      expect(setItem).toHaveBeenCalled();
    });

    it('宣言キーが要素自身のバインドデータに無ければレコードを変更しない', async () => {
      writeRecord('apply', {customer: {name: '下書き'}});
      // フォームは data-form-arg を持たないため、収集値は平坦なキーになる。
      await render(`
        <div id="state" data-bind='{"customer":{"name":"既定"}}'>
          <form id="f" data-store="apply" data-store-params="customer">
            <input id="name" name="name" type="text">
          </form>
        </div>`);

      await edit(container.querySelector('#name') as HTMLInputElement, 'あおい');

      // customer キーはフォーム自身のデータに無いため、保存済みの下書きは残る。
      expect(readRecord('apply')).toEqual({customer: {name: '下書き'}});
    });

    it('祖先の更新でコピーが解除されても保存済みの値を消さない', async () => {
      writeRecord('apply', {customer: {name: '下書き'}});
      await render(`
        <div id="state" data-bind='{"customer":{"id":7,"name":"あかね"}}'>
          <form id="f" data-form-arg="customer"
            data-store="apply" data-store-params="customer">
            <input id="name" name="name" type="text">
          </form>
        </div>`);

      // 祖先の更新でフォーム自身のコピー（宣言キー）が解除される。
      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {customer: {id: 9, name: 'きい'}},
      );
      await waitForDomSettled(3);
      await Queue.wait();

      expect(readRecord('apply')).not.toBeNull();
      expect(readRecord('apply')!.customer).toBeDefined();
    });

    it('祖先に宣言してもフォームの入力値は保存されない', async () => {
      await render(`
        <div id="state" data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer">
          <form><input id="name" name="name" type="text"></form>
        </div>`);

      await edit(container.querySelector('#name') as HTMLInputElement, 'あおい');

      // 双方向コミットはフォーム要素自身へ書き込むため、祖先の宣言では拾えない。
      expect(readRecord('apply')).toBeNull();
    });

    it('フェッチ応答のバインドが保存される', async () => {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({no: 'A-1', confirmed: true}), {
          headers: {'Content-Type': 'application/json'},
        })) as unknown as typeof fetch;

      await render(`
        <div id="state" data-bind='{"receipt":{}}'
          data-store="apply" data-store-params="receipt">
        </div>
        <button id="send" data-click-fetch="https://example.com/apply.json"
          data-click-bind="#state" data-click-bind-arg="receipt"></button>`);

      const send = container.querySelector('#send') as HTMLButtonElement;
      send.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled(8);
      await Queue.wait();

      expect(readRecord('apply')).toEqual({
        receipt: {no: 'A-1', confirmed: true},
      });
    });

    it('初期スキャンでは既定値でレコードを上書きしない', async () => {
      writeRecord('apply', {customer: {name: '下書き'}});
      await render(`
        <div data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer">
        </div>`);

      expect(readRecord('apply')).toEqual({customer: {name: '下書き'}});
    });
  });

  describe('破棄', () => {
    it('data-click-store-clear でレコードを破棄する', async () => {
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer">
        </div>
        <button id="done" data-click-store-clear="apply"></button>`);

      const done = container.querySelector('#done') as HTMLButtonElement;
      done.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled(5);
      await Queue.wait();

      expect(sessionStorage.getItem('apply')).toBeNull();
    });

    it('破棄直後は同じ値を書き戻さない', async () => {
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div id="state" data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer">
        </div>
        <button id="done" data-click-store-clear="apply"></button>`);

      const done = container.querySelector('#done') as HTMLButtonElement;
      done.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled(5);
      await Queue.wait();

      // 破棄後に同じ値で再設定しても書き戻さない（署名が再シードされている）。
      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {customer: {name: 'あかね'}},
      );
      await waitForDomSettled(3);
      expect(sessionStorage.getItem('apply')).toBeNull();
    });

    it('破棄後に値が変われば再び保存される', async () => {
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div id="state" data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer">
        </div>
        <button id="done" data-click-store-clear="apply"></button>`);

      const done = container.querySelector('#done') as HTMLButtonElement;
      done.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled(5);
      await Queue.wait();

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {customer: {name: 'あおい'}},
      );
      await waitForDomSettled(3);

      expect(readRecord('apply')).toEqual({customer: {name: 'あおい'}});
    });

    it('data-click-store-clear-type="local" は localStorage を破棄する', async () => {
      writeRecord('apply', {customer: {name: 'あかね'}}, 'local');
      writeRecord('apply', {customer: {name: 'セッション'}});
      await render(`
        <button id="done" data-click-store-clear="apply"
          data-click-store-clear-type="local"></button>`);

      const done = container.querySelector('#done') as HTMLButtonElement;
      done.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled(5);
      await Queue.wait();

      expect(localStorage.getItem('apply')).toBeNull();
      expect(readRecord('apply')).toEqual({customer: {name: 'セッション'}});
    });

    it('ページの load でも破棄できる（完了画面の導線）', async () => {
      writeRecord('apply', {receipt: {no: 'A-1'}});
      document.documentElement.setAttribute('data-load-store-clear', 'apply');
      try {
        await render(`
          <div data-bind='{"receipt":{}}'
            data-store="apply" data-store-params="receipt">
            <span id="label">{{receipt.no}}</span>
          </div>`);

        // 復元は破棄より先に済むため、受付番号は表示できる。
        expect(container.querySelector('#label')!.textContent).toBe('A-1');

        window.dispatchEvent(new Event('load'));
        await waitForDomSettled(5);
        await Queue.wait();

        expect(sessionStorage.getItem('apply')).toBeNull();
      } finally {
        document.documentElement.removeAttribute('data-load-store-clear');
      }
    });

    it('ストレージキーが空なら何もしない', async () => {
      writeRecord('apply', {customer: {name: 'あかね'}});
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      await render('<button id="done" data-click-store-clear=""></button>');

      const done = container.querySelector('#done') as HTMLButtonElement;
      done.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled(5);
      await Queue.wait();

      expect(readRecord('apply')).toEqual({customer: {name: 'あかね'}});
      expect(error).toHaveBeenCalled();
    });
  });

  describe('無効条件と異常系', () => {
    it('対象キーの指定が無い宣言は警告して無効にする', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div id="state" data-bind='{"customer":{"name":"既定"}}'
          data-store="apply">
          <span id="label">{{customer.name}}</span>
        </div>`);

      expect(container.querySelector('#label')!.textContent).toBe('既定');

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {customer: {name: 'あおい'}},
      );
      await waitForDomSettled(3);

      expect(readRecord('apply')).toEqual({customer: {name: 'あかね'}});
      expect(warn).toHaveBeenCalled();
    });

    it('data-each の行の内側では無効にする', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      writeRecord('apply', {customer: {name: '下書き'}});
      await render(
        `
        <div data-bind='{"rows":[{"customer":{"name":"行"}}]}'>
          <div data-each="rows">
            <div>
              <form data-form-arg="customer"
                data-store="apply" data-store-params="customer">
                <input name="name" type="text">
              </form>
            </div>
          </div>
        </div>`,
        6,
      );

      const input = container.querySelector(
        'form[data-form-arg] input',
      ) as HTMLInputElement;
      // 行の内側では data-store が無効なため、保存済みの値は流し込まれない
      // （行データそのものの流し込みも data-form-arg の対象外）。
      expect(input.value).toBe('');
      await edit(input, '編集');
      expect(readRecord('apply')).toEqual({customer: {name: '下書き'}});
      expect(warn).toHaveBeenCalled();
    });

    it('式を含むストレージキーは警告して無効にする', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      await render(`
        <div id="state" data-bind='{"customer":{}}'
          data-store="apply-{{userId}}" data-store-params="customer">
        </div>`);

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {customer: {name: 'あかね'}},
      );
      await waitForDomSettled(3);

      expect(sessionStorage.length).toBe(0);
      expect(warn).toHaveBeenCalled();
    });

    it('data-store 属性の削除では復元しない', async () => {
      await render(`
        <div id="state" data-bind='{"customer":{"name":"現在"}}'
          data-store="apply" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      // 別のタブや外部スクリプトが後から書いたレコードを模す。
      writeRecord('apply', {customer: {name: '外部'}});

      const state = container.querySelector('#state') as HTMLElement;
      await Core.setAttribute(state, 'data-store', null);
      await waitForDomSettled(3);
      await Queue.wait();

      // 削除で復元が走ると現在の値を保存済みの値で上書きしてしまう。
      expect(container.querySelector('#label')!.textContent).toBe('現在');
    });

    it('原因が複数あるときは種別ごとに警告する', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      await render(`
        <div data-bind='{"customer":{}}' data-store="apply"
          data-store-type="cookie">
        </div>`);

      const messages = warn.mock.calls.map(call => String(call[1]));
      expect(messages.some(message => message.includes('store-type'))).toBe(
        true,
      );
      expect(messages.some(message => message.includes('store-params'))).toBe(
        true,
      );
    });

    it('data-store-type の不正値は session として扱い警告する', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div data-bind='{"customer":{}}' data-store="apply"
          data-store-type="cookie" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      expect(container.querySelector('#label')!.textContent).toBe('あかね');
      expect(warn).toHaveBeenCalled();
    });

    it('保存に失敗しても画面は壊さない（容量超過）', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      await render(`
        <div id="state" data-bind='{"customer":{}}'
          data-store="apply" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {customer: {name: 'あおい'}},
      );
      await waitForDomSettled(3);

      // バインドと再評価は通常どおり完了する。
      expect(container.querySelector('#label')!.textContent).toBe('あおい');
      expect(warn).toHaveBeenCalled();
    });

    it('読み取りに失敗しても既定値で描画する', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      await render(`
        <div data-bind='{"customer":{"name":"既定"}}'
          data-store="apply" data-store-params="customer">
          <span id="label">{{customer.name}}</span>
        </div>`);

      expect(container.querySelector('#label')!.textContent).toBe('既定');
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('data-url-param との優先順', () => {
    const originalLocation = window.location;

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    });

    /**
     * URL のクエリ文字列を差し替えます。
     *
     * @param search クエリ文字列
     */
    const setSearch = (search: string): void => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {...originalLocation, search},
      });
    };

    it('data-url-arg 併用時は URL とストレージが共存する', async () => {
      setSearch('?agencyCode=A9');
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div data-bind='{"customer":{}}' data-store="apply"
          data-store-params="customer" data-url-param data-url-arg="q">
          <span id="name">{{customer.name}}</span>
          <span id="code">{{q.agencyCode}}</span>
        </div>`);

      expect(container.querySelector('#name')!.textContent).toBe('あかね');
      expect(container.querySelector('#code')!.textContent).toBe('A9');
    });

    it('data-url-arg なしの併用は復元値が消え、警告を出す', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      setSearch('?agencyCode=A9');
      writeRecord('apply', {customer: {name: 'あかね'}});
      await render(`
        <div data-bind='{"customer":{}}' data-store="apply"
          data-store-params="customer" data-url-param>
          <span id="name">{{customer.name}}</span>
          <span id="code">{{agencyCode}}</span>
        </div>`);

      // url-param は生バインドデータを全置換するため復元値は残らない。
      expect(container.querySelector('#name')!.textContent).toBe('');
      expect(container.querySelector('#code')!.textContent).toBe('A9');
      expect(warn).toHaveBeenCalled();
    });
  });
});
