/* @vitest-environment jsdom */
/**
 * @fileoverview 厳密比較の型の診断が、比較の各辺を評価したことで別の診断を出さないことの検証。
 *
 * `{{state.loading === true}}` のような判定する式は、`state` が無くても「無い＝偽」と
 * 結論が出るため、未解決参照として報告しません。ところが開発モードでは、評価結果が
 * 偽の厳密比較について型の食い違いを診断するため、比較の各辺（`state.loading`）を
 * 改めて評価します。その評価が未解決参照として記録され、宣言には無い式で警告が
 * 出ていました（`!!state.loading` では出ないのに、`=== true` では出る）。
 *
 * 期待値の根拠は仕様「未解決参照の診断」。テスト間で診断の状態を共有するため、
 * テストごとに別のキー名を使い、警告はキー名で絞り込みます。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Expression from '../src/expression';
import Queue from '../src/queue';

/**
 * 属性を 1 つ持つ要素を走査し、描画が落ち着くまで待ちます。
 *
 * @param name 属性名
 * @param template 属性の値
 * @return 戻り値はありません。
 */
const scanWithAttribute = async (
  name: string,
  template: string,
): Promise<void> => {
  const root = document.createElement('div');
  const element = document.createElement('p');
  element.setAttribute(name, template);
  root.appendChild(element);
  document.body.appendChild(root);
  await Core.scan(root);
  await Queue.waitForIdle();
  await Queue.waitForIdle();
};

/**
 * 呼び出しの引数を 1 つの文字列にまとめます。
 *
 * @param spy console のスパイ
 * @return 呼び出しごとの文字列
 */
const messagesOf = (spy: ReturnType<typeof vi.spyOn>): string[] =>
  (spy.mock.calls as unknown[][]).map(args =>
    args.map(arg => String(arg)).join(' '),
  );

describe('厳密比較の診断は、各辺の評価で別の診断を出さない', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setStrictBind(false);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Env.setStrictBind(false);
    Dev.enable();
  });

  it.each([['data-x'], ['data-if']])(
    '%s に書いた未解決の値との厳密比較は、未解決参照として報告しない',
    async name => {
      // 仕様「未解決参照の診断」の「[判定する式](#判定する式と値を求める式)として
      // 結論が出た場合は報告しません」
      const key = name === 'data-x' ? 'sideStateX' : 'sideStateIf';
      await scanWithAttribute(name, `{{${key}.loading === true}}`);
      expect(messagesOf(warn).filter(message => message.includes(key))).toEqual(
        [],
      );
    },
  );

  it('厳格バインドモードでも、未解決の値との厳密比較をエラーにしない', async () => {
    // 仕様「未解決参照の診断」の「[判定する式](#判定する式と値を求める式)として
    // 結論が出た場合は報告しません」
    Env.setStrictBind(true);
    await scanWithAttribute('data-x', '{{strictSideState.loading === true}}');
    expect(
      messagesOf(error).filter(message => message.includes('strictSideState')),
    ).toEqual([]);
  });

  it('別スコープで供給されたキーとの厳密比較は、宣言した式だけを報告する', async () => {
    // 仕様「未解決参照の診断」の「同じ式とキーの組は一度だけ報告します」
    Expression.evaluateDetailed('crossSideState.loading', {
      crossSideState: {loading: true},
    });
    await scanWithAttribute('data-x', '{{crossSideState.loading === true}}');
    const reported = messagesOf(warn).filter(
      message =>
        message.includes('missing from this scope') &&
        message.includes('crossSideState'),
    );
    expect(reported.length).toBe(1);
    expect(reported[0]).toContain('crossSideState.loading === true');
  });

  it('型が食い違う厳密比較は、これまでどおり報告する', async () => {
    // 仕様「`data-attr-*`」の「開発モードでは、型の食い違う厳密比較を警告します」
    const root = document.createElement('div');
    root.setAttribute('data-bind', '{"typedSideId": 1, "typedSideValue": "1"}');
    const element = document.createElement('p');
    element.setAttribute('data-x', '{{typedSideId === typedSideValue}}');
    root.appendChild(element);
    document.body.appendChild(root);
    await Core.scan(root);
    await Queue.waitForIdle();
    expect(
      messagesOf(warn).some(
        message =>
          message.includes('typedSideId === typedSideValue') &&
          message.includes('number'),
      ),
    ).toBe(true);
  });
});
