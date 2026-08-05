/* @vitest-environment jsdom */
/**
 * @fileoverview 入力要素へ付けた `data-form-list`（同名リスト）の回帰テスト。
 *
 * `<input name="tags" data-form-list>` は「この `name` を配列として集める」印で、
 * キーは `name` が決めるため属性値を省略できる。収集は属性の有無で判定し、書き戻しは
 * 同じ収集キーの出現順に配列の要素を配る。
 *
 * 期待値の根拠は仕様「`data-form-list`」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('同名リスト（入力要素の data-form-list）', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('属性値を省略しても配列として収集する', async () => {
    container.innerHTML = `
      <form id="f">
        <input name="tags" value="js" data-form-list>
        <input name="tags" value="ts" data-form-list>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#f') as HTMLFormElement;
    expect(Form.getValues(getFrag(form))).toEqual({tags: ['js', 'ts']});
  });

  it('属性値を指定しても配列として収集する', async () => {
    container.innerHTML = `
      <form id="f">
        <input name="tags" value="js" data-form-list="tags">
        <input name="tags" value="ts" data-form-list="tags">
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#f') as HTMLFormElement;
    expect(Form.getValues(getFrag(form))).toEqual({tags: ['js', 'ts']});
  });

  it('配列を出現順に各入力へ配る', async () => {
    container.innerHTML = `
      <form id="f" data-bind='{"tags":["js","ts"]}'>
        <input name="tags" data-form-list>
        <input name="tags" data-form-list>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled(4);

    const form = container.querySelector('#f') as HTMLFormElement;
    expect(
      Array.from(container.querySelectorAll('input')).map(
        input => (input as HTMLInputElement).value,
      ),
    ).toEqual(['js', 'ts']);
    expect(Form.getValues(getFrag(form))).toEqual({tags: ['js', 'ts']});
  });

  it('要素数より入力欄が多い場合は余りを空にする', async () => {
    container.innerHTML = `
      <form id="f" data-bind='{"tags":["js"]}'>
        <input name="tags" data-form-list>
        <input name="tags" value="残り" data-form-list>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled(4);

    expect(
      Array.from(container.querySelectorAll('input')).map(
        input => (input as HTMLInputElement).value,
      ),
    ).toEqual(['js', '']);
  });

  it('data-form-object の中では出現順を数え直す', async () => {
    container.innerHTML = `
      <form id="f" data-bind='{"tags":["a","b"],"inner":{"tags":["x","y"]}}'>
        <input class="outer" name="tags" data-form-list>
        <input class="outer" name="tags" data-form-list>
        <div data-form-object="inner">
          <input class="inner" name="tags" data-form-list>
          <input class="inner" name="tags" data-form-list>
        </div>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled(4);

    const form = container.querySelector('#f') as HTMLFormElement;
    expect(
      Array.from(container.querySelectorAll('.outer')).map(
        input => (input as HTMLInputElement).value,
      ),
    ).toEqual(['a', 'b']);
    expect(
      Array.from(container.querySelectorAll('.inner')).map(
        input => (input as HTMLInputElement).value,
      ),
    ).toEqual(['x', 'y']);
    expect(Form.getValues(getFrag(form))).toEqual({
      tags: ['a', 'b'],
      inner: {tags: ['x', 'y']},
    });
  });

  it('data-form-list の行ごとに出現順を数え直す', async () => {
    container.innerHTML = `
      <form id="f" data-bind='{"rows":[{"tags":["a","b"]},{"tags":["x","y"]}]}'>
        <div data-form-list="rows">
          <div class="row">
            <input name="tags" data-form-list>
            <input name="tags" data-form-list>
          </div>
          <div class="row">
            <input name="tags" data-form-list>
            <input name="tags" data-form-list>
          </div>
        </div>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled(4);

    const form = container.querySelector('#f') as HTMLFormElement;
    expect(
      Array.from(container.querySelectorAll('input')).map(
        input => (input as HTMLInputElement).value,
      ),
    ).toEqual(['a', 'b', 'x', 'y']);
    expect(Form.getValues(getFrag(form))).toEqual({
      rows: [{tags: ['a', 'b']}, {tags: ['x', 'y']}],
    });
  });
});
