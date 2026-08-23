/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, window */
// scan の進行より先に値が供給されたとき、`data-each` の描画が取りこぼされない
// ことの確認。期待値は仕様「`data-each`」の「その**最初の子要素がテンプレート**
// として配列の要素数ぶん複製されます」から取っている。
//
// 単体テスト（tests/each-supply-during-scan.test.ts）は、実ブラウザで観測した
// 状態（文書の中にあるがマウント状態が false）を直接作って検証している。こちらは
// 組み立てと供給を繰り返して自然な間隙を突く。修正前の Chromium では 4 回に
// 1 回ほど一度も描画されないまま残ったため、繰り返し回数で検出する。
const {test, expect} = require('@playwright/test');

const RUNS = 24;

test.describe('scan と同じタスクでの供給', () => {
  test('繰り返しても必ず 7 行描画される', async ({page}) => {
    test.setTimeout(180000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    const failures = [];
    for (let attempt = 1; attempt <= RUNS; attempt += 1) {
      // 読み込みごとに 1 回だけ試す。同じページで繰り返すと監視とキューが
      // 温まって間隙が消えるため、毎回読み込み直す。
      await page.goto('/playwright/each-supply-race-repro.html');
      await page.waitForFunction(() => typeof window.__run === 'function');
      const result = await page.evaluate(() => window.__run());
      if (result.rows !== 7 || !result.done) {
        failures.push(
          `${attempt} 回目: rows=${result.rows} done=${result.done}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
