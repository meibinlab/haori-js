import Queue from '../../src/queue';

/**
 * DOM 更新とキュー処理が概ね安定するまで待機します。
 *
 * @param cycles 待機サイクル数
 * @returns 待機完了Promise
 */
export async function waitForDomSettled(cycles = 3): Promise<void> {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve();
    await Queue.wait();
  }
}

/**
 * 条件が満たされるまでキュー処理を進めながら待機します。
 *
 * @param condition 判定関数
 * @param options 最大試行回数と説明
 * @returns 条件が満たされたら解決されるPromise
 */
export async function waitForCondition(
  condition: () => boolean,
  options: {description?: string; maxAttempts?: number} = {},
): Promise<void> {
  const {description = 'condition', maxAttempts = 10} = options;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (condition()) {
      return;
    }
    await waitForDomSettled();
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
