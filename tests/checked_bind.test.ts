/* @vitest-environment jsdom */
/**
 * @fileoverview radio/checkbox の checked と option の selected の宣言バインド
 * 回帰テスト。
 *
 * checked="{{式}}" / data-attr-checked / data-attr-selected で、属性だけでなく
 * DOM プロパティ（element.checked / option.selected）まで同期されることを検証する。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';
import {waitForDomSettled} from './helpers/async';

describe('checked / selected の宣言バインド', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('radio の checked="{{式}}" がチェック状態（プロパティ）へ反映される', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"sel":"b"}'>
        <input type="radio" name="r" value="a" checked="{{sel === 'a'}}">
        <input type="radio" name="r" value="b" checked="{{sel === 'b'}}">
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const radios = container.querySelectorAll(
      'input[type=radio]',
    ) as NodeListOf<HTMLInputElement>;
    await Core.scan(container);
    await waitForDomSettled();

    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);

    await Core.setBindingData(state, {sel: 'a'});
    await waitForDomSettled();

    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
  });

  it('checkbox の checked="{{式}}" が真偽でチェック状態へ反映される', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"on":false}'>
        <input id="cb" type="checkbox" value="x" checked="{{on}}">
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const cb = container.querySelector('#cb') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();
    expect(cb.checked).toBe(false);

    await Core.setBindingData(state, {on: true});
    await waitForDomSettled();
    expect(cb.checked).toBe(true);

    await Core.setBindingData(state, {on: false});
    await waitForDomSettled();
    expect(cb.checked).toBe(false);
  });

  it('data-attr-checked でもチェック状態へ反映される', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"on":true}'>
        <input id="cb" type="checkbox" value="x" data-attr-checked="{{on}}">
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const cb = container.querySelector('#cb') as HTMLInputElement;
    await Core.scan(container);
    await waitForDomSettled();
    expect(cb.checked).toBe(true);

    await Core.setBindingData(state, {on: false});
    await waitForDomSettled();
    expect(cb.checked).toBe(false);
  });

  it('option の data-attr-selected が選択状態（プロパティ）へ反映される', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"sel":"b"}'>
        <select id="sel">
          <option value="a" data-attr-selected="{{sel === 'a'}}">A</option>
          <option value="b" data-attr-selected="{{sel === 'b'}}">B</option>
        </select>
      </div>
    `;
    const state = container.querySelector('#state') as HTMLElement;
    const options = container.querySelectorAll(
      'option',
    ) as NodeListOf<HTMLOptionElement>;
    await Core.scan(container);
    await waitForDomSettled();
    expect(options[1].selected).toBe(true);

    await Core.setBindingData(state, {sel: 'a'});
    await waitForDomSettled();
    expect(options[0].selected).toBe(true);
  });
});
