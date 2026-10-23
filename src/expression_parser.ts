/**
 * @fileoverview CSP モードの式の構文解析
 *
 * 式の文字列を字句に分け、構文木へ組み立てます。`new Function` を使わずに式を
 * 評価するための前段です（仕様「CSP モードの式評価」）。評価は
 * `expression_interpreter.ts` が行います。
 *
 * 受け付ける構文は、従来の方式が受け付ける式から、文を持つ関数の本体（ブロックを
 * 本体にしたアロー関数、オブジェクトリテラルのメソッド・getter・setter）を除いた
 * ものです。受け付けない式は `SyntaxError` を投げます。
 */

import {
  DISALLOWED_KEYWORDS,
  FORBIDDEN_PROPERTY_NAMES,
  STRICT_FORBIDDEN_NAMES,
  STRICT_RESERVED_WORDS,
} from './expression_rules';

/** 構文木の節に共通する情報です。 */
interface NodeBase {
  /** 式の中での開始位置 */
  start: number;

  /** 式の中での終了位置（この位置の文字は含みません） */
  end: number;

  /** 丸括弧で囲まれていたかどうか */
  paren?: boolean;
}

/** リテラル（数値・BigInt・文字列・`true` / `false` / `null`）です。 */
export interface LiteralNode extends NodeBase {
  type: 'Literal';
  value: unknown;
}

/** 正規表現リテラルです。評価のたびに新しいオブジェクトを作ります。 */
export interface RegExpNode extends NodeBase {
  type: 'RegExp';
  pattern: string;
  flags: string;
}

/** 識別子の参照です。 */
export interface IdentifierNode extends NodeBase {
  type: 'Identifier';
  name: string;
}

/** スプレッド（`...式`）です。配列リテラルと呼び出しの引数に現れます。 */
export interface SpreadNode extends NodeBase {
  type: 'Spread';
  argument: ExpressionNode;
}

/** 配列リテラルです。`null` の要素は穴（`[1, , 2]`）を表します。 */
export interface ArrayNode extends NodeBase {
  type: 'Array';
  elements: (ExpressionNode | SpreadNode | null)[];
}

/** オブジェクトリテラルの要素です。 */
export type ObjectProperty =
  | {kind: 'init'; key: string; value: ExpressionNode}
  | {kind: 'spread'; argument: ExpressionNode};

/** オブジェクトリテラルです。 */
export interface ObjectNode extends NodeBase {
  type: 'Object';
  properties: ObjectProperty[];
}

/** メンバーアクセスです。`computed` が真なら `property` は式です。 */
export interface MemberNode extends NodeBase {
  type: 'Member';
  object: ExpressionNode;
  property: string | ExpressionNode;
  computed: boolean;
}

/** 呼び出しです。 */
export interface CallNode extends NodeBase {
  type: 'Call';
  callee: ExpressionNode;
  args: (ExpressionNode | SpreadNode)[];

  /** 呼び出し先が `null` / `undefined` のとき `undefined` を返すかどうか */
  optional: boolean;
}

/** 単項演算子（`!` / `-` / `+`）です。 */
export interface UnaryNode extends NodeBase {
  type: 'Unary';
  operator: '!' | '-' | '+';
  argument: ExpressionNode;
}

/** 増減演算子（`++` / `--`）です。対象は識別子に限ります。 */
export interface UpdateNode extends NodeBase {
  type: 'Update';
  operator: '++' | '--';
  prefix: boolean;
  argument: IdentifierNode;
}

/** 二項演算子です。 */
export interface BinaryNode extends NodeBase {
  type: 'Binary';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

/** 論理演算子（`&&` / `||` / `??`）です。 */
export interface LogicalNode extends NodeBase {
  type: 'Logical';
  operator: '&&' | '||' | '??';
  left: ExpressionNode;
  right: ExpressionNode;
}

/** 三項演算子です。 */
export interface ConditionalNode extends NodeBase {
  type: 'Conditional';
  test: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

/** カンマ演算子です。 */
export interface SequenceNode extends NodeBase {
  type: 'Sequence';
  expressions: ExpressionNode[];
}

/** アロー関数です。本体は式に限ります。 */
export interface ArrowNode extends NodeBase {
  type: 'Arrow';
  params: PatternNode[];
  rest: PatternNode | null;
  body: ExpressionNode;
  async: boolean;
}

/** 引数の識別子です。 */
export interface BindingIdentifierNode {
  type: 'BindingIdentifier';
  name: string;
}

/** 引数の分割代入（オブジェクト）です。 */
export interface ObjectPatternNode {
  type: 'ObjectPattern';
  properties: {key: string; value: PatternNode}[];
  rest: string | null;
}

/** 引数の分割代入（配列）です。`null` の要素は穴を表します。 */
export interface ArrayPatternNode {
  type: 'ArrayPattern';
  elements: (PatternNode | null)[];
  rest: PatternNode | null;
}

/** 引数の形です。 */
export type PatternNode =
  | BindingIdentifierNode
  | ObjectPatternNode
  | ArrayPatternNode;

/** 式の構文木の節です。 */
export type ExpressionNode =
  | LiteralNode
  | RegExpNode
  | IdentifierNode
  | ArrayNode
  | ObjectNode
  | MemberNode
  | CallNode
  | UnaryNode
  | UpdateNode
  | BinaryNode
  | LogicalNode
  | ConditionalNode
  | SequenceNode
  | ArrowNode;

/** 字句の種類です。 */
type TokenType =
  | 'number'
  | 'string'
  | 'regexp'
  | 'identifier'
  | 'punct'
  | 'eof';

/** 字句です。 */
interface Token {
  type: TokenType;

  /** 識別子の名前・記号。リテラルでは元の文字列 */
  value: string;

  /** リテラルの値（数値・BigInt・文字列） */
  literal?: unknown;

  start: number;
  end: number;

