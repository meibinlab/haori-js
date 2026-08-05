/* @vitest-environment jsdom */
/**
 * @fileoverview まだバインドデータへ載っていない編集（`change` の前の `input`、
 * 貼り付け、IME 確定、スクリプトからの代入）が、逆方向同期で消えないことのテスト。
 *
 * 内部値は「バインドデータへ載っている値」を表し、DOM が先に進むことは許されて
 * います。内部値だけを先へ進めると、古いバインドデータを流し込む逆方向同期が
 * 「不一致」と判定して入力欄を上書きし、入力した値が表示からも収集値からも消えます。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「収集は DOM を真とする」「**収集は読み取りに徹し、内部値は書き換えません。**
 *   … ここで内部値を書き換えると、**バインドデータには載っていないのに内部値だけが
 *   新しい**状態が生まれ、続く逆方向同期（フォーム配下の入力欄への書き戻し）が古い
 *   バインドデータと不一致とみなして入力欄を上書きします。その結果、利用者が入力した
 *   値が表示からも収集値からも消えます。DOM の値が内部値・バインドデータへ入るのは、
 *   収集結果がバインドへコミットされ、そこから書き戻される経路だけです」
 * - 同節「**イベントを伴わない値の変更にも追随します。** … 値がバインドデータへ載るのは
 *   収集の契機（`change` による双方向コミット、`data-{event}-form` での送信など）を
 *   通じてであり、**代入した瞬間に反映されるわけではありません**」
 * - 仕様「ユーザー編集と宣言バインドの権威」「番号は **DOM で `change` / `input` が
 *   発火した時点**に発番します」（通番の発番は内部値の同期とは別である）
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';

import {waitForIdle} from './helpers/async';

/**
 * 契約行（取得元＝収集先）の中にオプション行（取得元≠収集先）を持つ構成。
 *
 * 内側の行を編集すると、収集値が外側の行の要素データへ載るため、外側の行に対する
 * 逆方向同期が走ります。このとき外側の入力欄に「まだバインドデータへ載っていない
 * 編集」があると、古い要素データで上書きされる余地が生まれます。
 */
const NESTED =
  '<form id="f" data-bind=\'{"contracts":[{"name":""}],' +
  '"candidates":{"content":[{"id":11},{"id":12}]}}\'>' +
  '<div data-form-list="contracts" data-each="contracts" data-each-arg="c">' +
  '<div class="row">' +
  '<input class="place" name="name">' +
  '<div data-form-list="options" data-each="candidates.content ?? []"' +
  ' data-each-arg="o">' +
  '<div class="opt">' +
  '<input type="checkbox" name="selected" value="true"' +
  ' data-attr-id="chk-{{o.id}}">' +
  '<input type="text" name="staffName" data-attr-id="staff-{{o.id}}">' +
  '</div></div></div></div></form>';

describe('バインドデータへ載っていない編集と逆方向同期', () => {
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
   * 入力欄へ値を入れます。
   *
   * `change` を伴わない場合は、貼り付け・IME 確定・スクリプトからの代入と同じ
   * 「1 回の `input` だけで値が確定する」入力手段を表します。
   *
   * @param input 対象の入力欄
   * @param value 入れる値
   * @param withChange `change` も発火するかどうか
   * @returns 戻り値はありません。
   */
  const put = (
    input: HTMLInputElement,
    value: string,
    withChange = false,
  ): void => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    if (withChange) {
      input.dispatchEvent(new Event('change', {bubbles: true}));
    }
  };

  /**
   * フォームの収集値を返します。
   *
   * @param form 対象のフォーム
   * @returns 収集値
   */
  const collect = (form: HTMLFormElement): Record<string, unknown> =>
    Form.getValues(Fragment.get(form) as ElementFragment) as Record<
      string,
      unknown
    >;

  it('input だけで入れた値が、古い内容の供給で消えない（回帰）', async () => {
    container.innerHTML = NESTED;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    const staff = document.getElementById('staff-11') as HTMLInputElement;
    const place = container.querySelector('.place') as HTMLInputElement;

    // 内側の行のテキストを編集する（`change` を伴う手段）。収集値が外側の行の
    // 要素データへ載るため、以降の更新で外側の行へ逆方向同期が走る。
    put(staff, '担当', true);
    await waitForIdle();

    // 外側の行のテキストへ、1 回の `input` だけで値を入れる（貼り付け・IME 確定）。
    // この時点ではまだバインドデータへ載っていない（載るのは `change` の双方向
    // コミット以降）。
    put(place, '場所A');
    await waitForIdle();
    expect(place.value).toBe('場所A');

    // 候補一覧を絞り込む供給。契約行の要素データは供給前の内容（`name` が空）の
    // ままなので、行へ流し込むと入力した値を潰す余地がある。
    const current = Core.getBindingData(form) ?? {};
    await Core.setBindingData(form, {
      ...current,
      candidates: {content: [{id: 11}]},
    });
    await waitForIdle();

    expect(place.value).toBe('場所A');
    expect((collect(form).contracts as Record<string, unknown>[])[0].name).toBe(
      '場所A',
    );
  });

  it('input だけの編集でも収集値には載る', async () => {
    container.innerHTML = NESTED;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    const place = container.querySelector('.place') as HTMLInputElement;
    put(place, '場所B');
    await waitForIdle();

    // 収集は DOM を真として読むため、`change` を待たずに収集値へ載る。
    expect((collect(form).contracts as Record<string, unknown>[])[0].name).toBe(
      '場所B',
    );
  });

  it('change まで発火した編集はバインドデータへ載る（対照）', async () => {
    container.innerHTML = NESTED;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    const place = container.querySelector('.place') as HTMLInputElement;
    put(place, '場所C', true);
    await waitForIdle();

    const contracts = (Core.getBindingData(form) ?? {}).contracts as Record<
      string,
      unknown
    >[];
    expect(contracts[0].name).toBe('場所C');
  });
});
