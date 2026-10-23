/* @vitest-environment jsdom */
/**
 * @fileoverview 遮断をすり抜けようとする式を、CSP モードの評価器と従来の方式の両方で
 * 確かめるテスト
 *
 * 期待値の根拠は仕様「評価メカニズム」の「セキュリティレイヤー」です。式から
 * `constructor`・`__proto__`・`prototype` へは届かず（5・6・7）、禁止識別子は
 * `undefined` に遮断されます（3）。遮断の結果は、構文の検証で弾かれた式は `null`、
 * 評価中に遮断されたアクセスは `undefined` です（同節の「3・5・6・7 で遮断された
 * アクセスは…`undefined` になります」）。どちらで遮断されるかは書き方によるため、
 * ここでは「危険な値が返らないこと」と「ページの標準組み込みが書き換わらないこと」を
 * 判定し、あわせて二つの方式の結果が同じであること（仕様「CSP モードの式評価」の
 * 「**評価の結果は従来の方式と同じです。**」）を確かめます。
 *
 * 評価器は JavaScript のスコープではなく自前の判定で名前とプロパティを解決するため、
 * 従来の方式で `new Function` に任せていた部分に穴が無いかを、ここで集中して試します。
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Expression from '../src/expression';
import Log from '../src/log';
import {comparable} from './helpers/comparable';
import {cspEvaluateDetailed} from './helpers/csp-evaluate';

/** 式から届いてはならない値 */
const DANGEROUS: readonly unknown[] = [
  Function,
  Object,
  Object.prototype,
  Function.prototype,
  Array.prototype,
  String.prototype,
  globalThis,
  window,
  document,
  // 関数のコンストラクタの別名（async・generator）
  Object.getPrototypeOf(async () => undefined).constructor,
  Object.getPrototypeOf(function* () {
    // 空の generator
  }).constructor,
  eval,
  setTimeout,
  Reflect,
];

/**
 * 値（配列・オブジェクトの中身を含む）に危険な値が含まれるかを返します。
 *
 * @param value 値
 * @param seen たどった値
 * @returns 含まれていれば true
 */
function containsDangerous(value: unknown, seen = new Set<unknown>()): boolean {
  if (DANGEROUS.includes(value)) {
    return true;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).some(item => containsDangerous(item, seen));
}

/** 評価の前後で変わってはならない標準組み込み */
const SNAPSHOT_TARGETS = [
  Object.prototype,
  Array.prototype,
  Function.prototype,
  String.prototype,
];

/**
 * 標準組み込みの自身のプロパティの一覧を控えます。
 *
 * @returns 控え
 */
function snapshot(): string[] {
  return SNAPSHOT_TARGETS.map(target =>
    Reflect.ownKeys(target)
      .map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(target, key)!;
        return `${String(key)}:${typeof descriptor.value}:${typeof descriptor.get}`;
      })
      .join(','),
  );
}

/** 脱出の成否を記録するグローバル */
interface EscapeProbeGlobal {
  __escaped__?: unknown;
}