  /** 直前に改行があったかどうか（後置の `++` と `=>` の判定に使います） */
  newlineBefore: boolean;
}

/** 記号の一覧です。長いものから照合します。 */
const PUNCTUATORS = [
  '>>>',
  '===',
  '!==',
  '...',
  '**',
  '?.',
  '??',
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '<<',
  '>>',
  '=>',
  '++',
  '--',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '.',
  ',',
  '?',
  ':',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '<',
  '>',
];

/** 二項演算子の優先順位です（大きいほど強く結びつきます）。 */
const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  '==': 1,
  '!=': 1,
  '===': 1,
  '!==': 1,
  '<': 2,
  '>': 2,
  '<=': 2,
  '>=': 2,
  '<<': 3,
  '>>': 3,
  '>>>': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
};

/**
 * 呼び出すと `TypeError` になる識別子です。
 *
 * 従来の方式は、これらの直後の `(` を暗黙のオプショナルチェーンの対象にしません
 * （`undefined()` は `undefined` ではなく `TypeError` になります）。
 */
const NON_OPTIONAL_CALLEE_NAMES: ReadonlySet<string> = new Set([
  'undefined',
  'NaN',
  'Infinity',
]);

/**
 * 改行文字かどうかを返します。
 *
 * @param character 判定する文字
 * @returns 改行文字であれば true
 */
function isLineTerminator(character: string): boolean {
  return (
    character === '\n' ||
    character === '\r' ||
    character === ' ' ||
    character === ' '
  );
}

/**
 * 識別子の先頭にできる文字かどうかを返します。
 *
 * 従来の方式と同じく ASCII の範囲に限ります。
 *
 * @param character 判定する文字
 * @returns 識別子の先頭にできれば true
 */
function isIdentifierStart(character: string): boolean {
  return /[A-Za-z_$]/.test(character);
}

/**
 * 識別子の 2 文字目以降にできる文字かどうかを返します。
 *
 * @param character 判定する文字
 * @returns 識別子の 2 文字目以降にできれば true
 */
function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_$]/.test(character);
}

/**
 * 構文エラーを作ります。
 *
 * @param message エラーの内容
 * @param position 式の中での位置
 * @returns 構文エラー
 */
function syntaxError(message: string, position: number): SyntaxError {
  // 例外の説明文は、評価の結果（構文エラーになるかどうか）に影響しない。
  // Stryker disable next-line StringLiteral
  return new SyntaxError(`${message} (at position ${position})`);
}

// 例外の説明文は開発者向けで、評価の結果（構文エラーになるかどうか）には影響しない
// ため、ミューテーションテストの対象から外す。
// Stryker disable all
/** 構文エラーの説明文 */
const MESSAGES = {
  comment: 'Comments are not allowed in expressions',
  unexpectedCharacter: (character: string) =>
    `Unexpected character '${character}'`,
  unterminatedRegExp: 'Unterminated regular expression',
  invalidRegExp: (reason: string) => `Invalid regular expression: ${reason}`,
  numericSeparator: 'Numeric separators are not allowed here',
  invalidToken: 'Invalid or unexpected token',
  octalLiteral: 'Octal literals are not allowed in strict mode',
  unterminatedString: 'Unterminated string literal',
  octalEscape: 'Octal escape sequences are not allowed in strict mode',
  invalidHex: 'Invalid hexadecimal escape sequence',
  invalidUnicode: 'Invalid Unicode escape sequence',
  unexpectedEnd: 'Unexpected end of expression',
  unexpectedToken: (value: string) => `Unexpected token '${value}'`,
  notInExpressions: (name: string) => `'${name}' cannot be used in expressions`,
  notParameter: (name: string) => `'${name}' cannot be used as a parameter`,
  notProperty: (name: string) => `'${name}' cannot be used as a property`,
  duplicateParameter: 'Duplicate parameter name',
  blockBody: 'Arrow functions with a block body are not supported',
  mixNullish: 'Cannot mix ?? with || or &&',
  unaryExponent:
    'Unary operator used immediately before exponentiation expression',
  invalidUpdate: 'Invalid left-hand side expression in update operation',
} as const;
// Stryker restore all

/**
 * 字句解析器です。
 *
 * `/` は除算として読みます。値が来る位置の `/` は、構文解析器が
 * `readRegExp()` で正規表現リテラルとして読み直します（仕様「正規表現
 * リテラル」の「`/` が正規表現リテラルの開始になるのは、値が来る位置に
 * 限られます」）。
 *
 * 式の末尾を越えた位置の文字は `undefined` です。`/[0-9]/.test(undefined)` は
 * 文字列 `'undefined'` を調べるため、数字や記号の判定は偽になります（末尾を
 * 越えた位置を別に確かめる必要はありません）。
 */
class Lexer {
  /** 次に読む位置 */
  public position = 0;

  /**
   * @param source 式の文字列
   */
  public constructor(private readonly source: string) {}

  /**
   * 次の字句を読みます。
   *
   * @returns 字句
   */
  public lex(): Token {
    const source = this.source;
    let newlineBefore = false;
    // 末尾（`position === length`）の文字は undefined で、改行にも空白にも当たらず
    // 抜けるため、`<=` に書き換えても結果は同じ（等価な書き換え）。
    // Stryker disable next-line EqualityOperator
    while (this.position < source.length) {
      const character = source[this.position];
      if (isLineTerminator(character)) {
        newlineBefore = true;
      } else if (!/\s/.test(character)) {
        break;
      }
      this.position += 1;
    }
    const start = this.position;
    if (start >= source.length) {
      return {type: 'eof', value: '', start, end: start, newlineBefore};
    }
    const character = source[start];
    const next = source[start + 1];
    // `.` で始まる数値（`.5`）は読まない。`.` は記号になり、構文解析で値の位置に
    // 置けないため構文エラーになる（従来の方式も受け付けない）。
    if (/[0-9]/.test(character)) {
      return this.readNumber(start, newlineBefore);
    }
    if (character === '"' || character === "'") {
      return this.readString(start, newlineBefore);
    }
    if (isIdentifierStart(character)) {
      let end = start + 1;
      while (isIdentifierPart(source[end])) {
        end += 1;
      }
      this.position = end;
      return {
        type: 'identifier',
        value: source.slice(start, end),
        start,
        end,
        newlineBefore,
      };
    }
    // `/*` を除算として読んでも、続く `*` で構文エラーになる（結果は同じ）。
    // Stryker disable next-line ConditionalExpression,StringLiteral
    if (character === '/' && (next === '/' || next === '*')) {
      // コメントは式の構文に含めない（仕様「正規表現リテラル」）。
      throw syntaxError(MESSAGES.comment, start);
    }
    for (const punctuator of PUNCTUATORS) {
      if (!source.startsWith(punctuator, start)) {
        continue;
      }
      // JavaScript は数字が続く `?.`（`a?.5:1`）を `?` と `.5` に分けるが、`.` で
      // 始まる数値は受け付けないため、どちらに分けても構文エラーになる。
      this.position = start + punctuator.length;
      return {
        type: 'punct',
        value: punctuator,
        start,
        end: this.position,
        newlineBefore,
      };
    }
    throw syntaxError(MESSAGES.unexpectedCharacter(character), start);
  }

