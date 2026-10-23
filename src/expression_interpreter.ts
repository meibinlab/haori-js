/**
 * @fileoverview CSP モードの式の評価器
 *
 * `expression_parser.ts` が作った構文木を、`new Function` を使わずに評価します
 * （仕様「CSP モードの式評価」）。構文木は一度だけ JavaScript のクロージャの木へ
 * 変換し、評価のたびにはその木を呼び出します。
 *
 * この評価器が受け持つのは、従来の方式で式の書き換えと関数の組み立てが担って
 * いた部分です。
 *
 * - 禁止識別子を `undefined` にする（仕様「評価メカニズム」の 3）
 * - 計算プロパティ名を評価時に検査する（同 7）
 * - バインドに無い識別子をグローバルへ解決しない（同 8）
 * - メンバーアクセスと呼び出しを暗黙のオプショナルチェーンにする
 *
 * バインド値の Proxy ラップ、評価中の prototype 系アクセスの遮断、危険な値の
 * 検査は、方式によらない層として呼び出し側（`expression.ts`）が受け持ちます。
 */

import {
  ArrowNode,
  CallNode,
  ExpressionNode,
  MemberNode,
  ObjectNode,
  ArrayNode,
  PatternNode,
  SpreadNode,
  UpdateNode,
  parseExpression,
} from './expression_parser';
import {
  ALLOWED_GLOBAL_IDENTIFIERS,
  FORBIDDEN_NAMES,
  FORBIDDEN_PROPERTY_NAMES,
  REBINDABLE_FORBIDDEN_NAMES,
} from './expression_rules';

/**
 * バインドに無い識別子を参照したときの扱いです。
 *
 * - `throw`: `MissingIdentifierError`（`名前 is not defined` の
 *   `ReferenceError`）を投げます
 * - `undefined`: `undefined` として評価を続けます
 *
 * 従来の方式は、`?.` / `??` / `||` / `&&` を含む式だけを `undefined` として
 * 続けます（仕様「バインドに無い識別子の扱い」）。どちらにするかは呼び出し側が
 * 決めます。
 */
export type MissingIdentifierPolicy = 'throw' | 'undefined';

/**
 * バインドに無い識別子を参照したときに投げるエラーです（`missingIdentifier` が
 * `throw` の場合）。
 *
 * 呼び出し側が、参照された名前を文言から読み取らずに知るために名前を持ちます。
 */
export class MissingIdentifierError extends ReferenceError {
  /** 参照された名前 */
  public readonly identifier: string;

  /**
   * @param identifier 参照された名前
   */
  constructor(identifier: string) {
    super(`${identifier} is not defined`);
    this.identifier = identifier;
  }
}

/** 評価のオプションです。 */
export interface InterpreterRunOptions {
  /** バインドに無い識別子の扱い（既定は `throw`） */
  missingIdentifier?: MissingIdentifierPolicy;
}

/** 1 回の評価の状態です。 */
interface RunState {
  /** バインド値 */
  bindings: Record<string, unknown>;

  /** 増減演算子で書き換えた値。バインド値そのものは書き換えません。 */
  overlay: Map<string, unknown> | null;

  /** バインドに無い識別子の扱い */
  missingIdentifier: MissingIdentifierPolicy;
}

/** アロー関数の呼び出しごとの引数の置き場です。 */
interface Frame {
  slots: unknown[];
  parent: Frame | null;
  run: RunState;
}

/** 構文木の節を変換したクロージャです。 */
type Evaluator = (frame: Frame) => unknown;

/** 引数の形を変換したクロージャです。 */
type Binder = (frame: Frame, value: unknown) => void;

/** 変換時のスコープです。アロー関数の引数名と置き場の番号を持ちます。 */
interface StaticScope {
  names: Map<string, number>;
  parent: StaticScope | null;
}

/** 引数ではない識別子の種類です。 */
type GlobalKind = 'forbidden' | 'rebindable' | 'constant' | 'builtin' | 'free';

/** 変換済みの式です。 */
export interface CompiledExpression {
  /** 元の式 */
  readonly expression: string;

  /** 評価の入口 */
  readonly evaluator: Evaluator;
}

