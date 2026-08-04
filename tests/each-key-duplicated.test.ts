/* @vitest-environment jsdom */
/**
 * @fileoverview `data-each-key` の値が配列の中で重複している場合のテスト。
 *
 * キーは一意である前提ですが（仕様「`data-each`」）、重複しても行の数・並び・各行の
 * 要素データが配列どおりになることを確かめます。キーで要素や行を引くと、同じキーの
 * 行がすべて最後の要素のデータを受け取り、行の数も配列と合わなくなります。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「`data-each`」「`data-each-key`: 一意キープロパティ名 … 重複した場合、行と
 *   配列要素の対応付けは**出現順**へ退き … 行の数・並び・各行の要素データは配列
 *   どおりになります。重複を検出すると、開発モードで項目名ごとに一度だけ警告します」
 * - 仕様「行の対応付けと `data-each-key`」「`data-each-key` の値が重複しているとき:
 *   同じキーを持つ行と配列要素は、その範囲の中で**出現順**に対応します」
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';

import {waitForIdle} from './helpers/async';

/** 重複したキー（`id` が 1 の行が 2 つ）を持つ行リスト */
const DUPLICATED =
  '<form id="f" data-bind=\'{"rows":[' +
  '{"id":1,"title":"a"},{"id":1,"title":"b"},{"id":2,"title":"c"}]}\'>' +
  '<div data-form-list="rows" data-each="rows" data-each-arg="r"' +
  ' data-each-key="id">' +
  '<div class="line"><span class="t">{{r.title}}</span>' +
  '<input name="title" data-attr-value="{{r.title}}"></div>' +
  '</div></form>';