  /**
   * 正規表現リテラルを読みます。
   *
   * 本体の `\` エスケープと `[…]` 文字クラスを追跡して終端の `/` を探し、続く
   * 識別子の文字をフラグとして読みます（仕様「正規表現リテラル」）。本体と
   * フラグはここで `RegExp` に通して検証します。
   *
   * @param start `/` の位置
   * @param newlineBefore 直前に改行があったかどうか
   * @returns 字句
   */
  public readRegExp(start: number, newlineBefore: boolean): Token {
    const source = this.source;
    let index = start + 1;
    let inCharacterClass = false;
    for (;;) {
      const character = source[index];
      if (character === undefined || isLineTerminator(character)) {
        throw syntaxError(MESSAGES.unterminatedRegExp, start);
      }
      if (character === '\\') {
        // 末尾の `\`（`escaped` が undefined）は、次の周回で終端が無い構文
        // エラーになる。
        const escaped = source[index + 1];
        if (isLineTerminator(escaped)) {
          throw syntaxError(MESSAGES.unterminatedRegExp, start);
        }
        index += 2;
        continue;
      }
      if (character === '[') {
        inCharacterClass = true;
      } else if (character === ']') {
        inCharacterClass = false;
      } else if (character === '/' && !inCharacterClass) {
        break;
      }
      index += 1;
    }
    const pattern = source.slice(start + 1, index);
    index += 1;
    const flagsStart = index;
    while (isIdentifierPart(source[index])) {
      index += 1;
    }
    const flags = source.slice(flagsStart, index);
    try {
      new RegExp(pattern, flags);
    } catch (error) {
      throw syntaxError(
        MESSAGES.invalidRegExp((error as Error).message),
        start,
      );
    }
    this.position = index;
    return {
      // 正規表現の字句は構文解析器がすぐに値として読むため、種類と元の書き方は
      // 使わない。
      // Stryker disable next-line StringLiteral
      type: 'regexp',
      // Stryker disable next-line MethodExpression
      value: source.slice(start, index),
      literal: {pattern, flags},
      start,
      end: index,
      newlineBefore,
    };
  }

  /**
   * 数字の並びを読みます。区切り（`_`）は数字と数字の間にだけ置けます。
   *
   * @param index 読み始める位置
   * @param digit 数字にできる文字の正規表現
   * @returns 読み終えた位置
   */
  private readDigits(index: number, digit: RegExp): number {
    const source = this.source;
    let current = index;
    for (;;) {
      const character = source[current];
      if (character !== undefined && digit.test(character)) {
        current += 1;
        continue;
      }
      if (character === '_') {
        const before = source[current - 1];
        const after = source[current + 1];
        // 先頭の `_`（`0x_1`）は直前が数字でないことで弾かれる。
        if (!digit.test(before) || after === undefined || !digit.test(after)) {
          throw syntaxError(MESSAGES.numericSeparator, current);
        }
        current += 1;
        continue;
      }
      return current;
    }
  }

  /**
   * 数値リテラルを読みます。
   *
   * 10 進（小数・指数）・`0x` / `0o` / `0b`・BigInt（`n`）を読みます。strict
   * モードで書けない旧式の 8 進（`010`・`08`）は構文エラーです。
   *
   * @param start 開始位置
   * @param newlineBefore 直前に改行があったかどうか
   * @returns 字句
   */
  private readNumber(start: number, newlineBefore: boolean): Token {
    const source = this.source;
    let index = start;
    let isBigInt = false;
    const prefix = source[start + 1];
    if (source[start] === '0' && /[xXoObB]/.test(prefix)) {
      const digit = /[xX]/.test(prefix)
        ? /[0-9a-fA-F]/
        : /[oO]/.test(prefix)
          ? /[0-7]/
          : /[01]/;
      index = this.readDigits(start + 2, digit);
      if (index === start + 2) {
        throw syntaxError(MESSAGES.invalidToken, start);
      }
      if (source[index] === 'n') {
        isBigInt = true;
        index += 1;
      }
    } else {
      if (source[start] === '0' && /[0-9_]/.test(source[start + 1])) {
        throw syntaxError(MESSAGES.octalLiteral, start);
      }
      index = this.readDigits(start, /[0-9]/);
      if (source[index] === '.') {
        index += 1;
        // `.` の直後の `_`（`1._5`）は、数値の直後の識別子として弾かれる。
        // 数字が無ければ `readDigits()` は位置を進めないため、この判定を外しても
        // 結果は同じ。
        // Stryker disable next-line ConditionalExpression
        if (/[0-9]/.test(source[index])) {
          index = this.readDigits(index, /[0-9]/);
        }
      }
      if (source[index] === 'e' || source[index] === 'E') {
        index += 1;
        if (source[index] === '+' || source[index] === '-') {
          index += 1;
        }
        if (!/[0-9]/.test(source[index])) {
          throw syntaxError(MESSAGES.invalidToken, start);
        }
        index = this.readDigits(index, /[0-9]/);
      }
      // 小数・指数に付けた `n`（`1.5n`）は、下の `BigInt()` が SyntaxError にする。
      if (source[index] === 'n') {
        isBigInt = true;
        index += 1;
      }
    }
    // 数値の直後の識別子（`1a`・`1.toString`）は、この後で別の字句になり、
    // 構文解析で値の後に値を置いた構文エラーになる。
    const text = source.slice(start, index).replace(/_/g, '');
    this.position = index;
    return {
      type: 'number',
      // Stryker disable next-line MethodExpression: 字句の元の書き方は説明文にだけ使う
      value: source.slice(start, index),
      literal: isBigInt ? BigInt(text.slice(0, -1)) : Number(text),
      start,
      end: index,
      newlineBefore,
    };
  }

