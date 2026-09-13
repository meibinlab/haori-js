/* @vitest-environment jsdom */
/**
 * @fileoverview フラグメントの取り外しが、子をすべて外すことを検証します。
 *
 * `ElementFragment.remove()` は子をたどりながら子の `remove()` を呼びますが、
 * 子の `remove()` は親の子配列から自分を取り除きます。配列をそのままたどると
 * 1 つおきにしか外れず、外れなかった子は状態（属性の写し、バインドデータ、
 * キャッシュ登録）を保ったまま残っていました（課題 45）。残った断片は要素を
 * 付け直したときに再利用されるため、どの子が作り直されるかが、空白のテキスト
 * ノードの有無（子の並び）で変わっていました。
 *
 * 取り外しの後始末は内部の不変条件で、仕様書に対応する節はありません。期待値は
 * `remove()` の契約（フラグメントとノードを削除する）から取っています。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('フラグメントの取り外しと子の後始末', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  /**
   * 子を 4 つ持つ要素を走査します。
   *
   * @param html 子の並び
   * @returns 親要素
   */
  const mount = async (html: string): Promise<HTMLElement> => {
    container.innerHTML = `<div id="box">${html}</div>`;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('#box') as HTMLElement;
  };

  it('取り外した要素の子は、1 つ残らず断片の木から外れる', async () => {
    const box = await mount(
      '<span id="a"></span><span id="b"></span>' +
        '<span id="c"></span><span id="d"></span>',
    );
    const children = ['#a', '#b', '#c', '#d'].map(
      selector => container.querySelector(selector) as HTMLElement,
    );

    await (Fragment.get(box) as ElementFragment).remove(false);

    // 外れた子はキャッシュにも残らない（残ると付け直しで再利用される）。
    expect(children.map(child => Fragment.peek(child))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('空白のテキストノードが挟まっていても結果は変わらない', async () => {
    const box = await mount(
      '\n  <span id="a"></span>\n  <span id="b"></span>\n' +
        '  <span id="c"></span>\n  <span id="d"></span>\n',
    );
    const children = ['#a', '#b', '#c', '#d'].map(
      selector => container.querySelector(selector) as HTMLElement,
    );

    await (Fragment.get(box) as ElementFragment).remove(false);

    expect(children.map(child => Fragment.peek(child))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