describe('data-each-key の値が重複した行リスト', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    Dev.enable();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher();
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * 各行の表示（要素データ由来のテキスト）を取り出します。
   *
   * @returns 行ごとのテキスト
   */
  const texts = (): string[] =>
    Array.from(container.querySelectorAll('.t')).map(
      el => el.textContent ?? '',
    );

  /**
   * 各行の入力値を取り出します。
   *
   * @returns 行ごとの入力値
   */
  const values = (): string[] =>
    Array.from(container.querySelectorAll('input')).map(
      el => (el as HTMLInputElement).value,
    );

  it('行の要素データが出現順で対応する（回帰）', async () => {
    container.innerHTML = DUPLICATED;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    expect(texts()).toEqual(['a', 'b', 'c']);
    expect(values()).toEqual(['a', 'b', 'c']);
  });

  it('重複キーの行が増えても行の数と要素データが配列どおりになる（回帰）', async () => {
    container.innerHTML = DUPLICATED;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    void Core.setBindingData(form, {
      rows: [
        {id: 1, title: 'p'},
        {id: 1, title: 'q'},
        {id: 1, title: 'r'},
        {id: 2, title: 's'},
      ],
    });
    await waitForIdle();

    expect(texts()).toEqual(['p', 'q', 'r', 's']);
  });

  it('重複が解消して行が減っても古い行が残らない（回帰）', async () => {
    container.innerHTML = DUPLICATED;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    void Core.setBindingData(form, {
      rows: [
        {id: 1, title: 'u'},
        {id: 2, title: 'v'},
      ],
    });
    await waitForIdle();

    expect(texts()).toEqual(['u', 'v']);
  });

  it('供給された配列の値が、重複キーでも出現順で入力欄へ書き戻される', async () => {
    // 宣言バインド（`data-attr-value`）を使わない構成。入力欄の値は逆方向同期
    // （`Form.pairRowsWithItems()`）だけで決まる。
    container.innerHTML =
      '<form id="f" data-bind=\'{"rows":[' +
      '{"id":1,"title":"a"},{"id":1,"title":"b"},{"id":2,"title":"c"}]}\'>' +
      '<div data-form-list="rows" data-each="rows" data-each-arg="r"' +
      ' data-each-key="id">' +
      '<div class="line"><input name="title"></div>' +
      '</div></form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(container);
    await waitForIdle();

    expect(values()).toEqual(['a', 'b', 'c']);

    // 行数が変わらない再供給。書き戻しだけで値が決まる。
    void Core.setBindingData(form, {
      rows: [
        {id: 1, title: 'X'},
        {id: 1, title: 'Y'},
        {id: 2, title: 'Z'},
      ],
    });
    await waitForIdle();

    expect(values()).toEqual(['X', 'Y', 'Z']);
  });

  it('重複キーの行を編集すると、その行の配列要素へ入る', async () => {
    container.innerHTML = DUPLICATED;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    const inputs = Array.from(
      container.querySelectorAll('input'),
    ) as HTMLInputElement[];
    inputs[1].value = 'B2';
    inputs[1].dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    expect((Core.getBindingData(form) ?? {}).rows).toEqual([
      {id: 1, title: 'a'},
      {id: 1, title: 'B2'},
      {id: 2, title: 'c'},
    ]);
  });

  it('重複キーの行へのコピーが、その行の配列要素へ入る（回帰）', async () => {
    container.innerHTML =
      '<form id="f" data-bind=\'{"rows":[' +
      '{"id":1,"title":"a"},{"id":1,"title":"b"},{"id":2,"title":"c"}]}\'>' +
      '<div id="owner" data-bind=\'{"title":"COPIED"}\'></div>' +
      '<div data-form-list="rows" data-each="rows" data-each-arg="r"' +
      ' data-each-index="i" data-each-key="id">' +
      '<div id="row-{{i}}">' +
      '<input name="title" data-attr-value="{{r.title}}">' +
      '<button type="button" class="btn" data-click-copy="#row-{{i}}"' +
      ' data-click-copy-source="#owner" data-click-copy-params="title">' +
      'copy</button></div>' +
      '</div></form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(container);
    await waitForIdle();

    // 重複キーの 2 番目の行でコピーを実行する。
    const buttons = Array.from(
      container.querySelectorAll('.btn'),
    ) as HTMLElement[];
    buttons[1].click();
    await waitForIdle();

    expect((Core.getBindingData(form) ?? {}).rows).toEqual([
      {id: 1, title: 'a'},
      {id: 1, title: 'COPIED'},
      {id: 2, title: 'c'},
    ]);
    expect(values()).toEqual(['a', 'COPIED', 'c']);
  });

  /**
   * `each-key` の警告だけを抜き出します。
   *
   * @returns 警告メッセージ
   */
  const keyWarnings = (): string[] =>
    (warn.mock.calls as unknown[][])
      .map(args => args.map(arg => String(arg)).join(' '))
      .filter(message => message.includes('each-key'));

  it('重複を検出すると開発モードで一度だけ警告する', async () => {
    // 警告は項目名ごとに一度だけなので、他のテストが使っていない項目名で組み立てる。
    container.innerHTML =
      '<div id="host" data-bind=\'{"rows":[' +
      '{"code":"x","title":"a"},{"code":"x","title":"b"}]}\'>' +
      '<div data-each="rows" data-each-arg="r" data-each-key="code">' +
      '<div class="line"><span class="t">{{r.title}}</span></div>' +
      '</div></div>';
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(host);
    await waitForIdle();

    // 再描画しても警告は増えない。
    void Core.setBindingData(host, {
      rows: [
        {code: 'x', title: 'p'},
        {code: 'x', title: 'q'},
      ],
    });
    await waitForIdle();

    const messages = keyWarnings();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('重複');
  });

  it('同じ値が並ぶプリミティブ配列でも行の数が配列どおりになる（回帰）', async () => {
    // `data-each-key` が無いプリミティブ配列のリストキーは値そのものなので、同じ値が
    // 並ぶと重複する。値の重複は正当な構成であり、警告の対象ではない。
    container.innerHTML =
      '<div id="host" data-bind=\'{"tags":["a","a","b"]}\'>' +
      '<div data-each="tags" data-each-arg="tag">' +
      '<div class="line"><span class="t">{{tag}}</span></div>' +
      '</div></div>';
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(host);
    await waitForIdle();

    expect(texts()).toEqual(['a', 'a', 'b']);

    void Core.setBindingData(host, {tags: ['a', 'b']});
    await waitForIdle();

    expect(texts()).toEqual(['a', 'b']);
    expect(keyWarnings()).toEqual([]);
  });

  it('キーが一意なら警告しない（対照）', async () => {
    container.innerHTML =
      '<div id="host" data-bind=\'{"rows":[' +
      '{"uid":"p","title":"a"},{"uid":"q","title":"b"}]}\'>' +
      '<div data-each="rows" data-each-arg="r" data-each-key="uid">' +
      '<div class="line"><span class="t">{{r.title}}</span></div>' +
      '</div></div>';
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(host);
    await waitForIdle();

    expect(texts()).toEqual(['a', 'b']);
    expect(keyWarnings()).toEqual([]);
  });
});
