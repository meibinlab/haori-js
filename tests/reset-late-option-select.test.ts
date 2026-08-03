/* @vitest-environment jsdom */
/**
 * @fileoverview リセットで、候補を `data-each` で流し込む `<select>` が既定値へ
 * 戻ることの回帰テスト。
 *
 * 候補が後から届く `<select>` では、DOM が受け付けられなかった書き込みを候補が
 * 揃った時点で載せ直す。この載せ直しがリセットの後にも働くと、クリアしたはずの
 * `<select>` だけがクリア前の値へ戻り、検索条件のクリアが効かなくなる。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: Element): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('リセットと候補が後から届く select', () => {
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

  /** 検索条件フォーム（候補はフォームの外側のバインドデータから流し込む） */
  const SEARCH_FORM = `
    <div id="page-state" data-bind='{"candidates":{"content":[
      {"id":"1","label":"A"},{"id":"7","label":"G"}]}}'>
      <form id="search">
        <select name="parentId" data-each="candidates.content"
                data-each-key="id" data-each-arg="c">
          <option value="" data-each-before>すべて</option>
          <option value="{{c.id}}">{{c.label}}</option>
        </select>
        <input name="name" type="text">
      </form>
      <button id="clear" type="button" data-click-reset-before="#search"></button>
      <button id="clear2" type="button" data-click-reset="#search"></button>
    </div>`;

  /** 祖先が所有するレコードを `data-form-arg` フォームが編集する構成 */
  const ARG_FORM = `
    <div id="page-state" data-bind='{"record":{"parentId":"1","name":"い"},
      "candidates":{"content":[{"id":"1","label":"A"},{"id":"7","label":"G"}]}}'>
      <form id="search" data-form-arg="record">
        <select name="parentId" data-each="candidates.content"
                data-each-key="id" data-each-arg="c">
          <option value="" data-each-before>すべて</option>
          <option value="{{c.id}}">{{c.label}}</option>
        </select>
        <input name="name" type="text">
      </form>
      <button id="clear" type="button" data-click-reset-before="#search"></button>
    </div>`;

  /**
   * HTML をマウントして初期評価を終えます。
   *
   * @param html マウントする HTML
   * @returns 戻り値はありません。
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  /**
   * 指定したボタンの手続きを完了まで実行します。
   *
   * @param selector ボタンのセレクター
   * @returns 手続き完了を待つ Promise
   */
  const run = async (selector: string): Promise<void> => {
    const button = container.querySelector(selector) as HTMLElement;
    await new Procedure(getFrag(button), 'click').run();
    await waitForDomSettled();
  };

  /**
   * 利用者の操作と同じ順序で検索条件を入力します。
   *
   * @param settle 双方向コミットの完了を待つかどうか
   * @returns DOM 反映の完了を待つ Promise
   */
  const fillCondition = async (settle: boolean): Promise<void> => {
    const select = container.querySelector('select') as HTMLSelectElement;
    select.value = '7';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    const text = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    text.value = 'あ';
    text.dispatchEvent(new Event('input', {bubbles: true}));
    text.dispatchEvent(new Event('change', {bubbles: true}));
    if (settle) {
      await waitForDomSettled();
    }
  };

  it('reset-before で select も既定値へ戻る', async () => {
    await mount(SEARCH_FORM);
    await fillCondition(true);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('7');

    await run('#clear');

    // 候補は残ったまま、選択だけが既定値へ戻る。
    expect(Array.from(select.options).map(option => option.value)).toEqual([
      '',
      '1',
      '7',
    ]);
    expect(select.value).toBe('');
    const form = container.querySelector('#search') as HTMLFormElement;
    expect(Form.getValues(getFrag(form))).toEqual({parentId: '', name: ''});
  });

  it('reset でも select が既定値へ戻る', async () => {
    await mount(SEARCH_FORM);
    await fillCondition(true);

    await run('#clear2');

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('同じフォームのテキスト入力も空へ戻る', async () => {
    await mount(SEARCH_FORM);
    await fillCondition(true);

    await run('#clear');

    const text = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    expect(text.value).toBe('');
  });

  it('入力の双方向コミットが進行中でも select が既定値へ戻る', async () => {
    // 利用者が入力欄を離れた直後（`change` の双方向コミットが完了する前）に
    // クリアを押した場合。コミットの後段が初期化に割り込むと、候補が揃った時点で
    // クリア前の値が載せ直され、クリアが効かなくなる。
    await mount(SEARCH_FORM);
    await fillCondition(false);

    await run('#clear');

    const select = container.querySelector('select') as HTMLSelectElement;
    const text = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    expect(select.value).toBe('');
    expect(text.value).toBe('');
    const form = container.querySelector('#search') as HTMLFormElement;
    expect(Form.getValues(getFrag(form))).toEqual({parentId: '', name: ''});
  });

  /** `#page-state` が持つ候補（更新のたびに同じ内容を渡す） */
  const CANDIDATES = {
    content: [
      {id: '1', label: 'A'},
      {id: '7', label: 'G'},
    ],
  };

  it('祖先のバインド更新が進行中でも select が既定値へ戻る', async () => {
    // 祖先が所有するレコードは、値が変わると配下の `data-form-arg` フォームへ
    // 流し込まれる（`Form.syncAncestorArgForms`）。この流し込みと、その後の
    // 載せ直しが初期化に割り込むと、クリアが取り消される。
    await mount(ARG_FORM);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('1');

    const pageState = container.querySelector('#page-state') as HTMLElement;
    const pending = Core.setBindingData(pageState, {
      record: {parentId: '7', name: 'あ'},
      candidates: JSON.parse(JSON.stringify(CANDIDATES)),
    });
    await run('#clear');
    await pending;
    await waitForDomSettled();

    const text = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    expect(select.value).toBe('');
    expect(text.value).toBe('');
  });

  it('リセットの後に始まった祖先の更新は入力欄へ反映される', async () => {
    // 初期化との競合を避けるための抑止が、正常な供給まで止めてしまわないこと。
    await mount(ARG_FORM);

    await run('#clear');
    const pageState = container.querySelector('#page-state') as HTMLElement;
    await Core.setBindingData(pageState, {
      record: {parentId: '7', name: 'あ'},
      candidates: JSON.parse(JSON.stringify(CANDIDATES)),
    });
    await waitForDomSettled();

    const select = container.querySelector('select') as HTMLSelectElement;
    const text = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    expect(select.value).toBe('7');
    expect(text.value).toBe('あ');
  });

  it('リセットの後に始まったフォームへの更新は入力欄へ反映される', async () => {
    await mount(SEARCH_FORM);
    await fillCondition(true);

    await run('#clear');
    const form = container.querySelector('#search') as HTMLFormElement;
    await Core.setBindingData(form, {parentId: '1', name: 'い'});
    await waitForDomSettled();

    const select = container.querySelector('select') as HTMLSelectElement;
    const text = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    expect(select.value).toBe('1');
    expect(text.value).toBe('い');
  });
});
