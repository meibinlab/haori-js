/* @vitest-environment jsdom */
/**
 * @fileoverview 確定していない編集を抱えた欄が、リセットで初期化されることの
 * 回帰テスト。
 *
 * 欄から出ずに（`change` を起こさずに）打鍵した直後にクリアを押すと、ボタンへ
 * フォーカスが移らない環境（`click()` 相当・Safari のボタンクリック）では、その後
 * 別の欄へ移った時点で初めて `change` が発火する。この `change` はリセットより後に
 * 起きるが、**運んでいる編集はリセットより前**である。編集の時点を `change` の時点で
 * 打ち直すと「リセットの要求より後の編集」に見え、クリアが効かなくなる。
 *
 * 期待値の根拠は仕様「ユーザー編集と宣言バインドの権威」の「印は打鍵ごと（`input`）に
 * 付きます」「供給は、その供給を起こした操作が起きた時点までの編集を解除し、それより
 * 後の編集は残します」と、仕様「`data-{event}-reset`」の「進行中のバインドデータ更新は
 * 書き戻しません」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('確定していない編集とリセット', () => {
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

  /** 検索条件フォームとクリアのボタン（報告された最小の構成） */
  const SEARCH_FORM = `
    <form id="search-form">
      <input id="customerId" name="customerId" type="text">
      <input id="staffName" name="staffName" type="text">
    </form>
    <button id="clear-btn" type="button"
            data-click-reset-before="#search-form"></button>`;

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
   * 指定した入力欄の要素を返します。
   *
   * @param id 要素の id
   * @returns 入力欄の要素
   */
  const field = (id: string): HTMLInputElement =>
    container.querySelector(`#${id}`) as HTMLInputElement;

  /**
   * 打鍵と同じ経路で値を入れます（`change` は起こしません）。
   *
   * @param id 対象の入力欄の id
   * @param value 入れる値
   * @returns 戻り値はありません。
   */
  const type = (id: string, value: string): void => {
    field(id).value = value;
    field(id).dispatchEvent(new Event('input', {bubbles: true}));
  };

  it('欄から出ずに打鍵した値は、クリアで初期化される', async () => {
    await mount(SEARCH_FORM);
    type('customerId', '9999');
    await waitForDomSettled();

    // クリアを押す。フォーカスは移らないため customerId の編集は未確定のまま。
    (container.querySelector('#clear-btn') as HTMLElement).dispatchEvent(
      new MouseEvent('click', {bubbles: true}),
    );
    // 同一タスクで別の欄へ移る。実ブラウザではこの時点で customerId がブラーし、
    // 値が変わっているため native な change が発火する。
    field('customerId').dispatchEvent(new Event('change', {bubbles: true}));
    type('staffName', 'クリア中に入力');
    await waitForDomSettled();
    await waitForDomSettled();
    await waitForDomSettled();

    // クリアの要求より前の編集は解除され、後の編集は残る。
    expect(field('customerId').value).toBe('');
    expect(field('staffName').value).toBe('クリア中に入力');
    // 収集値も画面と一致する（送信・保存に古い条件が混ざらない）。
    const form = container.querySelector('#search-form') as HTMLFormElement;
    expect(Form.getValues(Fragment.get(form) as ElementFragment)).toEqual({
      customerId: '',
      staffName: 'クリア中に入力',
    });
  });

  // リセットの途中のどの時点でブラーが起きても結果が変わらないことを確かめる。
  // 報告では入力のタイミング（同一タスク・`setTimeout(0)`・`requestAnimationFrame`
  // 1 回後・2 回後）で結果が変わっていた。リセットは複数の段に分かれて非同期に進む
  // ため、段の切れ目ごとに割り込ませる。
  it.each([0, 1, 2, 3, 4, 5, 6])(
    'リセットの %i マイクロタスク後にブラーが起きても初期化は保たれる',
    async (microtasks: number) => {
      await mount(SEARCH_FORM);
      type('customerId', '9999');
      await waitForDomSettled();

      (container.querySelector('#clear-btn') as HTMLElement).dispatchEvent(
        new MouseEvent('click', {bubbles: true}),
      );
      for (let index = 0; index < microtasks; index += 1) {
        await Promise.resolve();
      }
      // ブラーで初めて `change` が発火する（打鍵の時点はリセットの要求より前）。
      field('customerId').dispatchEvent(new Event('change', {bubbles: true}));
      type('staffName', 'クリア中に入力');
      await waitForDomSettled();
      await waitForDomSettled();
      await waitForDomSettled();

      expect(field('customerId').value).toBe('');
      expect(field('staffName').value).toBe('クリア中に入力');
    },
  );

  it('クリアの後に打鍵した値は、その欄だけ残る', async () => {
    await mount(SEARCH_FORM);
    type('customerId', '9999');
    await waitForDomSettled();

    (container.querySelector('#clear-btn') as HTMLElement).dispatchEvent(
      new MouseEvent('click', {bubbles: true}),
    );
    // クリアの後に customerId 自身へ打ち直す（要求より後の編集なので残る）。
    type('customerId', '1234');
    await waitForDomSettled();
    await waitForDomSettled();
    await waitForDomSettled();

    expect(field('customerId').value).toBe('1234');
  });

  it('change は既存の未確定の編集の時点を打ち直さない', async () => {
    await mount(SEARCH_FORM);
    type('customerId', '9999');
    await waitForDomSettled();
    const fragment = Fragment.get(field('customerId')) as ElementFragment;
    const typedAt = fragment.getUserEditSequence();

    field('customerId').dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // 編集の時点は打鍵の時点。`change` はフォーカスを外した時点で発火するだけで、
    // 新しい編集ではない。
    expect(fragment.getUserEditSequence()).toBe(typedAt);
  });

  it('未編集の欄で起きた change は編集として記録する', async () => {
    await mount(SEARCH_FORM);
    const fragment = Fragment.get(field('staffName')) as ElementFragment;
    expect(fragment.getUserEditSequence()).toBe(0);

    // `input` を伴わない `change`（`<select>` を差し替える外部ライブラリなど）は、
    // その時点を編集として記録する（記録しないと反映待ちの書き込みに負ける）。
    field('staffName').value = '田中';
    field('staffName').dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    expect(fragment.getUserEditSequence()).toBeGreaterThan(0);
  });
});