  /**
   * 16 進の数字の並びを読みます。
   *
   * @param index 読み始める位置
   * @param length 読む桁数
   * @returns 値。桁が足りない場合は null
   */
  private readHex(index: number, length: number): number | null {
    // 末尾を越えて桁が足りないときは、続けて終端が無い構文エラーになるため、桁の
    // 数は確かめない。
    const text = this.source.slice(index, index + length);
    if (!/^[0-9a-fA-F]+$/.test(text)) {
      return null;
    }
    return parseInt(text, 16);
  }

  /**
   * 文字列リテラルを読み、エスケープを解きます。
   *
   * strict モードの規則に従います。8 進のエスケープ（`\1`）・`\8`・`\9` と、
   * 本体の改行は構文エラーです。
   *
   * @param start 開始位置
   * @param newlineBefore 直前に改行があったかどうか
   * @returns 字句
   */
  private readString(start: number, newlineBefore: boolean): Token {
    const source = this.source;
    const quote = source[start];
    let index = start + 1;
    let value = '';
    for (;;) {
      const character = source[index];
      if (character === undefined || character === '\n' || character === '\r') {
        throw syntaxError(MESSAGES.unterminatedString, start);
      }
      if (character === quote) {
        index += 1;
        break;
      }
      if (character !== '\\') {
        value += character;
        index += 1;
        continue;
      }
      const escaped = source[index + 1];
      const escapeStart = index;
      index += 2;
      switch (escaped) {
        // 末尾の `\` は、次の周回で終端が無い構文エラーになる（結果は同じ）。
        // Stryker disable next-line ConditionalExpression
        case undefined:
          throw syntaxError(MESSAGES.unterminatedString, start);
        case 'n':
          value += '\n';
          break;
        case 't':
          value += '\t';
          break;
        case 'r':
          value += '\r';
          break;
        case 'b':
          value += '\b';
          break;
        case 'f':
          value += '\f';
          break;
        case 'v':
          value += '\v';
          break;
        case '0':
          if (/[0-9]/.test(source[index])) {
            throw syntaxError(MESSAGES.octalEscape, escapeStart);
          }
          value += '\0';
          break;
        case 'x': {
          const code = this.readHex(index, 2);
          if (code === null) {
            throw syntaxError(MESSAGES.invalidHex, escapeStart);
          }
          value += String.fromCharCode(code);
          index += 2;
          break;
        }
        case 'u': {
          if (source[index] === '{') {
            const close = source.indexOf('}', index);
            // `}` が無ければ中身を空として読み、続く判定で構文エラーにする（`}` が
            // 無いときの分岐を外しても、中身が 16 進にならず同じ構文エラーになる）。
            // Stryker disable next-line all
            const end = close < 0 ? index : close;
            const text = source.slice(index + 1, end);
            const code = /^[0-9a-fA-F]+$/.test(text) ? parseInt(text, 16) : NaN;
            if (!(code <= 0x10ffff)) {
              throw syntaxError(MESSAGES.invalidUnicode, escapeStart);
            }
            value += String.fromCodePoint(code);
            index = close + 1;
            break;
          }
          const code = this.readHex(index, 4);
          if (code === null) {
            throw syntaxError(MESSAGES.invalidUnicode, escapeStart);
          }
          value += String.fromCharCode(code);
          index += 4;
          break;
        }
        case '\r':
          // 行の継続。`\r\n` は 1 つの改行として扱う。
          if (source[index] === '\n') {
            index += 1;
          }
          break;
        case '\n':
        case ' ':
        case ' ':
          break;
        default:
          if (/[1-9]/.test(escaped)) {
            throw syntaxError(MESSAGES.octalEscape, escapeStart);
          }
          value += escaped;
      }
    }
    this.position = index;
    return {
      type: 'string',
      // Stryker disable next-line MethodExpression: 字句の元の書き方は説明文にだけ使う
      value: source.slice(start, index),
      literal: value,
      start,
      end: index,
      newlineBefore,
    };
  }
}

/** 構文解析器の巻き戻し位置です。 */
interface ParserState {
  position: number;
  token: Token;
  lastEnd: number;
}

/**
 * 構文解析器です。
 *
 * 優先順位は JavaScript と同じです。
 */
class Parser {
  /** 字句解析器 */
  private readonly lexer: Lexer;

  /** 現在の字句 */
  private token: Token;

  /** 最後に読み終えた字句の終了位置 */
  private lastEnd = 0;

  /**
   * @param source 式の文字列
   */
  public constructor(source: string) {
    this.lexer = new Lexer(source);
    this.token = this.lexer.lex();
  }

  /**
   * 式全体を解析します。
   *
   * @returns 構文木
   */
  public parseProgram(): ExpressionNode {
    // 空の式は、一次式の位置で終端に当たって構文エラーになる。
    const node = this.parseExpression();
    if (this.token.type !== 'eof') {
      throw this.unexpected();
    }
    return node;
  }

  /**
   * 現在の字句が予期しないものであることを表すエラーを作ります。
   *
   * @returns 構文エラー
   */
  private unexpected(): SyntaxError {
    const token = this.token;
    // 説明文を選ぶだけなので、ミューテーションテストの対象から外す。
    // Stryker disable next-line all
    return token.type === 'eof'
      ? syntaxError(MESSAGES.unexpectedEnd, token.start)
      : syntaxError(MESSAGES.unexpectedToken(token.value), token.start);
  }

  /**
   * 次の字句へ進みます。
   *
   * @returns 進む前の字句
   */
  private advance(): Token {
    const token = this.token;
    this.lastEnd = token.end;
    this.token = this.lexer.lex();
    return token;
  }

