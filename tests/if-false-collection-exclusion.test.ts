/* @vitest-environment jsdom */
/**
 * @fileoverview `data-if` が偽の分岐で収集から除外されたキーの扱いのテスト。
 *
 * 収集値はバインドデータへ**重ねる**ため、除外したキーは土台の値のまま残りかねません。
 * 残ると、表示条件から外れた項目が保存値・送信データに乗り、業務的に誤ったデータが
 * サーバへ届きます（電灯の契約に力率が付く、一般家庭の顧客に代表者情報が付く）。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「双方向バインディングの自動更新」「**`data-if` が偽の分岐で収集から除外されたキーは、土台からも
 *   落とします。** 重ね合わせが引き継ぐのは「どの入力欄も表していないキー」だけです」
 * - 仕様「双方向バインディングの自動更新」「落ちるのは**収集が行われた時点**です。分岐を隠す操作そのものの収集は
 *   `data-if` の再評価より前に走るため … 次の収集 … で落ちます」
 * - 仕様「`data-if-false` 分岐とフォーム送信」「`data-if-false` 属性を持つ要素とその配下を**収集対象から除外**します」
 * - 仕様「双方向バインディングの自動更新」「収集値は現在のバインドデータへ重ねます（置き換えません）」
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';

import {waitForIdle} from './helpers/async';

describe('data-if で収集から除外されたキー', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher();
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    document.body.innerHTML = '';
  });

  /**
   * 入力欄へ値を入れて確定します。
   *
   * @param element 対象の入力欄
   * @param value 入れる値
   * @returns 確定と再評価の完了 Promise
   */
  const commit = async (
    element: HTMLInputElement | HTMLSelectElement,
    value: string,
  ): Promise<void> => {
    element.value = value;
    element.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();
  };

  it('非表示になった分岐のキーは、次の収集でバインドデータから落ちる（回帰）', async () => {
    container.innerHTML =
      '<form id="f" data-bind=\'{"kind":"corp","ownerName":"","memo":""}\'>' +
      '<select name="kind" id="kind">' +
      '<option value="corp">法人</option>' +
      '<option value="home">一般家庭</option>' +
      '</select>' +
      '<div data-if="kind === \'corp\'">' +
      '<input name="ownerName" id="owner"></div>' +
      '<input name="memo" id="memo">' +
      '</form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    await commit(
      document.getElementById('owner') as HTMLInputElement,
      '山田 太郎',
    );
    expect(Core.getBindingData(form)).toMatchObject({ownerName: '山田 太郎'});

    // 分岐を隠す。仕様「双方向バインディングの自動更新」のとおり、この操作の収集自体は再評価より前に走るため
    // まだ表示中の値を集める。
    await commit(document.getElementById('kind') as HTMLSelectElement, 'home');
    expect(
      form.querySelector('div[data-if]')!.hasAttribute('data-if-false'),
    ).toBe(true);

    // 次の収集（別の欄の確定）で落ちる。
    await commit(document.getElementById('memo') as HTMLInputElement, 'めも');

    expect(Core.getBindingData(form)).toEqual({
      kind: 'home',
      memo: 'めも',
    });
  });

  it('行の中の非表示になった分岐のキーも落ちる（回帰）', async () => {
    container.innerHTML =
      '<form id="f" data-bind=\'{"memo":"","contracts":' +
      '[{"kind":"power","powerFactor":""},{"kind":"power","powerFactor":""}]}\'>' +
      '<input name="memo" id="memo">' +
      '<div data-form-list="contracts" data-each="contracts"' +
      ' data-each-arg="c" data-each-index="i">' +
      '<div class="row">' +
      '<select name="kind" data-attr-id="kind-{{i}}">' +
      '<option value="power">動力</option>' +
      '<option value="light">電灯</option>' +
      '</select>' +
      '<div data-if="c.kind === \'power\'">' +
      '<input name="powerFactor" data-attr-id="pf-{{i}}"></div>' +
      '</div></div></form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    await commit(document.getElementById('pf-0') as HTMLInputElement, '85');
    await commit(
      document.getElementById('kind-0') as HTMLSelectElement,
      'light',
    );
    await commit(document.getElementById('memo') as HTMLInputElement, 'めも');

    // 隠れた行だけが落ちる。表示中の行はそのまま。
    expect((Core.getBindingData(form) ?? {}).contracts).toEqual([
      {kind: 'light'},
      {kind: 'power', powerFactor: ''},
    ]);
  });

  it('非表示分岐が data-form-object を丸ごと含む場合もキーが落ちる（回帰）', async () => {
    container.innerHTML =
      '<form id="f" data-bind=\'{"kind":"corp","owner":{"name":""},"memo":""}\'>' +
      '<select name="kind" id="kind">' +
      '<option value="corp">法人</option>' +
      '<option value="home">一般家庭</option>' +
      '</select>' +
      '<div data-if="kind === \'corp\'">' +
      '<div data-form-object="owner"><input name="name" id="owner"></div>' +
      '</div>' +
      '<input name="memo" id="memo">' +
      '</form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    await commit(
      document.getElementById('owner') as HTMLInputElement,
      '山田 太郎',
    );
    expect(Core.getBindingData(form)).toMatchObject({
      owner: {name: '山田 太郎'},
    });

    await commit(document.getElementById('kind') as HTMLSelectElement, 'home');
    await commit(document.getElementById('memo') as HTMLInputElement, 'めも');

    expect(Core.getBindingData(form)).toEqual({kind: 'home', memo: 'めも'});
  });

  it('data-form-object の配下がすべて非表示になった場合もキーが落ちる（回帰）', async () => {
    // `data-form-object` は表示されたまま、その配下の宣言がすべて非表示になる形。
    // 収集値にはそのキー自体が現れないため、子の階層へ除外を控えても重ね合わせには
    // 届かない。キー全体が除外されたものとして親の階層へ控える必要がある。
    container.innerHTML =
      '<form id="f" data-bind=\'{"kind":"corp","owner":{"name":""},"memo":""}\'>' +
      '<select name="kind" id="kind">' +
      '<option value="corp">法人</option>' +
      '<option value="home">一般家庭</option>' +
      '</select>' +
      '<div data-form-object="owner">' +
      '<div data-if="kind === \'corp\'"><input name="name" id="owner"></div>' +
      '</div>' +
      '<input name="memo" id="memo">' +
      '</form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    await commit(
      document.getElementById('owner') as HTMLInputElement,
      '山田 太郎',
    );
    expect(Core.getBindingData(form)).toMatchObject({
      owner: {name: '山田 太郎'},
    });

    await commit(document.getElementById('kind') as HTMLSelectElement, 'home');
    await commit(document.getElementById('memo') as HTMLInputElement, 'めも');

    expect(Core.getBindingData(form)).toEqual({kind: 'home', memo: 'めも'});
  });

  it('どの入力欄も表さないキーは重ね合わせで引き継ぐ', async () => {
    // 重ね合わせの目的（`id` や表示専用のラベルを失わない）は保たれる。除外の対象は
    // 「宣言があるのに収集値に無いキー」だけで、宣言の無いキーには及ばない。
    container.innerHTML =
      '<form id="f" data-bind=\'{"id":7,"label":"表示用","kind":"corp",' +
      '"ownerName":"","memo":""}\'>' +
      '<select name="kind" id="kind">' +
      '<option value="corp">法人</option>' +
      '<option value="home">一般家庭</option>' +
      '</select>' +
      '<div data-if="kind === \'corp\'">' +
      '<input name="ownerName" id="owner"></div>' +
      '<span>{{label}}</span>' +
      '<input name="memo" id="memo">' +
      '</form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    await commit(
      document.getElementById('owner') as HTMLInputElement,
      '山田 太郎',
    );
    await commit(document.getElementById('kind') as HTMLSelectElement, 'home');
    await commit(document.getElementById('memo') as HTMLInputElement, 'めも');

    expect(Core.getBindingData(form)).toEqual({
      id: 7,
      label: '表示用',
      kind: 'home',
      memo: 'めも',
    });
    expect(container.querySelector('span')!.textContent).toBe('表示用');
  });
});
