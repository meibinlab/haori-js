/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 行への明示的な書き戻し（`data-{event}-copy` で行を指す）が、同じ手続きの起点に
 * なった入力の編集値を巻き戻さないこと、および利用者が操作した入力へも届くことの
 * 回帰テストです。
 *
 * 報告された構成は「住所欄を編集したら『契約者住所と同じ』のチェックを外す」です。
 * 住所欄の `change` で `sameAsCustomerAddress: false` を行データへ書き戻します。
 * 所有者に収集の宣言（`data-form` を持つ `<form>`）が無いため、入力欄の状態は
 * 要素データへ確定しません。読み直した要素データをそのまま土台にすると、
 * コピーしないキー（住所）の編集値が旧値へ巻き戻り、要素データが変わらないために
 * コピーしたキー（チェック）も画面へ届きません。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('行への書き戻しとユーザー編集', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // change の委譲（内部値の同期・ユーザー編集の記録・手続きの実行）を
    // 実ブラウザと同じ経路で通す。
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.innerHTML = '';
  });

  /**
   * 報告された構成を組み立てます。
   *
   * @returns 組み立てた要素
   */
  async function mount(): Promise<{
    owner: HTMLElement;
    checkbox: HTMLInputElement;
    municipality: HTMLInputElement;
    street: HTMLInputElement;
  }> {
    container.innerHTML = `
      <div id="copy-off" hidden data-bind='{"sameAsCustomerAddress":false}'>
      </div>
      <div id="owner" data-bind='{"contracts":[
        {"sameAsCustomerAddress":false,"municipality":"","street":""}
      ]}'>
        <div id="list" data-form-list="contracts" data-each="contracts"
             data-each-arg="c" data-each-index="i">
          <div id="row-{{i}}">
            <input type="checkbox" name="sameAsCustomerAddress" value="true">
            <input name="municipality"
              data-change-copy="#row-{{i}}"
              data-change-copy-source="#copy-off"
              data-change-copy-params="sameAsCustomerAddress">
            <input name="street">
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    return {
      owner: container.querySelector('#owner')!,
      checkbox: container.querySelector<HTMLInputElement>(
        'input[name="sameAsCustomerAddress"]',
      )!,
      municipality: container.querySelector<HTMLInputElement>(
        'input[name="municipality"]',
      )!,
      street: container.querySelector<HTMLInputElement>(
        'input[name="street"]',
      )!,
    };
  }

  /**
   * 行データ（`contracts` の 0 番目）を返します。
   *
   * @param owner 配列の所有者
   * @returns 行の要素データ
   */
  function rowData(owner: HTMLElement): Record<string, unknown> {
    const data = Core.getBindingData(owner) as Record<string, unknown>;
    return (data.contracts as Record<string, unknown>[])[0];
  }

  /**
   * 入力の値を変えて change を通知します。
   *
   * @param input 対象の入力
   * @param value 入力する値
   */
  async function edit(input: HTMLInputElement, value: string): Promise<void> {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    input.blur();
    await waitForDomSettled();
  }

  it('住所欄の編集でチェックだけが外れ、編集値は巻き戻らない', async () => {
    const {owner, checkbox, municipality} = await mount();

    // 住所が複写された状態を作る（複写元からの供給を模す）。
    await Core.setBindingData(owner, {
      contracts: [
        {sameAsCustomerAddress: true, municipality: '千代田区', street: '1-1'},
      ],
    });
    await waitForCondition(() => municipality.value === '千代田区', {
      description: '住所の複写',
    });

    // 「契約者住所と同じ」をチェックする（利用者の操作）。所有者に収集の宣言が
    // 無いため、この操作は要素データへ確定しない。
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // 住所欄を編集する。data-change-copy が sameAsCustomerAddress: false を
    // 行データへ書き戻す。
    await edit(municipality, '港区');

    // 編集値は残る（画面・要素データの両方）。
    expect(municipality.value, '編集した住所が巻き戻っている').toBe('港区');
    expect(rowData(owner).municipality, '要素データの住所が旧値へ戻っている').toBe(
      '港区',
    );
    // コピーしていないキーも巻き戻らない。
    expect(rowData(owner).street, '編集していないキーが失われている').toBe(
      '1-1',
    );
    // コピーしたキーは、利用者が操作した入力にも反映される。
    expect(
      rowData(owner).sameAsCustomerAddress,
      '要素データのチェックが外れていない',
    ).toBe(false);
    expect(checkbox.checked, '画面のチェックが外れていない').toBe(false);
  });

  it('入れ子（値リスト・data-form-object）を持つ行のデータを壊さない', async () => {
    container.innerHTML = `
      <div id="copy-off" hidden data-bind='{"sameAsCustomerAddress":false}'>
      </div>
      <div id="owner2" data-bind='{"contracts":[
        {"sameAsCustomerAddress":true,"municipality":"千代田区",
         "detail":{"note":"A","memo":"B"},"tags":["x","y"]}
      ]}'>
        <div data-form-list="contracts" data-each="contracts"
             data-each-arg="c" data-each-index="i">
          <div id="nested-row-{{i}}">
            <input type="checkbox" name="sameAsCustomerAddress" value="true">
            <input name="municipality"
              data-change-copy="#nested-row-{{i}}"
              data-change-copy-source="#copy-off"
              data-change-copy-params="sameAsCustomerAddress">
            <div data-form-object="detail">
              <input name="note">
              <input name="memo">
            </div>
            <input name="tags" data-form-list>
            <input name="tags" data-form-list>
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    const owner = container.querySelector<HTMLElement>('#owner2')!;
    const municipality = container.querySelector<HTMLInputElement>(
      'input[name="municipality"]',
    )!;
    await waitForCondition(() => municipality.value === '千代田区', {
      description: '行データの反映',
    });

    await edit(municipality, '港区');

    const item = (
      (Core.getBindingData(owner) as Record<string, unknown>)
        .contracts as Record<string, unknown>[]
    )[0];
    // 編集していない入れ子のキーが、編集値の収集で使う場所取り（null）で
    // 潰されていないこと。
    expect(item.tags, '値リストが潰れている').toEqual(['x', 'y']);
    expect(item.detail, '入れ子オブジェクトが潰れている').toEqual({
      note: 'A',
      memo: 'B',
    });
    expect(item.municipality).toBe('港区');
    expect(item.sameAsCustomerAddress).toBe(false);
  });

  it('コピーしたキーだけが上書きされ、他のキーの編集は保持される', async () => {
    const {owner, checkbox, municipality, street} = await mount();

    // 住所と番地の両方を編集し、チェックも入れる。
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    await edit(street, '2-2');
    await edit(municipality, '港区');

    expect(municipality.value).toBe('港区');
    expect(street.value, '別の入力の編集が巻き戻っている').toBe('2-2');
    expect(rowData(owner)).toMatchObject({
      sameAsCustomerAddress: false,
      municipality: '港区',
      street: '2-2',
    });
  });
});

