/* @vitest-environment jsdom */
/**
 * @fileoverview 初期化完了後（監視稼働中）の `data-import` の検証。
 *
 * 取り込みは初期化の前後で経路が分かれていた。初期化後は監視（`Core.addNode`）へ
 * 委ねていたが、この経路は同じ変更通知で追加された 2 つ目以降のノードを取りこぼす
 * （`insertBefore` が挿入のあいだ立てる抑止フラグに、同じ通知の後続の `addNode` が
 * 掛かるため）。表面化するかどうかは通知順序に依存し、実ブラウザでは通る一方で
 * この環境では断片が評価されないまま（`{{...}}` が生のまま）だった。取り込み側で
 * 常に走査するようにして依存を断ったことの回帰テストである。実ブラウザ側は
 * `playwright/import-scope.spec.cjs` で押さえている。
 *
 * `src/observer` は読み込みだけで初期化（`document.body` の走査と監視開始）が
 * 走るため、他のテストへ影響しないようファイルを分けている。
 *
 * 期待値の根拠は仕様「`data-import`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Queue from '../src/queue';
import {waitForDomSettled} from './helpers/async';

/** 取り込む断片（`<body>` の中身だけが使われる）。 */
const FRAGMENT_HTML = `<!DOCTYPE html><html><body>
<p id="frag-text">現在のステップ: {{currentStep}} / 名前: {{user.name}}</p>
<p id="frag-if" data-if="currentStep === 2">ステップ2のときだけ表示</p>
</body></html>`;

describe('初期化後の data-import', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(FRAGMENT_HTML, {
          status: 200,
          headers: {'Content-Type': 'text/html'},
        }),
    ) as unknown as typeof fetch;
    // 読み込み時点では URL が未解決なので、初期化中は取り込みを行わない。
    document.body.innerHTML = `
      <div id="host" data-bind='{"currentStep":2,"user":{"name":"テスト太郎"}}'>
        <div id="imported" data-import="{{url}}"></div>
      </div>`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-haori-ready');
  });

  it('初期化後に URL が確定した取り込みも評価される', async () => {
    // 実ページと同じ入口（読み込み時の init → 走査 → ready → 監視開始）を通す。
    await import('../src/observer');
    for (let i = 0; i < 6; i += 1) {
      await waitForDomSettled();
      await Queue.waitForIdle();
    }
    expect(document.body.hasAttribute('data-haori-ready')).toBe(true);
    expect(document.querySelector('#frag-text'), '未解決なので未実行').toBe(
      null,
    );

    const Core = (await import('../src/core')).default;
    await Core.setBindingData(document.querySelector('#host') as HTMLElement, {
      currentStep: 2,
      user: {name: 'テスト太郎'},
      url: '/fragment.html',
    });
    for (let i = 0; i < 8; i += 1) {
      await waitForDomSettled();
      await Queue.waitForIdle();
    }

    expect(document.querySelector('#frag-text')?.textContent).toBe(
      '現在のステップ: 2 / 名前: テスト太郎',
    );
    expect(
      document.querySelector('#frag-if')?.hasAttribute('data-if-false'),
    ).toBe(false);
  });
});
