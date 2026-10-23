/**
 * @fileoverview 式とバインド値を乱数で組み立てるテスト用の補助
 *
 * CSP モードの評価器と従来の方式の結果を、人が思いつかない組み合わせで比べるために
 * 使います。乱数は種から決まる（同じ種なら同じ式になる）ため、食い違いが出た式は
 * 種と番号から作り直せます。
 *
 * 組み立てる式は、許可する式構文（仕様「評価メカニズム」の 1）の範囲に限ります。
 * 構文として受け付けない組み合わせ（`a ?? b || c` など）もあえて作り、両方の方式が
 * 同じように拒否することを確かめます。
 */

/**
 * 種から決まる乱数列を返します（mulberry32）。
 *
 * @param seed 種
 * @returns 0 以上 1 未満の数を返す関数
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 式の組み立てに使う乱数の操作 */
class Picker {
  /**
   * @param random 乱数列
   */
  constructor(private readonly random: () => number) {}

  /**
   * 0 以上 `count` 未満の整数を返します。
   *
   * @param count 上限（含まない）
   * @returns 整数
   */
  int(count: number): number {
    return Math.floor(this.random() * count);
  }

  /**
   * 候補から 1 つ選びます。
   *
   * @param items 候補
   * @returns 選んだ候補
   */
  one<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /**
   * 確率 `p` で true を返します。
   *
   * @param p 確率
   * @returns 真偽値
   */
  chance(p: number): boolean {
    return this.random() < p;
  }
}

/** バインド値のキー（式から参照する名前） */
export const BINDING_NAMES = ['a', 'b', 's', 'list', 'obj', 'flag', 'none'];

/** 二項演算子 */
const BINARY_OPERATORS = [
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '!=',
  '===',
  '!==',
  '&&',
  '||',
  '??',
];

/** 単項演算子 */
const UNARY_OPERATORS = ['!', '-', '+', '!!'];

/** リテラル */
const LITERALS = [
  '0',
  '1',
  '2',
  '-1',
  '0.5',
  '1e3',
  '10n',
  "'x'",
  "''",
  '"1"',
  "'abc'",
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  '[]',
  '{}',
];

/** 配列のメソッドの呼び出し（引数はアロー関数など） */
const ARRAY_CALLS = [
  '.map(x => x * 2)',
  '.filter(x => x > 1)',
  '.some(x => x === 2)',
  '.every(x => x)',
  '.find(x => x > 1)',
  '.findIndex(x => x === 3)',
  '.includes(2)',
  '.indexOf(3)',
  '.join("-")',
  '.slice(1)',
  '.reduce((p, x) => p + x, 0)',
  '.concat([9])',
  '.length',
  '[0]',
  '[1]',
  '?.[2]',
];

/** 文字列のメソッドの呼び出し */
const STRING_CALLS = [
  '.length',
  '.toUpperCase()',
  '.trim()',
  '.split("b")',
  '.includes("b")',
  '.startsWith("a")',
  '.padStart(5, "0")',
  '[0]',
  '.charAt(1)',
];

/** オブジェクトのメンバーアクセス */
const OBJECT_MEMBERS = [
  '.x',
  '.y',
  '.nested.z',
  '.nested?.z',
  '.missing',
  '.missing.deep',
  '["x"]',
  "['nested']['z']",
  '.list[0]',
  '.list.length',
];

/**
 * 式を 1 つ組み立てます。
 *
 * @param pick 乱数の操作
 * @param depth 残りの深さ
 * @returns 式
 */
function expression(pick: Picker, depth: number): string {
  if (depth <= 0) {
    return primary(pick);
  }
  switch (pick.int(10)) {
    case 0:
    case 1:
    case 2:
      return `${expression(pick, depth - 1)} ${pick.one(BINARY_OPERATORS)} ${expression(pick, depth - 1)}`;
    case 3:
      return `${pick.one(UNARY_OPERATORS)}${operand(pick, depth - 1)}`;
    case 4:
      return `${expression(pick, depth - 1)} ? ${expression(pick, depth - 1)} : ${expression(pick, depth - 1)}`;
    case 5:
      return `(${expression(pick, depth - 1)})`;
    case 6:
      return `[${expression(pick, depth - 1)}, ${pick.chance(0.4) ? '...' : ''}${operand(pick, depth - 1)}]`;
    case 7:
      return `({k: ${expression(pick, depth - 1)}${pick.chance(0.4) ? ', ...obj' : ''}}).k`;
    case 8:
      return `${operand(pick, depth - 1)}${pick.one(['.length', '?.length', '.x', '[0]'])}`;
    default:
      return primary(pick);
  }
}

