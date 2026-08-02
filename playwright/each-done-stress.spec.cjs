/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 同一バインドホストの配下に data-each が複数あるとき、描画完了マーカー
// (`data-each-done`) が確定しないことがあるという報告の検証。報告は 0.24.0 で
// 「単体では再現しにくく、一括実行で数回に 1 回」という不安定な事象だったため、
// 実ブラウザ（実 requestAnimationFrame）で連続実行して確定を確かめる。
//
// 判定は「その回のデータが描画され、かつ両方のマーカーが付く」ことまで見る。
// マーカーだけを見ると、前の回の状態が残っているあいだに評価が通ってしまい、
// その回の確定を検証できない（マーカーは「除去 → 再付与」で運用されるため、
// 除去より前に読むと前回の付与が見える）。
const {test, expect} = require('@playwright/test');

/** 受け入れ条件に合わせた連続実行の回数。 */
const ROUNDS = 20;

/** 変更履歴の行数。 */
const HISTORY_ROWS = 25;

/** 1 回あたりの確定待ちの上限（ミリ秒）。 */
const SETTLE_TIMEOUT = 5000;

/**
 * バインドホストへ流し込むデータを組み立てる関数を、ブラウザ側で使えるように
 * 文字列ではなく引数で渡すための素材です。
 *
 * @param {number} seed 回ごとに変える種
 * @param {string} tab 表示するタブ
 * @param {number} rows 変更履歴の行数
 * @returns {object} バインドデータ
 */
function buildData(seed, tab, rows) {
  return {
    tab,
    fields: Array.from({length: 5}, (unused, index) => ({
      id: `f${seed}-${index}`,
      label: `項目${index}`,
    })),
    history: Array.from({length: rows}, (unused, index) => ({
      id: `h${seed}-${index}`,
      field: `項目${index}`,
      before: `旧${seed}`,
      after: `新${seed}`,
    })),
  };
}

/**
 * 現在の状態を読み取ります。失敗時の材料にします。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<object>} マーカー・行数・先頭行の値
 */
function readState(page) {
  return page.evaluate(() => ({
    filter: document.getElementById('filter').hasAttribute('data-each-done'),
    history: document.getElementById('history').hasAttribute('data-each-done'),
    rows: document.querySelectorAll('#history .before').length,
    first:
      document.querySelector('#history .before')?.textContent ?? '(no rows)',
  }));
}

/**
 * その回のデータが描画され、両方のマーカーが付くまで待ちます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {number} seed 期待する回の種
 * @returns {Promise<boolean>} 期限内に確定したら true
 */
async function waitForSettled(page, seed) {
  try {
    await page.waitForFunction(
      ({seed, rows}) => {
        const filter = document.getElementById('filter');
        const history = document.getElementById('history');
        const cells = document.querySelectorAll('#history .before');
        return (
          cells.length === rows &&
          Array.from(cells).every(cell => cell.textContent === `旧${seed}`) &&
          filter.hasAttribute('data-each-done') &&
          history.hasAttribute('data-each-done')
        );
      },
      {seed, rows: HISTORY_ROWS},
      {timeout: SETTLE_TIMEOUT},
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * ページを開き、スクリプトエラーの収集を始めます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<string[]>} 収集先（JS エラーと console.error）
 */
async function open(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  await page.goto('/playwright/each-done-stress-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
  return errors;
}

test.describe('data-each-done の確定', () => {
  test(`再バインドを ${ROUNDS} 回繰り返してもマーカーが確定する`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = await open(page);

    const failures = [];
    for (let round = 1; round <= ROUNDS; round += 1) {
      await page.evaluate(
        data =>
          window.Haori.Core.setBindingData(
            document.getElementById('state'),
            data,
          ),
        buildData(round, 'history', HISTORY_ROWS),
      );
      if (!(await waitForSettled(page, round))) {
        failures.push(
          `round ${round}: ${JSON.stringify(await readState(page))}`,
        );
      }
    }

    expect(failures, `確定しなかった回:\n${failures.join('\n')}`).toEqual([]);
    // 例外で描画ループが確定前に抜けていないこと（報告の原因候補のひとつ）。
    expect(errors, `エラー出力:\n${errors.join('\n')}`).toEqual([]);
  });

  test('確定を待たずに更新を重ねてもマーカーが確定する', async ({page}) => {
    test.setTimeout(120000);
    const errors = await open(page);

    const failures = [];
    for (let round = 1; round <= ROUNDS; round += 1) {
      // 前の更新の描画確定を待たずに次を流し込み、再入経路（rerunRequested）を
      // 通す。1 回目はタブを交互に切り替えて、非表示のあいだに更新が入る場合も
      // 混ぜる。最終状態は必ず history タブの seed + 500 になる。
      await page.evaluate(
        ({first, second}) => {
          const state = document.getElementById('state');
          void window.Haori.Core.setBindingData(state, first);
          void window.Haori.Core.setBindingData(state, second);
        },
        {
          first: buildData(round, round % 2 === 0 ? 'other' : 'history', 10),
          second: buildData(round + 500, 'history', HISTORY_ROWS),
        },
      );
      if (!(await waitForSettled(page, round + 500))) {
        failures.push(
          `round ${round}: ${JSON.stringify(await readState(page))}`,
        );
      }
    }

    expect(failures, `確定しなかった回:\n${failures.join('\n')}`).toEqual([]);
    expect(errors, `エラー出力:\n${errors.join('\n')}`).toEqual([]);
  });
});
