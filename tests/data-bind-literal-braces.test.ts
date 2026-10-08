/* @vitest-environment jsdom */
/**
 * @fileoverview `data-bind` の値に含まれる `{{ }}` を式として評価しないことのテスト。
 *
 * 期待値は仕様「`data-bind`」の「**値は式として評価しません。** 値の中の `{{ }}` は
 * 文字のまま扱い、`data-bind` 属性にも書かれたとおりに残します。利用者の入力や API の
 * 応答に `{{ }}` が含まれていても、式にはなりません（中略）。属性は常に内部の値と
 * 一致するため、要素を DOM の中で移して走査し直しても、バインドデータは変わりません」
 * から取っている。
 *
 * 修正前は、`data-bind` 属性への書き出しが通常の属性と同じくテンプレートとして評価
 * されていた。内部の値は文字のままでも属性だけが評価済みになり、要素を移すと評価済みの
 * 属性から作り直されて値が書き換わっていた。値に書かれた式も実行されていた。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('data-bind の値の中の {{ }}', () => {
  beforeEach(async () => {
    Env.setRuntime('embedded');
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    await Observer.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
  });

  /**
   * 読み込みの後に `#box` を差し込み、監視が取り込むのを待ちます。
   *
   * @param bind `#box` の `data-bind` 属性の値
   * @returns `#box`
   */
  async function mount(bind: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML =
      `<div id="box" data-bind='${bind}'><p id="out">{{s}}</p></div>` +
      '<div id="other"></div>';
    document.body.appendChild(host);
    await waitForIdle();
    return document.querySelector('#box') as HTMLElement;
  }

  /**
   * `#box` の属性・内部の値・表示を返します。
   *
   * @returns 属性を解析した値、内部の値、表示
   */
  function stateOf(): {
    attribute: unknown;
    memory: unknown;
    text: string;
  } {
    const box = document.querySelector('#box') as HTMLElement;
    return {
      attribute: JSON.parse(box.getAttribute('data-bind') as string),
      memory: (Fragment.get(box) as ElementFragment).getRawBindingData(),
      text: document.querySelector('#out')!.textContent ?? '',
    };
  }

  it('Core.setBindingData で渡した値の {{ }} を、属性でも評価しない（回帰）', async () => {
    const box = await mount('{"t": "T", "s": "x"}');

    await Core.setBindingData(box, {t: 'T', s: 'a{{t}}b'});
    await waitForIdle();

    expect(stateOf()).toEqual({
      attribute: {t: 'T', s: 'a{{t}}b'},
      memory: {t: 'T', s: 'a{{t}}b'},
      text: 'a{{t}}b',
    });
  });

  it('属性に書いた値の {{ }} を、走査で評価しない（回帰）', async () => {
    await mount('{"t": "T", "s": "a{{t}}b"}');

    expect(stateOf().attribute).toEqual({t: 'T', s: 'a{{t}}b'});
  });

  it('参照が解決できない {{ }} も、文字のまま属性に残す（回帰）', async () => {
    const box = await mount('{"s": "x"}');

    await Core.setBindingData(box, {s: 'a{{zz}}b'});
    await waitForIdle();

    expect(stateOf().attribute).toEqual({s: 'a{{zz}}b'});
  });

  it('要素を DOM の中で移しても、値は変わらない（回帰）', async () => {
    const box = await mount('{"t": "T", "s": "x"}');
    await Core.setBindingData(box, {t: 'T', s: 'a{{t}}b'});
    await waitForIdle();

    document.querySelector('#other')!.appendChild(box);
    await waitForIdle();

    // 表示は確かめない。移した要素は描画済みの DOM から作り直されるため、配下の
    // `{{s}}` は描いた結果の文字として読み込まれる（`data-bind` とは別の挙動）。
    const {attribute, memory} = stateOf();
    expect({attribute, memory}).toEqual({
      attribute: {t: 'T', s: 'a{{t}}b'},
      memory: {t: 'T', s: 'a{{t}}b'},
    });
  });

  it('評価すると引用符が入る値でも、移した後に値を保つ（回帰）', async () => {
    const box = await mount('{"q": "x", "s": "x"}');
    await Core.setBindingData(box, {q: 'say "hi"', s: '{{q}}'});
    await waitForIdle();

    document.querySelector('#other')!.appendChild(box);
    await waitForIdle();

    expect(stateOf().memory).toEqual({q: 'say "hi"', s: '{{q}}'});
  });

  it('値に書かれた式を実行しない（回帰）', async () => {
    // 仕様「0. 脅威モデル（前提）」の「**値は安全側です。** 利用者入力や API 応答を
    // `data-bind` の**値**として渡す限り、式はそれをデータとして扱います。値から
    // コードにはなりません」。
    const warn = vi.spyOn(console, 'warn');
    const box = await mount('{"s": "x"}');

    await Core.setBindingData(box, {s: '{{ haori.range(3) }} {{ 氏名 }}'});
    await waitForIdle();

    expect(stateOf().attribute).toEqual({s: '{{ haori.range(3) }} {{ 氏名 }}'});
    expect(warn).not.toHaveBeenCalled();
  });

  it('data-bind 以外の属性の {{ }} は、従来どおり評価する（対照）', async () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<div id="box" data-bind=\'{"t": "T"}\' title="a{{t}}b"></div>';
    document.body.appendChild(host);
    await waitForIdle();

    expect(document.querySelector('#box')!.getAttribute('title')).toBe('aTb');
  });
});
