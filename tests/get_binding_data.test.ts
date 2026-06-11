/* @vitest-environment jsdom */
/**
 * @fileoverview Core.getBindingData（バインドデータ読み取り公式 API）の回帰テスト。
 * 改修依頼第2回 #1 に対応する。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';

describe('Core.getBindingData', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('要素自身の生バインドデータを返す', async () => {
    container.innerHTML = `<div id="a" data-bind='{"x":1,"y":"z"}'></div>`;
    const el = container.querySelector('#a') as HTMLElement;
    await Core.scan(container);

    expect(Core.getBindingData(el)).toEqual({x: 1, y: 'z'});
  });

  it('バインドデータを持たない要素は null を返す', async () => {
    container.innerHTML = `<div id="a"></div>`;
    const el = container.querySelector('#a') as HTMLElement;
    await Core.scan(container);

    expect(Core.getBindingData(el)).toBeNull();
  });

  it('resolved:true で継承を含む解決済みスコープを返す', async () => {
    container.innerHTML = `
      <div data-bind='{"outer":"O","shared":"parent"}'>
        <div id="inner" data-bind='{"shared":"child","inner":"I"}'></div>
      </div>
    `;
    const inner = container.querySelector('#inner') as HTMLElement;
    await Core.scan(container);

    // 生データは自身の宣言のみ
    expect(Core.getBindingData(inner)).toEqual({shared: 'child', inner: 'I'});
    // 解決済みスコープは外側を継承し、内側が上書き
    const resolved = Core.getBindingData(inner, {resolved: true});
    expect(resolved).toMatchObject({
      outer: 'O',
      shared: 'child',
      inner: 'I',
    });
  });

  it('setBindingData による更新後の値を返す', async () => {
    container.innerHTML = `<div id="a" data-bind='{"x":1}'></div>`;
    const el = container.querySelector('#a') as HTMLElement;
    await Core.scan(container);

    await Core.setBindingData(el, {x: 2, added: true});
    expect(Core.getBindingData(el)).toEqual({x: 2, added: true});
  });

  it('Haori に未登録の要素は null を返す', () => {
    const orphan = document.createElement('div');
    expect(Core.getBindingData(orphan)).toBeNull();
  });
});
