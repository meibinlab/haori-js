/* @vitest-environment jsdom */
/**
 * @fileoverview 注入前の `_fetch` を `!!` で揃えた宣言が、開発モードで警告されないことの検証。
 *
 * 未解決参照の集約警告は、モジュールの中で共有する状態から描画が落ち着いた時点に
 * 出ます。ほかのテストで未解決の `_fetch` を評価すると、その警告がこのファイルの
 * 確認に混ざるため、`!!` で揃えた宣言だけをこのファイルで評価します。
 *
 * 期待値の根拠は仕様「`data-fetch-state` / `data-{event}-fetch-state`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Queue from '../src/queue';

describe('注入前の _fetch を !! で揃えた宣言の警告', () => {
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

  it.each([
    ['data-lock', '{{!!_fetch.loading}}'],
    ['disabled', '{{!!_fetch.loading}}'],
    ['data-if', '{{!!_fetch.loading}}'],
  ])('%s に書いた !! の式は、注入前に警告されない', async (name, template) => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「判定する式として
    // 「無い＝偽」の結論が出るため、どちらの警告も出ません」
    const root = document.createElement('div');
    const element = document.createElement('button');
    element.setAttribute(name, template);
    root.appendChild(element);
    document.body.appendChild(root);
    await Core.scan(root);
    await Queue.waitForIdle();
    await Queue.waitForIdle();
    const messages = (warn.mock.calls as unknown[][])
      .map(args => args.map(arg => String(arg)).join(' '))
      .filter(message => message.includes('_fetch'));
    expect(messages).toEqual([]);
  });
});
