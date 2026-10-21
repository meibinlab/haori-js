/* @vitest-environment jsdom */
/**
 * @fileoverview 行単位の値反映で、入れ子の収集キーが要素データに無い場合のテスト
 *
 * 報告: 明細行の途中で `data-click-row-add` を押すと、追加した行の
 * `data-form-object` 配下の select に、直下の行の選択が残っていた。
 * `data-each-key` の無い行は位置で DOM を使い回すため、使い回した DOM へ `{}` を
 * 反映するときに、要素データに無い `data-form-object` / `data-form-list` の配下を
 * 空にしていなかった。
 *
 * 期待値の根拠は仕様「`data-each` で生成された行への値反映」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';
import {waitForIdle} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('行単位の値反映（入れ子の収集キーが要素データに無い場合）', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** 行の中に `data-form-object` の select と、行の操作ボタンを持つ明細 */
  const DETAIL_ROWS = (initial: string, extra = ''): string => `
    <form data-bind='${initial}'>
      <div data-form-list="details" data-each="details" data-each-arg="d">
        <div>
          <div data-form-object="material">
            <select name="id">
              <option value="">未選択</option>
              <option value="1">ソース</option>
              <option value="2">青のり</option>
            </select>
            ${extra}
          </div>
          <input name="lotQuantity">
          <button type="button" class="add" data-click-row-add></button>
          <button type="button" class="del" data-click-row-remove></button>
        </div>
      </div>
    </form>`;

  const mount = async (html: string): Promise<HTMLFormElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForIdle();
    return container.querySelector('form')!;
  };

  const clickNth = async (
    form: HTMLElement,
    selector: string,
    nth: number,
  ): Promise<void> => {
    const buttons = form.querySelectorAll<HTMLElement>(selector);
    await new Procedure(getFrag(buttons[nth]), 'click').run();
    await waitForIdle();
  };

  const selectValues = (form: HTMLElement): string[] =>
    Array.from(form.querySelectorAll('select')).map(select => select.value);

  const collectedDetails = (form: HTMLFormElement): unknown[] =>
    Form.getValues(getFrag(form)).details as unknown[];

  it('途中の行の row-add で、追加した行の data-form-object 配下が空になる', async () => {
    // 仕様「`data-each` で生成された行への値反映」の「行単位の反映では、
    // **要素データに無いキーの入力欄は空になります**」
    const form = await mount(
      DETAIL_ROWS(
        '{"details":[' +
          '{"material":{"id":"1"},"lotQuantity":3},' +
          '{"material":{"id":"2"},"lotQuantity":5}]}',
      ),
    );

    await clickNth(form, '.add', 0);

    expect(selectValues(form)).toEqual(['1', '', '2']);
  });

  it('途中の行から追加した行の送信値は、末尾の行から追加した行と同じになる', async () => {
    // 仕様「`data-each` で生成された行への値反映」の「要素データが行全体を規定する」
    // ため、同じ `{}` を受け取った行は、DOM を使い回したかどうかによらず同じ値になる。
    const form = await mount(
      DETAIL_ROWS(
        '{"details":[' +
          '{"material":{"id":"1"},"lotQuantity":3},' +
          '{"material":{"id":"2"},"lotQuantity":5}]}',
      ),
    );

    await clickNth(form, '.add', 0);
    await clickNth(form, '.add', 2);

    const details = collectedDetails(form);
    expect(details).toHaveLength(4);
    expect(details[1]).toEqual(details[3]);
  });

  it('row-remove で前の行の DOM を使い回しても、data-form-object 配下に前の選択が残らない', async () => {
    // 仕様「`data-each` で生成された行への値反映」の「行の途中への挿入や並べ替えで
    // 担当する要素が変わったときに前の行の入力値が残らないようにするため」
    const form = await mount(
      DETAIL_ROWS('{"details":[{"material":{"id":"1"}},{"lotQuantity":5}]}'),
    );

    await clickNth(form, '.del', 0);

    expect(selectValues(form)).toEqual(['']);
  });

  it('要素データの data-form-object のキーが null でも配下が空になる', async () => {
    // 仕様「`data-each` で生成された行への値反映」の「要素データに無いキーの入力欄は
    // 空になります」。`material` が null のとき `material.id` は要素データに無い。
    const form = await mount(
      DETAIL_ROWS('{"details":[{"material":{"id":"1"}}]}'),
    );

    await Core.setBindingData(form, {details: [{material: null}]});
    await waitForIdle();

    expect(selectValues(form)).toEqual(['']);
  });

  it('宣言バインドで値が決まる data-form-object 配下の入力は空にしない', async () => {
    // 仕様「`data-each` で生成された行への値反映」の「ただし**宣言バインドで値や
    // 状態が決まる入力は空にしません**」
    const form = await mount(
      DETAIL_ROWS(
        '{"unit":"kg","details":[' +
          '{"material":{"id":"1"}},{"material":{"id":"2"}}]}',
        '<input type="hidden" name="unit" value="{{unit}}">',
      ),
    );

    await clickNth(form, '.add', 0);

    const units = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="unit"]'),
    ).map(input => input.value);
    expect(units).toEqual(['kg', 'kg', 'kg']);
  });

  it('途中の行の row-add で、行の中の静的な data-form-list 配下も空になる', async () => {
    // 仕様「`data-each` で生成された行への値反映」の「行単位の反映では、
    // **要素データに無いキーの入力欄は空になります**」
    const form = await mount(`
      <form data-bind='{"details":[{"lots":[{"qty":"3"}]},{"lots":[{"qty":"5"}]}]}'>
        <div data-form-list="details" data-each="details" data-each-arg="d">
          <div>
            <div data-form-list="lots">
              <div><input name="qty"></div>
            </div>
            <button type="button" class="add" data-click-row-add></button>
          </div>
        </div>
      </form>`);

    await clickNth(form, '.add', 0);

    const quantities = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="qty"]'),
    ).map(input => input.value);
    expect(quantities).toEqual(['3', '', '5']);
  });

  it('フォーム全体への逆方向同期では、data-form-object のキーが無くても配下の値を保つ', async () => {
    // 仕様「`data-each` で生成された行への値反映」の「フォーム全体への逆方向同期では、
    // 未指定のキーは既存値を維持します」
    const form = await mount(`
      <form data-bind='{"material":{"id":"2"}}'>
        <div data-form-object="material">
          <select name="id">
            <option value="">未選択</option>
            <option value="1">ソース</option>
            <option value="2">青のり</option>
          </select>
        </div>
      </form>`);

    await Core.setBindingData(form, {memo: 'x'});
    await waitForIdle();

    expect(selectValues(form)).toEqual(['2']);
  });
});
