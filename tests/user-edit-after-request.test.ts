/* @vitest-environment jsdom */
/**
 * @fileoverview 送信後のユーザー編集が遅延応答で巻き戻らないことの回帰テスト。
 *
 * フェッチの応答はリクエストを組み立てた時点の内容を反映したものなので、その後に
 * 行われた編集より古い。そのままフォームへバインドすると、利用者の入力が画面からも
 * 収集値からも静かに消える。バインドデータの段階で編集分を上書きし直すことで、
 * 入力欄への書き戻しと宣言バインドの再評価の双方が最新の状態になる。
 *
 * 期待値の根拠は仕様「送信後に行われた編集の保護」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import EventDispatcher from '../src/event_dispatcher';
import Queue from '../src/queue';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('送信後のユーザー編集の保護', () => {
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
    document.body.innerHTML = '';
  });

  /**
   * 応答を任意のタイミングまで保留できるフェッチを差し込みます。
   *
   * @param body 応答の JSON 本文
   * @returns 応答を返すための解放関数
   */
  const gateFetch = (body: unknown): (() => void) => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    globalThis.fetch = (async () => {
      await gate;
      return new Response(JSON.stringify(body), {
        headers: {'Content-Type': 'application/json'},
      });
    }) as unknown as typeof fetch;
    return release!;
  };

  const FORM_HTML = `
    <form id="f" data-bind='{"name":"","code":"","materials":[{"material":{"id":""},"amount":null}]}'>
      <input id="name" name="name" type="text"
             data-change-fetch="/recalc.json" data-change-bind="#f">
      <input id="code" name="code" type="text">
      <div data-form-list="materials">
        <div class="row">
          <span data-form-object="material">
            <select id="sel" name="id">
              <option value="">選択</option>
              <option value="a">A</option>
              <option value="b">B</option>
            </select>
          </span>
          <input class="amount" type="number" name="amount">
        </div>
      </div>
    </form>`;

  it('応答より後に編集した入力欄は巻き戻らない', async () => {
    const release = gateFetch({
      name: 'foo',
      code: 'X-001',
      materials: [{material: {id: ''}, amount: null}],
    });
    container.innerHTML = FORM_HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#f') as HTMLFormElement;
    const name = container.querySelector('#name') as HTMLInputElement;
    const select = container.querySelector('#sel') as HTMLSelectElement;

    // 1) 直前の項目を編集する（フェッチ開始・応答は保留）。
    name.value = 'foo';
    name.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);

    // 2) 応答前に別の入力欄を編集する。
    select.value = 'b';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);

    // 3) 送信時点の内容を反映した応答が届く。
    release();
    await waitForDomSettled(8);
    await Queue.wait();

    expect(select.value).toBe('b');
    expect(getFrag(select).getValue()).toBe('b');
    expect(Form.getValues(getFrag(form))).toEqual({
      name: 'foo',
      // 編集していない項目にはサーバの値が反映される。
      code: 'X-001',
      materials: [{material: {id: 'b'}, amount: null}],
    });
  });

  it('送信前の編集は応答の値で上書きされる', async () => {
    const release = gateFetch({
      name: 'FOO',
      code: '',
      materials: [{material: {id: ''}, amount: null}],
    });
    container.innerHTML = FORM_HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#f') as HTMLFormElement;
    const name = container.querySelector('#name') as HTMLInputElement;

    // 送信のきっかけになった編集はリクエストに含まれるので、応答が権威。
    name.value = 'foo';
    name.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);

    release();
    await waitForDomSettled(8);
    await Queue.wait();

    expect(name.value).toBe('FOO');
    expect(Form.getValues(getFrag(form))).toMatchObject({name: 'FOO'});
  });

  it('編集が無ければ応答がそのまま反映される', async () => {
    const release = gateFetch({
      name: 'foo',
      code: 'X-002',
      materials: [{material: {id: 'a'}, amount: 3}],
    });
    container.innerHTML = FORM_HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#f') as HTMLFormElement;
    const name = container.querySelector('#name') as HTMLInputElement;
    const select = container.querySelector('#sel') as HTMLSelectElement;

    name.value = 'foo';
    name.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);

    release();
    await waitForDomSettled(8);
    await Queue.wait();

    expect(select.value).toBe('a');
    expect(Form.getValues(getFrag(form))).toEqual({
      name: 'foo',
      code: 'X-002',
      materials: [{material: {id: 'a'}, amount: 3}],
    });
  });

  it('宣言バインドで選択状態を決める select でも巻き戻らない', async () => {
    const release = gateFetch({
      name: 'foo',
      materials: [{material: {id: ''}, amount: null}],
    });
    container.innerHTML = `
      <div id="wrap" data-bind='{"materialList":{"content":[{"id":"a","name":"A"},{"id":"b","name":"B"}]}}'>
        <form id="f" data-bind='{"name":"","materials":[{"material":{"id":""},"amount":null}]}'>
          <input id="name" name="name" type="text"
                 data-change-fetch="/recalc.json" data-change-bind="#f">
          <div data-form-list="materials" data-each="materials" data-each-arg="m">
            <div class="row">
              <span data-form-object="material">
                <select name="id" data-each="materialList.content"
                        data-each-arg="opt" data-each-key="id">
                  <option value="" data-each-before>選択</option>
                  <option value="{{opt.id}}"
                          data-attr-selected="{{opt.id === m.material.id}}">{{opt.name}}</option>
                </select>
              </span>
              <input class="amount" type="number" name="amount" value="{{m.amount}}">
            </div>
          </div>
        </form>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled(6);

    const form = container.querySelector('#f') as HTMLFormElement;
    const name = container.querySelector('#name') as HTMLInputElement;

    name.value = 'foo';
    name.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);

    const select = container.querySelector(
      'select[name="id"]',
    ) as HTMLSelectElement;
    select.value = 'b';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);

    release();
    await waitForDomSettled(8);
    await Queue.wait();

    const updated = container.querySelector(
      'select[name="id"]',
    ) as HTMLSelectElement;
    expect(updated.value).toBe('b');
    expect(Form.getValues(getFrag(form))).toEqual({
      name: 'foo',
      materials: [{material: {id: 'b'}, amount: null}],
    });
  });

  it('ラジオグループは同名の兄弟ごと保護される', async () => {
    const release = gateFetch({name: 'foo', plan: 'basic'});
    container.innerHTML = `
      <form id="f" data-bind='{"name":"","plan":"basic"}'>
        <input id="name" name="name" type="text"
               data-change-fetch="/recalc.json" data-change-bind="#f">
        <label><input type="radio" name="plan" value="basic" checked>基本</label>
        <label><input id="plus" type="radio" name="plan" value="plus">拡張</label>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#f') as HTMLFormElement;
    const name = container.querySelector('#name') as HTMLInputElement;
    const plus = container.querySelector('#plus') as HTMLInputElement;

    name.value = 'foo';
    name.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);

    plus.checked = true;
    plus.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(3);

    release();
    await waitForDomSettled(8);
    await Queue.wait();

    expect(plus.checked).toBe(true);
    expect(Form.getValues(getFrag(form))).toMatchObject({plan: 'plus'});
  });
});
