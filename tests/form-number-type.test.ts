/* @vitest-environment jsdom */
/**
 * @fileoverview type="number" 入力の値を数値型として収集することの回帰テスト。
 * 文字列ではなく number 型でバインド／送信されること、空・小数・バインド経由の
 * いずれでも数値化されること、他の入力種別は影響を受けないことを検証する。
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('type="number" の数値型変換', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // change イベントを syncValue へ委譲するために起動する
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.removeChild(container);
  });

  const getValues = async (html: string) => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    const form = container.querySelector('form')!;
    return Form.getValues(Fragment.get(form) as ElementFragment);
  };

  it('静的な value 属性を数値として収集する', async () => {
    const values = await getValues(`
      <form>
        <input type="number" name="qty" value="25">
        <input type="text" name="label" value="25">
      </form>
    `);
    expect(values.qty).toBe(25);
    // 同じ "25" でも text はそのまま文字列
    expect(values.label).toBe('25');
  });

  it('小数を数値として収集する', async () => {
    const values = await getValues(`
      <form><input type="number" name="rate" value="2.5"></form>
    `);
    expect(values.rate).toBe(2.5);
  });

  it('空の number 入力は null になる', async () => {
    const values = await getValues(`
      <form><input type="number" name="qty" value=""></form>
    `);
    expect(values.qty).toBeNull();
  });

  it('ユーザー入力（change）後も数値になる', async () => {
    container.innerHTML = `<form><input type="number" name="qty" value="1"></form>`;
    await Core.scan(container);
    await waitForDomSettled();
    const input = container.querySelector(
      'input[name="qty"]',
    ) as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    const values = Form.getValues(
      Fragment.get(container.querySelector('form')!) as ElementFragment,
    );
    expect(values.qty).toBe(42);
  });

  it('value="{{...}}" 経由（属性評価）でも数値として収集する', async () => {
    const values = await getValues(`
      <form data-bind='{"q":7}'>
        <input type="number" name="qty" value="{{q}}">
      </form>
    `);
    expect(values.qty).toBe(7);
  });

  it('数値文字列をバインドした number 入力も数値として収集する', async () => {
    container.innerHTML = `
      <form data-bind='{"qty":"7"}'>
        <input type="number" name="qty">
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();
    const form = Fragment.get(
      container.querySelector('form')!,
    ) as ElementFragment;
    await Form.setValues(form, {qty: '7'});
    await waitForDomSettled();
    const values = Form.getValues(form);
    expect(values.qty).toBe(7);
  });

  describe('ブラウザが受け付けない文字列は数値にしない', () => {
    /**
     * 値をバインドしてから収集します。
     *
     * 期待値の根拠は仕様「収集は DOM を真とする」の「数値として採用するのは、
     * ブラウザが `<input type="number">` の値として受け付ける文字列だけです」。
     * 受理する形と否認する例は同節の表による。
     *
     * @param raw バインドする値
     * @returns 収集された `qty` の値
     */
    const collect = async (raw: unknown): Promise<unknown> => {
      // 呼び出しごとに新しい部分木を作る。同じ要素の `innerHTML` を差し替えると
      // フラグメントが再利用され、2 回目以降は初期の逆方向同期が走らない。
      const host = document.createElement('div');
      container.appendChild(host);
      host.innerHTML = `
        <form data-bind='{"qty":${JSON.stringify(raw)}}'>
          <input type="number" name="qty" data-attr-value="{{qty}}">
        </form>`;
      await Core.scan(host);
      await waitForDomSettled();
      const form = Fragment.get(host.querySelector('form')!) as ElementFragment;
      return Form.getValues(form).qty;
    };

    it('16 進表記は null になる', async () => {
      expect(await collect('0x10')).toBeNull();
    });

    it('前後に空白を含む数字は null になる', async () => {
      expect(await collect('  12  ')).toBeNull();
    });

    it('先頭の + は null になる', async () => {
      expect(await collect('+5')).toBeNull();
    });

    it('小数点で終わる形は null になる', async () => {
      expect(await collect('5.')).toBeNull();
    });

    it('区切り文字を含む数字は null になる', async () => {
      expect(await collect('1_000')).toBeNull();
    });

    it('Infinity は null になる', async () => {
      expect(await collect('Infinity')).toBeNull();
      expect(await collect('-Infinity')).toBeNull();
    });

    it('指数表記と先頭が小数点の形は受理する', async () => {
      expect(await collect('1e5')).toBe(100000);
      expect(await collect('1.5e-3')).toBe(0.0015);
      expect(await collect('.5')).toBe(0.5);
    });

    it('符号つきの整数と小数は受理する', async () => {
      expect(await collect('-3')).toBe(-3);
      expect(await collect('-2.5')).toBe(-2.5);
    });
  });
});
