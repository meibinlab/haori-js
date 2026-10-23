/* @vitest-environment jsdom */
/**
 * @fileoverview 乱数で組み立てた式で、CSP モードの評価器と従来の方式の結果を比べるテスト
 *
 * 期待値の根拠は仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」
 * です。式とバインド値は `tests/helpers/expression-generator.ts` が種から組み立てる
 * ため、食い違いが出たときは種と番号から同じ式を作り直せます。
 *
 * 二つの方式は同じ入口の形（`tests/helpers/csp-evaluate.ts`）で呼び、評価結果と
 * 未解決参照の有無を比べます。従来の方式がエラーとして `null` を返す式（構文として
 * 受け付けない組み合わせを含む）も、同じく `null` になることを確かめます。
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

import Expression from '../src/expression';
import Log from '../src/log';
import {comparable} from './helpers/comparable';
import {cspEvaluateDetailed} from './helpers/csp-evaluate';
import {generateCases} from './helpers/expression-generator';

/** 種 */
const SEEDS = [1, 2, 3, 4, 5];

/** 種ごとの件数 */
const COUNT = 800;

describe('乱数で組み立てた式での、CSP モードの評価器と従来の方式の一致', () => {
  beforeAll(() => {
    // 従来の方式はエラーの式でログを出すため、出力を止める。
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it.each(SEEDS)('種 %i', seed => {
    const mismatches: string[] = [];
    generateCases(seed, COUNT).forEach((sample, index) => {
      const legacy = Expression.evaluateDetailed(
        sample.expression,
        sample.bindings(),
      );
      const csp = cspEvaluateDetailed(sample.expression, sample.bindings());
      const expected = {
        value: comparable(legacy.value),
        unresolved: legacy.unresolvedReference,
      };
      const actual = {
        value: comparable(csp.value),
        unresolved: csp.unresolvedReference,
      };
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(
          `#${index} ${sample.expression}\n  従来: ${JSON.stringify(expected)}\n  CSP: ${JSON.stringify(actual)}`,
        );
      }
    });
    expect(mismatches.slice(0, 20).join('\n')).toBe('');
  });
});
