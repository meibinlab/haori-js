/* @vitest-environment jsdom */
/**
 * @fileoverview 同一 name チェックボックスグループの値収集に関する回帰テスト。
 *
 * 背景: ラジオの配列累積バグ修正（form.getPartValues で DOM の checked を真とし、
 * 未チェック要素の古い内部値を無視する）に伴い、チェックボックスグループの
 * 既存挙動（複数チェック→配列、単一→スカラ、未チェック→null）が退行しないことを
 * 保証する。
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
