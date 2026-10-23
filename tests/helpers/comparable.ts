/**
 * @fileoverview 二つの方式の評価結果を比べられる形へ写すテスト用の補助
 *
 * 関数・Promise は種類だけを、`NaN`・`-0`・BigInt・正規表現・日付は印で比べます。
 * 配列とオブジェクトは中身を再帰的に写します（Proxy で包んだ値も中身で比べます）。
 */

/**
 * 比べられる形へ値を写します。
 *
 * @param value 値
 * @returns 比べられる値
 */
export function comparable(value: unknown): unknown {
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
