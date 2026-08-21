/* @vitest-environment jsdom */
/**
 * @fileoverview 型の食い違う厳密比較の開発モード診断のテスト。
 *
 * `===` / `!==` の両辺の型が違うと、値が同じでも比較は必ず偽になる。
 * `data-attr-selected` / `data-attr-checked` では「選択やチェックが付かない」、
 * その他の `data-attr-*` では「属性が消える」という形でしか現れないため、原因の
 * 宣言に辿り着けない。開発モードで属性名・テンプレート・両辺の型を名指しする。
 *
 * 期待値の根拠は仕様「`data-attr-*`」の「開発モードでは、型の食い違う厳密比較を
 * 警告します」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import {waitForIdle} from './helpers/async';

describe('型の食い違う厳密比較の診断', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    Dev.disable();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * 開発モードで走査し、警告メッセージの一覧を返します。
   *
   * @param html 対象の HTML
   * @returns 出力された警告メッセージ
   */
  const warningsFor = async (html: string): Promise<string[]> => {
    Dev.enable();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    container.innerHTML = html;
    await Core.scan(container);
    await waitForIdle();
    return warn.mock.calls.map(args => args.join(' '));
  };

  /**
   * 厳密比較の診断メッセージだけを抜き出します。
   *
   * @param messages 警告メッセージの一覧
   * @returns 診断メッセージ
   */
  const diagnostics = (messages: string[]): string[] =>
    messages.filter(message => message.includes('strict comparison'));

  it('数値と文字列を比べた option の selected を、両辺の型を添えて警告する', async () => {
    const messages = await warningsFor(
      `<div data-bind='{"optionId":1,"selectedId":"1"}'>
         <select>
           <option value="1"
                   data-attr-selected="{{optionId === selectedId}}">鉄</option>
         </select>
       </div>`,
    );

    const reported = diagnostics(messages);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('number vs string');
    expect(reported[0]).toContain(
      'data-attr-selected="{{optionId === selectedId}}"',
    );
  });

  it("`比較 && 'selected'` の書き方でも警告する", async () => {
    // ガイドが案内している書き方。`&&` の左側が偽なら全体が偽になるため、左側を
    // 診断する。
    const messages = await warningsFor(
      `<div data-bind='{"andOptionId":3,"andSelectedId":"3"}'>
         <select>
           <option value="3"
                   data-attr-selected="{{andOptionId === andSelectedId && 'selected'}}"
                   >銅</option>
         </select>
       </div>`,
    );

    const reported = diagnostics(messages);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('number vs string');
  });

  it('`条件 && 比較` は警告しない', async () => {
    // 偽になった理由が左側の条件かもしれないため、比較へは帰属できない。
    const messages = await warningsFor(
      `<div data-bind='{"guard":false,"guardId":7,"guardPicked":"7"}'>
         <input data-attr-value="{{guard && guardId === guardPicked}}">
       </div>`,
    );

    expect(diagnostics(messages)).toEqual([]);
  });

  it('同じ宣言は再評価のたびに警告しない', async () => {
    const messages = await warningsFor(
      `<div id="scope" data-bind='{"rowId":2,"pickedId":"2"}'>
         <input data-attr-checked="{{rowId === pickedId}}" type="checkbox">
       </div>`,
    );
    const before = diagnostics(messages).length;
    expect(before).toBe(1);

    await Core.setBindingData(
      container.querySelector('#scope') as HTMLElement,
      {rowId: 2, pickedId: '2', other: 1},
    );
    await waitForIdle();

    // 再評価しても同じ宣言は増えない。
    expect(diagnostics(messages)).toHaveLength(before);
  });

  it('値そのものが違う比較は警告しない', async () => {
    const messages = await warningsFor(
      `<div data-bind='{"leftNum":1,"rightText":"9"}'>
         <input data-attr-value="{{leftNum === rightText}}">
       </div>`,
    );

    expect(diagnostics(messages)).toEqual([]);
  });

  it('未解決参照を含む比較は警告しない', async () => {
    // 値の無いキーを含む比較は、型より前に宣言かデータの問題。既存の未解決参照の
    // 警告が報告するため、こちらでは報告しない。
    const messages = await warningsFor(
      `<div data-bind='{"list":[],"nothing":null}'>
         <input data-attr-value="{{list[5] === nothing}}">
       </div>`,
    );

    expect(diagnostics(messages)).toEqual([]);
  });

  it('論理演算を含む式は警告しない', async () => {
    // 全体の結果を厳密比較だけでは決められないため対象外にする。
    const messages = await warningsFor(
      `<div data-bind='{"enabled":false,"idNum":3,"idText":"3"}'>
         <input data-attr-value="{{enabled || idNum === idText}}">
       </div>`,
    );

    expect(diagnostics(messages)).toEqual([]);
  });

  it('厳密比較が 2 つ以上ある式は警告しない', async () => {
    // `a === b === c` は `(a === b) === c` なので、片方の比較だけを取り出すと
    // 真偽値と数値の比較になり、誤った報告になる。
    const messages = await warningsFor(
      `<div data-bind='{"one":5,"two":5,"three":1}'>
         <input data-attr-value="{{one === two === three}}">
       </div>`,
    );

    expect(diagnostics(messages)).toEqual([]);
  });

  it('開発モードでなければ警告しない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    container.innerHTML = `
      <div data-bind='{"prodId":4,"prodPicked":"4"}'>
        <input data-attr-value="{{prodId === prodPicked}}">
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    expect(
      diagnostics(warn.mock.calls.map(args => args.join(' '))),
    ).toEqual([]);
  });
});
