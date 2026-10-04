/* @vitest-environment jsdom */
/**
 * @fileoverview 注入前の `_fetch` を `!!` で真偽へ揃えて参照する書き方の検証。
 *
 * クリックで取得する構成では、`_fetch` は取得まで注入されません。その間の宣言が
 * どう評価され、開発モードで何が警告されるかを確かめます。
 *
 * 開発モードの未解決参照の集約警告は、ファイル内の全テストで共有する状態から
 * 出るため、「警告されない」ことの確認は別ファイル
 * （`fetch-state-boolean-no-warning.test.ts`・`fetch-state-unresolved-warning.test.ts`）
 * に分けています。
 *
 * 期待値の根拠は仕様「`data-fetch-state` / `data-{event}-fetch-state`」、
 * 仕様「判定する式と値を求める式」、仕様「プレースホルダ解決規則」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Expression from '../src/expression';
import Queue from '../src/queue';

/** `_fetch` を名指しする警告だけを抜き出します。 */
const fetchWarnings = (warn: ReturnType<typeof vi.spyOn>): string[] =>
  (warn.mock.calls as unknown[][])
    .map(args => args.map(arg => String(arg)).join(' '))
    .filter(message => message.includes('_fetch'));

/**
 * 属性を 1 つ持つ要素を走査し、描画が落ち着くまで待ちます。
 *
 * @param name 属性名
 * @param template 属性の値
 * @return 走査した要素
 */
const scanWithAttribute = async (
  name: string,
  template: string,
): Promise<HTMLElement> => {
  const root = document.createElement('div');
  const element = document.createElement('button');
  element.setAttribute(name, template);
  root.appendChild(element);
  document.body.appendChild(root);
  await Core.scan(root);
  await Queue.waitForIdle();
  return element;
};

describe('注入前の _fetch を !! で揃えて参照する', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setStrictBind(false);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Dev.enable();
  });

  it('!! を付けた式は未解決参照にならず、偽の結論が出る', () => {
    // 仕様「判定する式と値を求める式」の表の「`{{!!_fetch.loading}}` | `false` | ×」
    const detail = Expression.evaluateDetailed('!!_fetch.loading', {});
    expect(detail.value).toBe(false);
    expect(detail.unresolvedReference).toBe(false);
  });

  it('!! を付けない式は未解決参照になる', () => {
    // 仕様「判定する式と値を求める式」の表の「`{{_fetch.loading}}` | `undefined` | ○」
    const detail = Expression.evaluateDetailed('_fetch.loading', {});
    expect(detail.value).toBeUndefined();
    expect(detail.unresolvedReference).toBe(true);
  });

  it('属性に書いた !! の式は、偽なら属性を削除し、真なら "true" を書く', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「属性では、偽なら
    // 属性を削除し、真なら `"true"` を書きます」
    const element = await scanWithAttribute(
      'data-lock',
      '{{!!_fetch.loading}}',
    );
    expect(element.hasAttribute('data-lock')).toBe(false);

    await Core.setBindingData(element.parentElement!, {
      _fetch: {loading: true},
    });
    await Queue.waitForIdle();
    expect(element.getAttribute('data-lock')).toBe('true');

    await Core.setBindingData(element.parentElement!, {
      _fetch: {loading: false},
    });
    await Queue.waitForIdle();
    expect(element.hasAttribute('data-lock')).toBe(false);
  });

  it.each([['{{_fetch.loading}}'], ['{{_fetch?.loading}}']])(
    '属性に書いた %s は、注入前に反映を見送った警告が出る',
    async template => {
      // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「属性（`data-*`・
      // `disabled` など）に書いた `{{_fetch.loading}}` は、注入より前に評価されると、
      // 反映を見送った警告も出ます。属性では `?.` を付けても、この警告は消えません」
      await scanWithAttribute('data-lock', template);
      await Queue.waitForIdle();
      expect(
        fetchWarnings(warn).some(message =>
          message.includes('was not applied because the expression has'),
        ),
      ).toBe(true);
    },
  );

  it('文字列属性の単体プレースホルダは、0 を "0" として設定する', async () => {
    // 仕様「プレースホルダ解決規則」の「それ以外の評価結果は文字列にして設定します
    // （`true` は `"true"`、`0` は `"0"`）」
    const root = document.createElement('div');
    root.setAttribute('data-bind', '{"count": 0}');
    const element = document.createElement('span');
    element.setAttribute('data-count', '{{count}}');
    root.appendChild(element);
    document.body.appendChild(root);
    await Core.scan(root);
    await Queue.waitForIdle();
    expect(element.getAttribute('data-count')).toBe('0');
  });
});