/** 名前を書き換えずに参照できる定数です。 */
const CONSTANTS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ['undefined', undefined],
  ['NaN', NaN],
  ['Infinity', Infinity],
]);

/**
 * 自身の列挙可能なプロパティかどうかを返します。
 *
 * 従来の方式は `Object.keys()` のキーを引数にするため、これに合わせます。
 *
 * @param target 対象
 * @param key キー
 * @returns 自身の列挙可能なプロパティであれば true
 */
function isOwnEnumerable(target: object, key: string): boolean {
  return Object.prototype.propertyIsEnumerable.call(target, key);
}

/**
 * 計算プロパティ名を検査します。
 *
 * 名前が `constructor` / `__proto__` / `prototype` のときは `undefined` へ
 * 差し替えます（仕様「評価メカニズム」の 7）。
 *
 * @param value キーの評価結果
 * @returns プロパティのキー
 */
function toGuardedKey(value: unknown): PropertyKey {
  const key = typeof value === 'symbol' ? value : String(value);
  return typeof key === 'string' && FORBIDDEN_PROPERTY_NAMES.has(key)
    ? 'undefined'
    : key;
}

/**
 * 増減演算子の対象を数値（または BigInt）へ変換します。
 *
 * @param value 値
 * @returns 数値または BigInt
 */
function toNumeric(value: unknown): number | bigint {
  return typeof value === 'bigint' ? value : Number(value);
}

/**
 * 反復可能な値の反復子を取り出します。
 *
 * @param value 値
 * @returns 反復子
 */
function getIterator(value: unknown): Iterator<unknown> {
  // 反復できない値（`null` を含む）は、ここで TypeError になる。
  return (value as Iterable<unknown>)[Symbol.iterator]();
}

/**
 * 値の自身の列挙可能なプロパティを写します（スプレッドと残余の分割代入）。
 *
 * `__proto__` というキーも通常のプロパティとして作ります（代入で写すと
 * prototype の差し替えになるため、`defineProperty` を使います）。
 *
 * @param target 写す先
 * @param source 写す元
 * @param excluded 写さないキー
 */