  /**
   * 現在の字句が指定の記号かどうかを返します。
   *
   * @param value 記号
   * @returns 指定の記号であれば true
   */
  private is(value: string): boolean {
    // 記号以外の字句の元の書き方は記号と一致しない（文字列は引用符を含む）ため、
    // 種類の判定を外しても結果は同じ。
    // Stryker disable next-line ConditionalExpression
    if (this.token.type !== 'punct') {
      return false;
    }
    return this.token.value === value;
  }

  /**
   * 現在の字句が指定の記号なら読み進めます。
   *
   * @param value 記号
   * @returns 読み進めた場合は true
   */
  private eat(value: string): boolean {
    if (this.is(value)) {
      this.advance();
      return true;
    }
    return false;
  }

  /**
   * 指定の記号を読みます。違う場合は構文エラーです。
   *
   * @param value 記号
   */
  private expect(value: string): void {
    if (!this.eat(value)) {
      throw this.unexpected();
    }
  }

  /**
   * 巻き戻し位置を控えます。
   *
   * @returns 巻き戻し位置
   */
  private save(): ParserState {
    return {
      position: this.lexer.position,
      token: this.token,
      lastEnd: this.lastEnd,
    };
  }

  /**
   * 控えた位置へ巻き戻します。
   *
   * @param state 巻き戻し位置
   */
  private restore(state: ParserState): void {
    this.lexer.position = state.position;
    this.token = state.token;
    this.lastEnd = state.lastEnd;
  }

  /**
   * 節に位置を付けます。
   *
   * @param node 節（位置を除く）
   * @param start 開始位置
   * @returns 位置を付けた節
   */
  private finish<T extends ExpressionNode>(
    node: Omit<T, 'start' | 'end'>,
    start: number,
  ): T {
    return {...node, start, end: this.lastEnd} as T;
  }

  /**
   * 変数として参照できる名前かを検査します。
   *
   * @param name 名前
   * @param position 位置
   */
  private checkReferenceName(name: string, position: number): void {
    if (
      DISALLOWED_KEYWORDS.has(name) ||
      STRICT_FORBIDDEN_NAMES.has(name) ||
      STRICT_RESERVED_WORDS.has(name)
    ) {
      throw syntaxError(MESSAGES.notInExpressions(name), position);
    }
  }

  /**
   * 引数名にできる名前かを検査します。
   *
   * @param name 名前
   * @param position 位置
   */
  private checkBindingName(name: string, position: number): void {
    this.checkReferenceName(name, position);
    if (name === 'true' || name === 'false' || name === 'null') {
      throw syntaxError(MESSAGES.notParameter(name), position);
    }
  }

  /**
   * プロパティ名（`.` の後・オブジェクトのキー）にできる名前かを検査します。
   *
   * 従来の方式と同じく、使用できないキーワードと `eval` / `arguments` は
   * プロパティ名にも書けません。
   *
   * @param name 名前
   * @param position 位置
   */
  private checkPropertyName(name: string, position: number): void {
    if (
      DISALLOWED_KEYWORDS.has(name) ||
      STRICT_FORBIDDEN_NAMES.has(name) ||
      FORBIDDEN_PROPERTY_NAMES.has(name)
    ) {
      throw syntaxError(MESSAGES.notProperty(name), position);
    }
  }

  /**
   * カンマ演算子を含む式を解析します。
   *
   * @returns 構文木
   */
  private parseExpression(): ExpressionNode {
    const start = this.token.start;
    const first = this.parseAssignment();
    if (!this.is(',')) {
      return first;
    }
    const expressions = [first];
    while (this.eat(',')) {
      expressions.push(this.parseAssignment());
    }
    return this.finish<SequenceNode>({type: 'Sequence', expressions}, start);
  }

  /**
   * アロー関数または三項演算子以下の式を解析します。
   *
   * @returns 構文木
   */
  private parseAssignment(): ExpressionNode {
    const arrow = this.tryParseArrow();
    return arrow ?? this.parseConditional();
  }

  /**
   * アロー関数として読めるなら解析します。
   *
   * @returns アロー関数。読めない場合は null（位置は戻します）
   */
  private tryParseArrow(): ArrowNode | null {
    const token = this.token;
    const start = token.start;
    if (token.type === 'identifier') {
      const state = this.save();
      this.advance();
      if (this.is('=>') && !this.token.newlineBefore) {
        this.checkBindingName(token.value, token.start);
        const params: PatternNode[] = [
          {type: 'BindingIdentifier', name: token.value},
        ];
        return this.parseArrowBody(params, null, false, start);
      }
      if (token.value === 'async' && !this.token.newlineBefore) {
        const parameter = this.token;
        if (parameter.type === 'identifier') {
          this.advance();
          if (this.is('=>') && !this.token.newlineBefore) {
            this.checkBindingName(parameter.value, parameter.start);
            const params: PatternNode[] = [
              {type: 'BindingIdentifier', name: parameter.value},
            ];
            return this.parseArrowBody(params, null, true, start);
          }
        } else {
          // `(` でなければ、引数の解析が失敗して null を返す。
          const arrow = this.tryParseParenthesizedArrow(true, start);
          if (arrow !== null) {
            return arrow;
          }
        }
      }
      this.restore(state);
      return null;
    }
    if (this.is('(')) {
      return this.tryParseParenthesizedArrow(false, start);
    }
    return null;
  }

  /**
   * `(` で始まるアロー関数として読めるなら解析します。
   *
   * @param isAsync `async` が前置されているか
   * @param start アロー関数の開始位置
   * @returns アロー関数。読めない場合は null（位置は戻します）
   */
  private tryParseParenthesizedArrow(
    isAsync: boolean,
    start: number,
  ): ArrowNode | null {
    const state = this.save();
    let parsed: {params: PatternNode[]; rest: PatternNode | null};
    try {
      parsed = this.parseParameters();
    } catch {
      this.restore(state);
      return null;
    }
    if (!this.is('=>') || this.token.newlineBefore) {
      this.restore(state);
      return null;
    }
    return this.parseArrowBody(parsed.params, parsed.rest, isAsync, start);
  }

