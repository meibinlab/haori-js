/* @vitest-environment jsdom */
/**
 * @fileoverview 走査した要素を外部のスクリプトが DOM の中で動かした場合のテスト。
 *
 * 期待値は仕様「監視対象」の「**走査した要素を外部のスクリプトが DOM の中で移したり、
 * 外して後で戻したりしても、宣言は保ちます。** 取り外しを観測しても内部の木
 * （`{{ }}` の式、属性の宣言、`data-each` の行の雛形など）は捨てず、付け直しでは
 * その木をそのまま使います」から取っている。
 *
 * 修正前は、取り外しを観測した時点で内部の木を捨て、付け直しで描画済みの DOM から
 * 作り直していた。`{{ }}` は描いた結果の文字として読み込まれて更新に追従せず、
 * `data-each` は描画済みの行を雛形と余分な子として読み込んで行が増えていた。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Env from '../src/env';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('走査した要素を外部のスクリプトが動かした場合', () => {
  beforeEach(async () => {
    Env.setRuntime('embedded');
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    await Observer.init();
    const host = document.createElement('div');
    host.innerHTML =
      '<form id="root" data-bind=\'{"s": "hello", "rows": [1, 2]}\'>' +
      '<div id="box">' +
      '<p id="txt" title="{{s}}">{{s}}</p>' +
      '<ul id="list" data-each="rows" data-each-arg="r"><li>{{r}}</li></ul>' +
      '<input id="name" name="name" value="taro">' +
      '</div><div id="other"></div></form>';
    document.body.appendChild(host);
    await waitForIdle();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
  });

  /**
   * 指定したセレクタの要素を返します。
   *
   * @param selector セレクタ
   * @returns 要素
   */
  function $(selector: string): HTMLElement {
    return document.querySelector(selector) as HTMLElement;
  }

  /**
   * 一覧の各行の文字を返します。
   *
   * @returns 行の文字の配列
   */
  function rows(): string[] {
    return Array.from($('#list').children).map(li => li.textContent ?? '');
  }

  /**
   * `#root` のバインドデータを更新します。
   */
  async function update(): Promise<void> {
    await Core.setBindingData($('#root'), {s: 'bye', rows: [7, 8, 9]});
    await waitForIdle();
  }

  /**
   * 移した後の表示と、更新への追従を確かめます。
   */
  async function expectPreserved(): Promise<void> {
    expect(rows()).toEqual(['1', '2']);
    await update();
    expect($('#txt').textContent).toBe('bye');
    expect($('#txt').getAttribute('title')).toBe('bye');
    expect(rows()).toEqual(['7', '8', '9']);
  }

  it('同じタスクで別の親へ移しても、宣言を保つ（回帰）', async () => {
    $('#other').appendChild($('#box'));
    await waitForIdle();

    await expectPreserved();
  });

  it('同じ親の中で順番を変えても、宣言を保つ（回帰）', async () => {
    $('#root').appendChild($('#box'));
    await waitForIdle();

    await expectPreserved();
  });

  it('外して後のタスクで戻しても、宣言を保つ（回帰）', async () => {
    const box = $('#box');
    box.remove();
    await waitForIdle();
    $('#root').appendChild(box);
    await waitForIdle();

    await expectPreserved();
  });

  it('移した後も、入力欄の値を 1 度だけ収集する（対照）', async () => {
    $('#other').appendChild($('#box'));
    await waitForIdle();

    const values = Form.getValues(Fragment.get($('#root')) as ElementFragment);
    expect(values).toEqual({name: 'taro'});
  });

  it('外したままの要素の入力欄は収集しない（対照）', async () => {
    $('#box').remove();
    await waitForIdle();

    const values = Form.getValues(Fragment.get($('#root')) as ElementFragment);
    expect(values).toEqual({});
  });
});
