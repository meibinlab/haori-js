/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 欄から出ずに打鍵した値が、クリアで初期化されることを実ブラウザで確認する。
// フォーカスがボタンへ移らない環境（Safari のボタンクリック・`click()`）では、
// クリアの後に別の欄へ移った時点で初めて `change` が発火する。この `change` が運ぶ
// 編集はクリアより前なので、クリアが勝たなければならない。
// 期待値の根拠は仕様「ユーザー編集と宣言バインドの権威」と仕様「`data-{event}-reset`」。
const {test, expect} = require('@playwright/test');

/** `staffName` へ入力するタイミング（報告の実測表と同じ並び）。 */
const TIMINGS = ['none', 'same-task', 'timeout0', 'raf1', 'raf2'];

/** 同一タスクの場合の反復回数（タイミング競合のため複数回試す）。 */
const SAME_TASK_REPEATS = 20;

test.describe('確定していない編集とリセット（実ブラウザ）', () => {
  /**
   * 1 回分の手順を実行し、両方の欄の値を返します。
   *
   * @param page テスト対象のページ
   * @param timing 入力するタイミング
   * @returns 両方の欄の値と収集値
   */
  const runStep = async (page, timing) => {
    await page.goto('/playwright/reset-uncommitted-edit-repro.html');
    await page.waitForSelector('body[data-haori-ready]');
    await page.evaluate(value => window.runStep(value), timing);
    await page.waitForTimeout(800);
    return page.evaluate(() => ({
      customerId: document.getElementById('customerId').value,
      staffName: document.getElementById('staffName').value,
      collected: window.Haori.Core
        ? JSON.parse(
            document.getElementById('search-form').getAttribute('data-bind') ||
              '{}',
          )
        : {},
    }));
  };

  for (const timing of TIMINGS) {
    const repeats = timing === 'same-task' ? SAME_TASK_REPEATS : 2;
    test(`${timing}: 編集していない欄がリセットされ、後の入力は残る`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      for (let index = 0; index < repeats; index += 1) {
        const result = await runStep(page, timing);
        // クリアの要求より前の編集は解除される。
        expect(
          result.customerId,
          `${timing} の ${index + 1} 回目で customerId が空になっていない`,
        ).toBe('');
        // クリアの要求より後の入力はその欄に残る。
        expect(result.staffName).toBe(
          timing === 'none' ? '' : 'クリア中に入力',
        );
      }
    });
  }

  test('収集値も画面と一致する（古い検索条件が送信されない）', async ({page}) => {
    test.setTimeout(60000);
    const result = await runStep(page, 'same-task');

    expect(result.customerId).toBe('');
    expect(result.collected.customerId ?? '').toBe('');
    expect(result.collected.staffName).toBe('クリア中に入力');
  });
});