  /**
   * 丸括弧の引数リストを解析します。
   *
   * @returns 引数と残余引数
   */
  private parseParameters(): {
    params: PatternNode[];
    rest: PatternNode | null;
  } {
    this.expect('(');
    const params: PatternNode[] = [];
    let rest: PatternNode | null = null;
    while (!this.is(')')) {
      if (this.eat('...')) {
        rest = this.parseBindingTarget();
        break;
      }
      params.push(this.parseBindingTarget());
      if (!this.eat(',')) {
        break;
      }
    }
    this.expect(')');
    return {params, rest};
  }

  /**
   * 引数の形（識別子・分割代入）を解析します。
   *
   * @returns 引数の形
   */
  private parseBindingTarget(): PatternNode {
    const token = this.token;
    if (token.type === 'identifier') {
      this.checkBindingName(token.value, token.start);
      this.advance();
      return {type: 'BindingIdentifier', name: token.value};
    }
    if (this.eat('{')) {
      const properties: {key: string; value: PatternNode}[] = [];
      let rest: string | null = null;
      while (!this.is('}')) {
        if (this.eat('...')) {
          const target = this.token;
          if (target.type !== 'identifier') {
            throw this.unexpected();
          }
          this.checkBindingName(target.value, target.start);
          this.advance();
          rest = target.value;
          break;
        }
        const keyToken = this.token;
        const key = this.parsePropertyKey();
        if (this.eat(':')) {
          properties.push({key, value: this.parseBindingTarget()});
        } else {
          if (keyToken.type !== 'identifier') {
            throw this.unexpected();
          }
          this.checkBindingName(key, keyToken.start);
          properties.push({key, value: {type: 'BindingIdentifier', name: key}});
        }
        if (!this.eat(',')) {
          break;
        }
      }
      this.expect('}');
      return {type: 'ObjectPattern', properties, rest};
    }
    if (this.eat('[')) {
      const elements: (PatternNode | null)[] = [];
      let rest: PatternNode | null = null;
      while (!this.is(']')) {
        if (this.eat(',')) {
          elements.push(null);
          continue;
        }
        if (this.eat('...')) {
          rest = this.parseBindingTarget();
          break;
        }
        elements.push(this.parseBindingTarget());
        if (!this.is(']')) {
          this.expect(',');
        }
      }
      this.expect(']');
      return {type: 'ArrayPattern', elements, rest};
    }
    throw this.unexpected();
  }

  /**
   * 引数の形に現れる名前を集めます。
   *
   * @param pattern 引数の形
   * @param names 集めた名前（追記します）
   */
  private collectBoundNames(pattern: PatternNode, names: string[]): void {
    switch (pattern.type) {
      case 'BindingIdentifier':
        names.push(pattern.name);
        return;
      case 'ObjectPattern':
        pattern.properties.forEach(property =>
          this.collectBoundNames(property.value, names),
        );
        if (pattern.rest !== null) {
          names.push(pattern.rest);
        }
        return;
      case 'ArrayPattern':
        pattern.elements.forEach(element => {
          if (element !== null) {
            this.collectBoundNames(element, names);
          }
        });
        if (pattern.rest !== null) {
          this.collectBoundNames(pattern.rest, names);
        }
        return;
    }
  }

  /**
   * アロー関数の `=>` と本体を解析します。
   *
   * @param params 引数
   * @param rest 残余引数
   * @param isAsync `async` が前置されているか
   * @param start アロー関数の開始位置
   * @returns アロー関数
   */
  private parseArrowBody(
    params: PatternNode[],
    rest: PatternNode | null,
    isAsync: boolean,
    start: number,
  ): ArrowNode {
    // 名前は重複の検査にだけ使う。書き換えが初めに足す値（空白を含む文字列）は
    // 識別子にならず、重複を生まないため、配列の初期値の書き換えは等価。
    // Stryker disable next-line ArrayDeclaration
    const names: string[] = [];
    params.forEach(param => this.collectBoundNames(param, names));
    if (rest !== null) {
      this.collectBoundNames(rest, names);
    }
    if (new Set(names).size !== names.length) {
      throw syntaxError(MESSAGES.duplicateParameter, start);
    }
    this.expect('=>');
    if (this.is('{')) {
      // ブロックの本体は文になる（仕様「CSP モードの式評価」）。
      throw syntaxError(MESSAGES.blockBody, this.token.start);
    }
    const body = this.parseAssignment();
    return this.finish<ArrowNode>(
      {type: 'Arrow', params, rest, body, async: isAsync},
      start,
    );
  }

  /**
   * 三項演算子以下の式を解析します。
   *
   * @returns 構文木
   */
  private parseConditional(): ExpressionNode {
    const start = this.token.start;
    const test = this.parseShortCircuit();
    if (!this.eat('?')) {
      return test;
    }
    const consequent = this.parseAssignment();
    this.expect(':');
    const alternate = this.parseAssignment();
    return this.finish<ConditionalNode>(
      {type: 'Conditional', test, consequent, alternate},
      start,
    );
  }

  /**
   * `??` と `||` / `&&` の式を解析します。
   *
   * JavaScript と同じく、`??` と `||` / `&&` を丸括弧なしで混ぜた式は構文
   * エラーです。
   *
   * @returns 構文木
   */
  private parseShortCircuit(): ExpressionNode {
    const start = this.token.start;
    let left = this.parseLogical('||');
    if (!this.is('??')) {
      return left;
    }
    if (left.type === 'Logical' && !left.paren) {
      throw syntaxError(MESSAGES.mixNullish, this.token.start);
    }
    while (this.eat('??')) {
      const right = this.parseBinary(1);
      left = this.finish<LogicalNode>(
        // 評価器は `&&` と `||` 以外を `??` として扱う。
        // Stryker disable next-line StringLiteral
        {type: 'Logical', operator: '??', left, right},
        start,
      );
    }
    // 右側の `||` / `&&`（`a ?? b || c`）は読まれずに残り、構文エラーになる。
    return left;
  }