/** 試す式（名前はテストの表示に使う） */
const CASES: readonly (readonly [string, string])[] = [
  ['計算プロパティ名で constructor', "s['constructor']"],
  ['連結した名前で constructor', "s['con' + 'structor']"],
  ['配列で書いた名前で constructor', "s[['constructor']]"],
  [
    'toString を持つオブジェクトで書いた名前',
    "s[{toString: () => 'constructor'}]",
  ],
  [
    'valueOf だけを持つオブジェクトで書いた名前',
    "s[{valueOf: () => 'constructor'}]",
  ],
  ['関数の constructor（二段）', "s['constructor']['constructor']"],
  ['アロー関数の constructor', "(() => 1)['constructor']"],
  ['メソッドの constructor', "list.map['constructor']"],
  ['組み込みヘルパーの constructor', "haori.sum['constructor']"],
  ['呼び出し結果の constructor', "list.map(x => x)['constructor']"],
  ['__proto__ の計算プロパティ名', "obj['__proto__']"],
  ['__proto__ を連結で', "obj['__pro' + 'to__']"],
  ['prototype の計算プロパティ名', "Array['prototype']"],
  [
    '__lookupGetter__ で __proto__ のゲッター',
    "obj['__lookupGetter__']('__proto__')",
  ],
  [
    '__lookupGetter__ のゲッターを呼ぶ',
    "obj['__lookupGetter__']('__proto__').call(list)",
  ],
  ['__lookupGetter__ で constructor', "obj['__lookupGetter__']('constructor')"],
  ['Object.getPrototypeOf', 'Object.getPrototypeOf(obj)'],
  ['globalThis', 'globalThis'],
  ['window', 'window'],
  ['self', 'self'],
  ['document', 'document'],
  ['Function', "Function('return 1')"],
  ['Reflect', 'Reflect.get(obj, "x")'],
  ['eval', "eval('1')"],
  ['setTimeout', "setTimeout('1')"],
  ['Promise の then から constructor', "Promise.resolve(1)['constructor']"],
  [
    'Proxy.revocable の proxy',
    "Proxy.revocable(obj, {})['proxy']['constructor']",
  ],
  ['Error の constructor', "Error('x')['constructor']"],
  ['Symbol の constructor', "Symbol('x')['constructor']"],
  ['bind した関数の constructor', "list.map.bind(list)['constructor']"],
  ['call した結果の constructor', "list.map.call(list, x => x)['constructor']"],
  ['apply で Function へ', "list.map.apply(list, [x => x['constructor']])"],
  ['reduce の初期値に constructor', "list.reduce((p) => p['constructor'], s)"],
  ['アロー関数の既定値で constructor', "((p = s['constructor']) => p)()"],
  ['分割代入で constructor', '(({constructor: c}) => c)(s)'],
  ['分割代入の既定値で constructor', "(({x = s['constructor']}) => x)({})"],
  ['スプレッドで prototype を写す', "({...Array})['prototype']"],
  ['Array.from の写像で constructor', "Array.from([s], x => x['constructor'])"],
  [
    'JSON.parse の reviver で constructor',
    "JSON.parse('[1]', (k, v) => v['constructor'])",
  ],
  ['正規表現の constructor', "/a/['constructor']"],
  ['数値の constructor', "(1)['constructor']"],
  ['増減演算子で標準組み込みを書き換える', 'Math++'],
  ['増減演算子で Object を書き換える', '++Object'],
  ['arguments', 'arguments'],
  ['this', 'this'],
  ['new', "new Function('return 1')"],
  ['Unicode エスケープで constructor', "s['\\u0063onstructor']"],
];

describe('遮断をすり抜けようとする式', () => {
  const probe = globalThis as unknown as EscapeProbeGlobal;
  let before: string[];

  beforeEach(() => {
    delete probe.__escaped__;
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    before = snapshot();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 評価に使うバインド値を作ります。
   *
   * @returns バインド値
   */
  const bindings = (): Record<string, unknown> => ({
    s: 'abc',
    list: [1, 2],
    obj: {x: 1},
  });

  it.each(CASES)('%s', (_label, expression) => {
    // 仕様「評価メカニズム」の「3・5・6・7 で遮断されたアクセスは、…例外ではなく `undefined` になります」
    const legacy = Expression.evaluateDetailed(expression, bindings());
    const csp = cspEvaluateDetailed(expression, bindings());

    expect(containsDangerous(csp.value)).toBe(false);
    expect(containsDangerous(legacy.value)).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(probe.__escaped__).toBeUndefined();
    // 仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」
    expect({
      value: comparable(csp.value),
      unresolved: csp.unresolvedReference,
    }).toEqual({
      value: comparable(legacy.value),
      unresolved: legacy.unresolvedReference,
    });
  });
});
