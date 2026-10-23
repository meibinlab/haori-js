/**
 * @fileoverview CSP モードの評価器と従来の方式の結果の一致のテスト
 *
 * 期待値の根拠は仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じ
 * です。**」です。同じ式とバインド値を二つの方式で評価し、結果が一致することを
 * 確かめます。バインドに無い識別子とエラーの扱いは、呼び出し側（`expression.ts`）
 * と組み合わせるまで二つの方式で形が違うため、ここではすべての識別子が解決する
 * 式だけを比べます。組み込みヘルパー（`haori`）の注入も呼び出し側が受け持つため、
 * ここでは比べません。
 */

import {describe, expect, it} from 'vitest';

import Expression from '../src/expression';
import ExpressionInterpreter from '../src/expression_interpreter';

/**
 * 比べられる形へ値を写します（関数は種類だけを比べます）。
 *
 * @param value 値
 * @returns 比べられる値
 */
function comparable(value: unknown): unknown {
  if (typeof value === 'function') {
    return 'function';
  }
  if (value instanceof RegExp) {
    return `${value.source}/${value.flags}`;
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

const rows = [
  {id: 1, name: 'りんご', price: 120, tags: ['赤', '果物']},
  {id: 2, name: 'みかん', price: 80, tags: ['橙']},
  {id: 3, name: 'ぶどう', price: 300, tags: []},
];

/** 比べる式とバインド値 */
const CASES: [string, Record<string, unknown>][] = [
  ['rows.length', {rows}],
  ['rows.map(r => r.name).join("、")', {rows}],
  ['rows.filter(r => r.price >= 100).map(r => r.id)', {rows}],
  ['rows.find(r => r.id === target)?.name', {rows, target: 2}],
  ['rows.reduce((sum, r) => sum + r.price, 0)', {rows}],
  ['rows.map(({id, name}) => ({value: id, label: name}))', {rows}],
  ['rows.map(r => ({...r, id: null}))', {rows}],
  ['rows.some(r => r.tags.includes("橙"))', {rows}],
  ['[...rows].sort((a, b) => b.price - a.price)[0].name', {rows}],
  ['rows.flatMap(r => r.tags)', {rows}],
  ['Object', {}],
  ['Math.max(...rows.map(r => r.price))', {rows}],
  ['JSON.stringify({a: [1, 2], b: "x"})', {}],
  [
    'Array(totalPages).fill(0).map((_, i) => i).filter(i => i === 0 || i === totalPages - 1)',
    {totalPages: 5},
  ],
  [
    'items.map(item => ({value: item, even: item % 2 === 0}))',
    {items: [1, 2, 3]},
  ],
  ['price.toLocaleString() + "円"', {price: 1234567}],
  ['(price * 1.1).toFixed(0)', {price: 100}],
  ['Number(qty) * unit', {qty: '3', unit: 50}],
  ['String(code).padStart(5, "0")', {code: 42}],
  [
    'status === "done" ? "完了" : status === "doing" ? "作業中" : "未着手"',
    {status: 'doing'},
  ],
  ['!flag', {flag: 0}],
  ['!!list.length', {list: []}],
  ['a ?? b', {a: null, b: 'b'}],
  ['a || b', {a: '', b: 'b'}],
  ['a && b', {a: 1, b: 2}],
  ['count > 0 && count < 10', {count: 5}],
  ['user.profile.name', {user: {}}],
  ['user.profile?.name ?? "名無し"', {user: {}}],
  ['user.getName()', {user: {}}],
  ['text.replace(/\\s+/g, " ").trim()', {text: '  a   b  '}],
  ['/^[0-9]{3}-[0-9]{4}$/.test(zip)', {zip: '123-4567'}],
  ['text.split(/\\s*,\\s*/)', {text: 'a , b,c'}],
  ['date.slice(0, 10).split("-").join("/")', {date: '2026-10-22T00:00:00'}],
  ['new_value', {new_value: 1}],
  ['items[index]', {items: ['a', 'b'], index: 1}],
  ['map[key]', {map: {k: 'v'}, key: 'k'}],
  ['a["con" + "structor"]', {a: {}}],
  ['count++ / 2', {count: 8}],
  ['count++ + count', {count: 8}],
  ['2 ** 10', {}],
  ['7 >> 1', {}],
  ['(1, 2, 3)', {}],
  ['[1, , 3].length', {}],
  ['0x1F + 1_000 + 1e3', {}],
  ['10n * 3n', {}],
  ['1..toFixed(2)', {}],
  ['"abc"[1]', {}],
  ['[..."ab"]', {}],
  ['({...a, b: 2})', {a: {a: 1}}],
  ['({"x y": 1, 2: 3})', {}],
  ['history.length', {history: [1, 2, 3]}],
  ['window', {}],
  ['document', {}],
  ['undefined', {}],
  ['NaN', {}],
  ['parseInt("08", 10)', {}],
  ['encodeURIComponent(q)', {q: 'a&b c'}],
  ['xs.map(x => ys.map(y => x * y))', {xs: [1, 2], ys: [3, 4]}],
  ['((a, ...r) => [a, r])(1, 2, 3)', {}],
  ['(([a, , c]) => a + c)([1, 2, 3])', {}],
  ['f(...args)', {f: (a: number, b: number) => a - b, args: [5, 2]}],
];

describe('CSP モードの評価器と従来の方式の結果の一致', () => {
  it.each(CASES)('%s', (expression, bindings) => {
    const expected = Expression.evaluate(expression, {...bindings});
    const actual = ExpressionInterpreter.evaluate(expression, {...bindings});
    expect(comparable(actual)).toEqual(comparable(expected));
  });
});
