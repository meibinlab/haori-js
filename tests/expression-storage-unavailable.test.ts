/* @vitest-environment jsdom */
/**
 * @fileoverview ストレージ参照が例外になる環境での式評価の検証。
 *
 * `allow-same-origin` の無い sandbox iframe や、サイトデータをブロックした状態の
 * クロスサイト iframe では、`localStorage` / `sessionStorage` は参照しただけで
 * `SecurityError` になります。式評価は「バインド値に危険なホストオブジェクトが
 * 紛れ込んでいないか」を照合するためにこれらを読むため、例外をそのまま通すと
 * 画面上のすべての `{{}}` が評価できなくなります（`data-bind` の既定値まで消える）。
 *
 * ここでは、ストレージが参照できない環境でも式評価と描画が通常どおり動くことを
 * 固定します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Expression from '../src/expression';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

/** 退避したストレージのプロパティ定義（復元用） */
const SAVED_DESCRIPTORS = new Map<string, PropertyDescriptor>();

/**
 * 指定したストレージの参照を例外にします。
 *
 * @param name 対象のグローバル名
 */
const denyStorage = (name: 'localStorage' | 'sessionStorage'): void => {
  const descriptor = Object.getOwnPropertyDescriptor(window, name);
  if (descriptor && !SAVED_DESCRIPTORS.has(name)) {
    SAVED_DESCRIPTORS.set(name, descriptor);
  }
  Object.defineProperty(window, name, {
    configurable: true,
    get() {
      throw new DOMException('storage is blocked', 'SecurityError');
    },
  });
};

/**
 * 例外にしたストレージの参照を元へ戻します。
 */
const restoreStorages = (): void => {
  for (const [name, descriptor] of SAVED_DESCRIPTORS) {
    Object.defineProperty(window, name, descriptor);
  }
  SAVED_DESCRIPTORS.clear();
};

describe('ストレージ参照が例外になる環境の式評価', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    restoreStorages();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('sessionStorage が参照できなくても式は評価される', () => {
    denyStorage('sessionStorage');

    expect(Expression.evaluate('a + 1', {a: 1})).toBe(2);
  });

  it('localStorage が参照できなくても式は評価される', () => {
    denyStorage('localStorage');

    expect(Expression.evaluate('a + 1', {a: 1})).toBe(2);
  });

  it('両方が参照できなくても data-bind の既定値が描画される', async () => {
    denyStorage('sessionStorage');
    denyStorage('localStorage');
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

    container.innerHTML =
      '<div data-bind=\'{"name":"あかね","count":2}\'>' +
      '<span id="name">{{name}}</span>' +
      '<span id="calc">{{count * 3}}</span>' +
      '</div>';
    await Core.scan(container);
    await waitForDomSettled();

    expect(container.querySelector('#name')!.textContent).toBe('あかね');
    expect(container.querySelector('#calc')!.textContent).toBe('6');
    expect(error).not.toHaveBeenCalled();
  });

  it('ストレージが参照できなくても危険値の持ち込みは拒否される', () => {
    denyStorage('sessionStorage');
    denyStorage('localStorage');
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

    // window そのものは読めるため、照合は従来どおり機能する。
    expect(Expression.evaluate('value', {value: window})).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
