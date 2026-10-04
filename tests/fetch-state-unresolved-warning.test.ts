/* @vitest-environment jsdom */
/**
 * @fileoverview 注入前の `_fetch` を `!!` なしで `data-if` に書いた宣言が、開発モードで
 * 未解決参照として警告されることの検証。
 *
 * 未解決参照の集約警告は、モジュールの中で共有する状態から描画が落ち着いた時点に
 * 出ます。ほかの宣言の警告と見分けられないため、この宣言だけをこのファイルで評価します。
 *
 * 期待値の根拠は仕様「`data-fetch-state` / `data-{event}-fetch-state`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Queue from '../src/queue';

describe('注入前の _fetch を !! なしで data-if に書いた宣言の警告', () => {
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

  it('data-if に書いた _fetch.loading は、注入前に未解決参照として警告される', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の「`data-if="_fetch.loading"`
    // などは、フェッチより前に描画が落ち着くと（クリックで取得する構成など）、
    // 未解決参照として警告されます」
    const root = document.createElement('div');
    const element = document.createElement('p');
    element.setAttribute('data-if', '{{_fetch.loading}}');
    root.appendChild(element);
    document.body.appendChild(root);
    await Core.scan(root);
    await Queue.waitForIdle();
    await Queue.waitForIdle();
    const messages = (warn.mock.calls as unknown[][]).map(args =>
      args.map(arg => String(arg)).join(' '),
    );
    expect(
      messages.some(
        message =>
          message.includes('_fetch') &&
          message.includes('were never provided by any binding'),
      ),
    ).toBe(true);
  });
});
