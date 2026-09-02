/* @vitest-environment jsdom */
/**
 * @fileoverview `display` の宣言を持つ要素の `data-if` による非表示の検証。
 *
 * `hide()` は `display: none !important` を追随結果として DOM へ書きますが、属性の
 * 再適用は `style` 属性をまるごと宣言の値へ置き換えます。追随結果を優先しないと、
 * `data-if-false` は付いているのに要素は見えたまま、という食い違いが残ります。
 * 判定の基準は内部状態なので `show()` は何もせず、その要素は条件によらず見え続けます。
 *
 * 期待値の根拠は仕様「data-if の動作」の「`data-if` が false の場合、要素を
 * `display: none` で非表示にする」と、同節の「判定の基準は内部状態であり、
 * `style.display` や `data-if-false` は追随結果として扱う」。
 *
 * 追随結果を宣言として取り込まないことは
 * [tests/follow-up-artifact-intake.test.ts](./follow-up-artifact-intake.test.ts)
 * が固定しています。こちらは逆向き（宣言が追随結果を消さないこと）です。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('display の宣言を持つ要素の data-if', () => {
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
   * `data-if` を持つ要素を組み立てて走査します。
   *
   * @param style 対象要素へ書く `style` の宣言
   * @param show `data-if` が参照する値
   * @returns 対象要素とホスト要素
   */
  const mount = async (
    style: string,
    show: boolean,
  ): Promise<{host: HTMLElement; target: HTMLElement}> => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', JSON.stringify({show}));
    host.innerHTML = `<i id="t" data-if="show" style="${style}">x</i>`;
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForIdle();
    return {host, target: document.getElementById('t') as HTMLElement};
  };

  it('display の宣言があっても隠れる', async () => {
    // 仕様「data-if の動作」の「`data-if` が false の場合、要素を `display: none`
    // で非表示にする」。宣言の再適用が追随結果を消してはならない。
    const {target} = await mount('display: flex', false);
    expect(target.hasAttribute('data-if-false')).toBe(true);
    expect(target.style.display).toBe('none');
  });

  it('空の style の宣言があっても隠れる', async () => {
    // 空の `style` も宣言として取り込まれるため、同じ経路で追随結果を消す。
    const {target} = await mount('', false);
    expect(target.hasAttribute('data-if-false')).toBe(true);
    expect(target.style.display).toBe('none');
  });

  it('表示へ戻すと display の宣言が復帰する', async () => {
    // 非表示は追随結果なので、表示へ戻したら利用者の宣言が残る（仕様「data-if の
    // 動作」の「追随結果は**宣言として取り込みません**」）。`display: none` を
    // 宣言ごと消してしまうと、戻したときに `flex` でなくなる。
    const {host, target} = await mount('display: flex', false);
    expect(target.style.display).toBe('none');
    await Core.setBindingData(host, {show: true});
    await waitForIdle();
    expect(target.hasAttribute('data-if-false')).toBe(false);
    expect(target.style.display).toBe('flex');
  });

  it('display を含まない宣言は従来どおり保たれる', async () => {
    // 対照。追随結果の優先は `display` だけに効かせる。他のプロパティを触ると
    // 利用者の宣言を壊す。
    const {target} = await mount('color: red', false);
    expect(target.style.display).toBe('none');
    expect(target.style.color).toBe('red');
  });

  it('表示中に style の宣言が変わっても隠さない', async () => {
    // 追随結果の書き戻しは**内部状態が非表示のあいだ**だけに効かせる。表示中の
    // 要素にも効かせると、`data-attr-style` の値が変わったときに要素が消える。
    // `data-attr-style` は解決後の属性名が `style` になるため、同じ経路を通る。
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"show":true,"s":"color: red"}');
    host.innerHTML = '<i id="t" data-if="show" data-attr-style="{{s}}">x</i>';
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForIdle();
    const target = document.getElementById('t') as HTMLElement;
    expect(target.style.color).toBe('red');
    expect(target.style.display).not.toBe('none');

    await Core.setBindingData(host, {show: true, s: 'color: blue'});
    await waitForIdle();
    expect(target.style.color).toBe('blue');
    expect(target.style.display).not.toBe('none');
  });

  it('非表示のあいだに宣言が変わっても、戻すと最新の宣言になる', async () => {
    // 非表示は追随結果なので、表示へ戻したときに残るのは**その時点の宣言**。
    // `hide()` の時点で控えた値を戻すと、非表示のあいだに変えた宣言が失われる
    // （仕様「data-if の動作」の「**戻す値はその時点の宣言**（`style` /
    // `data-attr-style`）であり、隠した時点の値ではない」）。
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"show":false,"d":"display: flex"}');
    host.innerHTML = '<i id="t" data-if="show" data-attr-style="{{d}}">x</i>';
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForIdle();
    const target = document.getElementById('t') as HTMLElement;
    expect(target.style.display).toBe('none');

    // 非表示のまま宣言を変える。
    await Core.setBindingData(host, {show: false, d: 'display: grid'});
    await waitForIdle();
    expect(target.style.display).toBe('none');

    // 表示へ戻すと、最新の宣言が効く。
    await Core.setBindingData(host, {show: true, d: 'display: grid'});
    await waitForIdle();
    expect(target.hasAttribute('data-if-false')).toBe(false);
    expect(target.style.display).toBe('grid');
  });

  it('非表示のあいだに宣言の優先度が変わっても、戻すと最新の優先度になる', async () => {
    // 期待値は仕様「data-if の動作」の「控えはそのたびに宣言から取り直す」。
    // 控えは値と優先度の組で戻すため、片方だけ取り直すと食い違う。`!important` の
    // 宣言を外したのに `!important` が残ると、後から当てる CSS が効かなくなる。
    // 表示状態から隠す。`hide()` はこの時点の優先度（`important`）を控える。
    // 最初から非表示だと `hide()` が宣言の書き込みより先に走り、控えが空のまま
    // になるため、優先度の食い違いが出ない。
    // この観測点の検出力は、表示へ戻す更新で `show()` が `style` の再適用より
    // 後に走ることに依っている（先に走ると、再適用が優先度なしの宣言をそのまま
    // 書き直すため、控えが古くても差が出ない）。順序が変わった場合、このテストは
    // 落ちずに検出力だけを失うので、そのときは観測点を作り直す。
    const host = document.createElement('div');
    host.setAttribute(
      'data-bind',
      '{"show":true,"d":"display: flex !important"}',
    );
    host.innerHTML = '<i id="t" data-if="show" data-attr-style="{{d}}">x</i>';
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForIdle();
    const target = document.getElementById('t') as HTMLElement;
    expect(target.style.getPropertyPriority('display')).toBe('important');

    await Core.setBindingData(host, {
      show: false,
      d: 'display: flex !important',
    });
    await waitForIdle();
    expect(target.style.display).toBe('none');

    // 非表示のまま、優先度を外した宣言へ変える。
    await Core.setBindingData(host, {show: false, d: 'display: grid'});
    await waitForIdle();

    await Core.setBindingData(host, {show: true, d: 'display: grid'});
    await waitForIdle();
    expect(target.style.display).toBe('grid');
    expect(target.style.getPropertyPriority('display')).toBe('');
  });

  it('非表示のあいだに宣言が変わらなければ、元の宣言へ戻る', async () => {
    // 対照。控えを取り直しても、宣言が変わっていなければ結果は変わらない。
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"show":true,"d":"display: flex"}');
    host.innerHTML = '<i id="t" data-if="show" data-attr-style="{{d}}">x</i>';
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForIdle();
    const target = document.getElementById('t') as HTMLElement;
    expect(target.style.display).toBe('flex');

    await Core.setBindingData(host, {show: false, d: 'display: flex'});
    await waitForIdle();
    expect(target.style.display).toBe('none');

    await Core.setBindingData(host, {show: true, d: 'display: flex'});
    await waitForIdle();
    expect(target.style.display).toBe('flex');
  });

  it('真のときは宣言どおりに表示する', async () => {
    // 対照。非表示でない要素の `display` には触らない。
    const {target} = await mount('display: flex', true);
    expect(target.hasAttribute('data-if-false')).toBe(false);
    expect(target.style.display).toBe('flex');
  });
});
