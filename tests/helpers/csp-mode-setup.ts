/**
 * @fileoverview 全テストを CSP モードで流すための設定
 *
 * `vitest.config.ts` の `setupFiles` から読み込みます。CSP モードは既定のまま
 * にし、`Function` コンストラクタと `eval` を、`'unsafe-eval'` の無い CSP の
 * 下と同じく `EvalError` を投げるものへ置き換えます。式の評価が `new Function`
 * を一度も使わないことを、全テストで確かめるためです。
 *
 * 拒否するのは Haori の本体（`src/`）からの呼び出しだけです。テストの環境
 * （jsdom のセレクタの処理など）は `Function` を使うため、ほかの呼び出しは
 * そのまま通します。
 */

import {resolve} from 'node:path';

/**
 * Haori の本体のディレクトリ（スタックの行と比べるため `/` 区切りの小文字）。
 * テストはリポジトリの直下で動かします。
 */
const SOURCE_DIRECTORY = `${resolve('src')}/`.replace(/\\/g, '/').toLowerCase();

/** CSP が文字列からのコードの生成を拒否したときの文言 */
const REFUSED =
  "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not" +
  ' an allowed source of script.';

/**
 * 呼び出し元が Haori の本体かを返します。
 *
 * @returns 本体からの呼び出しなら true
 */
function calledFromHaori(): boolean {
  const frames = (new Error().stack ?? '').split('\n').slice(1);
  const caller = frames.find(frame => !frame.includes('csp-mode-setup'));
  return (
    caller !== undefined &&
    caller.replace(/\\/g, '/').toLowerCase().includes(SOURCE_DIRECTORY)
  );
}

const OriginalFunction = Function;
const originalEval = globalThis.eval;

globalThis.Function = new Proxy(OriginalFunction, {
  apply(target, thisArg, args) {
    if (calledFromHaori()) {
      throw new EvalError(REFUSED);
    }
    return Reflect.apply(target, thisArg, args);
  },
  construct(target, args, newTarget) {
    if (calledFromHaori()) {
      throw new EvalError(REFUSED);
    }
    return Reflect.construct(target, args, newTarget);
  },
});
globalThis.eval = (source: string) => {
  if (calledFromHaori()) {
    throw new EvalError(REFUSED);
  }
  return originalEval(source);
};
