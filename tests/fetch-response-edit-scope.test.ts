/* @vitest-environment jsdom */
/**
 * @fileoverview 取得の応答の反映が、ユーザー編集の印を解除する範囲の検証。
 *
 * 応答の反映で印を解除するのは、その応答で値が決まる欄（宣言バインドが応答の
 * キーを参照する欄）だけです。応答と関係のない欄の入力は、宣言バインドの評価結果
 * （既定値など）へ戻りません。
 *
 * 期待値の根拠は仕様「ユーザー編集と宣言バインドの権威」。応答を止めたまま入力する
 * ため、fetch は解決関数を控えるモックにする（ネットワークの遅延を模したもので、
 * 内部メソッドを直接呼ぶ人工的な状態は作らない）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {Observer} from '../src/observer';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('取得の応答が編集の印を解除する範囲', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  /** 応答を止めている取得の解決関数（要求順） */
  let pending: ((response: Response) => void)[];

  beforeEach(() => {
    Observer.getDispatcher()?.stop();
    container = document.createElement('div');
    pending = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          pending.push(resolve);
        }) as unknown as Promise<Response>,
    );
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(async () => {
    pending.forEach(resolve => resolve(jsonResponse({})));
    await waitForIdle();
    dispatcher.stop();
    vi.restoreAllMocks();
    container.remove();
  });

  /**
   * JSON の応答を作ります。
   *
   * @param body 応答の本文
   * @returns 応答
   */
  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      headers: {'Content-Type': 'application/json'},
    });
  }

  /**
   * HTML を組み立ててから走査し、描画の完了まで待ちます。
   *
   * @param html container に設定する HTML
   * @returns 待機完了の Promise
   */
  async function mount(html: string): Promise<void> {
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
    await waitForIdle();
  }

  /**
   * 入力欄へ打ったものとして値を変え、`input` と `change` を発火します。
   *
   * @param id 入力欄の id
   * @param value 入力する値
   * @returns 戻り値はない。
   */
  function type(id: string, value: string): void {
    const input = document.getElementById(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }

  /**
   * ボタンを押して取得を要求し、応答を返して反映の完了まで待ちます。
   *
   * @param id ボタンの id
   * @param body 応答の本文
   * @returns 待機完了の Promise
   */
  async function fetchAndRespond(id: string, body: unknown): Promise<void> {
    (document.getElementById(id) as HTMLElement).click();
    await waitForCondition(() => pending.length === 1, {
      description: '取得の要求',
    });
    pending.shift()!(jsonResponse(body));
    await waitForIdle();
  }

  /**
   * 入力欄の値を返します。
   *
   * @param id 入力欄の id
   * @returns 値
   */
  function valueOf(id: string): string {
    return (document.getElementById(id) as HTMLInputElement).value;
  }

  it('応答と関係のない既定値の欄に入力した値は、祖先への反映で戻らない', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「応答の反映が印を解除するのは、
    // その応答で値が決まる欄だけです」
    await mount(`
      <div id="area" data-bind='{"list":[]}'>
        <form data-bind='{"other":""}'>
          <input id="i" name="x" data-attr-value="{{ '既定' }}">
        </form>
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">更新</button>
      </div>`);
    type('i', '手入力');
    await waitForIdle();
    await fetchAndRespond('b', {list: [1]});
    expect(valueOf('i')).toBe('手入力');
  });

  it('応答と関係のない既定値の欄に入力した値は、フォームへの反映で戻らない', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「応答の反映が印を解除するのは、
    // その応答で値が決まる欄だけです」
    await mount(`
      <form id="f" data-bind='{"other":""}'>
        <input id="i" name="x" data-attr-value="{{ '既定' }}">
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#f">更新</button>
      </form>`);
    type('i', '手入力');
    await waitForIdle();
    await fetchAndRespond('b', {other: '更新'});
    expect(valueOf('i')).toBe('手入力');
  });

  it('宣言バインドが応答を参照する欄は、要求より前の入力を応答の値へ戻す', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「宣言バインドがその応答のキーを
    // 参照する欄」「リクエストを組み立てた時点までの編集」
    await mount(`
      <div id="area" data-bind='{"rec":{"x":"旧"}}'>
        <input id="i" name="x" data-attr-value="{{ rec.x }}">
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">更新</button>
      </div>`);
    type('i', '手入力');
    await waitForIdle();
    await fetchAndRespond('b', {rec: {x: '新'}});
    expect(valueOf('i')).toBe('新');
  });

  it('value 属性の式が応答を参照する欄も、要求より前の入力を応答の値へ戻す', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「`value` / `checked` /
    // `selected` の式」
    await mount(`
      <div id="area" data-bind='{"rec":{"x":"旧"}}'>
        <input id="i" name="x" value="{{ rec.x }}">
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">更新</button>
      </div>`);
    type('i', '手入力');
    await waitForIdle();
    await fetchAndRespond('b', {rec: {x: '新'}});
    expect(valueOf('i')).toBe('新');
  });

  it('チェックの宣言が応答を参照する欄は、要求より前の操作を応答の値へ戻す', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「`value` / `checked` /
    // `selected` の式と `data-attr-value` / `data-attr-checked` /
    // `data-attr-selected`」
    await mount(`
      <div id="area" data-bind='{"rec":{"on":false}}'>
        <input id="c" type="checkbox" name="on" value="true"
          data-attr-checked="{{ rec.on }}">
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">更新</button>
      </div>`);
    const box = document.getElementById('c') as HTMLInputElement;
    box.click();
    await waitForIdle();
    box.click();
    await waitForIdle();
    expect(box.checked).toBe(false);
    await fetchAndRespond('b', {rec: {on: true}});
    expect(box.checked).toBe(true);
  });

  it('途中の要素が同じ名前を持つ欄は、応答を参照しないものとして入力を残す', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「途中の要素が同じ名前を自分で
    // 持つ場合は除きます」
    await mount(`
      <div id="area" data-bind='{"rec":{"x":"旧"}}'>
        <form data-bind='{"rec":{"x":"自身"}}'>
          <input id="i" name="y" data-attr-value="{{ rec.x }}">
        </form>
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">更新</button>
      </div>`);
    type('i', '手入力');
    await waitForIdle();
    await fetchAndRespond('b', {rec: {x: '新'}});
    expect(valueOf('i')).toBe('手入力');
  });

  it('一覧を取り直すと、行の要素データを参照する欄は応答の値になる', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「`data-each` の行の変数は、その
    // `data-each` の式が応答のキーを参照していれば、参照しているとみなします」
    await mount(`
      <div id="area" data-bind='{"items":[{"id":1,"name":"旧"}]}'>
        <div data-each="items" data-each-arg="item" data-each-key="id">
          <div><input class="row" name="name"
            data-attr-value="{{ item.name }}"></div>
        </div>
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">取り直す</button>
      </div>`);
    const row = (): HTMLInputElement =>
      container.querySelector('.row') as HTMLInputElement;
    row().id = 'r';
    type('r', '手入力');
    await waitForIdle();
    await fetchAndRespond('b', {items: [{id: 1, name: '新'}]});
    expect(row().value).toBe('新');
  });

  it('応答を参照しない一覧の行に入力した値は、その応答の反映で戻らない', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「`data-each` の行の変数は、その
    // `data-each` の式が応答のキーを参照していれば、参照しているとみなします」。
    // 行の外の値（`suffix`）も参照させ、祖先の更新で行を評価し直させる（行の値だけを
    // 参照する行は、要素データが同じなら評価し直されない）。
    await mount(`
      <div id="area" data-bind='{"items":[],"other":""}'>
        <div data-bind='{"local":[{"id":1,"name":"旧"}],"suffix":""}'>
          <div data-each="local" data-each-arg="item" data-each-key="id">
            <div><input class="row" name="name"
              data-attr-value="{{ item.name + suffix }}"></div>
          </div>
        </div>
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">更新</button>
      </div>`);
    const row = (): HTMLInputElement =>
      container.querySelector('.row') as HTMLInputElement;
    row().id = 'r';
    type('r', '手入力');
    await waitForIdle();
    await fetchAndRespond('b', {items: [{id: 1, name: '別'}]});
    expect(row().value).toBe('手入力');
  });

  it('option の選択が応答を参照する select は、要求より前の選択を応答の値へ戻す', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「`option` の `selected` 属性も
    // 同じです」と、「宣言バインドがその応答のキーを参照する欄」
    await mount(`
      <div id="area" data-bind='{"rec":{"x":"A"}}'>
        <select id="s" name="y">
          <option value="A" data-attr-selected="{{ rec.x === 'A' }}">A</option>
          <option value="B" data-attr-selected="{{ rec.x === 'B' }}">B</option>
          <option value="C" data-attr-selected="{{ rec.x === 'C' }}">C</option>
        </select>
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">更新</button>
      </div>`);
    type('s', 'B');
    await waitForIdle();
    await fetchAndRespond('b', {rec: {x: 'C'}});
    expect(valueOf('s')).toBe('C');
  });

  it('選択肢の値だけが応答を参照する select は、選んだ値を既定値へ戻さない', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「`option` の選択は所属する
    // `<select>` の印を解除します」。`option` の `value` は選択を決めないため、
    // `<select>` の既定値（定数）は応答と関係のない宣言である。
    await mount(`
      <div id="area" data-bind='{"rec":{"a":"A","b":"B"}}'>
        <select id="s" name="y" data-attr-value="{{ 'A' }}">
          <option value="{{ rec.a }}">A</option>
          <option value="{{ rec.b }}">B</option>
        </select>
        <button id="b" type="button" data-click-fetch="/c"
          data-click-bind="#area">更新</button>
      </div>`);
    type('s', 'B');
    await waitForIdle();
    await fetchAndRespond('b', {rec: {a: 'A', b: 'B'}});
    expect(valueOf('s')).toBe('B');
  });
});
