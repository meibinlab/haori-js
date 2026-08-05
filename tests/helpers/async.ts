import {expect} from 'vitest';

import Queue from '../../src/queue';
import {collectFormInconsistencies} from './invariants';

/**
 * 不変条件の常時検査モード。
 *
 * - `assert`: 違反があればその場でテストを失敗させる（既定）
 * - `report`: 違反を標準出力へ書き出すだけで失敗させない（棚卸し用）
 * - `off`: 検査しない
 */
export type InvariantMode = 'off' | 'report' | 'assert';

/** 環境変数 `HAORI_INVARIANTS` で切り替える（未指定なら assert） */
let invariantMode: InvariantMode =
  (process.env.HAORI_INVARIANTS as InvariantMode | undefined) ?? 'assert';

/** `report` モードで同じ違反を何度も書き出さないための記録 */
const reportedViolations = new Set<string>();

/**
 * 違反が出たときに追加で落ち着かせる回数。
 *
 * バインドデータの確定は同期、`data-bind` 属性への反映は Queue
 * （requestAnimationFrame バッチ）です。`fetch` の解決がサイクルの切れ目に入ると、
 * 属性の書き込みだけが積まれた**進行中**の状態を捕まえてしまいます。違反が出た
 * ときだけ追加で落ち着かせ、**残った**違反だけを報告します。
 */
const SETTLE_RETRIES = 3;

/**
 * 不変条件の常時検査モードを切り替えます。
 *
 * 意図的に不整合な中間状態を作るテストで一時的に `off` にする場合に使います。
 * 切り替えたら必ず `afterEach` などで戻してください。特定の要素だけを外すなら
 * `exemptFromInvariants()` の方が範囲が狭く安全です。
 *
 * @param mode 設定するモード
 * @returns 切り替える前のモード
 */
export function setInvariantMode(mode: InvariantMode): InvariantMode {
  const previous = invariantMode;
  invariantMode = mode;
  return previous;
}

/**
 * 現在の不変条件の常時検査モードを返します。
 *
 * @returns 現在のモード
 */
export function getInvariantMode(): InvariantMode {
  return invariantMode;
}

/**
 * DOM 更新とキュー処理を 1 サイクル進めます。
 *
 * @returns 待機完了Promise
 */
async function settleOnce(): Promise<void> {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Queue.wait();
}

/**
 * 文書全体の内部整合を検査します。
 *
 * `waitForDomSettled()` の終わりに呼ばれ、すべての待機点を不変条件の検査点に
 * 変えます。個々のテストへ検査を書き足す必要をなくすためです。
 *
 * @returns 検査完了Promise
 */
async function checkInvariants(): Promise<void> {
  if (invariantMode === 'off' || typeof document === 'undefined') {
    return;
  }
  let violations = collectFormInconsistencies(document);
  for (
    let retry = 0;
    retry < SETTLE_RETRIES && violations.length > 0;
    retry++
  ) {
    if (retry === SETTLE_RETRIES - 1) {
      // 最後の再検査は完全に空になるまで待つ。I5（内部値の非先行）は「バインド
      // データへ載る機会が済んだ時点」で成り立つ条件で、`change` の同期的な内部値
      // 同期からコミット完了までの間は**正しく**ずれる。固定サイクルの待機では
      // その途中を捕まえるため、残っているかどうかは空になるまで待って判定する。
      await Queue.waitForIdle();
    }
    await settleOnce();
    violations = collectFormInconsistencies(document);
  }
  if (violations.length === 0) {
    return;
  }
  if (invariantMode === 'assert') {
    expect(
      violations,
      `不変条件の違反（await 時点）:\n${violations.join('\n')}`,
    ).toEqual([]);
    return;
  }
  const name = expect.getState().currentTestName ?? '(unknown test)';
  for (const violation of violations) {
    const line = `${name} :: ${violation}`;
    if (reportedViolations.has(line)) {
      continue;
    }
    reportedViolations.add(line);
    console.log(`[INVARIANT] ${line}`);
  }
}

/**
 * DOM 更新とキュー処理が概ね安定するまで待機します。
 *
 * 待機の終わりに不変条件（画面・バインドデータ・`data-bind` 属性・`data-each` の
 * 行の整合）を検査します。検査の内容は `tests/helpers/invariants.ts` を参照。
 *
 * @param cycles 待機サイクル数
 * @returns 待機完了Promise
 */
export async function waitForDomSettled(cycles = 3): Promise<void> {
  for (let index = 0; index < cycles; index += 1) {
    await settleOnce();
  }
  await checkInvariants();
}

/**
 * 追従して積まれる処理まで含めて、DOM 更新が安定するまで待機します。
 *
 * `waitForDomSettled()` は固定サイクル数だけ進めます。`Queue.wait()` は**呼び出し
 * 時点のタスクだけ**を待つため、「1 段の完了を待ってから次の段を積む」直列チェーン
 * （`Form.reset()` は 8 段ある）ではサイクル数が足りず、処理の途中で解決します。
 * **最終状態を検証するテストではこちらを使ってください。**
 *
 * 逆に、修復前の中間状態を狙って観測するテスト
 * （[tests/row-identity.test.ts](../row-identity.test.ts)）では固定サイクルの
 * `waitForDomSettled()` を使います。こちらへ替えると中間状態が観測できなくなり、
 * 検出力を失います（`docs/ja/testing.md`「効かなかった方法」を参照）。
 *
 * @param cycles 「完全に空になるまで待つ」を繰り返す回数
 * @returns 待機完了Promise
 */
export async function waitForIdle(cycles = 3): Promise<void> {
  for (let index = 0; index < cycles; index += 1) {
    await Queue.waitForIdle();
    await settleOnce();
  }
  await checkInvariants();
}

/**
 * タスク境界をひとつだけ越えます。
 *
 * 「同期フレームは抜けたが、フェッチの応答はまだ返っていない」時点を作るために
 * 使います。`waitForIdle()` / `waitForDomSettled()` は応答待ちの状態でも先へ進めて
 * しまうため、飛行中の通信に割り込む操作を書くテストではこちらを使ってください。
 *
 * @returns 次のタスクで解決されるPromise
 */
export function nextTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * 条件が満たされるまでキュー処理を進めながら待機します。
 *
 * @param condition 判定関数
 * @param options 最大試行回数、説明、各試行前の待機ミリ秒
 * @returns 条件が満たされたら解決されるPromise
 */
export async function waitForCondition(
  condition: () => boolean,
  options: {description?: string; maxAttempts?: number; delayMs?: number} = {},
): Promise<void> {
  const {description = 'condition', maxAttempts = 10, delayMs = 0} = options;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    await waitForDomSettled();
    if (condition()) {
      return;
    }
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
