/* @vitest-environment jsdom */
/**
 * @fileoverview 非表示のあいだに外部が `style` を書き換えたときの扱い。
 *
 * DOM の監視は、非表示のあいだの `style` を宣言として取り込みません。取り込むと
 * `display: none` が宣言として焼き付き、表示へ戻した分岐を引き戻すためです。
 * ただし取り込まないだけでは、外部のスクリプト（第三者ライブラリ、開発者ツール）が
 * `display` を直接書き換えたときに、`data-if-false` が付いたまま要素が見えてしまいます。
 *
 * 期待値の根拠は仕様「data-if の動作」の「非表示のあいだに外部から `style.display` を
 * 書き換えた場合は、**追随結果を書き直して非表示へ戻します**」。
 *
 * エンジン自身の書き込みが同じ経路を通ったときに書き直しが起きないことは、
 * [tests/if-hide-with-display-declaration.test.ts](./if-hide-with-display-declaration.test.ts)
 * が固定しています（宣言の再適用は控えを取り直します）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('非表示のあいだの外部からの style の書き換え', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    await Observer.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * `data-if` と `data-attr-style` を持つ要素を組み立てて走査します。
   *
   * @param show `data-if` が参照する値
   * @param declaration `data-attr-style` が参照する宣言
   * @returns ホスト要素と対象要素
   */
  const mount = async (
    show: boolean,
    declaration: string,
  ): Promise<{host: HTMLElement; target: HTMLElement}> => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', JSON.stringify({show, d: declaration}));
    host.innerHTML = '<i id="t" data-if="show" data-attr-style="{{d}}">x</i>';
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForIdle();
    return {host, target: document.getElementById('t') as HTMLElement};
  };

  it('外部が display を書き換えても非表示へ戻す', async () => {
    // 仕様「data-if の動作」の「非表示のあいだに外部から `style.display` を書き換えた
    // 場合は、**追随結果を書き直して非表示へ戻します**」。取り込まないだけでは、
    // `data-if-false` が付いているのに要素が見えたままになる。
    const {target} = await mount(false, 'display: flex');
    expect(target.style.display).toBe('none');

    target.style.setProperty('display', 'block');
    await waitForIdle();

    expect(target.style.display).toBe('none');
    expect(target.style.getPropertyPriority('display')).toBe('important');
    expect(target.hasAttribute('data-if-false')).toBe(true);
  });

  it('宣言が無い要素でも戻し、外部が書いた値を控えにしない', async () => {
    // 外部の書き換えは宣言ではないため、控えを取り直してはならない。取り直すと、
    // 表示へ戻したときに宣言でない値（`block`）が復元される（仕様「data-if の動作」
    // の「復元するのはその時点の宣言です」）。
    // `style` の宣言を持つ要素では観測できない。表示へ戻す更新では宣言の再適用が
    // 先に走り、そこで控えを取り直すため、外部の値が上書きされて消えるからである。
    // 宣言が無い要素は再適用が走らないので、控えの中身がそのまま表に出る。
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"show":false}');
    host.innerHTML = '<i id="t" data-if="show">x</i>';
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForIdle();
    const target = document.getElementById('t') as HTMLElement;
    expect(target.style.display).toBe('none');

    target.style.setProperty('display', 'block');
    await waitForIdle();
    expect(target.style.display).toBe('none');

    await Core.setBindingData(host, {show: true});
    await waitForIdle();
    expect(target.hasAttribute('data-if-false')).toBe(false);
    // 宣言が無いので、表示へ戻したら `display` の指定も無い状態へ戻る。
    expect(target.style.display).toBe('');
  });

  it('display 以外の書き換えは残す', async () => {
    // 対照。書き直すのは `display` だけ。他のプロパティまで戻すと、非表示のあいだの
    // 外部の書き込みを一律に捨てることになる。
    const {target} = await mount(false, 'display: flex');
    target.style.setProperty('color', 'rgb(1, 2, 3)');
    await waitForIdle();

    expect(target.style.display).toBe('none');
    expect(target.style.color).toBe('rgb(1, 2, 3)');
  });

  it('表示中の要素の書き換えには触らない', async () => {
    // 対照。書き直すのは内部状態が非表示のあいだだけ。表示中にも効かせると、
    // 利用者やライブラリの `display` の指定が消える。
    const {target} = await mount(true, 'display: flex');
    expect(target.style.display).toBe('flex');

    target.style.setProperty('display', 'block');
    await waitForIdle();
    expect(target.style.display).toBe('block');
  });
});