function copyDataProperties(
  target: object,
  source: unknown,
  excluded: ReadonlySet<PropertyKey> | null,
): void {
  // `null` / `undefined` は `Object()` で空のオブジェクトになり、何も写さない。
  const from = Object(source) as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(from)) {
    if (excluded?.has(key)) {
      continue;
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(from, key);
    if (descriptor?.enumerable) {
      Object.defineProperty(target, key, {
        value: from[key],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
}

/**
 * CSP モードの式の評価器です。
 */
export default class ExpressionInterpreter {
  /** 式 → 変換結果（構文エラーの場合はそのメッセージ）のキャッシュ */
  private static readonly COMPILE_CACHE = new Map<
    string,
    CompiledExpression | string
  >();

  /**
   * 式を解析し、評価できる形へ変換します。結果は式ごとに控えます。
   *
   * @param expression 式の文字列
   * @returns 変換済みの式
   * @throws {SyntaxError} 受け付けない式の場合
   */
  public static compile(expression: string): CompiledExpression {
    const cached = this.COMPILE_CACHE.get(expression);
    if (typeof cached === 'string') {
      throw new SyntaxError(cached);
    }
    if (cached !== undefined) {
      return cached;
    }
    let compiled: CompiledExpression;
    try {
      const node = parseExpression(expression);
      compiled = {
        expression,
        evaluator: this.compileNode(node, null),
      };
    } catch (error) {
      // 構文エラー以外（入れ子が深すぎるときの RangeError など）は控えない。控えても
      // 評価できない式であることは変わらないため、テストでは区別しない。
      // Stryker disable next-line ConditionalExpression
      if (error instanceof SyntaxError) {
        this.COMPILE_CACHE.set(expression, error.message);
      }
      throw error;
    }
    this.COMPILE_CACHE.set(expression, compiled);
    return compiled;
  }

  /**
   * 変換済みの式を評価します。
   *
   * @param compiled 変換済みの式
   * @param bindings バインド値
   * @param options 評価のオプション
   * @returns 評価結果
   */
  public static run(
    compiled: CompiledExpression,
    bindings: Record<string, unknown>,
    options: InterpreterRunOptions = {},
  ): unknown {
    const frame: Frame = {
      slots: [],
      parent: null,
      run: {
        bindings,
        overlay: null,
        missingIdentifier: options.missingIdentifier ?? 'throw',
      },
    };
    return compiled.evaluator(frame);
  }

  /**
   * 式を解析して評価します。
   *
   * @param expression 式の文字列
   * @param bindings バインド値
   * @param options 評価のオプション
   * @returns 評価結果
   * @throws {SyntaxError} 受け付けない式の場合
   */
  public static evaluate(
    expression: string,
    bindings: Record<string, unknown> = {},
    options: InterpreterRunOptions = {},
  ): unknown {
    return this.run(this.compile(expression), bindings, options);
  }

  /**
   * 節をクロージャへ変換します。
   *
   * @param node 節
   * @param scope 変換時のスコープ
   * @returns クロージャ
   */
  private static compileNode(
    node: ExpressionNode,
    scope: StaticScope | null,
  ): Evaluator {
    switch (node.type) {
      case 'Literal': {
        const value = node.value;
        return () => value;
      }
      case 'RegExp': {
        const {pattern, flags} = node;
        return () => new RegExp(pattern, flags);
      }
      case 'Identifier':
        return this.compileIdentifier(node.name, scope);
      case 'Array':
        return this.compileArray(node, scope);
      case 'Object':
        return this.compileObject(node, scope);
      case 'Member':
        return this.compileMember(node, scope);
      case 'Call':
        return this.compileCall(node, scope);
      case 'Unary': {
        const argument = this.compileNode(node.argument, scope);
        switch (node.operator) {
          case '!':
            return frame => !argument(frame);
          case '-':
            return frame => -(argument(frame) as number);
          default:
            return frame => +(argument(frame) as number);
        }
      }
      case 'Update':
        return this.compileUpdate(node, scope);
      case 'Binary':
        return this.compileBinary(
          node.operator,
          this.compileNode(node.left, scope),
          this.compileNode(node.right, scope),
        );
      case 'Logical': {
        const left = this.compileNode(node.left, scope);
        const right = this.compileNode(node.right, scope);
        switch (node.operator) {
          case '&&':
            return frame => {
              const value = left(frame);
              return value ? right(frame) : value;
            };
          case '||':
            return frame => {
              const value = left(frame);
              return value ? value : right(frame);
            };
          default:
            return frame => {
              const value = left(frame);
              return value === null || value === undefined
                ? right(frame)
                : value;
            };
        }
      }
      case 'Conditional': {
        const test = this.compileNode(node.test, scope);
        const consequent = this.compileNode(node.consequent, scope);
        const alternate = this.compileNode(node.alternate, scope);
        return frame => (test(frame) ? consequent(frame) : alternate(frame));
      }
      case 'Sequence': {
        const expressions = node.expressions.map(item =>
          this.compileNode(item, scope),
        );
        return frame => {
          let value: unknown;
          for (const expression of expressions) {
            value = expression(frame);
          }
          return value;
        };
      }
      case 'Arrow':
        return this.compileArrow(node, scope);
    }
  }

  /**
   * アロー関数の引数を探します。
   *
   * @param name 名前
   * @param scope 変換時のスコープ
   * @returns 何段外側のどの置き場か。引数でない場合は null
   */
  private static findSlot(
    name: string,
    scope: StaticScope | null,
  ): {depth: number; slot: number} | null {
    let depth = 0;
    for (let current = scope; current !== null; current = current.parent) {
      const slot = current.names.get(name);
      if (slot !== undefined) {
        return {depth, slot};
      }
      depth += 1;
    }
    return null;
  }

  /**
   * 指定の段数だけ外側の置き場を返します。
   *
   * @param frame 現在の置き場
   * @param depth 段数
   * @returns 置き場
   */
  private static outerFrame(frame: Frame, depth: number): Frame {
    let current = frame;
    for (let index = 0; index < depth; index += 1) {
      current = current.parent!;
    }
    return current;
  }

  /**
   * 引数ではない識別子の種類を返します。
   *
   * @param name 名前
   * @returns 種類
   */
  private static classify(name: string): GlobalKind {
    if (REBINDABLE_FORBIDDEN_NAMES.has(name)) {
      return 'rebindable';
    }
    if (FORBIDDEN_NAMES.has(name)) {
      return 'forbidden';
    }
    if (CONSTANTS.has(name)) {
      return 'constant';
    }
    if (ALLOWED_GLOBAL_IDENTIFIERS.has(name)) {
      return 'builtin';
    }
    return 'free';
  }

  /**
   * バインドに無い識別子を参照したときの値を返します。
   *
   * @param run 評価の状態
   * @param name 名前
   * @returns `undefined`（`throw` の場合は投げます）
   */
  private static missing(run: RunState, name: string): undefined {
    if (run.missingIdentifier === 'throw') {
      throw new MissingIdentifierError(name);
    }
    return undefined;
  }

  /**
   * 識別子の参照を変換します。
   *
   * 引数 → バインド値 → 禁止識別子・定数・標準組み込み の順に解決し、どれにも
   * 当たらなければバインドに無い識別子です（仕様「バインドに無い識別子の
   * 扱い」）。グローバルへは解決しません。
   *
   * @param name 名前
   * @param scope 変換時のスコープ
   * @returns クロージャ
   */
  private static compileIdentifier(
    name: string,
    scope: StaticScope | null,
  ): Evaluator {
    const found = this.findSlot(name, scope);
    if (found !== null) {
      const {depth, slot} = found;
      // 外側をたどらない近道（`outerFrame(frame, 0)` は `frame` そのもの）。
      // Stryker disable next-line ConditionalExpression
      return depth === 0
        ? frame => frame.slots[slot]
        : frame => this.outerFrame(frame, depth).slots[slot];
    }
    const kind = this.classify(name);
    if (kind === 'forbidden') {
      // 再バインドできない禁止識別子は、バインド値にあっても使わない。
      return () => undefined;
    }
    return frame => {
      const run = frame.run;
      if (run.overlay !== null && run.overlay.has(name)) {
        return run.overlay.get(name);
      }
      if (isOwnEnumerable(run.bindings, name)) {
        return run.bindings[name];
      }
      switch (kind) {
        // 再バインドできる禁止識別子は、バインド値に無ければ `undefined`
        // （`CONSTANTS` に無い名前なので、定数の分岐と同じ結果になる）。
        case 'rebindable':
        case 'constant':
          return CONSTANTS.get(name);
        case 'builtin':
          return (globalThis as Record<string, unknown>)[name];
        default:
          return this.missing(run, name);
      }
    };
  }

  /**
   * 増減演算子を変換します。
   *
   * 書き換えるのは、アロー関数の引数と、この評価の中だけで見える値です。バインド
   * 値そのものは書き換えません。禁止識別子・定数・標準組み込みは書き換えられ
   * ません（`TypeError`）。
   *
   * @param node 節
   * @param scope 変換時のスコープ
   * @returns クロージャ
   */
  private static compileUpdate(
    node: UpdateNode,
    scope: StaticScope | null,
  ): Evaluator {
    const name = node.argument.name;
    const delta = node.operator === '++' ? 1 : -1;
    const prefix = node.prefix;
    const apply = (value: unknown): [number | bigint, number | bigint] => {
      const old = toNumeric(value);
      const updated =
        typeof old === 'bigint' ? old + BigInt(delta) : old + delta;
      return [old, updated];
    };
    const found = this.findSlot(name, scope);
    if (found !== null) {
      const {depth, slot} = found;
      return frame => {
        const target = this.outerFrame(frame, depth);
        const [old, updated] = apply(target.slots[slot]);
        target.slots[slot] = updated;
        return prefix ? updated : old;
      };
    }
    const kind = this.classify(name);
    const read = this.compileIdentifier(name, null);
    return frame => {
      const run = frame.run;
      // 一度書き換えた名前は、書き換えた時点で書き換えてよい名前だったため、
      // 書き換えた値（`run.overlay`）の有無は見なくてよい。
      const writable =
        kind !== 'forbidden' && isOwnEnumerable(run.bindings, name);
      if (!writable && kind !== 'free') {
        // Stryker disable next-line StringLiteral: 例外の説明文
        throw new TypeError(`Assignment to constant variable '${name}'.`);
      }
      const [old, updated] = apply(read(frame));
      if (run.overlay === null) {
        run.overlay = new Map();
      }
      run.overlay.set(name, updated);
      return prefix ? updated : old;
    };
  }

  /**
   * 二項演算子を変換します。演算の意味は JavaScript と同じです。
   *
   * @param operator 演算子
   * @param left 左辺
   * @param right 右辺
   * @returns クロージャ
   */
  private static compileBinary(
    operator: string,
    left: Evaluator,
    right: Evaluator,
  ): Evaluator {
    // 演算の意味は JavaScript の演算子そのものに任せるため、型だけを数値として扱う。
    // 式の中で `as` を使わずに引数の型で受けるのは、ミューテーションテストの書き換えが
    // `as` の括弧を落とし、比較演算子と組み合わさって構文エラーになるため。
    const l = left as (frame: Frame) => number;
    const r = right as (frame: Frame) => number;
    switch (operator) {
      case '+':
        return f => l(f) + r(f);
      case '-':
        return f => l(f) - r(f);
      case '*':
        return f => l(f) * r(f);
      case '/':
        return f => l(f) / r(f);
      case '%':
        return f => l(f) % r(f);
      case '**':
        return f => l(f) ** r(f);
      case '<<':
        return f => l(f) << r(f);
      case '>>':
        return f => l(f) >> r(f);
      case '>>>':
        return f => l(f) >>> r(f);
      case '<':
        return f => l(f) < r(f);
      case '>':
        return f => l(f) > r(f);
      case '<=':
        return f => l(f) <= r(f);
      case '>=':
        return f => l(f) >= r(f);
      case '==':
        return f => left(f) == right(f);
      case '!=':
        return f => left(f) != right(f);
      case '===':
        return f => left(f) === right(f);
      default:
        return f => left(f) !== right(f);
    }
  }

  /**
   * メンバーアクセスを変換します。
   *
   * 基点が `null` / `undefined` なら、キーを評価せずに `undefined` を返します
   * （仕様「暗黙のオプショナルチェーン」）。
   *
   * @param node 節
   * @param scope 変換時のスコープ
   * @returns クロージャ
   */
  private static compileMember(
    node: MemberNode,
    scope: StaticScope | null,
  ): Evaluator {
    const object = this.compileNode(node.object, scope);
    if (!node.computed) {
      const name = node.property as string;
      return frame => {
        const base = object(frame);
        return base === null || base === undefined
          ? undefined
          : (base as Record<string, unknown>)[name];
      };
    }
    const property = this.compileNode(node.property as ExpressionNode, scope);
    return frame => {
      const base = object(frame);
      if (base === null || base === undefined) {
        return undefined;
      }
      return (base as Record<PropertyKey, unknown>)[
        toGuardedKey(property(frame))
      ];
    };
  }

  /**
   * 配列の要素・呼び出しの引数を変換します。
   *
   * @param elements 要素
   * @param scope 変換時のスコープ
   * @returns 要素の配列を作るクロージャ
   */
  private static compileElements(
    elements: (ExpressionNode | SpreadNode | null)[],
    scope: StaticScope | null,
  ): (frame: Frame) => unknown[] {
    const parts = elements.map(element => {
      if (element === null) {
        return null;
      }
      if (element.type === 'Spread') {
        return {
          spread: true,
          evaluate: this.compileNode(element.argument, scope),
        };
      }
      return {
        spread: false,
        evaluate: this.compileNode(element, scope),
      };
    });
    return frame => {
      const values: unknown[] = [];
      let index = 0;
      for (const part of parts) {
        if (part === null) {
          // 穴（`[1, , 2]`）。値を置かずに位置だけ進める。
          index += 1;
        } else if (part.spread) {
          const iterator = getIterator(part.evaluate(frame));
          for (;;) {
            const step = iterator.next();
            if (step.done) {
              break;
            }
            values[index] = step.value;
            index += 1;
          }
        } else {
          values[index] = part.evaluate(frame);
          index += 1;
        }
      }
      values.length = index;
      return values;
    };
  }

  /**
   * 配列リテラルを変換します。
   *
   * @param node 節
   * @param scope 変換時のスコープ
   * @returns クロージャ
   */
  private static compileArray(
    node: ArrayNode,
    scope: StaticScope | null,
  ): Evaluator {
    return this.compileElements(node.elements, scope);
  }

  /**
   * オブジェクトリテラルを変換します。
   *
   * @param node 節
   * @param scope 変換時のスコープ
   * @returns クロージャ
   */
  private static compileObject(
    node: ObjectNode,
    scope: StaticScope | null,
  ): Evaluator {
    const parts = node.properties.map(property =>
      property.kind === 'init'
        ? {
            key: property.key,
            evaluate: this.compileNode(property.value, scope),
          }
        : {
            key: null,
            evaluate: this.compileNode(property.argument, scope),
          },
    );
    return frame => {
      const result: Record<string, unknown> = {};
      for (const part of parts) {
        if (part.key === null) {
          copyDataProperties(result, part.evaluate(frame), null);
        } else {
          // キーは構文解析で `__proto__` などを拒否しているため代入でよい。
          result[part.key] = part.evaluate(frame);
        }
      }
      return result;
    };
  }

  /**
   * 呼び出しを変換します。
   *
   * メンバーアクセスを呼び出す場合は、基点を `this` にします。呼び出し先が
   * `null` / `undefined` で、オプショナルな呼び出しなら、引数を評価せずに
   * `undefined` を返します（仕様「暗黙のオプショナルチェーン」）。呼び出せない
   * 値は `TypeError` です。
   *
   * @param node 節
   * @param scope 変換時のスコープ
   * @returns クロージャ
   */
  private static compileCall(
    node: CallNode,
    scope: StaticScope | null,
  ): Evaluator {
    const args = this.compileElements(node.args, scope);
    const optional = node.optional;
    const invoke = (fn: unknown, thisArg: unknown, frame: Frame): unknown => {
      if (optional && (fn === null || fn === undefined)) {
        return undefined;
      }
      // 呼び出せない値は `Reflect.apply()` が TypeError にする。
      return Reflect.apply(
        fn as (...args: unknown[]) => unknown,
        thisArg,
        args(frame),
      );
    };
    const callee = node.callee;
    if (callee.type === 'Member') {
      const object = this.compileNode(callee.object, scope);
      const name = callee.computed ? null : (callee.property as string);
      const property = callee.computed
        ? this.compileNode(callee.property as ExpressionNode, scope)
        : null;
      return frame => {
        const base = object(frame);
        if (base === null || base === undefined) {
          return undefined;
        }
        const key = property === null ? name! : toGuardedKey(property(frame));
        return invoke((base as Record<PropertyKey, unknown>)[key], base, frame);
      };
    }
    const target = this.compileNode(callee, scope);
    return frame => invoke(target(frame), undefined, frame);
  }

  /**
   * 引数の形を変換します。
   *
   * @param pattern 引数の形
   * @param scope アロー関数のスコープ
   * @returns 引数を置き場へ入れるクロージャ
   */
  private static compilePattern(
    pattern: PatternNode,
    scope: StaticScope,
  ): Binder {
    switch (pattern.type) {
      case 'BindingIdentifier': {
        const slot = scope.names.get(pattern.name)!;
        return (frame, value) => {
          frame.slots[slot] = value;
        };
      }
      case 'ObjectPattern': {
        const properties = pattern.properties.map(property => ({
          key: property.key,
          bind: this.compilePattern(property.value, scope),
        }));
        // 残余の置き場が無いときの分岐は、置き場を作らないための近道で、結果は
        // 変わらない（使われない置き場に書くだけになる）。
        const restSlot =
          // Stryker disable next-line ConditionalExpression
          pattern.rest === null ? null : scope.names.get(pattern.rest)!;
        const excluded = new Set<PropertyKey>(properties.map(item => item.key));
        return (frame, value) => {
          if (value === null || value === undefined) {
            const text = String(value);
            throw new TypeError(
              // Stryker disable next-line StringLiteral: 例外の説明文
              `Cannot destructure '${text}' as it is ${text}.`,
            );
          }
          for (const property of properties) {
            property.bind(
              frame,
              (value as Record<string, unknown>)[property.key],
            );
          }
          // Stryker disable next-line ConditionalExpression: 上の近道と同じ
          if (restSlot !== null) {
            const rest = {};
            copyDataProperties(rest, value, excluded);
            frame.slots[restSlot] = rest;
          }
        };
      }
      case 'ArrayPattern': {
        const elements = pattern.elements.map(element =>
          element === null ? null : this.compilePattern(element, scope),
        );
        const rest =
          pattern.rest === null
            ? null
            : this.compilePattern(pattern.rest, scope);
        return (frame, value) => {
          const iterator = getIterator(value);
          let done = false;
          try {
            for (const element of elements) {
              let item: unknown = undefined;
              if (!done) {
                const step = iterator.next();
                done = step.done === true;
                item = done ? undefined : step.value;
              }
              element?.(frame, item);
            }
            if (rest !== null) {
              const items: unknown[] = [];
              while (!done) {
                const step = iterator.next();
                done = step.done === true;
                if (!done) {
                  items.push(step.value);
                }
              }
              rest(frame, items);
            }
          } finally {
            if (!done) {
              iterator.return?.();
            }
          }
        };
      }
    }
  }

  /**
   * 引数の形に現れる名前を、置き場の番号と対応づけます。
   *
   * @param pattern 引数の形
   * @param names 名前 → 置き場の番号（追記します）
   */
  private static assignSlots(
    pattern: PatternNode,
    names: Map<string, number>,
  ): void {
    switch (pattern.type) {
      case 'BindingIdentifier':
        names.set(pattern.name, names.size);
        return;
      case 'ObjectPattern':
        pattern.properties.forEach(property =>
          this.assignSlots(property.value, names),
        );
        // Stryker disable next-line ConditionalExpression: 上の近道と同じ
        if (pattern.rest !== null) {
          names.set(pattern.rest, names.size);
        }
        return;
      case 'ArrayPattern':
        pattern.elements.forEach(element => {
          if (element !== null) {
            this.assignSlots(element, names);
          }
        });
        if (pattern.rest !== null) {
          this.assignSlots(pattern.rest, names);
        }
        return;
    }
  }

  /**
   * アロー関数を変換します。
   *
   * 評価すると JavaScript の関数を返します。組み込みのメソッド（`map` /
   * `sort` など）から呼ばれても、評価した時点のバインド値と引数で本体を
   * 評価します。
   *
   * @param node 節
   * @param parent 外側の変換時のスコープ
   * @returns クロージャ
   */
  private static compileArrow(
    node: ArrowNode,
    parent: StaticScope | null,
  ): Evaluator {
    const scope: StaticScope = {names: new Map(), parent};
    node.params.forEach(param => this.assignSlots(param, scope.names));
    if (node.rest !== null) {
      this.assignSlots(node.rest, scope.names);
    }
    const binders = node.params.map(param => this.compilePattern(param, scope));
    const restBinder =
      node.rest === null ? null : this.compilePattern(node.rest, scope);
    const body = this.compileNode(node.body, scope);
    const parameterCount = binders.length;
    const isAsync = node.async;
    return frame => {
      const invoke = (args: unknown[]): unknown => {
        const inner: Frame = {slots: [], parent: frame, run: frame.run};
        for (let index = 0; index < parameterCount; index += 1) {
          binders[index](inner, args[index]);
        }
        if (restBinder !== null) {
          restBinder(inner, args.slice(parameterCount));
        }
        return body(inner);
      };
      const fn = isAsync
        ? async (...args: unknown[]) => invoke(args)
        : (...args: unknown[]) => invoke(args);
      Object.defineProperty(fn, 'length', {value: parameterCount});
      return fn;
    };
  }
}