  /**
   * `||` または `&&` の式を解析します。
   *
   * @param operator 解析する演算子
   * @returns 構文木
   */
  private parseLogical(operator: '||' | '&&'): ExpressionNode {
    const start = this.token.start;
    const parseOperand = () =>
      operator === '||' ? this.parseLogical('&&') : this.parseBinary(1);
    let left = parseOperand();
    while (this.eat(operator)) {
      const right = parseOperand();
      left = this.finish<LogicalNode>(
        {type: 'Logical', operator, left, right},
        start,
      );
    }
    return left;
  }

  /**
   * 二項演算子の式を優先順位に従って解析します。
   *
   * @param minimum 受け付ける最小の優先順位
   * @returns 構文木
   */
  private parseBinary(minimum: number): ExpressionNode {
    const start = this.token.start;
    let left = this.parseExponent();
    for (;;) {
      const token = this.token;
      const precedence =
        token.type === 'punct' ? BINARY_PRECEDENCE[token.value] : undefined;
      if (precedence === undefined || precedence < minimum) {
        return left;
      }
      this.advance();
      const right = this.parseBinary(precedence + 1);
      left = this.finish<BinaryNode>(
        {type: 'Binary', operator: token.value, left, right},
        start,
      );
    }
  }

  /**
   * `**` の式を解析します（右結合）。
   *
   * JavaScript と同じく、丸括弧のない単項演算子を左辺に置いた式
   * （`-2 ** 2`）は構文エラーです。
   *
   * @returns 構文木
   */
  private parseExponent(): ExpressionNode {
    const start = this.token.start;
    const left = this.parseUnary();
    if (!this.is('**')) {
      return left;
    }
    if (left.type === 'Unary' && !left.paren) {
      throw syntaxError(MESSAGES.unaryExponent, this.token.start);
    }
    this.advance();
    const right = this.parseExponent();
    return this.finish<BinaryNode>(
      {type: 'Binary', operator: '**', left, right},
      start,
    );
  }

  /**
   * 増減演算子の対象を検査します。
   *
   * 従来の方式はメンバーアクセスを暗黙のオプショナルチェーンへ変換するため、
   * `a.b++` は構文エラーになります。対象にできるのは識別子だけです。
   *
   * @param node 対象
   * @returns 識別子の節
   */
  private toUpdateTarget(node: ExpressionNode): IdentifierNode {
    if (node.type !== 'Identifier') {
      throw syntaxError(MESSAGES.invalidUpdate, node.start);
    }
    return node;
  }

  /**
   * 単項演算子と前置の増減演算子の式を解析します。
   *
   * @returns 構文木
   */
  private parseUnary(): ExpressionNode {
    const start = this.token.start;
    if (this.is('!') || this.is('-') || this.is('+')) {
      const operator = this.advance().value as UnaryNode['operator'];
      const argument = this.parseUnary();
      return this.finish<UnaryNode>({type: 'Unary', operator, argument}, start);
    }
    if (this.is('++') || this.is('--')) {
      const operator = this.advance().value as UpdateNode['operator'];
      const argument = this.toUpdateTarget(this.parseUnary());
      return this.finish<UpdateNode>(
        {type: 'Update', operator, prefix: true, argument},
        start,
      );
    }
    return this.parsePostfix();
  }

  /**
   * 後置の増減演算子の式を解析します。
   *
   * @returns 構文木
   */
  private parsePostfix(): ExpressionNode {
    const start = this.token.start;
    const node = this.parseCallOrMember();
    if ((this.is('++') || this.is('--')) && !this.token.newlineBefore) {
      const argument = this.toUpdateTarget(node);
      const operator = this.advance().value as UpdateNode['operator'];
      return this.finish<UpdateNode>(
        {type: 'Update', operator, prefix: false, argument},
        start,
      );
    }
    return node;
  }

  /**
   * 呼び出しを暗黙のオプショナルチェーンにするかを返します。
   *
   * 従来の方式は、直前が識別子・`)`・`]` の `(` を `?.(` へ変換します（仕様
   * 「暗黙のオプショナルチェーン」）。
   *
   * @param callee 呼び出し先
   * @returns オプショナルにする場合は true
   */
  private isImplicitlyOptionalCall(callee: ExpressionNode): boolean {
    if (callee.paren) {
      return true;
    }
    switch (callee.type) {
      case 'Identifier':
        return !NON_OPTIONAL_CALLEE_NAMES.has(callee.name);
      case 'Member':
      case 'Call':
        return true;
      // Stryker disable next-line all: 分岐を外しても undefined（偽）を返す
      default:
        return false;
    }
  }

  /**
   * 呼び出しの引数を解析します。
   *
   * @returns 引数
   */
  private parseArguments(): (ExpressionNode | SpreadNode)[] {
    this.expect('(');
    const args: (ExpressionNode | SpreadNode)[] = [];
    while (!this.is(')')) {
      args.push(this.parseElement());
      if (!this.eat(',')) {
        break;
      }
    }
    this.expect(')');
    return args;
  }

  /**
   * 配列の要素・呼び出しの引数（スプレッドを含む）を解析します。
   *
   * @returns 構文木
   */
  private parseElement(): ExpressionNode | SpreadNode {
    const start = this.token.start;
    if (this.eat('...')) {
      const argument = this.parseAssignment();
      return {type: 'Spread', argument, start, end: this.lastEnd};
    }
    return this.parseAssignment();
  }

  /**
   * `.` の後のプロパティ名を読みます。
   *
   * @returns プロパティ名
   */
  private parseMemberName(): string {
    const token = this.token;
    if (token.type !== 'identifier') {
      throw this.unexpected();
    }
    this.checkPropertyName(token.value, token.start);
    this.advance();
    return token.value;
  }

