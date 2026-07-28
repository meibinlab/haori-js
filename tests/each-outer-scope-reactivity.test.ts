/* @vitest-environment jsdom */
/**
 * @fileoverview `data-each` 行が行外データの更新へ追従することの回帰テスト。
 *
 * `data-each` は要素データが同値なら差分更新を省略するが、行の中に行スコープ外を
 * 参照する式（別の一覧を描画する `data-each` など）がある場合、省略すると行外の
 * 更新が行内へ届かない。報告された「行内の外部キー選択が空のままで、空のまま
 * 送信される」構成を最小化した回帰ガード。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('data-each 行の行外データ追従', () => {
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
    document.body.innerHTML = '';
  });

  it('行内の data-each が後から届いた選択肢を描画する', async () => {
    container.innerHTML = `
      <div id="wrap" data-bind='{"materialList":{"content":[]}}'>
        <form id="f" data-bind='{"materials":[{"material":{"id":""}}]}'>
          <div data-form-list="materials" data-each="materials" data-each-arg="m">
            <div class="row">
              <span data-form-object="material">
                <select name="id"
                        data-each="materialList.content"
                        data-each-arg="opt"
                        data-each-key="id">
                  <option value="" data-each-before>選択</option>
                  <option value="{{opt.id}}"
                          data-attr-selected="{{opt.id === m.material.id}}">{{opt.name}}</option>
                </select>
              </span>
            </div>
          </div>
        </form>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const wrap = container.querySelector('#wrap') as HTMLElement;
    const select = container.querySelector(
      'select[name="id"]',
    ) as HTMLSelectElement;
    // 選択肢がまだ無い状態（data-each-before の 1 件のみ）。
    expect(select.options.length).toBe(1);

    // 一覧だけを後から更新する（行の要素データは変化しない）。
    await Core.setBindingData(wrap, {
      materialList: {
        content: [
          {id: 'a', name: 'A'},
          {id: 'b', name: 'B'},
        ],
      },
    });
    await waitForDomSettled(6);

    const updated = container.querySelector(
      'select[name="id"]',
    ) as HTMLSelectElement;
    expect(
      Array.from(updated.options).map(option => option.value),
    ).toEqual(['', 'a', 'b']);
  });

  it('行内の宣言バインドが行外データの更新で再評価される', async () => {
    container.innerHTML = `
      <div id="wrap" data-bind='{"unit":"円","rows":[{"id":1,"amount":10}]}'>
        <ul data-each="rows" data-each-arg="row" data-each-key="id">
          <li><span class="label">{{row.amount}}{{unit}}</span></li>
        </ul>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const wrap = container.querySelector('#wrap') as HTMLElement;
    expect(container.querySelector('.label')?.textContent?.trim()).toBe('10円');

    // 一覧は同値のまま、行の外にある単位だけを変更する。
    await Core.setBindingData(wrap, {
      unit: 'ドル',
      rows: [{id: 1, amount: 10}],
    });
    await waitForDomSettled();

    expect(container.querySelector('.label')?.textContent?.trim()).toBe(
      '10ドル',
    );
  });

  it('行内の選択が行外データの更新で失われない', async () => {
    container.innerHTML = `
      <div id="wrap" data-bind='{"materialList":{"content":[{"id":"a","name":"A"},{"id":"b","name":"B"}]},"note":""}'>
        <form id="f" data-bind='{"materials":[{"material":{"id":""}}]}'>
          <div data-form-list="materials" data-each="materials" data-each-arg="m">
            <div class="row">
              <span data-form-object="material">
                <select name="id"
                        data-each="materialList.content"
                        data-each-arg="opt"
                        data-each-key="id">
                  <option value="" data-each-before>選択</option>
                  <option value="{{opt.id}}"
                          data-attr-selected="{{opt.id === m.material.id}}">{{opt.name}}</option>
                </select>
              </span>
            </div>
          </div>
        </form>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled(6);

    const wrap = container.querySelector('#wrap') as HTMLElement;
    const form = container.querySelector('#f') as HTMLFormElement;
    const select = container.querySelector(
      'select[name="id"]',
    ) as HTMLSelectElement;
    expect(select.options.length).toBe(3);

    // 利用者の選択操作（change まで）を再現する。
    select.value = 'b';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(4);

    // 行外のデータだけを更新する。
    await Core.setBindingData(wrap, {
      materialList: {
        content: [
          {id: 'a', name: 'A'},
          {id: 'b', name: 'B'},
        ],
      },
      note: '更新',
    });
    await waitForDomSettled(6);

    const updated = container.querySelector(
      'select[name="id"]',
    ) as HTMLSelectElement;
    expect(updated.value).toBe('b');
    expect(Form.getValues(getFrag(form))).toEqual({
      materials: [{material: {id: 'b'}}],
    });
  });
});
