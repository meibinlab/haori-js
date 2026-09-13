/* @vitest-environment jsdom */
/**
 * @fileoverview まとめて追加したノードの取り込みを検証します。
 *
 * 監視の開始後に、走査済みの要素へ複数のノードを 1 回の操作で追加すると、2 つめ
 * 以降が断片の木へ繋がらず、フォーム値の収集から落ちていました（課題 47）。
 * エンジン自身が差し込んでいる最中かどうかを親ごとに見ていたため、同じ記録の
 * 2 つめ以降が巻き添えになっていたためです。
 *
 * 期待値の根拠は仕様「`data-enhance`」の契機の表（「後から追加されたノード」を
 * 取り込みの対象としており、まとめて追加した場合を除外していない）と、仕様
 * 「収集は DOM を真とする」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import {waitForDomSettled} from './helpers/async';

type ObserverPrivate = {_initialized: boolean};

/** ライブ監視の初期化状態を戻します。 */
function resetObserver(): void {
  (Observer as unknown as ObserverPrivate)._initialized = false;
  document.body.removeAttribute('data-haori-ready');
}

describe('まとめて追加したノードの取り込み', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetObserver();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    resetObserver();
  });

  /**
   * 監視を開始し、空の入れ物を持つフォームを組み立てます。
   *
   * @returns 追加先の要素
   */
  const mountForm = async (): Promise<HTMLElement> => {
    await Observer.init();
    await waitForDomSettled(4);
    container.innerHTML = '<form id="f"><div id="box"></div></form>';
    await waitForDomSettled(12);
    return container.querySelector('#box') as HTMLElement;
  };

  /**
   * フォームの収集値を返します。
   *
   * @returns 収集値
   */
  const collect = (): Record<string, unknown> => {
    const form = container.querySelector('#f') as HTMLElement;
    return Form.getValues(Fragment.get(form) as ElementFragment);
  };

  it('innerHTML でまとめて追加した入力欄が、すべて収集に載る', async () => {
    const box = await mountForm();

    box.innerHTML =
      '<input name="title" value="x"><input name="note" value="y">';
    await waitForDomSettled(12);

    expect(collect()).toEqual({title: 'x', note: 'y'});
  });

  it('append() でまとめて追加した入力欄が、すべて収集に載る', async () => {
    const box = await mountForm();

    const first = document.createElement('input');
    first.name = 'title';
    first.value = 'x';
    const second = document.createElement('input');
    second.name = 'note';
    second.value = 'y';
    box.append(first, second);
    await waitForDomSettled(12);

    expect(collect()).toEqual({title: 'x', note: 'y'});
  });

  it('data-form-list の入力欄をまとめて追加しても、すべて配列に載る', async () => {
    const box = await mountForm();

    // 仕様「`data-form-list`」の「値の配列」の書き方。
    box.innerHTML =
      '<input name="tags" value="x" data-form-list>' +
      '<input name="tags" value="y" data-form-list>';
    await waitForDomSettled(12);

    expect(collect()).toEqual({tags: ['x', 'y']});
  });

  it('1 つずつ追加した場合の結果は変わらない（対照）', async () => {
    const box = await mountForm();

    box.innerHTML = '<input name="title" value="x">';
    await waitForDomSettled(12);
    const second = document.createElement('input');
    second.name = 'note';
    second.value = 'y';
    box.appendChild(second);
    await waitForDomSettled(12);

    expect(collect()).toEqual({title: 'x', note: 'y'});
  });
});
