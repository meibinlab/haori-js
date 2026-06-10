/* @vitest-environment jsdom */
/**
 * @fileoverview Core.setBindingData の並行呼出直列化（FIFO）の回帰テスト。
 *
 * 同一要素へ短い間隔で複数回 setBindingData を呼んだとき、呼出順（FIFO）で
 * 直列に適用され、data-bind 属性・内部バインドデータが最後の呼出値で確定する
 * ことを検証する。直列化されないと、先に呼んだ古いデータが後から適用され、
 * data-bind 属性が古い JSON で確定する不具合が発生する。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('Core.setBindingData の並行呼出直列化', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  const getFrag = (el: HTMLElement): ElementFragment =>
    Fragment.get(el) as ElementFragment;

  it('同一tickで連続呼出しても最後の値で data-bind 属性と内部値が確定する', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-bind', '{"v":0}');
    container.appendChild(el);
    await Core.scan(container);
    await waitForDomSettled();

    // await せずに連続呼出（呼出順: 1 → 2）
    const p1 = Core.setBindingData(el, {v: 1});
    const p2 = Core.setBindingData(el, {v: 2});
    await Promise.all([p1, p2]);
    await waitForDomSettled();

    const frag = getFrag(el);
    expect(frag.getRawBindingData()).toEqual({v: 2});
    expect(JSON.parse(el.getAttribute('data-bind') as string)).toEqual({v: 2});
  });

  it('別tick（マイクロタスク跨ぎ）で連続呼出しても最後の値で確定する', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-bind', '{"v":0}');
    container.appendChild(el);
    await Core.scan(container);
    await waitForDomSettled();

    const p1 = Core.setBindingData(el, {v: 'a'});
    await Promise.resolve();
    const p2 = Core.setBindingData(el, {v: 'b'});
    await Promise.all([p1, p2]);
    await waitForDomSettled();

    const frag = getFrag(el);
    expect(frag.getRawBindingData()).toEqual({v: 'b'});
    expect(JSON.parse(el.getAttribute('data-bind') as string)).toEqual({
      v: 'b',
    });
  });

  it('3回以上の連続呼出でも呼出順に直列化され最後の値で確定する', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-bind', '{"n":0}');
    container.appendChild(el);
    await Core.scan(container);
    await waitForDomSettled();

    const promises = [1, 2, 3, 4, 5].map(n => Core.setBindingData(el, {n}));
    await Promise.all(promises);
    await waitForDomSettled();

    const frag = getFrag(el);
    expect(frag.getRawBindingData()).toEqual({n: 5});
    expect(JSON.parse(el.getAttribute('data-bind') as string)).toEqual({n: 5});
  });

  it('異なる要素への呼出は互いに影響しない', async () => {
    const a = document.createElement('div');
    a.setAttribute('data-bind', '{"x":0}');
    const b = document.createElement('div');
    b.setAttribute('data-bind', '{"y":0}');
    container.append(a, b);
    await Core.scan(container);
    await waitForDomSettled();

    await Promise.all([
      Core.setBindingData(a, {x: 9}),
      Core.setBindingData(b, {y: 8}),
    ]);
    await waitForDomSettled();

    expect(JSON.parse(a.getAttribute('data-bind') as string)).toEqual({x: 9});
    expect(JSON.parse(b.getAttribute('data-bind') as string)).toEqual({y: 8});
  });
});
