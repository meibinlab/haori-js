/* @vitest-environment jsdom */
/**
 * @fileoverview フォームコンテナを介さない単独入力の change 書き戻しの検証。
 *
 * 改修要望「単独（非グループ）boolean チェックボックスのオフ値をバインドへ
 * 書き戻したい」に対応する以下を検証します。
 * - `<form>` / `data-form` の外にある入力の change で、その要素の
 *   `name` と値が送信データへ含まれること（ON=true / OFF=false）
 * - 送信データが空の場合に、バインド先を空オブジェクトで全置換しないこと
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

describe('フォーム外の単独入力の change 書き戻し', () => {
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

  /**
   * 要素の自身のバインドデータを取得します。
   *
   * @param selector 対象要素のセレクタ
   * @returns 自身のバインドデータ
   */
  function rawBindingData(selector: string): Record<string, unknown> | null {
    const element = container.querySelector(selector) as HTMLElement;
    return (Fragment.get(element) as ElementFragment).getRawBindingData();
  }

  it('boolean チェックボックスの ON がバインド先へ書き戻される', async () => {
    mount(`
      <div id="gate" data-bind='{"agreed":false,"keep":"KEEP"}'>
        <span id="view">{{keep}}</span>
      </div>
      <input
        type="checkbox"
        id="agree"
        name="agreed"
        value="true"
        data-change-bind="#gate"
        data-change-bind-merge
      >`);
    await Core.scan(container);
    await waitForDomSettled();

    const checkbox = container.querySelector('#agree') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    expect(rawBindingData('#gate')).toEqual({agreed: true, keep: 'KEEP'});
    // マージ指定により、バインド先の他キーと表示が保持される。
    expect((container.querySelector('#view') as HTMLElement).textContent).toBe(
      'KEEP',
    );
  });

  it('boolean チェックボックスの OFF が false として書き戻される', async () => {
    mount(`
      <div id="gate" data-bind='{"agreed":true,"keep":"KEEP"}'></div>
      <input
        type="checkbox"
        id="agree"
        name="agreed"
        value="true"
        checked
        data-change-bind="#gate"
        data-change-bind-merge
      >`);
    await Core.scan(container);
    await waitForDomSettled();

    const checkbox = container.querySelector('#agree') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    expect(rawBindingData('#gate')).toEqual({agreed: false, keep: 'KEEP'});
  });

  it('テキスト入力でもフォーム外の change が書き戻される', async () => {
    mount(`
      <div id="state" data-bind='{"keyword":""}'></div>
      <input
        type="text"
        id="kw"
        name="keyword"
        data-change-bind="#state"
        data-change-bind-merge
      >`);
    await Core.scan(container);
    await waitForDomSettled();

    const input = container.querySelector('#kw') as HTMLInputElement;
    input.value = 'ABC';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    expect(rawBindingData('#state')).toEqual({keyword: 'ABC'});
  });

  it('name の無い入力では送信データが空になり bind 全置換を行わない', async () => {
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

    mount(`
      <div id="gate" data-bind='{"agreed":false,"keep":"KEEP"}'></div>
      <input
        type="checkbox"
        id="agree"
        value="true"
        data-change-bind="#gate"
      >`);
    await Core.scan(container);
    await waitForDomSettled();

    const checkbox = container.querySelector('#agree') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // 空オブジェクトでの全置換を抑止し、既存データを保持する。
    expect(rawBindingData('#gate')).toEqual({agreed: false, keep: 'KEEP'});
    const messages = warn.mock.calls.map(call => call.join(' '));
    expect(messages.some(message => message.includes('Skipped binding'))).toBe(
      true,
    );
  });

  it('data-click-bind による意図的な空クリアは従来どおり動作する（回帰）', async () => {
    mount(`
      <div id="target" data-bind='{"a":1}'></div>
      <button id="clear" data-click-bind="#target">クリア</button>`);
    await Core.scan(container);
    await waitForDomSettled();

    (container.querySelector('#clear') as HTMLElement).click();
    await waitForDomSettled();

    // 空 payload の bind 抑止はフォーム外 change / input に限定するため、
    // click による意図的な全置換クリアは抑止しない。
    expect(rawBindingData('#target')).toEqual({});
  });

  it('フォーム外の入力値が change の fetch クエリへ付与される', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        urls.push(String(input));
        return Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        );
      },
    );

    mount(`
      <select id="kind" name="kind" data-change-fetch="/api/list.json">
        <option value="A">A</option>
        <option value="B">B</option>
      </select>`);
    await Core.scan(container);
    await waitForDomSettled();

    const select = container.querySelector('#kind') as HTMLSelectElement;
    select.value = 'B';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    await new Promise(resolve => setTimeout(resolve, 100));

    // フォームコンテナが無くても、対象要素自身の値が送信データになる。
    expect(urls.length).toBe(1);
    expect(urls[0]).toContain('kind=B');
  });

  it('name の無いコンテナ要素の change では配下の入力を収集しない', async () => {
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

    mount(`
      <div id="gate" data-bind='{"keep":"KEEP"}'></div>
      <div id="box" data-change-bind="#gate">
        <input type="text" name="inner" value="INNER">
      </div>`);
    await Core.scan(container);
    await waitForDomSettled();

    // コンテナ要素自身で change が起きた場合（data-form 未宣言）。
    const box = container.querySelector('#box') as HTMLElement;
    box.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // 配下の inner を収集せず、既存データも破壊しない。
    expect(rawBindingData('#gate')).toEqual({keep: 'KEEP'});
    const messages = warn.mock.calls.map(call => call.join(' '));
    expect(messages.some(message => message.includes('Skipped binding'))).toBe(
      true,
    );
  });

  it('フォーム内の入力は従来どおりフォーム全体の値を収集する（回帰）', async () => {
    mount(`
      <div id="gate" data-bind='{}'></div>
      <form id="f">
        <input type="checkbox" name="agreed" value="true"
          data-change-bind="#gate">
        <input type="text" name="memo" value="MEMO">
      </form>`);
    await Core.scan(container);
    await waitForDomSettled();

    const checkbox = container.querySelector(
      'input[type=checkbox]',
    ) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // フォームコンテナがある場合はフォーム全体の値が対象になる。
    expect(rawBindingData('#gate')).toEqual({agreed: true, memo: 'MEMO'});
  });

  it('祖先 data-bind スコープを持つフォーム外入力でも書き戻せる', async () => {
    mount(`
      <div id="scope" data-bind='{"agreed":false}'>
        <input
          type="checkbox"
          id="agree"
          name="agreed"
          value="true"
          data-change-bind="#scope"
          data-change-bind-merge
        >
        <button id="btn" data-attr-disabled="{{!agreed}}">送信</button>
      </div>`);
    await Core.scan(container);
    await waitForDomSettled();

    const button = container.querySelector('#btn') as HTMLButtonElement;
    expect(button.hasAttribute('disabled')).toBe(true);

    const checkbox = container.querySelector('#agree') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    expect(rawBindingData('#scope')).toEqual({agreed: true});
    expect(button.hasAttribute('disabled')).toBe(false);
  });
});