  /**
   * 呼び出しとメンバーアクセスの式を解析します。
   *
   * @returns 構文木
   */
  private parseCallOrMember(): ExpressionNode {
    const start = this.token.start;
    let node = this.parsePrimary();
    for (;;) {
      if (this.eat('.')) {
        const property = this.parseMemberName();
        node = this.finish<MemberNode>(
          {type: 'Member', object: node, property, computed: false},
          start,
        );
      } else if (this.eat('?.')) {
        if (this.is('(')) {
          const args = this.parseArguments();
          node = this.finish<CallNode>(
            {type: 'Call', callee: node, args, optional: true},
            start,
          );
        } else if (this.eat('[')) {
          const property = this.parseExpression();
          this.expect(']');
          node = this.finish<MemberNode>(
            {type: 'Member', object: node, property, computed: true},
            start,
          );
        } else {
          const property = this.parseMemberName();
          node = this.finish<MemberNode>(
            {type: 'Member', object: node, property, computed: false},
            start,
          );
        }
      } else if (this.eat('[')) {
        const property = this.parseExpression();
        this.expect(']');
        node = this.finish<MemberNode>(
          {type: 'Member', object: node, property, computed: true},
          start,
        );
      } else if (this.is('(')) {
        const optional = this.isImplicitlyOptionalCall(node);
        const args = this.parseArguments();
        node = this.finish<CallNode>(
          {type: 'Call', callee: node, args, optional},
          start,
        );
      } else {
        return node;
      }
    }
  }

  /**
   * オブジェクトのキーを読みます。
   *
   * 識別子・文字列・数値を受け付けます。計算プロパティ名（`[式]`）は従来の
   * 方式と同じく受け付けません。
   *
   * @returns キー
   */
  private parsePropertyKey(): string {
    const token = this.token;
    if (token.type === 'identifier') {
      this.checkPropertyName(token.value, token.start);
      this.advance();
      return token.value;
    }
    // 数値の字句を文字列として扱っても、キーの値と検査の結果は同じ。
    // Stryker disable next-line ConditionalExpression
    if (token.type === 'string') {
      const key = token.literal as string;
      if (FORBIDDEN_PROPERTY_NAMES.has(key)) {
        throw syntaxError(MESSAGES.notProperty(key), token.start);
      }
      this.advance();
      return key;
    }
    if (token.type === 'number') {
      this.advance();
      return String(token.literal);
    }
    throw this.unexpected();
  }

  /**
   * オブジェクトリテラルを解析します。
   *
   * @returns 構文木
   */
  private parseObject(): ObjectNode {
    const start = this.token.start;
    this.expect('{');
    const properties: ObjectProperty[] = [];
    while (!this.is('}')) {
      if (this.eat('...')) {
        // 評価器は `init` 以外をスプレッドとして扱う。
        // Stryker disable next-line StringLiteral
        properties.push({kind: 'spread', argument: this.parseAssignment()});
      } else {
        // 計算プロパティ名（`[k]: v`）・メソッド（`f() {}`）・getter / setter
        // （`get a() {}`）は、キーかキーの後の字句が受け付けられず構文エラーになる
        // （仕様「CSP モードと従来の方式の違い」）。
        const keyToken = this.token;
        const key = this.parsePropertyKey();
        if (this.eat(':')) {
          properties.push({kind: 'init', key, value: this.parseAssignment()});
        } else {
          if (
            keyToken.type !== 'identifier' ||
            key === 'true' ||
            key === 'false' ||
            key === 'null'
          ) {
            throw this.unexpected();
          }
          this.checkReferenceName(key, keyToken.start);
          properties.push({
            kind: 'init',
            key,
            value: {
              type: 'Identifier',
              name: key,
              start: keyToken.start,
              end: keyToken.end,
            },
          });
        }
      }
      if (!this.eat(',')) {
        break;
      }
    }
    this.expect('}');
    return this.finish<ObjectNode>({type: 'Object', properties}, start);
  }

  /**
   * 配列リテラルを解析します。
   *
   * @returns 構文木
   */
  private parseArray(): ArrayNode {
    const start = this.token.start;
    this.expect('[');
    const elements: (ExpressionNode | SpreadNode | null)[] = [];
    while (!this.is(']')) {
      if (this.eat(',')) {
        elements.push(null);
        continue;
      }
      elements.push(this.parseElement());
      if (!this.is(']')) {
        this.expect(',');
      }
    }
    this.expect(']');
    return this.finish<ArrayNode>({type: 'Array', elements}, start);
  }

  /**
   * 一次式（リテラル・識別子・括弧・配列・オブジェクト）を解析します。
   *
   * @returns 構文木
   */
  private parsePrimary(): ExpressionNode {
    const token = this.token;
    const start = token.start;
    switch (token.type) {
      case 'number':
      case 'string':
        this.advance();
        return this.finish<LiteralNode>(
          {type: 'Literal', value: token.literal},
          start,
        );
      case 'identifier': {
        this.advance();
        if (token.value === 'true' || token.value === 'false') {
          return this.finish<LiteralNode>(
            {type: 'Literal', value: token.value === 'true'},
            start,
          );
        }
        if (token.value === 'null') {
          return this.finish<LiteralNode>(
            {type: 'Literal', value: null},
            start,
          );
        }
        this.checkReferenceName(token.value, token.start);
        return this.finish<IdentifierNode>(
          {type: 'Identifier', name: token.value},
          start,
        );
      }
      case 'punct':
        break;
      // Stryker disable next-line all: この後の分岐がすべて外れ、同じ構文エラーになる
      default:
        throw this.unexpected();
    }
    if (this.is('/')) {
      // 値が来る位置の `/` は正規表現リテラルの開始。
      this.token = this.lexer.readRegExp(token.start, token.newlineBefore);
      const literal = this.advance().literal as {
        pattern: string;
        flags: string;
      };
      return this.finish<RegExpNode>(
        {type: 'RegExp', pattern: literal.pattern, flags: literal.flags},
        start,
      );
    }
    if (this.eat('(')) {
      const node = this.parseExpression();
      this.expect(')');
      return {...node, paren: true};
    }
    if (this.is('[')) {
      return this.parseArray();
    }
    // `{` でなければ、`parseObject()` の `expect()` が同じ構文エラーにする。
    // Stryker disable next-line ConditionalExpression
    if (this.is('{')) {
      return this.parseObject();
    }
    throw this.unexpected();
  }
}

/**
 * 式を構文木へ解析します。
 *
 * @param expression 式の文字列
 * @returns 構文木
 * @throws {SyntaxError} 受け付けない式の場合
 */
export function parseExpression(expression: string): ExpressionNode {
  return new Parser(expression).parseProgram();
}
