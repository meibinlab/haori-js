/**
 * @fileoverview 300 行の一覧で、従来の方式と CSP モードの描画の時間を計ります
 *
 * `npm run bench:browser` で流します（先に `npm run build` で dist を作ります）。
 * ヘッドレスの Chrome（`channel: 'chrome'`）で `bench/csp-list.html` を開き、
 * 2 つの方式を交互に計って中央値を出します。回数は引数で変えられます
 * （`npm run bench:browser -- 12`。既定は 8 回、1 回目は捨てます）。
 */

import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {chromium} from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rounds = Number(process.argv[2] ?? 8);

const browser = await chromium.launch({channel: 'chrome'});
try {
  const page = await browser.newPage();
  page.on('console', message => {
    if (message.type() === 'error') {
      console.error('console error:', message.text());
    }
  });
  await page.goto(pathToFileURL(path.join(root, 'bench/csp-list.html')).href);
  await page.waitForFunction(() => window.Haori && window.runBench);
  const result = await page.evaluate(count => window.runBench(count), rounds);
  console.log(`300 行の一覧（${rounds - 1} 回の中央値、ミリ秒）`);
  console.log('方式\t広さ\t開く\t変える\t足す');
  for (const [mode, widths] of Object.entries(result)) {
    for (const [width, [open, change, add]] of Object.entries(widths)) {
      console.log(`${mode}\t${width}\t${open}\t${change}\t${add}`);
    }
  }
} finally {
  await browser.close();
}
