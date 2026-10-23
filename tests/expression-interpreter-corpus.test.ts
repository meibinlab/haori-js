/**
 * @fileoverview 既存のテストに出てくる式で、CSP モードの評価器と従来の方式の結果を比べるテスト
 *
 * 期待値の根拠は仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」です。
 *
 * `tests/fixtures/expression-corpus.json` は、全テストの実行中に
 * `Expression.evaluateDetailed()` へ渡された式とバインド値を集めたものです（式ごとに
 * バインド値の小さい順に 3 組まで）。関数・DOM 要素・循環参照など、JSON で写せない
 * バインド値を含む評価は集めていません。`undefined`・`NaN`・`±Infinity`・`-0`・BigInt・
 * Date は印（`$u` / `$n` / `$b` / `$d`）で写しています。
 *
 * 集め直すときは、`Expression.evaluateDetailed()` を包んで式とバインド値（上の印で
 * 写したもの）を書き出す処理を `setupFiles` に置き、全テストを流します。式ごとに
 * バインド値を JSON にした長さの短い順に 3 組を残します。
 *
 * 二つの方式は同じ入口の形（`tests/helpers/csp-evaluate.ts`）で呼び、評価結果と
 * 未解決参照の有無を比べます。
 */

import {describe, expect, it} from 'vitest';

import Expression from '../src/expression';
import corpus from './fixtures/expression-corpus.json';
import {cspEvaluateDetailed} from './helpers/csp-evaluate';

/** 固定データの 1 件 */
interface CorpusSample {
  /** 式 */
  e: string;
  /** バインド値（印で写したもの） */
  b: unknown;
}

/**
 * 印で写したバインド値を元へ戻します。
 *
 * @param value 写した値
 * @returns 元の値
 */
function decode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decode);
  }
  if (value !== null && typeof value === 'object') {
    const marked = value as Record<string, unknown>;
    if ('$u' in marked) {
      return undefined;
    }
    if ('$n' in marked) {
      return {NaN: NaN, Inf: Infinity, '-Inf': -Infinity, '-0': -0}[
        marked.$n as string
      ];
    }
    if ('$b' in marked) {
      return BigInt(marked.$b as string);
    }
    if ('$d' in marked) {
      return new Date(marked.$d as number);
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(marked)) {
      result[key] = decode(marked[key]);
    }
    return result;
  }
  return value;
}

/**
 * 比べられる形へ値を写します（関数・Promise は種類だけを比べます）。
 *
 * @param value 値
 * @returns 比べられる値
 */
function comparable(value: unknown): unknown {
  if (typeof value === 'function') {
    return '[function]';
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (typeof value === 'number') {
    return Number.isNaN(value)
      ? '[NaN]'
      : Object.is(value, -0)
        ? '[-0]'
        : value;
  }
  if (value === undefined) {
    return '[undefined]';
  }
  if (value instanceof Promise) {
    return '[promise]';
  }
  if (value instanceof RegExp) {
    return `[regexp ${value.source}/${value.flags}]`;
  }
  if (value instanceof Date) {
    return `[date ${value.getTime()}]`;
  }
  if (Array.isArray(value)) {
    return value.map(comparable);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = comparable((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

const samples = corpus as CorpusSample[];

describe('既存のテストに出てくる式での、CSP モードの評価器と従来の方式の一致', () => {
  it('固定データに十分な数の式がある', () => {
    expect(new Set(samples.map(sample => sample.e)).size).toBeGreaterThan(500);
  });

  it.each(samples.map(sample => [sample.e, sample.b] as const))(
    '%s',
    (expression, bindings) => {
      const legacy = Expression.evaluateDetailed(
        expression,
        decode(bindings) as Record<string, unknown>,
      );
      const csp = cspEvaluateDetailed(
        expression,
        decode(bindings) as Record<string, unknown>,
      );
      expect({
        value: comparable(csp.value),
        unresolved: csp.unresolvedReference,
      }).toEqual({
        value: comparable(legacy.value),
        unresolved: legacy.unresolvedReference,
      });
    },
  );
});