describe('行への bind とユーザー編集', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    // 郵便番号から住所を引く応答を模す。
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({city: '千代田区'}), {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('取得の起点になった入力の編集が、応答の書き戻しで巻き戻らない', async () => {
    // 行の中で「郵便番号を入れたら住所を引く」構成。応答は city だけを返すため、
    // 起点になった zip は応答に含まれない。読み直した要素データをそのまま土台に
    // すると、確定していない zip の編集が旧値（空）へ巻き戻る。
    container.innerHTML = `
      <div id="bind-owner" data-bind='{"rows":[
        {"zip":"","city":"","note":"N"}
      ]}'>
        <div data-form-list="rows" data-each="rows"
             data-each-arg="r" data-each-index="i">
          <div id="bind-row-{{i}}">
            <input name="zip"
              data-change-fetch="/api/address"
              data-change-bind="#bind-row-{{i}}"
              data-change-bind-merge>
            <input name="city">
            <input name="note">
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const owner = container.querySelector<HTMLElement>('#bind-owner')!;
    const zip = container.querySelector<HTMLInputElement>('input[name="zip"]')!;
    const city = container.querySelector<HTMLInputElement>(
      'input[name="city"]',
    )!;
    const note = container.querySelector<HTMLInputElement>(
      'input[name="note"]',
    )!;

    zip.focus();
    zip.value = '1000001';
    zip.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForCondition(() => city.value === '千代田区', {
      description: '応答の反映',
      maxAttempts: 40,
      delayMs: 50,
    });
    await waitForDomSettled();

    const item = (
      (Core.getBindingData(owner) as Record<string, unknown>)
        .rows as Record<string, unknown>[]
    )[0];
    // 応答が持つキーは応答どおり。
    expect(item.city).toBe('千代田区');
    // 起点になった入力の編集は、画面・要素データとも残る。
    expect(zip.value, '入力した郵便番号が消えている').toBe('1000001');
    expect(item.zip, '要素データの郵便番号が消えている').toBe('1000001');
    // 触っていないキーも保たれる。
    expect(note.value).toBe('N');
    expect(item.note).toBe('N');
  });
});
