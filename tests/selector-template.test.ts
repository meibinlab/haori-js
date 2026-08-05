/* @vitest-environment jsdom */
/**
 * @fileoverview セレクタを値に取る属性でのテンプレート式評価のテスト。
 *
 * `data-{event}-bind` などセレクタを値に取る属性は、`{{}}` を評価した結果を
 * セレクタとして扱う。これにより `data-each` の行の中から「その行の要素」を
 * 指す指定（`#plan-{{i}}`）が書ける。従来は生の属性値をそのままセレクタとして
 * 扱っていたため `'#plan-{{i}}' is not a valid selector` で失敗していた。
 *
 * あわせて、CSS セレクタとして不正な値は例外にせずログしてスキップすること
 * （後続のアクションが止まらないこと）を固定する。
 *
 * 期待値の根拠は仕様「セレクタを値に取る属性の解決」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Haori from '../src/haori';
import Log from '../src/log';
import Queue from '../src/queue';
import {waitForDomSettled} from './helpers/async';

describe('セレクタ属性のテンプレート式評価', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * 対象要素をスキャンして描画の安定を待ちます。
   *
   * @param html 対象の HTML
   * @param cycles 待機サイクル数
   * @returns 完了の Promise
   */
  const render = async (html: string, cycles = 5): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled(cycles);
    await Queue.wait();
  };

  /**
   * 要素をクリックして反映を待ちます。
   *
   * @param element 対象要素
   * @param cycles 待機サイクル数
   * @returns 完了の Promise
   */
  const click = async (element: Element, cycles = 5): Promise<void> => {
    element.dispatchEvent(new Event('click', {bubbles: true}));
    await waitForDomSettled(cycles);
    await Queue.wait();
  };

  /**
   * 文字列を返します（テキスト取得の簡略化）。
   *
   * @param selector CSS セレクタ
   * @returns テキスト内容
   */
  const text = (selector: string): string =>
    container.querySelector(selector)?.textContent ?? '';

  it('行ごとのバインド先を式で指定でき、他の行に影響しない', async () => {
    await render(`
      <div data-bind='{"rows":[{"id":"a"},{"id":"b"}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <button class="load"
              data-click-data='{"plans":["P1","P2"]}'
              data-click-bind="#plan-{{i}}"></button>
            <div id="plan-{{i}}"><span class="count">{{plans.length}}</span></div>
          </div>
        </div>
      </div>`);

    // id は行ごとに補間される。
    expect(container.querySelector('#plan-0')).not.toBeNull();
    expect(container.querySelector('#plan-1')).not.toBeNull();

    const buttons = container.querySelectorAll('.load');
    expect(buttons.length).toBe(2);

    await click(buttons[0]);

    expect(text('#plan-0 .count')).toBe('2');
    expect(text('#plan-1 .count')).toBe('');

    await click(buttons[1]);
    expect(text('#plan-1 .count')).toBe('2');
  });

  it('報告の構成（change → fetch → 行スコープへ bind）が成立する', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({name: '標準プラン'}), {
        headers: {'Content-Type': 'application/json'},
      })) as unknown as typeof fetch;
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <select class="area" name="area"
              data-change-fetch="https://example.com/plans.json"
              data-change-bind="#scope-{{i}}"
              data-change-bind-arg="plans">
              <option value=""></option>
              <option value="x">X</option>
            </select>
            <div id="scope-{{i}}"><span class="name">{{plans.name}}</span></div>
          </div>
        </div>
      </div>`);

    const selects = container.querySelectorAll<HTMLSelectElement>('.area');
    selects[0].value = 'x';
    selects[0].dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(8);
    await Queue.wait();

    expect(text('#scope-0 .name')).toBe('標準プラン');
    expect(text('#scope-1 .name')).toBe('');
    // 不正セレクタのログが出ていないこと（従来はここで失敗していた）。
    const messages = error.mock.calls.map(call => String(call[1]));
    expect(messages.some(message => message.includes('not a valid'))).toBe(
      false,
    );
    expect(messages.some(message => message.includes('Invalid selector'))).toBe(
      false,
    );
  });

  it('行ごとのコピー先とコピー元を式で指定できる（住所複写）', async () => {
    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div id="owner" data-bind='{"zip":"1000001","city":"千代田"}'></div>
        <div data-each="rows" data-each-index="i">
          <div>
            <form id="addr-{{i}}">
              <input class="zip" name="zip" type="text">
              <input class="city" name="city" type="text">
            </form>
            <button class="same"
              data-click-copy="#addr-{{i}}"
              data-click-copy-source="#owner"
              data-click-copy-params="zip&city"></button>
          </div>
        </div>
      </div>`);

    const buttons = container.querySelectorAll('.same');
    await click(buttons[1]);

    const zips = container.querySelectorAll<HTMLInputElement>('.zip');
    const cities = container.querySelectorAll<HTMLInputElement>('.city');
    // 2行目だけに複写される。
    expect(zips[1].value).toBe('1000001');
    expect(cities[1].value).toBe('千代田');
    expect(zips[0].value).toBe('');
    expect(cities[0].value).toBe('');
  });

  it('行ごとのフェッチ状態の注入先を式で指定できる', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ok: true}), {
        headers: {'Content-Type': 'application/json'},
      })) as unknown as typeof fetch;

    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <button class="load"
              data-click-fetch="https://example.com/ok.json"
              data-click-bind="#sink-{{i}}"
              data-click-fetch-state="#state-{{i}}"></button>
            <div id="sink-{{i}}"></div>
            <div id="state-{{i}}"><span class="status">{{_fetch.status}}</span></div>
          </div>
        </div>
      </div>`);

    await click(container.querySelectorAll('.load')[0], 8);

    expect(text('#state-0 .status')).toBe('success');
    expect(text('#state-1 .status')).toBe('');
  });

  it('行コンテナのセレクタを式で指定できる（行追加）', async () => {
    await render(`
      <div data-bind='{"key":"a","rows":[{"n":1}]}'>
        <div id="list-a" data-each="rows"><div><span class="n">{{n}}</span></div></div>
        <button id="add" data-click-row-add="#list-{{key}}"></button>
      </div>`);

    expect(container.querySelectorAll('#list-a > div').length).toBe(1);

    await click(container.querySelector('#add')!);

    expect(container.querySelectorAll('#list-a > div').length).toBe(2);
  });

  it('行ごとのフォームを式で指定できる', async () => {
    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <form id="addr-{{i}}">
              <input class="zip" name="zip" type="text" value="zip-{{i}}">
            </form>
            <button class="send"
              data-click-form="#addr-{{i}}"
              data-click-bind="#sink-{{i}}"></button>
            <div id="sink-{{i}}"><span class="value">{{zip}}</span></div>
          </div>
        </div>
      </div>`);

    await click(container.querySelectorAll('.send')[1]);

    // 2行目のフォーム値だけが収集され、2行目のスコープへ反映される。
    expect(text('#sink-1 .value')).toBe('zip-1');
    expect(text('#sink-0 .value')).toBe('');
  });

  it('行ごとの値調整の対象を式で指定できる', async () => {
    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <input class="qty" id="qty-{{i}}" type="number" value="1">
            <button class="plus"
              data-click-adjust="#qty-{{i}}"
              data-click-adjust-value="2"></button>
          </div>
        </div>
      </div>`);

    await click(container.querySelectorAll('.plus')[0]);

    const inputs = container.querySelectorAll<HTMLInputElement>('.qty');
    expect(inputs[0].value).toBe('3');
    expect(inputs[1].value).toBe('1');
  });

  it('行ごとのリセット対象を式で指定できる', async () => {
    const reset = vi.spyOn(Form, 'reset').mockResolvedValue(undefined);

    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <form id="addr-{{i}}"><input name="zip" type="text"></form>
            <button class="clear" data-click-reset="#addr-{{i}}"></button>
          </div>
        </div>
      </div>`);

    await click(container.querySelectorAll('.clear')[1]);

    expect(reset).toHaveBeenCalledTimes(1);
    const target = reset.mock.calls[0][0].getTarget();
    expect(target.id).toBe('addr-1');
  });

  it('行ごとのダイアログを式で指定できる', async () => {
    // jsdom は <dialog> の showModal を実装しないため、呼び出し対象で確認する。
    const open = vi.spyOn(Haori, 'openDialog').mockResolvedValue(undefined);

    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <button class="detail" data-click-open="#dialog-{{i}}"></button>
            <dialog id="dialog-{{i}}"></dialog>
          </div>
        </div>
      </div>`);

    await click(container.querySelectorAll('.detail')[1]);

    expect(open).toHaveBeenCalledTimes(1);
    expect((open.mock.calls[0][0] as HTMLElement).id).toBe('dialog-1');
  });

  it('行ごとの履歴フォームを式で指定できる', async () => {
    const pushState = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => undefined);

    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <form id="search-{{i}}">
              <input name="q" type="text" value="row-{{i}}">
            </form>
            <button class="go"
              data-click-history="/search"
              data-click-history-form="#search-{{i}}"></button>
          </div>
        </div>
      </div>`);

    await click(container.querySelectorAll('.go')[1]);

    expect(pushState).toHaveBeenCalled();
    const url = String(
      pushState.mock.calls[pushState.mock.calls.length - 1][2],
    );
    expect(url).toContain('q=row-1');
  });

  it('行ごとのスクロール先を式で指定できる', async () => {
    const scrollIntoView = vi.fn();
    (Element.prototype as unknown as {scrollIntoView: unknown}).scrollIntoView =
      scrollIntoView;

    await render(`
      <div data-bind='{"rows":[{},{}]}'>
        <div data-each="rows" data-each-index="i">
          <div>
            <button class="jump"
              data-click-data='{"v":1}'
              data-click-bind="#anchor-{{i}}"
              data-click-scroll="#anchor-{{i}}"></button>
            <div id="anchor-{{i}}"></div>
          </div>
        </div>
      </div>`);

    await click(container.querySelectorAll('.jump')[1]);

    expect(scrollIntoView).toHaveBeenCalled();
    expect((scrollIntoView.mock.instances[0] as HTMLElement).id).toBe(
      'anchor-1',
    );
  });

  it('不正なセレクタは例外にせず、後続のアクションを止めない', async () => {
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

    await render(`
      <div id="src" data-bind='{"copied":"yes"}'></div>
      <div id="sink"><span class="value">{{copied}}</span></div>
      <button id="go"
        data-click-data='{"v":9}'
        data-click-bind="[["
        data-click-copy="#sink"
        data-click-copy-source="#src"
        data-click-copy-params="copied"></button>`);

    await click(container.querySelector('#go')!);

    const messages = error.mock.calls.map(call => String(call[1]));
    expect(messages.some(message => message.includes('Invalid selector'))).toBe(
      true,
    );
    // 不正セレクタで例外にしないため、同じ手続きの copy は実行される。
    expect(text('#sink .value')).toBe('yes');
  });

  it('式が解決できないセレクタは指定なしとして扱う', async () => {
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

    await render(`
      <div id="target"><span class="value">{{v}}</span></div>
      <button id="go" data-click-data='{"v":9}'
        data-click-bind="{{missing}}"></button>`);

    await click(container.querySelector('#go')!);

    // バインド先が無いものとして扱い、例外にもログにもしない。
    expect(text('#target .value')).toBe('');
    const messages = error.mock.calls.map(call => String(call[1]));
    expect(messages.some(message => message.includes('Invalid selector'))).toBe(
      false,
    );
  });

  it('式を含まない静的なセレクタは従来どおり解決する', async () => {
    await render(`
      <div id="target"><span class="value">{{v}}</span></div>
      <button id="go" data-click-data='{"v":9}'
        data-click-bind="#target"></button>`);

    await click(container.querySelector('#go')!);

    expect(text('#target .value')).toBe('9');
  });
});
