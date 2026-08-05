/* @vitest-environment jsdom */
/**
 * @fileoverview 同一 name チェックボックスグループの値収集に関する回帰テスト。
 *
 * 期待値の根拠は仕様「同名チェックボックス・ラジオの収集値の形」の表で、`name` のみ
 * のときはチェック 0 個で `null`・1 個でスカラー・2 個以上で配列、`data-form-list` を
 * 併記したときは常に配列（0 個は `[]`）と定めている。
 *
 * 背景: ラジオの配列累積バグ修正（form.getPartValues で DOM の checked を真とし、
 * 未チェック要素の古い内部値を無視する）に伴い、この形が退行しないことを保証する。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('同一 name チェックボックスグループの値収集', () => {
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
   * #hobby-form を走査し、収集された hobby の値を返します。
   *
   * @returns name="hobby" の収集値（配列・スカラ・null のいずれか）
   */
  const collectHobby = async (): Promise<unknown> => {
    await Core.scan(container);
    await waitForDomSettled();
    const form = Fragment.get(
      container.querySelector('#hobby-form') as HTMLElement,
    ) as ElementFragment;
    return Form.getValues(form).hobby;
  };

  /**
   * 趣味選択フォームの HTML を組み立てます。
   *
   * @param checked チェック状態にする value の配列
   * @returns フォームの HTML 文字列
   */
  const buildForm = (checked: string[]): string => {
    const box = (value: string, label: string): string =>
      `<label><input type="checkbox" name="hobby" value="${value}"` +
      `${checked.includes(value) ? ' checked' : ''}>${label}</label>`;
    return `<form id="hobby-form">
      ${box('reading', '読書')}
      ${box('sports', 'スポーツ')}
      ${box('music', '音楽')}
    </form>`;
  };

  it('複数チェック時は配列で収集される', async () => {
    container.innerHTML = buildForm(['reading', 'music']);
    expect(await collectHobby()).toEqual(['reading', 'music']);
  });

  it('単一チェック時はスカラで収集される', async () => {
    container.innerHTML = buildForm(['sports']);
    expect(await collectHobby()).toBe('sports');
  });

  it('未チェック時は null で収集される', async () => {
    container.innerHTML = buildForm([]);
    expect(await collectHobby()).toBeNull();
  });

  describe('data-form-list を併記した群', () => {
    /**
     * `data-form-list` を併記した趣味選択フォームの HTML を組み立てます。
     *
     * @param checked チェック状態にする value の配列
     * @returns フォームの HTML 文字列
     */
    const buildListForm = (checked: string[]): string => {
      const box = (value: string, label: string): string =>
        `<label><input type="checkbox" name="hobby" value="${value}"` +
        ` data-form-list${checked.includes(value) ? ' checked' : ''}>` +
        `${label}</label>`;
      return `<form id="hobby-form">
        ${box('reading', '読書')}
        ${box('sports', 'スポーツ')}
        ${box('music', '音楽')}
      </form>`;
    };

    it('複数チェック時はチェック済みの送信値だけを配列で収集する', async () => {
      container.innerHTML = buildListForm(['reading', 'music']);
      expect(await collectHobby()).toEqual(['reading', 'music']);
    });

    it('単一チェック時も配列で収集する', async () => {
      container.innerHTML = buildListForm(['sports']);
      expect(await collectHobby()).toEqual(['sports']);
    });

    it('未チェック時は空配列で収集する（位置合わせの null を入れない）', async () => {
      container.innerHTML = buildListForm([]);
      expect(await collectHobby()).toEqual([]);
    });

    it('クリックで変更した後も DOM のチェック状態で収集する', async () => {
      container.innerHTML = buildListForm(['reading']);
      await Core.scan(container);
      await waitForDomSettled();

      const music = container.querySelector(
        'input[value="music"]',
      ) as HTMLInputElement;
      music.click();
      await waitForDomSettled();

      const form = Fragment.get(
        container.querySelector('#hobby-form') as HTMLElement,
      ) as ElementFragment;
      expect(Form.getValues(form).hobby).toEqual(['reading', 'music']);
    });

    it('イベントを伴わないチェックでも収集する', async () => {
      // 仕様「収集は DOM を真とする」の「チェック状態…: DOM の `checked`」。
      container.innerHTML = buildListForm([]);
      await Core.scan(container);
      await waitForDomSettled();

      (
        container.querySelector('input[value="sports"]') as HTMLInputElement
      ).checked = true;

      const form = Fragment.get(
        container.querySelector('#hobby-form') as HTMLElement,
      ) as ElementFragment;
      expect(Form.getValues(form).hobby).toEqual(['sports']);
    });

    it('ラジオグループでも選択値だけを配列で収集する', async () => {
      container.innerHTML = `<form id="hobby-form">
        <label><input type="radio" name="hobby" value="reading" data-form-list>読書</label>
        <label><input type="radio" name="hobby" value="sports" data-form-list checked>スポーツ</label>
      </form>`;
      expect(await collectHobby()).toEqual(['sports']);
    });

    it('真偽値チェックボックスは対象外で従来どおり真偽値を集める', async () => {
      // 仕様「同名チェックボックス・ラジオの収集値の形」の「真偽値チェックボックスは
      // 単一の真偽値なので、この規則の対象外です」。
      container.innerHTML = `<form id="hobby-form">
        <input type="checkbox" name="hobby" value="true" data-form-list checked>
      </form>`;
      expect(await collectHobby()).toEqual([true]);
    });
  });

  it('change イベント後も最新の DOM チェック状態で収集される', async () => {
    container.innerHTML = buildForm(['reading']);
    await Core.scan(container);
    await waitForDomSettled();

    const reading = container.querySelector(
      'input[value="reading"]',
    ) as HTMLInputElement;
    const music = container.querySelector(
      'input[value="music"]',
    ) as HTMLInputElement;

    // reading を外し music を追加する。
    reading.click();
    music.click();
    await waitForDomSettled();

    const form = Fragment.get(
      container.querySelector('#hobby-form') as HTMLElement,
    ) as ElementFragment;
    expect(Form.getValues(form).hobby).toBe('music');
  });
});
