/**
 * @fileoverview 式の評価で使う名前の規則
 *
 * 従来の方式（`expression.ts`）と CSP モード（`expression_interpreter.ts`）の
 * 両方が参照する名前の一覧です。二つの方式で遮断する名前や参照できる組み込みが
 * 食い違わないよう、一覧はここにだけ置きます。
 */

/**
 * 式から参照すると `undefined` になる識別子です（仕様「評価メカニズム」の
 * 「禁止識別子を `undefined` で上書き」）。
 */
export const FORBIDDEN_NAMES: ReadonlySet<string> = new Set([
  'window',
  'self',
  'globalThis',
  'frames',
  'parent',
  'top',
  'Function',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'alert',
  'confirm',
  'prompt',
  'fetch',
  'XMLHttpRequest',
  'Reflect',
  'constructor',
  '__proto__',
  'prototype',
  'Object',
  'document',
  'location',
  'navigator',
  'localStorage',
  'sessionStorage',
  'IndexedDB',
  'history',
]);

/** strict モードで使えない識別子です。式のどこに書いても構文として拒否します。 */
export const STRICT_FORBIDDEN_NAMES: ReadonlySet<string> = new Set([
  'eval',
  'arguments',
]);

/**
 * 禁止識別子のうち、バインドのキーとして渡した場合はその値で解決する名前です。
 */
export const REBINDABLE_FORBIDDEN_NAMES: ReadonlySet<string> = new Set([
  'location',
  'history',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'IndexedDB',
]);

/** メンバーアクセスとオブジェクトのキーで遮断するプロパティ名です。 */
export const FORBIDDEN_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  'constructor',
  '__proto__',
  'prototype',
]);

/** 式構文として許可しない予約語です。式のどこに書いても構文として拒否します。 */
export const DISALLOWED_KEYWORDS: ReadonlySet<string> = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'return',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

/**
 * strict モードで識別子にできない予約語です（`DISALLOWED_KEYWORDS` 以外）。
 *
 * プロパティ名とオブジェクトのキーには書けますが、変数の参照と引数名には
 * 書けません。
 */
export const STRICT_RESERVED_WORDS: ReadonlySet<string> = new Set([
  'enum',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'static',
  'super',
]);

/**
 * 式から参照できる標準組み込みです（仕様「バインドに無い識別子の扱い」の
 * 「式から参照できる標準組み込み」）。
 */
export const ALLOWED_GLOBAL_IDENTIFIERS: ReadonlySet<string> = new Set([
  'Math',
  'JSON',
  'Intl',
  'Atomics',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Date',
  'RegExp',
  'Symbol',
  'BigInt',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'WeakRef',
  'FinalizationRegistry',
  'Promise',
  'Proxy',
  'Error',
  'AggregateError',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'DataView',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'encodeURIComponent',
  'decodeURI',
  'decodeURIComponent',
]);
