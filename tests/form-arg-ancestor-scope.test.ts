/* @vitest-environment jsdom */
/**
 * @fileoverview 祖先が所有するレコードを `data-form-arg` フォームへ流し込むテスト。
 *
 * `data-form-arg="detail"` を指定したフォームは、祖先の `data-bind` が持つ `detail`
 * キーを入力欄へ反映する。参照キー（式が読むキー）と書込キー（`name` が書き込む
 * キー）が構造的に一致するため、`data-attr-value` を編集可能な入力へ使わずに
 * レコードを表示・編集できる。
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

describe('祖先所有レコードの data-form-arg フォームへの流し込み', () => {
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

  const HTML = `
    <div id="state" data-bind='{"detail":{"id":7,"name":"あかね","category":"b"}}'>
      <form id="f" data-form-arg="detail">
        <input id="name" name="name" type="text">
        <select id="category" name="category">
          <option value=""></option>
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
        <span id="label">{{detail.id}}</span>
      </form>
    </div>`;

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

  it('初期表示で祖先のレコードが入力欄へ入る', async () => {
    container.innerHTML = HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const name = container.querySelector('#name') as HTMLInputElement;
    const category = container.querySelector('#category') as HTMLSelectElement;

    expect(name.value).toBe('あかね');
    expect(category.value).toBe('b');
  });

  it('祖先の更新で別のレコードへ入れ替わる', async () => {
    container.innerHTML = HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const state = container.querySelector('#state') as HTMLElement;
    const name = container.querySelector('#name') as HTMLInputElement;
    const category = container.querySelector('#category') as HTMLSelectElement;

    // 1 件目を編集して双方向コミットを起こす（フォーム自身にコピーができる）。
    await edit(name, 'あおい');
    expect(name.value).toBe('あおい');

    // 一覧の別の行を選び直したときに相当する祖先の更新。
    await Core.setBindingData(state, {
      detail: {id: 9, name: 'きい', category: 'a'},
    });
    await waitForDomSettled(3);
    await Queue.wait();

    // 前の行の編集が残らず、新しいレコードが入る。
    expect(name.value).toBe('きい');
    expect(category.value).toBe('a');
  });

  it('祖先の更新でフォーム自身のコピーが解除され、式と入力欄が一致する', async () => {
    container.innerHTML = HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const state = container.querySelector('#state') as HTMLElement;
    const form = container.querySelector('#f') as HTMLFormElement;
    const name = container.querySelector('#name') as HTMLInputElement;
    const label = container.querySelector('#label') as HTMLElement;

    await edit(name, 'あおい');
    // 双方向コミットでフォーム自身が当該キーを持つ（祖先をシャドーする）。
    expect(Core.getBindingData(form)).toMatchObject({
      detail: {name: 'あおい'},
    });

    await Core.setBindingData(state, {
      detail: {id: 9, name: 'きい', category: 'a'},
    });
    await waitForDomSettled(3);
    await Queue.wait();

    // シャドーが解除され、式の参照結果も新しいレコードになる。
    const raw = Core.getBindingData(form);
    expect(raw === null || !('detail' in raw)).toBe(true);
    expect(label.textContent).toBe('9');
    expect(name.value).toBe('きい');
  });

  it('コミットしても入力欄に無いフィールドが式から参照できる', async () => {
    container.innerHTML = HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const name = container.querySelector('#name') as HTMLInputElement;
    const label = container.querySelector('#label') as HTMLElement;
    expect(label.textContent).toBe('7');

    await edit(name, 'あおい');

    // `id` は入力欄に対応しないが、祖先の値を土台にするため残る。
    expect(label.textContent).toBe('7');
    expect(
      Core.getBindingData(container.querySelector('#f') as HTMLFormElement),
    ).toMatchObject({detail: {id: 7, name: 'あおい'}});
  });

  it('値が変わらない祖先の更新では確定済みの編集を巻き戻さない', async () => {
    container.innerHTML = HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const state = container.querySelector('#state') as HTMLElement;
    const name = container.querySelector('#name') as HTMLInputElement;

    await edit(name, 'あおい');

    // 当該キーの値は変えず、別のキーだけを追加する更新。
    await Core.setBindingData(state, {
      detail: {id: 7, name: 'あかね', category: 'b'},
      other: 1,
    });
    await waitForDomSettled(3);
    await Queue.wait();

    // 祖先の `detail` は変化していないため、編集は残る。
    expect(name.value).toBe('あおい');
  });

  it('間に同名キーを持つ要素があれば近い方が権威になる', async () => {
    container.innerHTML = `
      <div id="outer" data-bind='{"detail":{"name":"外側"}}'>
        <div id="inner" data-bind='{"detail":{"name":"内側"}}'>
          <form data-form-arg="detail">
            <input id="name" name="name" type="text">
          </form>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const outer = container.querySelector('#outer') as HTMLElement;
    const name = container.querySelector('#name') as HTMLInputElement;
    expect(name.value).toBe('内側');

    // 外側の更新は内側にシャドーされているため入力欄へ届かない。
    await Core.setBindingData(outer, {detail: {name: '外側の更新'}});
    await waitForDomSettled(3);
    await Queue.wait();
    expect(name.value).toBe('内側');
  });

  it('data-each の行データは流し込みの対象外', async () => {
    container.innerHTML = `
      <div id="list" data-bind='{"rows":[{"detail":{"name":"行の値"}}]}'>
        <div data-each="rows">
          <div>
            <form data-form-arg="detail">
              <input name="name" type="text">
            </form>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled(5);
    await Queue.wait();

    const input = container.querySelector(
      'form[data-form-arg] input',
    ) as HTMLInputElement;
    // 行データの書き戻しは `data-form-list` の役割のため、ここでは反映しない。
    expect(input.value).toBe('');
  });

  it('リセットは祖先のレコードへ戻し、フォーム自身のコピーを残さない', async () => {
    container.innerHTML = HTML;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#f') as HTMLFormElement;
    const name = container.querySelector('#name') as HTMLInputElement;

    await edit(name, 'あおい');
    expect(name.value).toBe('あおい');

    await Form.reset(getFrag(form));
    await waitForDomSettled(5);
    await Queue.wait();

    // 初期状態＝祖先が持つレコードの内容へ戻る。
    expect(name.value).toBe('あかね');
    const raw = Core.getBindingData(form);
    expect(raw === null || !('detail' in raw)).toBe(true);
  });

  it('送信後の編集は祖先へのバインド応答で巻き戻らない', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    globalThis.fetch = (async () => {
      await gate;
      return new Response(
        JSON.stringify({detail: {id: 7, name: 'サーバ値', category: 'b'}}),
        {headers: {'Content-Type': 'application/json'}},
      );
    }) as unknown as typeof fetch;

    container.innerHTML = `
      <div id="state" data-bind='{"detail":{"id":7,"name":"あかね","category":"b"}}'>
        <form id="f" data-form-arg="detail">
          <input id="name" name="name" type="text">
          <input id="memo" name="memo" type="text">
        </form>
        <button id="save" data-click-fetch="https://example.com/save.json"
          data-click-bind="#state"></button>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const memo = container.querySelector('#memo') as HTMLInputElement;
    const save = container.querySelector('#save') as HTMLButtonElement;

    save.dispatchEvent(new Event('click', {bubbles: true}));
    await waitForDomSettled(3);

    // 応答が届く前に別の欄を編集する。
    await edit(memo, '送信後の入力');

    release!();
    await waitForDomSettled(8);
    await Queue.wait();

    const name = container.querySelector('#name') as HTMLInputElement;
    // 応答は送信時点の内容なので、送信後の編集より古い情報として扱う。
    expect(memo.value).toBe('送信後の入力');
    expect(name.value).toBe('サーバ値');
    expect(Form.getValues(getFrag(container.querySelector('#f')!))).toMatchObject(
      {name: 'サーバ値', memo: '送信後の入力'},
    );
  });
});