/**
 * 演算子の被演算子になる式を組み立てます（優先順位が崩れないよう括弧で包みます）。
 *
 * @param pick 乱数の操作
 * @param depth 残りの深さ
 * @returns 式
 */
function operand(pick: Picker, depth: number): string {
  const inner = expression(pick, depth);
  return /^[\w$.[\]'"]+$/.test(inner) ? inner : `(${inner})`;
}

/**
 * 最小単位の式（リテラル・名前・メンバーアクセス・呼び出し）を組み立てます。
 *
 * @param pick 乱数の操作
 * @returns 式
 */
function primary(pick: Picker): string {
  switch (pick.int(7)) {
    case 0:
      return pick.one(LITERALS);
    case 1:
      return pick.one(BINDING_NAMES);
    case 2:
      return `list${pick.one(ARRAY_CALLS)}`;
    case 3:
      return `s${pick.one(STRING_CALLS)}`;
    case 4:
      return `obj${pick.one(OBJECT_MEMBERS)}`;
    case 5:
      return pick.one([
        'Math.max(a, b)',
        'Math.floor(a / 3)',
        'Number(s)',
        'String(a)',
        'JSON.stringify(list)',
        'Array.isArray(list)',
        'parseInt("12px")',
        'isNaN(s)',
        'none.x',
        'none?.x',
        'missingName',
        'missingName?.x',
        'obj.missing()',
        'obj.missing?.()',
        'list.map((x, i) => x + i)',
        '[[1, 2], [3]].map(([p, q]) => p + q)',
        '[obj].map(({x, y = 3}) => x + y)',
        '[obj].map(({nested: {z} = {}}) => z)',
        '(x => y => x + y)(a)(b)',
        '((...rest) => rest.length)(a, b, ...list)',
        '((p = a) => p)()',
        '/b/.test(s)',
        's.replace(/b/g, "c")',
        'a++',
        '++a',
        '[a++, a]',
        '--b + b',
        'list.length ? list[0] : "none"',
        'obj?.nested?.z ?? "d"',
        '(a, b)',
      ]);
    default:
      return pick.one(['a', 'b', 'list', 'obj']);
  }
}

/**
 * バインド値を 1 組組み立てます。
 *
 * @param pick 乱数の操作
 * @returns バインド値
 */
function bindings(pick: Picker): Record<string, unknown> {
  const scalar = () =>
    pick.one<unknown>([
      0,
      1,
      2,
      3,
      -1,
      0.5,
      NaN,
      '',
      'abc',
      ' a b ',
      '2',
      true,
      false,
      null,
    ]);
  return {
    a: scalar(),
    b: scalar(),
    s: pick.one(['abc', ' ab ', 'b', '12', '']),
    list: pick.one([[1, 2, 3], [], [0, '2', null], [3, 1, 2]]),
    obj: pick.one([
      {x: 1, y: 'y', nested: {z: 2}, list: [5]},
      {x: 0, nested: null, list: []},
      {},
    ]),
    flag: pick.one([true, false]),
    none: pick.one([null, undefined]),
  };
}

/** 組み立てた 1 件 */
export interface GeneratedCase {
  /** 式 */
  expression: string;
  /** バインド値を作る関数（評価ごとに作り直し、前の評価の影響を受けない） */
  bindings: () => Record<string, unknown>;
}

/**
 * 式とバインド値を `count` 件組み立てます。
 *
 * @param seed 種
 * @param count 件数
 * @returns 組み立てた式とバインド値
 */
export function generateCases(seed: number, count: number): GeneratedCase[] {
  const pick = new Picker(createRandom(seed));
  const cases: GeneratedCase[] = [];
  for (let index = 0; index < count; index += 1) {
    const text = expression(pick, 1 + pick.int(3));
    const bindingSeed = pick.int(2 ** 31);
    cases.push({
      expression: text,
      bindings: () => bindings(new Picker(createRandom(bindingSeed))),
    });
  }
  return cases;
}
