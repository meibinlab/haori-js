/* @vitest-environment jsdom */
/**
 * @fileoverview `data-form-detach` を付けた入力が値収集から外れることの回帰テスト。
 *
 * 期待値の根拠は仕様「`data-form-detach`」の「バインディングから除外します」と、
 * 同節の例に添えられた「`getValues()` で取得されない」。収集から外れる結果として、
 * バインドデータにも送信ボディにも載らない。
 *
 * 背景: 収集（`Form.getPartValues`）に判定が無く、書き戻し側にだけあったため、
 * detach した欄の値が `change` の双方向コミットでバインドデータへ載っていた。
 * E2E（`playwright/demo-form.spec.cjs` の `data-form-detach`）が負荷によって
 * 落ちていた原因でもある。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForIdle} from './helpers/async';

describe('data-form-detach の値収集', () => {
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
    container.remove();
  });

  /**
   * デモと同じ構成のフォームを用意します。
   *
   * @returns フォームのフラグメント
   */
  const setup = async (): Promise<ElementFragment> => {
    container.innerHTML = `
      <form data-form data-bind='{"username":"user1"}'>
        <input name="username">
        <input name="password" value="secret" data-form-detach>
      </form>`;
    await Core.scan(container);
    await waitForIdle();
    return Fragment.get(
      container.querySelector('form') as HTMLElement,
    ) as ElementFragment;
  };

  it('getValues() が detach した欄のキーを出さない', async () => {
    const form = await setup();
    const values = Form.getValues(form);

    expect('password' in values).toBe(false);
    // 同じフォームの他の欄は従来どおり収集される。
    expect(values.username).toBe('user1');
  });

  it('detach した欄を編集してもバインドデータへ載らない', async () => {
    const form = await setup();
    const password = container.querySelector(
      'input[name="password"]',
    ) as HTMLInputElement;

    password.value = 'changed';
    password.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    const element = form.getTarget() as HTMLElement;
    expect(element.getAttribute('data-bind')).not.toContain('password');
    expect(Core.getBindingData(element)).toEqual({username: 'user1'});
  });

  it('detach していない欄の編集は従来どおりバインドデータへ載る', async () => {
    const form = await setup();
    const username = container.querySelector(
      'input[name="username"]',
    ) as HTMLInputElement;

    username.value = 'user2';
    username.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    expect(Core.getBindingData(form.getTarget() as HTMLElement)).toEqual({
      username: 'user2',
    });
  });

  it('detach した欄は逆方向同期でも書き換えられない', async () => {
    // 仕様「`data-form-detach`」の「バインディングから除外します」は書き戻しにも
    // 及ぶ（値の供給を受けない）。
    const form = await setup();
    const password = container.querySelector(
      'input[name="password"]',
    ) as HTMLInputElement;

    await Core.setBindingData(form.getTarget() as HTMLElement, {
      username: 'user3',
      password: 'supplied',
    });
    await waitForIdle();

    expect(password.value).toBe('secret');
  });

  describe('コンテナへの宣言', () => {
    /**
     * コンテナへ `data-form-detach` を付けたフォームを用意します。
     *
     * @param html フォームの中身
     * @returns フォームのフラグメント
     */
    const mount = async (html: string): Promise<ElementFragment> => {
      container.innerHTML = `<form>${html}</form>`;
      await Core.scan(container);
      await waitForIdle();
      return Fragment.get(
        container.querySelector('form') as HTMLElement,
      ) as ElementFragment;
    };

    it('配下すべてが収集から外れる', async () => {
      // 仕様「`data-form-detach`」の「入力欄以外の要素へ付けた場合は、その配下
      // すべてが収集と書き戻しの対象から外れます」。
      const form = await mount(`
        <input name="username" value="user1">
        <div data-form-detach>
          <input name="password" value="secret">
          <input name="passwordConfirm" value="secret">
        </div>`);

      expect(Form.getValues(form)).toEqual({username: 'user1'});
    });

    it('配下は逆方向同期でも書き換えられない', async () => {
      const form = await mount(`
        <input name="username" value="user1">
        <div data-form-detach><input name="password" value="secret"></div>`);
      const password = container.querySelector(
        'input[name="password"]',
      ) as HTMLInputElement;

      await Core.setBindingData(form.getTarget() as HTMLElement, {
        username: 'user2',
        password: 'supplied',
      });
      await waitForIdle();

      expect(password.value).toBe('secret');
      // 除外していない欄は従来どおり供給を受ける。
      expect(
        (container.querySelector('input[name="username"]') as HTMLInputElement)
          .value,
      ).toBe('user2');
    });

    it('data-form-object を併記した場合はそのキー自体が出ない', async () => {
      const form = await mount(`
        <input name="username" value="user1">
        <div data-form-object="secret" data-form-detach>
          <input name="password" value="secret">
        </div>`);

      expect(Form.getValues(form)).toEqual({username: 'user1'});
    });

    it('data-form-list を併記した場合もそのキー自体が出ない', async () => {
      const form = await mount(`
        <input name="username" value="user1">
        <div data-form-detach>
          <div data-form-list="rows">
            <div><input name="memo" value="a"></div>
            <div><input name="memo" value="b"></div>
          </div>
        </div>`);

      expect(Form.getValues(form)).toEqual({username: 'user1'});
    });

    it('入れ子のコンテナでも外側の宣言が配下すべてに及ぶ', async () => {
      const form = await mount(`
        <input name="username" value="user1">
        <div data-form-detach>
          <div data-form-object="inner">
            <input name="memo" value="a">
          </div>
        </div>`);

      expect(Form.getValues(form)).toEqual({username: 'user1'});
    });
  });

  describe('非表示分岐との併記', () => {
    /**
     * `username` を編集して、収集値をバインドデータへコミットさせます。
     *
     * @returns 編集後のバインドデータ
     */
    const commitEdit = async (): Promise<unknown> => {
      const form = container.querySelector('form') as HTMLFormElement;
      const username = container.querySelector(
        'input[name="username"]',
      ) as HTMLInputElement;
      username.value = 'user2';
      username.dispatchEvent(new Event('input', {bubbles: true}));
      username.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForIdle();
      return Core.getBindingData(form);
    };

    it('非表示になっても detach した欄のキーをバインドデータから落とさない', async () => {
      // 仕様「`data-form-detach`」の「バインディングから除外します」。detach した欄は
      // そもそもバインディングの一部ではないため、仕様「`data-if-false` 分岐とフォーム
      // 送信」の「除外された部分木が宣言している最上位の収集キーを落とす」の対象に
      // ならない（そのキーの値は別の出どころが持っている）。
      container.innerHTML = `
        <form data-bind='{"username":"user1","password":"fromServer","show":false}'>
          <input name="username" value="user1">
          <div data-if="show" data-form-detach>
            <input name="password" value="inside">
          </div>
        </form>`;
      await Core.scan(container);
      await waitForIdle();

      expect(await commitEdit()).toEqual({
        username: 'user2',
        password: 'fromServer',
        show: false,
      });
    });

    it('非表示分岐の中にある detach した欄のキーも落とさない', async () => {
      container.innerHTML = `
        <form data-bind='{"username":"user1","password":"fromServer","show":false}'>
          <input name="username" value="user1">
          <div data-if="show">
            <input name="password" value="inside" data-form-detach>
          </div>
        </form>`;
      await Core.scan(container);
      await waitForIdle();

      expect(await commitEdit()).toEqual({
        username: 'user2',
        password: 'fromServer',
        show: false,
      });
    });
  });
});
