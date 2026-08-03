/**
 * @fileoverview 式評価エンジン
 *
 * 式評価システムです。
 * XSS攻撃やコードインジェクションを防ぐためのセキュリティ機能と、
 * パフォーマンス向上のためのキャッシュ機能を提供します。
 */

import Log from './log';
import Builtins from './builtins';
import Dev from './dev';
import Env from './env';
import Queue from './queue';

/**
 * 式評価結果の詳細です。
 */
export interface ExpressionEvaluationDetail {
  /** 評価結果 */
  value: unknown;

  /** 未解決参照が含まれていたかどうか */
  unresolvedReference: boolean;
}

type ExpressionTokenType = 'identifier' | 'number' | 'string' | 'operator';

interface ExpressionToken {
  type: ExpressionTokenType;
  value: string;
  position: number;
}

interface ExpressionEvaluatorSetup {
  bindKeys: string[];
  evaluator: ((...args: unknown[]) => unknown) | null;
  compileFailed: boolean;
}

type GroupContext = 'paren' | 'array' | 'member' | 'object';

export default class Expression {
  /** 未宣言識別子の自動補完を試みる最大回数 */
  private static readonly MAX_IDENTIFIER_RECOVERY_COUNT = 8;

  /** 組み込みヘルパーを公開する予約名前空間 */
  private static readonly BUILTIN_NAMESPACE = 'haori';

  /**
   * 式スコープへ注入する組み込みヘルパー。公開 API の凍結オブジェクトをそのまま
   * 注入すると、評価時の Proxy ラップが「read-only プロパティに別値を返せない」と
   * いう Proxy 不変条件に違反するため、非凍結の浅いコピーを用いる。
   */
  private static readonly BUILTIN_HELPERS: Record<string, unknown> = {
    ...Builtins,
  };

  /**
   * 式が予約名前空間 `haori` を独立した識別子として参照しているか判定する正規表現。
   * `foo.haori` のようなプロパティアクセスは対象外とする。
   */
  private static readonly BUILTIN_REFERENCE_PATTERN =
    /(^|[^\w$.])haori(?![\w$])/;

  /**
   * 組み込みヘルパーの名前空間に載せる、要素データ参照用のプロパティ名。
   *
   * 識別子として書けないキー（`customer.email` のようにドットや記号を含む
   * `name` 由来のキー）は式の引数にできないため、`haori.data['customer.email']`
   * の形で読めるようにします。
   */
  private static readonly BUILTIN_DATA_PROPERTY = 'data';

  /**
   * 式が `haori.data` を参照しているか判定する正規表現。
   *
   * 参照している式にだけ要素データを載せるための判定です。ブラケット記法
   * （`haori['data']`）は文字列リテラルを除去した検出用テキストでは判別できないため、
   * `haori` へのブラケットアクセス全体を対象に含めて安全側へ倒します。
   */
  private static readonly BUILTIN_DATA_REFERENCE_PATTERN =
    /(^|[^\w$.])haori\s*(\.\s*data(?![\w$])|\[)/;

  /**
   * 単一の識別子名だけで構成されるかを判定する正規表現。
   *
   * `new Function` は `a,b` のような複数引数や `{a}` / `a=1` のような引数パターンも
   * 受け付けてしまう（引数の位置がずれて他のキーの値が壊れる、あるいは同名の
   * バインドキーを遮蔽する）ため、構造を持つキーはここで弾く。Unicode の識別子
   * （`氏名` など）は妥当なので通す。
   */
  private static readonly IDENTIFIER_NAME_PATTERN =
    /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u;

  /** キーが関数の引数名として使えるかの判定キャッシュ */
  private static readonly usableBindingKeyCache = new Map<string, boolean>();

  /** 引数名に使えないキーとして警告済みのキー集合（開発モードの重複抑止） */
  private static readonly loggedUnusableBindingKeys = new Set<string>();

  /** コンパイルに失敗した式の集合（診断メッセージの切り替えに用いる） */
  private static readonly compileFailedExpressions = new Set<string>();

  /** 危険値チェック結果の短命キャッシュ */
  private static forbiddenBindingValueCache = new WeakMap<object, boolean>();

  /** 危険値チェックキャッシュのクリア予約済みフラグ */
  private static forbiddenBindingValueCacheResetScheduled = false;

  /** 同一 microtask 内で重複出力を抑止する、出力済み禁止キー署名の集合 */
  private static readonly loggedForbiddenKeySignatures = new Set<string>();

  /** 禁止キーログ抑止集合のクリア予約済みフラグ */
  private static loggedForbiddenKeyResetScheduled = false;

  /** Haoriで禁止すべき識別子一覧（eval と arguments は strict モードで無効化） */
  private static readonly FORBIDDEN_NAMES = [
    // グローバルオブジェクト
    'window',
    'self',
    'globalThis',
    'frames',
    'parent',
    'top',
    // 危険な関数/オブジェクト
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
    // 脱出経路・プロトタイプ
    'constructor',
    '__proto__',
    'prototype',
    'Object',
    // その他
    'document',
    'location',
    'navigator',
    'localStorage',
    'sessionStorage',
    'IndexedDB',
    'history',
  ];

  /** strict モードで禁止される識別子 */
  private static readonly STRICT_FORBIDDEN_NAMES = ['eval', 'arguments'];

  /**
   * 明示バインド時のみ利用を許可する衝突名。
   *
   * グローバル名前空間と衝突するが「実行系・プロトタイプ脱出」ではない、データ/
   * ナビゲーション/ストレージ系の名前を列挙します。これらはバインドキーとして渡すと
   * 関数引数が式中でグローバルを遮蔽するため、実グローバルへは到達できず安全です
   * （`history` のようなトップレベルキーをそのまま `data-each` で使えるようにする）。
   * `window`/`self`/`globalThis`/`Object`/`Function`/`eval`/`constructor` などの
   * 実行系・プロトタイプ脱出名は再バインドを許可しません。
   */
  private static readonly REBINDABLE_FORBIDDEN_NAMES = new Set([
    'location',
    'history',
    'document',
    'navigator',
    'localStorage',
    'sessionStorage',
    'IndexedDB',
  ]);

  /** バインド識別子としては拒否する名前 */
  private static readonly FORBIDDEN_BINDING_NAMES = new Set([
    ...Expression.FORBIDDEN_NAMES.filter(
      name => !Expression.REBINDABLE_FORBIDDEN_NAMES.has(name),
    ),
    'constructor',
    '__proto__',
    'prototype',
    ...Expression.STRICT_FORBIDDEN_NAMES,
  ]);

  /**
   * ストレージを、参照が例外になる環境でも安全に読み出します。
   *
   * `localStorage` / `sessionStorage` は、`allow-same-origin` の無い sandbox
   * iframe やサイトデータをブロックした状態のクロスサイト iframe では、参照した
   * だけで `SecurityError` になります。呼び出し元は全式評価の共通経路なので、
   * 例外をそのまま通すと画面上のすべての `{{}}` が評価できなくなります。読めない
   * 値は「その環境では入手できない値」で、バインド値へ紛れ込みようもないため、
   * `undefined` を返して照合の対象から外します。
   *
   * 警告は出しません。式評価のたびに呼ばれるためログが氾濫するうえ、`data-store`
   * が同じ状況を種別ごとに一度だけ警告するので、原因は追跡できます。
   *
   * @param read ストレージを読み出す関数
   * @returns 読み出せた `Storage`。参照が例外になる場合は undefined
   */
  private static readStorageSafely(
    read: () => Storage | undefined,
  ): Storage | undefined {
    try {
      return read();
    } catch {
      return undefined;
    }
  }

  /**
   * 明示バインド内に持ち込まれてはならない危険値を返します。
   *
   * @returns 危険値の配列
   */
  private static getForbiddenBindingValues(): unknown[] {
    const scope = globalThis as typeof globalThis & {
      window?: Window;
      document?: Document;
      navigator?: Navigator;
      history?: History;
      localStorage?: Storage;
      sessionStorage?: Storage;
      fetch?: typeof fetch;
    };
    const candidates: unknown[] = [
      scope,
      scope.window,
      scope.document,
      scope.navigator,
      scope.history,
      // 参照だけで例外になり得るのはこの 2 つのみ（他は同一オリジンの自 window
      // 由来で常に読める）。ホットパスなので、囲むのも必要な箇所だけに絞る。
      Expression.readStorageSafely(() => scope.localStorage),
      Expression.readStorageSafely(() => scope.sessionStorage),
      scope.fetch,
      scope.Function,
      scope.setTimeout,
      scope.setInterval,
      scope.requestAnimationFrame,
      scope.alert,
      scope.confirm,
      scope.prompt,
    ];
    if (scope.window?.location) {
      candidates.push(scope.window.location);
    }
    return candidates.filter(value => value !== undefined && value !== null);
  }

  /**
   * 現在の評価サイクルで利用する危険値集合を返します。
   *
   * @returns 危険値の集合
   */
  private static getForbiddenBindingValueSet(): ReadonlySet<unknown> {
    return new Set(this.getForbiddenBindingValues());
  }

  /**
   * 危険値チェック用の短命キャッシュを次の microtask で破棄します。
   */
  private static scheduleForbiddenBindingValueCacheReset(): void {
    if (this.forbiddenBindingValueCacheResetScheduled) {
      return;
    }
    this.forbiddenBindingValueCacheResetScheduled = true;
    queueMicrotask(() => {
      this.forbiddenBindingValueCache = new WeakMap<object, boolean>();
      this.forbiddenBindingValueCacheResetScheduled = false;
    });
  }

  /**
   * 禁止キー警告の重複抑止用集合を次の microtask で破棄します。
   *
   * 禁止キーは継承スコープを通じて配下の全式評価に現れ得るため、同一キー集合の
   * エラーが氾濫しないよう microtask 単位で 1 回だけ出力するための仕組みです。
   */
  private static scheduleForbiddenKeyLogReset(): void {
    if (this.loggedForbiddenKeyResetScheduled) {
      return;
    }
    this.loggedForbiddenKeyResetScheduled = true;
    queueMicrotask(() => {
      this.loggedForbiddenKeySignatures.clear();
      this.loggedForbiddenKeyResetScheduled = false;
    });
  }

  /** プロパティアクセスで拒否する名前 */
  private static readonly FORBIDDEN_PROPERTY_NAMES = new Set([
    'constructor',
    '__proto__',
    'prototype',
  ]);

  /** object literal のプロパティ定義で前置修飾子として扱う識別子 */
  private static readonly OBJECT_PROPERTY_MODIFIERS = new Set([
    'get',
    'set',
    'async',
  ]);

  /** 式構文として許可しない予約語 */
  private static readonly DISALLOWED_KEYWORDS = new Set([
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
   * 未知の識別子であっても宣言によって遮蔽してはならない名前。
   *
   * リテラル（`true` / `undefined` など）は宣言すると意味が変わり、予約語は
   * `let` 宣言そのものが構文エラーになるため、遮蔽の対象から除外します。
   * `DISALLOWED_KEYWORDS` は式構文の検証段階で弾かれますが、多層防御として
   * ここでも除外します。
   */
  private static readonly NON_SHADOWABLE_IDENTIFIERS = new Set([
    // リテラル・グローバル定数
    'true',
    'false',
    'null',
    'undefined',
    'NaN',
    'Infinity',
    // strict モードの予約語（`let` 宣言が構文エラーになる）
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
   * 式から参照してよい標準組み込みグローバル。
   *
   * `Math.max(...)` や `JSON.stringify(...)` のように、ECMAScript の標準組み込みは
   * 式から利用できます（危険なものは `FORBIDDEN_NAMES` で個別に遮断済み）。
   * バインドに無い識別子の遮蔽対象からは、この一覧を除外します。ここに漏れがあると
   * その組み込みを使う式が未解決参照になるため、追加時は仕様書の一覧も更新します。
   */
  private static readonly ALLOWED_GLOBAL_IDENTIFIERS = new Set([
    // 名前空間オブジェクト
    'Math',
    'JSON',
    'Intl',
    'Atomics',
    // 基本コンストラクタ
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
    // エラー系
    'Error',
    'AggregateError',
    'EvalError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'TypeError',
    'URIError',
    // バイナリ系
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
    // 関数
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'encodeURI',
    'encodeURIComponent',
    'decodeURI',
    'decodeURIComponent',
  ]);

  /** 式 → 評価関数のグローバルキャッシュ */
  private static readonly EXPRESSION_CACHE = new Map<
    string,
    (...args: unknown[]) => unknown
  >();

  /** 式 → 自由識別子一覧のキャッシュ */
  private static readonly FREE_IDENTIFIER_CACHE = new Map<string, string[]>();

  /** 式ごとの「式の中で束縛された識別子」のキャッシュ */
  private static readonly BOUND_IDENTIFIER_CACHE = new Map<
    string,
    ReadonlySet<string>
  >();

  /** 式 → 暗黙のオプショナルチェーン変換後の式のキャッシュ */
  private static readonly OPTIONAL_CHAIN_CACHE = new Map<string, string>();

  /**
   * ブロック識別子の検出に使う正規表現。
   *
   * 直前が単語構成文字・`$`・`.` でなく、直後が単語構成文字・`$` でない、独立した
   * 識別子としての出現だけを検出します。評価のたびに生成しないよう事前に作ります。
   */
  private static readonly FORBIDDEN_NAME_PATTERNS =
    Expression.FORBIDDEN_NAMES.map(name => ({
      name,
      pattern: new RegExp(`(^|[^\\w$.])${name}(?![\\w$])`),
    }));

  /** 式 → 参照しているブロック識別子一覧のキャッシュ */
  private static readonly FORBIDDEN_IDENTIFIER_CACHE = new Map<
    string,
    string[]
  >();

  /** まだ報告していない未解決識別子名 */
  private static readonly pendingUnresolvedIdentifiers = new Set<string>();

  /** 未解決識別子の集約報告をスケジュール済みかどうか */
  private static unresolvedReportScheduled = false;

  /**
   * いずれかのスコープで供給されたことがあるキー名（開発モードのみ記録）。
   * 「このスコープには無いが別のスコープにはある」を判定するために使います。
   */
  private static readonly suppliedIdentifiers = new Set<string>();

  /**
   * スコープ外のキーを参照している式（開発モードのみ）。
   * キーは式そのもので、値はその式がスコープに持たないキー名の一覧です。
   * 同じ式の評価でキーが解決したら記録を取り消します。
   */
  private static readonly pendingScopeMissingIdentifiers = new Map<
    string,
    Set<string>
  >();

  /** スコープ外キーの集約報告をスケジュール済みかどうか */
  private static scopeMissingReportScheduled = false;

  /**
   * `data-each` の行スコープとして公開される名前（開発モードのみ記録）。
   * 「別のスコープでは供給されているキー」の診断から除外するために使います。
   */
  private static readonly rowScopeIdentifiers = new Set<string>();

  /** スコープ外キーとして報告済みの「式 + キー名」 */
  private static readonly loggedScopeMissingIdentifiers = new Set<string>();

  /** ブロック識別子の警告を出力済みの式 */
  private static readonly loggedBlockedIdentifierExpressions =
    new Set<string>();

  /**
   * 式が参照している自由識別子（バインドで解決されるべき名前）を返します。
   *
   * プロパティアクセスの右辺（`foo.bar` の `bar`）、リテラル、予約語、
   * 遮蔽対象外の組み込み名は含みません。式が解析できない場合は空配列を返すため、
   * 「この式は何も参照していない」と「解析できなかった」は区別できません。
   * 参照の有無で最適化を判断する用途では、空配列を安全側（= 参照あり）として
   * 扱うか、別途式の有無を確認してください。
   *
   * @param expression 評価対象の式
   * @returns 自由識別子の一覧（重複なし、出現順）
   */
  public static getFreeIdentifiers(expression: string): string[] {
    return this.extractFreeIdentifiers(expression);
  }

  /**
   * 式のコンパイルに失敗した記録があるかを返します。
   *
   * コンパイルに失敗した式の評価結果は `null` になるため、`data-if` などの診断で
   * 「値が falsy だった」と「そもそも評価できていない」を区別するために使います。
   *
   * @param expression 評価対象の式
   * @returns コンパイルに失敗した記録があれば true
   */
  public static hasCompileFailure(expression: string): boolean {
    return this.compileFailedExpressions.has(expression);
  }

  /**
   * バインドキーが関数の引数名として使えるかを返します。
   *
   * 評価器は `new Function(...bindKeys, body)` で組み立てるため、引数名にできない
   * キー（`customer.email` のようにドットを含むもの、ハイフン、空白、先頭が数字、
   * 予約語など）が 1 つでも混ざると引数リスト自体が壊れ、**そのスコープで評価する
   * すべての式**がコンパイルできなくなります。カンマを含むキーは引数の位置をずらし、
   * 例外も出さずに他のキーの値を壊します。
   *
   * 判定は 2 段で行います。実際に `new Function` へ通して予約語（`class` など）と
   * 識別子として不正な文字を弾き、あわせて単一の識別子名かを検査して `a,b`
   * （複数引数になる）や `{a}` / `a=1`（引数パターンになる）を弾きます。正規表現
   * だけでは予約語を通してしまい、`new Function` だけでは構造を持つキーを通します。
   * 結果はキー単位でキャッシュするため、評価ごとのコストは無視できます。
   *
   * @param key 判定するバインドキー
   * @returns 引数名として使える場合は true
   */
  private static isUsableBindingKey(key: string): boolean {
    const cached = this.usableBindingKeyCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    let usable = this.IDENTIFIER_NAME_PATTERN.test(key);
    if (usable) {
      try {
        new Function(key, '');
      } catch {
        usable = false;
      }
    }
    this.usableBindingKeyCache.set(key, usable);
    return usable;
  }

  /**
   * 引数名に使えないため式のスコープへ載せなかったキーを開発モードで報告します。
   *
   * キーごとに一度だけ出力します。除外したキーは式から参照できないため、
   * 「値はあるのに式から見えない」原因に辿り着けるようにします。
   *
   * @param keys 除外したキーの一覧
   * @returns 戻り値はありません。
   */
  private static reportUnusableBindingKeys(keys: string[]): void {
    if (keys.length === 0 || !Dev.isEnabled()) {
      return;
    }
    const unlogged = keys.filter(
      key => !this.loggedUnusableBindingKeys.has(key),
    );
    if (unlogged.length === 0) {
      return;
    }
    unlogged.forEach(key => this.loggedUnusableBindingKeys.add(key));
    Log.warn(
      '[Haori]',
      'Binding key(s) that cannot be used as identifiers are excluded from' +
        ` expressions: ${unlogged.join(', ')}.` +
        " Read them as haori.data['key'], or use" +
        ` ${Env.prefix}form-object to collect nested values.`,
    );
  }

  /**
   * 現在のバインド識別子に含まれない禁止グローバルを遮断するコードを生成します。
   *
   * @param bindKeys 現在の式で利用するバインド識別子一覧
   * @returns 評価前に挿入する初期化コード
   */
  private static buildAssignments(bindKeys: string[]): string {
    const bindKeySet = new Set(bindKeys);
    return this.FORBIDDEN_NAMES.filter(name => !bindKeySet.has(name))
      .map(name => `const ${name} = undefined`)
      .join(';\n');
  }

  /**
   * 式の中で「使用できない（ブロックされた）グローバル識別子」を参照しているものを
   * 検出します。`Object` などは評価時に `undefined` へ遮断されるため、`Object.assign`
   * のように使うと原因の分かりにくい `TypeError` になります。エラー時のヒント表示に
   * 用います。プロパティアクセス（`foo.Object`）は対象外です。
   *
   * @param expression 評価対象の式
   * @returns 式が参照しているブロック済み識別子の一覧
   */
  private static detectForbiddenIdentifiers(expression: string): string[] {
    const cached = this.FORBIDDEN_IDENTIFIER_CACHE.get(expression);
    if (cached !== undefined) {
      return cached;
    }
    const found = this.FORBIDDEN_NAME_PATTERNS.filter(item =>
      item.pattern.test(expression),
    ).map(item => item.name);
    this.FORBIDDEN_IDENTIFIER_CACHE.set(expression, found);
    return found;
  }

  /**
   * 式が参照している自由識別子（バインドで解決されるべき名前）を抽出します。
   *
   * プロパティアクセス（`foo.bar` の `bar`）とリテラル・予約語は除外します。
   * 抽出結果は「遮蔽してよい名前」の候補として使うため、取りこぼしても従来の
   * 挙動に戻るだけで、余分に含んでも参照されなければ影響しません（安全側）。
   * オブジェクトリテラルのキーは除外しませんが、キーとしてしか現れない名前は
   * 評価時に参照されないため遮蔽しても影響しません。
   *
   * @param expression 評価対象の式
   * @returns 自由識別子の一覧（重複なし、出現順）
   */
  private static extractFreeIdentifiers(expression: string): string[] {
    const cached = this.FREE_IDENTIFIER_CACHE.get(expression);
    if (cached !== undefined) {
      return cached;
    }

    const tokens = this.tokenizeExpression(expression);
    const found: string[] = [];
    if (tokens !== null) {
      let previous: ExpressionToken | null = null;
      for (const token of tokens) {
        const isProperty = previous?.value === '.' || previous?.value === '?.';
        if (
          token.type === 'identifier' &&
          !isProperty &&
          !this.NON_SHADOWABLE_IDENTIFIERS.has(token.value) &&
          !this.DISALLOWED_KEYWORDS.has(token.value) &&
          !this.STRICT_FORBIDDEN_NAMES.includes(token.value) &&
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token.value) &&
          !found.includes(token.value)
        ) {
          found.push(token.value);
        }
        previous = token;
      }
    }

    this.FREE_IDENTIFIER_CACHE.set(expression, found);
    return found;
  }

  /**
   * 式の中で束縛された識別子（アロー関数の引数）を返します。
   *
   * `items.find(p => p.id === target)` の `p` のように、値がバインドではなく式の
   * 中で決まる名前です。バインドに無い名前として遮蔽の対象にはしますが（アロー
   * 関数の内側では引数が遮蔽を上書きするため評価には影響しません）、
   * 「別のスコープでは供給されているキー」の診断からは外します。外さないと、
   * 同じ名前を `data-{event}-arg` に使う兄弟要素があるだけで、正しく動いている
   * 式に対して誤った警告が出ます。
   *
   * 引数リストは `=>` の直前から読み取ります。`(a, b) => …` は対応する `(` まで、
   * `p => …` は識別子ひとつです。分割代入（`({a, b}) => …`）は区切りの直後に
   * 現れる識別子を束縛として扱います。既定値（`(a = x) => …`）の `x` は区切りの
   * 直後ではないため束縛に含めません。
   *
   * @param expression 評価対象の式
   * @returns 束縛された識別子の集合（無ければ空集合）
   */
  private static extractBoundIdentifiers(
    expression: string,
  ): ReadonlySet<string> {
    const cached = this.BOUND_IDENTIFIER_CACHE.get(expression);
    if (cached !== undefined) {
      return cached;
    }
    const bound = new Set<string>();
    const tokens = this.tokenizeExpression(expression);
    if (tokens !== null) {
      /** 引数リストの区切り（この直後の識別子は束縛） */
      const separators = new Set(['(', ',', '{', '[']);
      for (let index = 0; index < tokens.length; index += 1) {
        if (tokens[index].value !== '=>') {
          continue;
        }
        const previous = tokens[index - 1];
        if (previous === undefined) {
          continue;
        }
        if (previous.type === 'identifier') {
          // `p => …`（括弧なしの単一引数）
          bound.add(previous.value);
          continue;
        }
        if (previous.value !== ')') {
          continue;
        }
        // `(…) => …`。対応する `(` まで戻りながら束縛位置の識別子を集める。
        // depth は引数リストの終わりを見つけるための全種類の入れ子、parenDepth は
        // 丸括弧だけの入れ子。分割代入（`({a}) => …` / `([a]) => …`）の中は束縛
        // だが、既定値の中の呼び出し（`(a = f(b)) => …` の `b`）は束縛ではない。
        // 前者は parenDepth が増えず、後者は増えることで区別できる。
        let depth = 0;
        let parenDepth = 0;
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          const value = tokens[cursor].value;
          if (value === ')' || value === ']' || value === '}') {
            depth += 1;
            if (value === ')') {
              parenDepth += 1;
            }
            continue;
          }
          if (value === '(' || value === '[' || value === '{') {
            depth -= 1;
            if (value === '(') {
              parenDepth -= 1;
            }
            if (depth === 0) {
              break;
            }
            continue;
          }
          if (
            parenDepth === 1 &&
            tokens[cursor].type === 'identifier' &&
            separators.has(tokens[cursor - 1]?.value ?? '')
          ) {
            bound.add(tokens[cursor].value);
          }
        }
      }
    }
    this.BOUND_IDENTIFIER_CACHE.set(expression, bound);
    return bound;
  }

  /**
   * 未知の識別子をスコープ内へ宣言して遮蔽するコードを生成します。
   *
   * 式の後ろへ `let` 宣言を置くことで、対象の識別子は関数スコープに属しつつ
   * 評価時点では未初期化（TDZ）になります。実際に参照された場合だけ
   * `ReferenceError` となるため、`window` の named access などグローバルへの
   * 解決を断ちながら、短絡評価で参照されない識別子は従来どおり無害に通せます。
   *
   * @param shadowNames 遮蔽する識別子の一覧
   * @returns 式の後ろへ挿入する宣言コード。対象が無い場合は空文字
   */
  private static buildShadowDeclarations(shadowNames: string[]): string {
    if (shadowNames.length === 0) {
      return '';
    }
    return `\nlet ${shadowNames.join(', ')};`;
  }

  /**
   * 使用できない（ブロックされた）識別子を参照している式に警告を出します。
   *
   * `Object` などは評価時に `undefined` へ遮断されるため、暗黙のオプショナル
   * チェーンと組み合わさると例外にもならず静かに `undefined` になります。原因が
   * 分からなくならないよう、式ごとに 1 度だけヒントを出力します。
   *
   * @param expression 評価対象の式
   * @return 戻り値はありません。
   */
  private static warnBlockedIdentifiers(expression: string): void {
    if (this.loggedBlockedIdentifierExpressions.has(expression)) {
      return;
    }
    const blocked = this.detectForbiddenIdentifiers(expression);
    if (blocked.length === 0) {
      return;
    }
    this.loggedBlockedIdentifierExpressions.add(expression);
    Log.warn(
      '[Haori]',
      'Expression references blocked identifier(s): ' +
        blocked.join(', ') +
        '. These are blocked in expressions and evaluate to' +
        ' undefined (often the cause of an empty result).' +
        ' Use spread {...a, ...b} instead of Object.assign.',
      expression,
    );
  }

  /**
   * 丸括弧が関数・メソッド呼び出しの開始かどうかを判定します。
   *
   * 直前が識別子・`)`・`]` のときだけ呼び出しとみなします。アロー関数の
   * 引数リストやグループ化の括弧は直前が演算子または先頭になるため除外されます。
   *
   * @param previous 直前のトークン
   * @returns 呼び出しの開始であれば true
   */
  private static startsCall(previous: ExpressionToken | null): boolean {
    if (previous === null) {
      return false;
    }
    if (previous.type === 'identifier') {
      // `true(...)` のようなリテラル・予約語直後は呼び出しではない。
      return !this.NON_SHADOWABLE_IDENTIFIERS.has(previous.value);
    }
    return previous.value === ')' || previous.value === ']';
  }

  /**
   * メンバーアクセスを暗黙のオプショナルチェーンへ変換します。
   *
   * `a.b` を `a?.b`、`a[i]` を `a?.[i]`、`a.b()` を `a?.b?.()` へ書き換えます。
   * これにより、値がまだ供給されていない途中経路（`null` / `undefined`）を
   * 参照しても `TypeError` にならず、結果が `undefined` になります。テンプレート
   * 側で `?.` を書く必要をなくすための変換です。
   *
   * 変換はトークン位置に基づく差し替えのみで行い、それ以外の文字列は元のまま
   * 保持します。トークン化できない式は変換せずそのまま返します。
   *
   * @param expression 変換対象の式
   * @returns 変換後の式
   */
  private static toOptionalChainExpression(expression: string): string {
    const cached = this.OPTIONAL_CHAIN_CACHE.get(expression);
    if (cached !== undefined) {
      return cached;
    }

    const tokens = this.tokenizeExpression(expression);
    let converted = expression;
    if (tokens !== null) {
      const edits: {start: number; end: number; text: string}[] = [];
      let previous: ExpressionToken | null = null;
      for (const token of tokens) {
        // すでに `?.` が書かれている箇所へ二重に挿入しない。
        if (token.type === 'operator' && previous?.value !== '?.') {
          if (token.value === '.') {
            edits.push({
              start: token.position,
              end: token.position + 1,
              text: '?.',
            });
          } else if (
            (token.value === '[' && this.startsMemberAccess(previous)) ||
            (token.value === '(' && this.startsCall(previous))
          ) {
            edits.push({
              start: token.position,
              end: token.position,
              text: '?.',
            });
          }
        }
        previous = token;
      }
      for (let index = edits.length - 1; index >= 0; index -= 1) {
        const edit = edits[index];
        converted =
          converted.slice(0, edit.start) +
          edit.text +
          converted.slice(edit.end);
      }
    }

    this.OPTIONAL_CHAIN_CACHE.set(expression, converted);
    return converted;
  }

  /**
   * TDZ の `ReferenceError` から実際に参照された識別子名を取り出します。
   *
   * メッセージ書式はブラウザごとに異なるため、引用符で囲まれた名前のうち
   * 遮蔽対象に含まれるものだけを採用します。取り出せない場合は遮蔽対象を
   * すべて返します。識別子名には `$` を含み得るため、正規表現ではなく
   * 文字列一致で判定します。
   *
   * @param error 発生した ReferenceError
   * @param shadowNames 遮蔽した識別子の一覧
   * @returns 未解決として報告する識別子名の一覧
   */
  private static extractUninitializedIdentifiers(
    error: ReferenceError,
    shadowNames: string[],
  ): string[] {
    const message = String(error.message || '');
    const matched = shadowNames.filter(name =>
      ["'", '"', '`'].some(quote =>
        message.includes(`${quote}${name}${quote}`),
      ),
    );
    return matched.length > 0 ? matched : shadowNames;
  }

  /**
   * バインドに無いキーを参照したことを記録します。
   *
   * 既定では初期表示時の一過性の未解決参照を騒がせないため、その場では出力せず
   * 描画が落ち着いた時点で集約して 1 度だけ警告します。厳格バインドモード
   * （`data-strict-bind`）では検出時点で `error` を出力します。
   *
   * @param names 未解決だった識別子名の一覧
   * @param expression 評価対象の式
   * @return 戻り値はありません。
   */
  private static recordUnresolvedIdentifiers(
    names: string[],
    expression: string,
  ): void {
    if (names.length === 0) {
      return;
    }
    if (Env.strictBind) {
      Log.error(
        '[Haori]',
        'Expression references key(s) that are not in the binding data: ' +
          names.join(', ') +
          '. The result is treated as an unresolved reference.',
        expression,
      );
      return;
    }
    if (!Dev.isEnabled()) {
      // 本番では未解決参照は正常系として扱い、一切出力しない。
      return;
    }
    names.forEach(name => {
      this.pendingUnresolvedIdentifiers.add(name);
    });
    this.scheduleUnresolvedIdentifierReport();
  }

  /**
   * 未解決識別子の集約報告をスケジュールします。
   *
   * @return 戻り値はありません。
   */
  private static scheduleUnresolvedIdentifierReport(): void {
    if (this.unresolvedReportScheduled) {
      return;
    }
    this.unresolvedReportScheduled = true;
    void Queue.waitForIdle().then(() => {
      this.unresolvedReportScheduled = false;
      this.reportUnresolvedIdentifiers();
    });
  }

  /**
   * 描画完了時点でも一度も供給されなかった識別子名をまとめて警告します。
   *
   * @return 戻り値はありません。
   */
  private static reportUnresolvedIdentifiers(): void {
    if (this.pendingUnresolvedIdentifiers.size === 0) {
      return;
    }
    const names = Array.from(this.pendingUnresolvedIdentifiers);
    this.pendingUnresolvedIdentifiers.clear();
    Log.warn(
      '[Haori]',
      'Expression key(s) were never provided by any binding: ' +
        names.join(', ') +
        '. They are treated as unresolved references (rendered as empty).' +
        ' Check for typos if this is unexpected.',
    );
  }

  /**
   * 供給されたキー名を記録します（開発モードのみ）。
   *
   * 「このスコープには無いが、別のスコープでは供給されている」キーを見分けるための
   * 材料です。バインド先を兄弟要素にしてしまった宣言は、`??` などで既定値を書いて
   * いると値のある式として評価が通るため、未解決参照の診断では検出できません。
   *
   * @param bindings 評価に用いるバインド値
   * @return 戻り値はありません。
   */
  private static recordSuppliedIdentifiers(
    bindings: Record<string, unknown>,
  ): void {
    for (const key of Object.keys(bindings)) {
      this.suppliedIdentifiers.add(key);
    }
  }

  /**
   * `data-each` の行スコープとして公開される名前を記録します（開発モードのみ）。
   *
   * 行スコープの名前（`data-each-arg` / `data-each-index`）は、行の描画より前に
   * 行テンプレートが評価される状況ではスコープに入りません（`data-each` が未マウント
   * などで待機している間、テンプレートはコンテナのスコープで評価されます）。行が
   * 描画されれば供給されるため、そのまま扱うと「別のスコープでは供給されている」
   * 診断の条件を満たしてしまいます。行スコープの名前は応答のバインド先を取り違えた
   * 宣言では供給されないため、診断の対象から外します。
   *
   * @param names 行スコープとして公開される名前（`null` と空文字は無視します）
   * @return 戻り値はありません。
   */
  public static recordRowScopeIdentifiers(
    names: readonly (string | null | undefined)[],
  ): void {
    if (!Dev.isEnabled()) {
      // 本番では診断を行わないため、常駐量を増やさない。
      return;
    }
    for (const name of names) {
      if (typeof name === 'string' && name !== '') {
        this.rowScopeIdentifiers.add(name);
      }
    }
  }

  /**
   * 式がスコープに持たないキー名を記録します（開発モードのみ）。
   *
   * 同じ式の評価でキーが揃った場合は記録を取り消します。行ごとに応答を取得する
   * 構成では、ある行が先に解決している間、別の行の同じ宣言は一時的にスコープ外に
   * なるためです。取り消しは式単位なので、同じ宣言が複数の行にある場合はどれか 1 つが
   * 解決すると報告しません（誤検知より見落としを選びます）。
   *
   * @param names スコープに無いキー名の一覧（空なら記録を取り消す）
   * @param expression 評価対象の式
   * @return 戻り値はありません。
   */
  private static recordScopeMissingIdentifiers(
    names: string[],
    expression: string,
  ): void {
    if (names.length === 0) {
      this.pendingScopeMissingIdentifiers.delete(expression);
      return;
    }
    this.pendingScopeMissingIdentifiers.set(expression, new Set(names));
    if (this.scopeMissingReportScheduled) {
      return;
    }
    this.scopeMissingReportScheduled = true;
    void Queue.waitForIdle().then(() => {
      this.scopeMissingReportScheduled = false;
      this.reportScopeMissingIdentifiers();
    });
  }

  /**
   * 描画完了時点で「別のスコープでは供給されているキー」を参照している式を警告します。
   *
   * 応答のバインド先を兄弟要素にしてしまった宣言（バインド先は自要素または祖先で
   * なければ評価スコープに入りません）を名指しするための診断です。同じ式とキーの
   * 組は一度だけ報告します。
   *
   * @return 戻り値はありません。
   */
  private static reportScopeMissingIdentifiers(): void {
    if (this.pendingScopeMissingIdentifiers.size === 0) {
      return;
    }
    const records = Array.from(this.pendingScopeMissingIdentifiers.entries());
    this.pendingScopeMissingIdentifiers.clear();
    for (const [expression, names] of records) {
      const reported: string[] = [];
      for (const name of names) {
        if (!this.suppliedIdentifiers.has(name)) {
          // どこにも供給されていないキーは未解決参照の集約報告が扱う。
          continue;
        }
        if (this.rowScopeIdentifiers.has(name)) {
          // 行スコープの名前は、行の描画より前のテンプレート評価では必ず
          // スコープ外になる。バインド先の取り違えでは供給されない名前なので
          // 報告しない（`recordRowScopeIdentifiers()` を参照）。
          continue;
        }
        const key = `${name}\n${expression}`;
        if (this.loggedScopeMissingIdentifiers.has(key)) {
          continue;
        }
        this.loggedScopeMissingIdentifiers.add(key);
        reported.push(name);
      }
      if (reported.length === 0) {
        continue;
      }
      Log.warn(
        '[Haori]',
        'Expression key(s) are missing from this scope but are provided in' +
          ` another scope: ${reported.join(', ')}.` +
          ' A binding is visible only to the target element itself and its' +
          ' descendants, so bind the response to this element or one of its' +
          ' ancestors (data-fetch-bind / data-{event}-bind):',
        expression,
      );
    }
  }

  /**
   * バインドに無いキーを `undefined` とみなして、判定結果が出るかを試します。
   *
   * 「無いものを表示する」式は未解決参照（空表示）が妥当ですが、「無いものを
   * 判定する」式は `false` などの結論が出せます。そのため、未宣言キーを
   * `undefined` として評価し直し、結果が真偽値になった場合だけ採用します。
   * 文字列連結（`'x' + missing`）や算術（`a + b`）は真偽値にならないため、
   * `'xundefined'` や `NaN` が表示されることはありません。
   *
   * @param expression 評価する式
   * @param bindings 現在のバインド値
   * @param shadowNames バインドに無い識別子の一覧
   * @returns 真偽値として結論が出た場合はその値。出ない場合は undefined
   */
  private static evaluateAsCondition(
    expression: string,
    bindings: Record<string, unknown>,
    shadowNames: string[],
  ): boolean | undefined {
    const fallbackBindings: Record<string, unknown> = {...bindings};
    shadowNames.forEach(name => {
      fallbackBindings[name] = undefined;
    });
    const setup = this.prepareEvaluator(expression, fallbackBindings);
    if (setup.compileFailed || setup.evaluator === null) {
      return undefined;
    }
    try {
      const wrappedValues = this.wrapBoundValues(fallbackBindings);
      const argValues = setup.bindKeys.map(key => wrappedValues[key]);
      const value = this.withBlockedPropertyAccess(() =>
        setup.evaluator!(...argValues),
      );
      return typeof value === 'boolean' ? value : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 供給されたキーを未解決識別子の報告対象から取り除きます。
   *
   * 初期表示では未解決でも、後続の `data-fetch` や `data-bind` 更新で解決した
   * キーは報告しません。
   *
   * @param bindings 評価に用いるバインド値
   * @return 戻り値はありません。
   */
  private static pruneResolvedIdentifiers(
    bindings: Record<string, unknown>,
  ): void {
    if (this.pendingUnresolvedIdentifiers.size === 0) {
      return;
    }
    this.pendingUnresolvedIdentifiers.forEach(name => {
      if (name in bindings) {
        this.pendingUnresolvedIdentifiers.delete(name);
      }
    });
  }

  /**
   * 式を評価します。
   *
   * @param expression 評価する式文字列
   * @param bindedValue バインドされた値のオブジェクト
   */
  public static evaluate(
    expression: string,
    bindedValues: Record<string, unknown> = {},
  ): unknown {
    return this.evaluateDetailed(expression, bindedValues).value;
  }

  /**
   * 式を評価し、未解決参照の有無を含む詳細結果を返します。
   *
   * @param expression 評価する式文字列
   * @param bindedValues バインドされた値のオブジェクト
   * @returns 評価結果と未解決参照の有無
   */
  public static evaluateDetailed(
    expression: string,
    bindedValues: Record<string, unknown> = {},
  ): ExpressionEvaluationDetail {
    this.scheduleForbiddenBindingValueCacheReset();
    if (expression.trim() === '') {
      Log.warn('[Haori]', expression, 'Expression is empty');
      return {value: null, unresolvedReference: false};
    }
    if (this.containsDangerousPatterns(expression)) {
      const keywords = this.detectDisallowedKeywords(expression);
      if (keywords.length > 0) {
        // function 宣言・return・各種ステートメント系キーワードは式構文として
        // 使用できない。よくある原因は function(){return ...} の使用なので、
        // アロー関数への置き換えを促す具体的なヒントを併記する。
        const hint = keywords.some(k => k === 'function' || k === 'return')
          ? ' Statement keywords are not allowed in expressions;' +
            ' use an arrow function such as `x => ({key: value})`' +
            ' instead of `function(x){ return {key: value}; }`.'
          : ' These are statement keywords and cannot be used in expressions.';
        Log.warn(
          '[Haori]',
          expression,
          'Expression uses disallowed keyword(s): ' +
            keywords.join(', ') +
            '.' +
            hint,
        );
      } else {
        Log.warn(
          '[Haori]',
          expression,
          'Expression contains dangerous patterns',
        );
      }
      return {value: null, unresolvedReference: false};
    }
    // トップレベルキーに拒否名（実行系・プロトタイプ脱出名など、明示バインドでも
    // 許可しない名前）が含まれていても、バインド全体を破棄せず該当キーのみ無視する。
    // 該当キーは prepareEvaluator で引数から除外され buildAssignments で undefined に
    // 遮蔽されるため、残りの正常なキーはそのまま評価・描画される。原因特定のため
    // error ログに該当キー名を明示する（無言の空描画を避ける）。
    const forbiddenKeys = this.collectForbiddenKeys(bindedValues);
    if (forbiddenKeys.length > 0) {
      // 同一キー集合のエラーは microtask 単位で 1 回だけ出力し、継承スコープ経由の
      // 多発（配下の全式評価で再発火）によるログの氾濫を防ぐ。
      const signature = forbiddenKeys.join(',');
      if (!this.loggedForbiddenKeySignatures.has(signature)) {
        this.loggedForbiddenKeySignatures.add(signature);
        this.scheduleForbiddenKeyLogReset();
        Log.error(
          '[Haori]',
          'Binding keys are reserved and ignored: ' +
            forbiddenKeys.join(', ') +
            '. These collide with blocked global/prototype names and cannot' +
            ' be used as top-level binding keys; the remaining keys are still' +
            ' evaluated.',
        );
      }
    }
    const forbiddenBindingValues = this.getForbiddenBindingValueSet();
    if (
      this.containsForbiddenBindingValues(
        bindedValues,
        new WeakSet(),
        forbiddenBindingValues,
      )
    ) {
      Log.warn(
        '[Haori]',
        bindedValues,
        'Binded values contain forbidden values',
      );
      return {value: null, unresolvedReference: false};
    }

    // 式が予約名前空間 `haori` を参照している場合のみ組み込みヘルパーを注入する。
    // 参照していない式に無駄な引数・Proxy ラップを増やさないための最適化。
    // 文字列リテラル（'...' / "..."）内の `haori` は識別子ではないので検出から除外する
    // （テンプレートリテラル内の ${haori...} を壊さないようバッククォートは残す）。
    const expressionForDetection = expression.replace(
      /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
      '',
    );
    const referencesBuiltins = this.BUILTIN_REFERENCE_PATTERN.test(
      expressionForDetection,
    );
    if (referencesBuiltins && this.BUILTIN_NAMESPACE in bindedValues) {
      Log.warn(
        '[Haori]',
        `Binding key "${this.BUILTIN_NAMESPACE}" is reserved for built-in` +
          ' helpers; the bound value is ignored in expressions.',
      );
    }
    // 多層防御: 拒否名（再バインド不可）のキーは評価用の作業オブジェクトから物理的に
    // 取り除く。引数除外（prepareEvaluator）・undefined 遮蔽（buildAssignments）に加え、
    // 危険キーが Proxy ラップや Function の引数空間へ一切入らないようにする
    // （下流レイヤのいずれかが将来退行しても安全側に倒す）。`__proto__` 等は
    // FORBIDDEN_BINDING_NAMES に含まれるため、ここでの代入経路にも乗らない。
    const runtimeBindings: Record<string, unknown> = {};
    for (const key of Object.keys(bindedValues)) {
      if (!this.FORBIDDEN_BINDING_NAMES.has(key)) {
        runtimeBindings[key] = (bindedValues as Record<string, unknown>)[key];
      }
    }
    if (referencesBuiltins) {
      // `haori.data` を参照する式にだけ、そのスコープの要素データを載せる。
      // 識別子として書けないキー（`customer.email` など）は引数にできず式から
      // 参照できないため、ブラケット記法で読める経路を用意する。
      // 参照しない式では静的な組み込みヘルパーをそのまま渡し、評価ごとの
      // オブジェクト生成を増やさない（`haori.date` などの既存の式が該当）。
      if (this.BUILTIN_DATA_REFERENCE_PATTERN.test(expressionForDetection)) {
        // 要素データの複製は名前空間の代入より前に評価されるため、`haori` 自身は
        // 複製に入らない（自己参照にならない）。
        runtimeBindings[this.BUILTIN_NAMESPACE] = {
          ...this.BUILTIN_HELPERS,
          [this.BUILTIN_DATA_PROPERTY]: {...runtimeBindings},
        };
      } else {
        runtimeBindings[this.BUILTIN_NAMESPACE] = this.BUILTIN_HELPERS;
      }
    }
    this.pruneResolvedIdentifiers(runtimeBindings);
    if (Dev.isEnabled()) {
      // 未解決参照の遮蔽（下の `unknownIdentifiers`）を加える前のスコープを記録する。
      this.recordSuppliedIdentifiers(runtimeBindings);
    }
    const allowMissingIdentifierRecovery =
      this.canAttemptMissingIdentifierRecovery(expression);

    // バインドに無い識別子は、そのままでは関数のスコープチェーンを通ってグローバルへ
    // 解決される。`id="foo"` の要素が `window.foo` として見える named access や、
    // `name` / `status` / `length` のような window の既存プロパティが該当し、
    // 未解決参照が「値のある参照」に化けてしまう（要素オブジェクトが値として
    // 書き込まれ、必須検証も通ってしまう）。ここでスコープ内へ引き込んで遮蔽する。
    const unknownIdentifiers = this.extractFreeIdentifiers(expression).filter(
      name =>
        !(name in runtimeBindings) &&
        // 禁止グローバルは buildAssignments が `const` で遮蔽するため対象外
        // （二重宣言は構文エラーになる）。
        !this.FORBIDDEN_NAMES.includes(name) &&
        // 標準組み込み（`Math` など）は式から参照できる仕様のため遮蔽しない。
        !this.ALLOWED_GLOBAL_IDENTIFIERS.has(name),
    );
    if (Dev.isEnabled()) {
      // 「このスコープには無いが別のスコープでは供給されている」キーの診断材料。
      // `??` などで既定値を書いた式は値のある結果になるため、未解決参照の診断では
      // 検出できない（バインド先を兄弟要素にした宣言が無言で既定値のままになる）。
      //
      // 式の中で束縛される名前（アロー関数の引数）は診断対象から外す。バインドで
      // 解決されるべき名前ではないため、同じ名前を `data-each-arg` に使う兄弟要素が
      // あるだけで誤った警告になる。遮蔽（グローバルへの解決の遮断）は名前だけでは
      // 束縛の範囲を判断できないため、上の一覧のまま行う。
      const bound = this.extractBoundIdentifiers(expression);
      this.recordScopeMissingIdentifiers(
        bound.size === 0
          ? unknownIdentifiers
          : unknownIdentifiers.filter(name => !bound.has(name)),
        expression,
      );
    }
    if (allowMissingIdentifierRecovery) {
      // `?.` / `??` / `||` / `&&` を含む式は、従来から未宣言識別子を undefined と
      // して評価を続ける。事前に undefined を渡せば ReferenceError による再試行が
      // 不要になり、グローバルへも解決されない。
      unknownIdentifiers.forEach(name => {
        runtimeBindings[name] = undefined;
      });
    }
    // 回復対象外の式では TDZ による遮蔽を使う。実際に参照されたときだけ
    // ReferenceError になるため、短絡評価で参照されない識別子の扱いは変わらない。
    const shadowNames = allowMissingIdentifierRecovery
      ? []
      : unknownIdentifiers;

    for (
      let recoveryCount = 0;
      recoveryCount <= this.MAX_IDENTIFIER_RECOVERY_COUNT;
      recoveryCount += 1
    ) {
      const setup = this.prepareEvaluator(
        expression,
        runtimeBindings,
        shadowNames,
      );
      if (setup.compileFailed || setup.evaluator === null) {
        return {value: null, unresolvedReference: false};
      }
      try {
        const argValues: unknown[] = [];
        const wrappedValues = this.wrapBoundValues(runtimeBindings);
        setup.bindKeys.forEach((key: string) => {
          argValues.push(wrappedValues[key]);
        });
        const value = this.withBlockedPropertyAccess(() =>
          setup.evaluator!(...argValues),
        );
        if (value === undefined) {
          // ブロック識別子が原因で静かに undefined になった場合のヒント。
          this.warnBlockedIdentifiers(expression);
        }
        return {
          value,
          // `undefined` になる参照は「値が無い」状態であり、未解決参照として扱う。
          // 暗黙のオプショナルチェーンにより、`null` / `undefined` を経由した
          // メンバーアクセスもここへ集約される。
          unresolvedReference: value === undefined,
        };
      } catch (error) {
        if (allowMissingIdentifierRecovery && error instanceof ReferenceError) {
          const missingIdentifier = this.extractMissingIdentifier(error);
          if (
            missingIdentifier !== null &&
            this.canRecoverMissingIdentifier(missingIdentifier, runtimeBindings)
          ) {
            runtimeBindings[missingIdentifier] = undefined;
            continue;
          }
        }
        // 式が使用できない（ブロックされた）識別子を参照している場合は、
        // 原因が分かりにくい TypeError になりがちなため明示的なヒントを出す。
        this.warnBlockedIdentifiers(expression);
        if (error instanceof ReferenceError && shadowNames.length > 0) {
          // 遮蔽した識別子を実際に参照した場合は TDZ の ReferenceError になる。
          // これは「バインドに無いキーを参照した」だけの正常系なので、エラーには
          // せず未解決参照として返し、診断は集約報告へ委ねる。
          const decided = this.evaluateAsCondition(
            expression,
            runtimeBindings,
            shadowNames,
          );
          if (decided !== undefined) {
            // 判定する式（`!x` や比較など）は「無い＝偽」として結論が出せる。
            return {value: decided, unresolvedReference: false};
          }
          this.recordUnresolvedIdentifiers(
            this.extractUninitializedIdentifiers(error, shadowNames),
            expression,
          );
          return {value: undefined, unresolvedReference: true};
        }
        Log.error('[Haori]', 'Expression evaluation error:', expression, error);
        if (error instanceof ReferenceError) {
          // ReferenceError（未定義変数）はundefinedを返す
          return {value: undefined, unresolvedReference: true};
        }
        return {value: null, unresolvedReference: false};
      }
    }

    Log.error(
      '[Haori]',
      'Failed to recover missing identifiers:',
      expression,
      runtimeBindings,
    );
    return {value: undefined, unresolvedReference: true};
  }

  /**
   * 現在のバインド集合で evaluator を取得または生成します。
   *
   * @param expression 評価する式
   * @param bindedValues バインドされた値のオブジェクト
   * @param shadowNames グローバル解決を断つため関数スコープへ宣言する識別子
   * @returns evaluator 準備結果
   */
  private static prepareEvaluator(
    expression: string,
    bindedValues: Record<string, unknown>,
    shadowNames: string[] = [],
  ): ExpressionEvaluatorSetup {
    const safeKeys = Object.keys(bindedValues).filter(
      key => !this.FORBIDDEN_BINDING_NAMES.has(key),
    );
    // 引数名として使えないキーは載せない。1 つ混ざるだけで引数リストが壊れ、
    // そのスコープの全式が評価できなくなる（カンマ入りは無言で値をずらす）。
    const bindKeys: string[] = [];
    const unusableKeys: string[] = [];
    safeKeys.forEach(key => {
      if (this.isUsableBindingKey(key)) {
        bindKeys.push(key);
      } else {
        unusableKeys.push(key);
      }
    });
    bindKeys.sort();
    this.reportUnusableBindingKeys(unusableKeys);
    const bindKeySet = new Set(bindKeys);
    // 引数・`const` 遮蔽と重複する宣言は構文エラーになるため取り除く。
    const declarations = shadowNames.filter(name => !bindKeySet.has(name));
    const cacheKey = `${expression}:${bindKeys.join(',')}:${declarations.join(
      ',',
    )}`;

    let evaluator = this.EXPRESSION_CACHE.get(cacheKey) || null;
    if (evaluator !== null) {
      // このバインド集合ではコンパイルできているため、別集合で失敗した記録は
      // 診断を誤らせる（下のコンパイル成功時と同じ扱いにする）。
      this.compileFailedExpressions.delete(expression);
      return {
        bindKeys,
        evaluator,
        compileFailed: false,
      };
    }

    const assignments = this.buildAssignments(bindKeys);
    const shadowDeclarations = this.buildShadowDeclarations(declarations);
    // メンバーアクセスは暗黙のオプショナルチェーンへ変換してから評価する。
    const source = this.toOptionalChainExpression(expression);
    const body = assignments
      ? '"use strict";\n' +
        `${assignments};\nreturn (${source});${shadowDeclarations}`
      : '"use strict";\n' + `return (${source});${shadowDeclarations}`;
    try {
      evaluator = new Function(...bindKeys, body) as (
        ...args: unknown[]
      ) => unknown;
      this.EXPRESSION_CACHE.set(cacheKey, evaluator);
      // 別のバインド集合で失敗した記録が残っていると診断を誤らせるため取り消す。
      this.compileFailedExpressions.delete(expression);
      return {
        bindKeys,
        evaluator,
        compileFailed: false,
      };
    } catch (error) {
      if (declarations.length > 0) {
        // 遮蔽用の宣言が構文エラーになった場合（予期しない識別子名など）は、
        // 式自体を壊さないよう遮蔽なしで再生成する。グローバルへ解決される
        // 従来の挙動には戻るが、式が評価できなくなる退行は避ける。
        Log.warn(
          '[Haori]',
          'Failed to shadow undeclared identifier(s): ' +
            declarations.join(', ') +
            '. Falling back to evaluation without shadowing.',
          expression,
        );
        return this.prepareEvaluator(expression, bindedValues, []);
      }
      Log.error('[Haori]', 'Failed to compile expression:', expression, error);
      this.compileFailedExpressions.add(expression);
      return {
        bindKeys,
        evaluator: null,
        compileFailed: true,
      };
    }
  }

  /**
   * ReferenceError から未宣言識別子名を抽出します。
   *
   * @param error 発生した ReferenceError
   * @returns 識別子名。抽出できない場合は null
   */
  private static extractMissingIdentifier(
    error: ReferenceError,
  ): string | null {
    const message = String(error.message || '');
    const match = message.match(/^([A-Za-z_$][A-Za-z0-9_$]*) is not defined$/);
    return match?.[1] || null;
  }

  /**
   * 未宣言識別子を undefined バインドとして補完可能かを返します。
   *
   * @param identifier 識別子名
   * @param bindedValues 現在のバインド値
   * @returns 補完可能なら true
   */
  private static canRecoverMissingIdentifier(
    identifier: string,
    bindedValues: Record<string, unknown>,
  ): boolean {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier)) {
      return false;
    }
    return (
      bindedValues[identifier] === undefined && !(identifier in bindedValues)
    );
  }

  /**
   * 未宣言識別子の補完を試みてよい式かを返します。
   *
   * @param expression 評価する式
   * @returns 補完を試みてよい場合は true
   */
  private static canAttemptMissingIdentifierRecovery(
    expression: string,
  ): boolean {
    return (
      expression.includes('?.') ||
      expression.includes('??') ||
      expression.includes('||') ||
      expression.includes('&&')
    );
  }

  /**
   * 式にevalや危険な構文が含まれているかチェックします。
   *
   * @param expression チェック対象の式文字列
   * @return 危険なパターンが含まれている場合はtrue
   */
  protected static containsDangerousPatterns(expression: string): boolean {
    if (!this.hasAllowedSyntax(expression)) {
      return true;
    }
    const dangerousPatterns = [
      /\beval\s*\(/, // eval(...)
      /\barguments\s*\[/, // arguments[...]
      /\barguments\s*\./, // arguments.xxx
    ];
    return dangerousPatterns.some(pattern => pattern.test(expression));
  }

  /**
   * 式の中で使用されている「使用できないキーワード」を検出します。
   * 文字列リテラルやプロパティ名は対象外とするため、トークナイザを用いて
   * 識別子トークンのみを判定します。エラー時のヒント表示に使用します。
   *
   * @param expression 検査対象の式
   * @returns 式に現れた使用できないキーワードの一覧（重複なし、出現順）
   */
  private static detectDisallowedKeywords(expression: string): string[] {
    // トークナイザは `;` など式構文外の文字で null を返すため、ここでは独立した
    // 識別子としての出現を正規表現で検出する。直前が単語構成文字・`$`・`.`（プロパティ
    // アクセス）でなく、直後が単語構成文字・`$` でないものだけを対象にする。
    const found: string[] = [];
    this.DISALLOWED_KEYWORDS.forEach(keyword => {
      const pattern = new RegExp(`(^|[^\\w$.])${keyword}(?![\\w$])`);
      if (pattern.test(expression)) {
        found.push(keyword);
      }
    });
    return found;
  }

  /**
   * 許可する式構文かどうかを検証します。
   *
   * @param expression 検証対象の式
   * @returns 許可する構文であればtrue
   */
  private static hasAllowedSyntax(expression: string): boolean {
    const tokens = this.tokenizeExpression(expression);
    if (tokens === null || tokens.length === 0) {
      return false;
    }

    const groups: GroupContext[] = [];
    let previous: ExpressionToken | null = null;

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      const next = tokens[index + 1] || null;

      const activeGroup = groups[groups.length - 1] || null;
      const beforePrevious = tokens[index - 2] || null;
      const thirdPrevious = tokens[index - 3] || null;

      if (
        this.startsObjectKey(
          activeGroup,
          previous,
          beforePrevious,
          thirdPrevious,
        )
      ) {
        if (token.value === '[') {
          return false;
        }
        if (
          token.type === 'identifier' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(token.value)
        ) {
          return false;
        }
        if (
          token.type === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(
            this.decodeStringLiteral(token.value),
          )
        ) {
          return false;
        }
      }

      if (token.type === 'identifier') {
        if (this.DISALLOWED_KEYWORDS.has(token.value)) {
          return false;
        }
        if (this.STRICT_FORBIDDEN_NAMES.includes(token.value)) {
          return false;
        }
        if (
          (previous?.value === '.' || previous?.value === '?.') &&
          this.FORBIDDEN_PROPERTY_NAMES.has(token.value)
        ) {
          return false;
        }
      }

      if (activeGroup === 'member' && token.value !== ']') {
        if (
          token.type === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(
            this.decodeStringLiteral(token.value),
          )
        ) {
          return false;
        }
      }

      if (token.value === '.' && next?.type !== 'identifier') {
        return false;
      }

      if (
        token.value === '?.' &&
        next?.type !== 'identifier' &&
        next?.value !== '[' &&
        next?.value !== '('
      ) {
        return false;
      }

      switch (token.value) {
        case '(':
          groups.push('paren');
          break;
        case ')': {
          const group = groups.pop();
          if (group !== 'paren') {
            return false;
          }
          break;
        }
        case '[': {
          const group: GroupContext = this.startsMemberAccess(previous)
            ? 'member'
            : 'array';
          groups.push(group);
          break;
        }
        case '{':
          groups.push('object');
          break;
        case ']': {
          const group = groups.pop();
          if (group === undefined) {
            return false;
          }
          break;
        }
        case '}': {
          const group = groups.pop();
          if (group !== 'object') {
            return false;
          }
          break;
        }
      }

      previous = token;
    }

    return groups.length === 0;
  }

  /**
   * 式をトークン列に分解します。
   *
   * @param expression 評価前に検証する式
   * @returns 分解結果。未対応構文を含む場合はnull
   */
  private static tokenizeExpression(
    expression: string,
  ): ExpressionToken[] | null {
    const tokens: ExpressionToken[] = [];
    const operators = [
      '===',
      '!==',
      '...',
      '?.',
      '&&',
      '||',
      '>=',
      '<=',
      '==',
      '!=',
      '=>',
    ];
    const singleCharacters = new Set([
      '(',
      ')',
      '{',
      '}',
      '[',
      ']',
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
      '>',
      '<',
    ]);
    let index = 0;

    while (index < expression.length) {
      const current = expression[index];

      if (/\s/.test(current)) {
        index += 1;
        continue;
      }

      if (
        current === '/' &&
        (expression[index + 1] === '/' || expression[index + 1] === '*')
      ) {
        return null;
      }

      if (current === '"' || current === "'") {
        const stringToken = this.readStringToken(expression, index);
        if (stringToken === null) {
          return null;
        }
        tokens.push(stringToken.token);
        index = stringToken.nextIndex;
        continue;
      }

      const operator = operators.find(item =>
        expression.startsWith(item, index),
      );
      if (operator) {
        tokens.push({type: 'operator', value: operator, position: index});
        index += operator.length;
        continue;
      }

      if (/[0-9]/.test(current)) {
        const numberToken = this.readNumberToken(expression, index);
        tokens.push(numberToken.token);
        index = numberToken.nextIndex;
        continue;
      }

      if (/[A-Za-z_$]/.test(current)) {
        const identifierToken = this.readIdentifierToken(expression, index);
        tokens.push(identifierToken.token);
        index = identifierToken.nextIndex;
        continue;
      }

      if (singleCharacters.has(current)) {
        tokens.push({type: 'operator', value: current, position: index});
        index += 1;
        continue;
      }

      return null;
    }

    return tokens;
  }

  /**
   * 文字列リテラルを読み取ります。
   *
   * @param expression 式全体
   * @param start 開始位置
   * @returns トークンと次の位置
   */
  private static readStringToken(
    expression: string,
    start: number,
  ): {token: ExpressionToken; nextIndex: number} | null {
    const quote = expression[start];
    let index = start + 1;

    while (index < expression.length) {
      const current = expression[index];
      if (current === '\\') {
        index += 2;
        continue;
      }
      if (current === quote) {
        return {
          token: {
            type: 'string',
            value: expression.slice(start, index + 1),
            position: start,
          },
          nextIndex: index + 1,
        };
      }
      index += 1;
    }

    return null;
  }

  /**
   * 数値リテラルを読み取ります。
   *
   * @param expression 式全体
   * @param start 開始位置
   * @returns トークンと次の位置
   */
  private static readNumberToken(
    expression: string,
    start: number,
  ): {token: ExpressionToken; nextIndex: number} {
    let index = start;
    while (index < expression.length && /[0-9_]/.test(expression[index])) {
      index += 1;
    }
    if (expression[index] === '.') {
      index += 1;
      while (index < expression.length && /[0-9_]/.test(expression[index])) {
        index += 1;
      }
    }
    return {
      token: {
        type: 'number',
        value: expression.slice(start, index),
        position: start,
      },
      nextIndex: index,
    };
  }

  /**
   * 識別子を読み取ります。
   *
   * @param expression 式全体
   * @param start 開始位置
   * @returns トークンと次の位置
   */
  private static readIdentifierToken(
    expression: string,
    start: number,
  ): {token: ExpressionToken; nextIndex: number} {
    let index = start;
    while (
      index < expression.length &&
      /[A-Za-z0-9_$]/.test(expression[index])
    ) {
      index += 1;
    }
    return {
      token: {
        type: 'identifier',
        value: expression.slice(start, index),
        position: start,
      },
      nextIndex: index,
    };
  }

  /**
   * 角括弧がメンバーアクセスかどうかを判定します。
   *
   * @param previous 直前のトークン
   * @returns メンバーアクセスであればtrue
   */
  private static startsMemberAccess(previous: ExpressionToken | null): boolean {
    if (previous === null) {
      return false;
    }
    if (previous.type === 'identifier' || previous.type === 'number') {
      return true;
    }
    return (
      previous.value === ')' ||
      previous.value === ']' ||
      previous.value === '?.'
    );
  }

  /**
   * object literal 内で次のトークンがキー位置かどうかを判定します。
   *
   * @param activeGroup 現在のグループ種別
   * @param previous 直前のトークン
   * @returns object literal のキー位置であれば true
   */
  private static startsObjectKey(
    activeGroup: GroupContext | null,
    previous: ExpressionToken | null,
    beforePrevious: ExpressionToken | null,
    thirdPrevious: ExpressionToken | null,
  ): boolean {
    if (activeGroup !== 'object') {
      return false;
    }
    if (previous?.value === '{' || previous?.value === ',') {
      return true;
    }

    if (
      previous?.type === 'identifier' &&
      this.OBJECT_PROPERTY_MODIFIERS.has(previous.value) &&
      (beforePrevious?.value === '{' || beforePrevious?.value === ',')
    ) {
      return true;
    }

    if (previous?.value !== '*') {
      return false;
    }

    if (beforePrevious?.value === '{' || beforePrevious?.value === ',') {
      return true;
    }

    return (
      beforePrevious?.type === 'identifier' &&
      beforePrevious.value === 'async' &&
      (thirdPrevious?.value === '{' || thirdPrevious?.value === ',')
    );
  }

  /**
   * 文字列リテラルをプレーン文字列へ変換します。
   *
   * @param literal 文字列リテラル
   * @returns デコード後の文字列
   */
  private static decodeStringLiteral(literal: string): string {
    return literal
      .slice(1, -1)
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, code: string) =>
        String.fromCodePoint(parseInt(code, 16)),
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
        String.fromCharCode(parseInt(code, 16)),
      )
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, code: string) =>
        String.fromCharCode(parseInt(code, 16)),
      )
      .replace(/\\(["'\\bfnrtv0])/g, (_, escaped: string) => {
        switch (escaped) {
          case 'b':
            return '\b';
          case 'f':
            return '\f';
          case 'n':
            return '\n';
          case 'r':
            return '\r';
          case 't':
            return '\t';
          case 'v':
            return '\v';
          case '0':
            return '\0';
          default:
            return escaped;
        }
      });
  }

  /**
   * バインド値を安全なProxyでラップします。
   *
   * @param bindedValues バインド値
   * @returns ラップ済みのバインド値
   */
  private static wrapBoundValues(
    bindedValues: Record<string, unknown>,
  ): Record<string, unknown> {
    const cache = new WeakMap<object, unknown>();
    const wrappedValues: Record<string, unknown> = {};

    Object.entries(bindedValues).forEach(([key, value]) => {
      wrappedValues[key] = this.wrapBoundValue(value, cache);
    });

    return wrappedValues;
  }

  /**
   * 危険なプロパティアクセスを防ぐために値を再帰的にラップします。
   *
   * @param value ラップ対象の値
   * @param cache 既存Proxyのキャッシュ
   * @returns ラップ済みの値
   */
  private static wrapBoundValue(
    value: unknown,
    cache: WeakMap<object, unknown>,
  ): unknown {
    if (!this.shouldWrapValue(value)) {
      return value;
    }

    const target = value as object;
    const cachedValue = cache.get(target);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    const proxy = new Proxy(target, {
      get: (currentTarget, property, receiver) => {
        if (
          typeof property === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(property)
        ) {
          return undefined;
        }
        const result = Reflect.get(currentTarget, property, receiver);
        if (typeof property === 'symbol') {
          return result;
        }
        return this.wrapBoundValue(result, cache);
      },
      has: (currentTarget, property) => {
        if (
          typeof property === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(property)
        ) {
          return false;
        }
        return Reflect.has(currentTarget, property);
      },
      getOwnPropertyDescriptor: (currentTarget, property) => {
        if (
          typeof property === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(property)
        ) {
          return undefined;
        }
        return Reflect.getOwnPropertyDescriptor(currentTarget, property);
      },
      apply: (currentTarget, thisArg, argArray) => {
        const result = Reflect.apply(
          currentTarget as (...args: unknown[]) => unknown,
          thisArg,
          argArray,
        );
        if (this.isIteratorLike(result)) {
          return result;
        }
        return this.wrapBoundValue(result, cache);
      },
      construct: (currentTarget, argArray, newTarget) => {
        return this.wrapBoundValue(
          Reflect.construct(
            currentTarget as new (...args: unknown[]) => object,
            argArray,
            newTarget,
          ),
          cache,
        ) as object;
      },
    });

    cache.set(target, proxy);
    return proxy;
  }

  /**
   * Proxy ラップ対象の値かどうかを判定します。
   *
   * @param value 判定対象
   * @returns ラップ対象であればtrue
   */
  private static shouldWrapValue(value: unknown): value is object {
    if (typeof value === 'function') {
      return true;
    }
    if (value === null || typeof value !== 'object') {
      return false;
    }
    if (Array.isArray(value)) {
      return true;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  /**
   * 評価中のみ prototype 系プロパティへの生アクセスを抑止します。
   *
   * @param callback 実行する処理
   * @returns 処理結果
   */
  private static withBlockedPropertyAccess<T>(callback: () => T): T {
    const blockedDescriptors = [
      {target: Object.prototype, property: 'constructor'},
      {target: Function.prototype, property: 'constructor'},
      {target: Object.prototype, property: '__proto__'},
    ] as const;
    const originals = blockedDescriptors
      .map(item => ({
        ...item,
        descriptor: Object.getOwnPropertyDescriptor(item.target, item.property),
      }))
      .filter(item => item.descriptor?.configurable === true);

    originals.forEach(({target, property}) => {
      Object.defineProperty(target, property, {
        configurable: true,
        enumerable: false,
        get: () => undefined,
        set: () => undefined,
      });
    });

    try {
      return callback();
    } finally {
      originals.forEach(({target, property, descriptor}) => {
        if (descriptor !== undefined) {
          Object.defineProperty(target, property, descriptor);
        }
      });
    }
  }

  /**
   * イテレータ互換オブジェクトかどうかを判定します。
   *
   * @param value 判定対象
   * @returns イテレータ互換であればtrue
   */
  private static isIteratorLike(value: unknown): boolean {
    if (value === null || typeof value !== 'object') {
      return false;
    }

    return typeof (value as Iterator<unknown>).next === 'function';
  }

  /**
   * トップレベルのバインド識別子に拒否対象名が含まれていないかを判定します。
   * ネストしたオブジェクトのプロパティ名は識別子として評価されないため、ここでは拒否しません。
   *
   * @param obj チェック対象のオブジェクト
   * @return 禁止識別子が含まれていればtrue
   */
  protected static containsForbiddenKeys(obj: unknown): boolean {
    return this.collectForbiddenKeys(obj).length > 0;
  }

  /**
   * トップレベルのバインドキーのうち、拒否対象名（実行系・プロトタイプ脱出名など、
   * 明示バインドでも許可しない名前）を列挙します。ネストしたオブジェクトのプロパティ名は
   * 識別子として評価されないため対象外です。
   *
   * @param obj チェック対象のオブジェクト
   * @return 拒否対象のトップレベルキー名の配列
   */
  protected static collectForbiddenKeys(obj: unknown): string[] {
    if (!obj || typeof obj !== 'object') {
      return [];
    }
    return Object.keys(obj as object).filter(key =>
      this.FORBIDDEN_BINDING_NAMES.has(key),
    );
  }

  /**
   * バインド値に危険なホストオブジェクトやグローバル関数が含まれていないかを再帰的に判定します。
   *
   * @param obj チェック対象の値
   * @param seen 循環参照検出用の訪問済み集合
   * @param forbiddenValues 危険値の集合。省略すると組み立てる。再帰呼び出しでは
   *   作り直さないよう、組み立てた集合を引き回す
   * @return 危険値が含まれていればtrue
   */
  protected static containsForbiddenBindingValues(
    obj: unknown,
    seen: WeakSet<object> = new WeakSet<object>(),
    forbiddenValues?: ReadonlySet<unknown>,
  ): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }
    const forbiddenBindingValues =
      forbiddenValues ?? this.getForbiddenBindingValueSet();

    const cached = this.forbiddenBindingValueCache.get(obj as object);
    if (cached !== undefined) {
      return cached;
    }

    if (seen.has(obj as object)) {
      return false;
    }
    seen.add(obj as object);

    if (forbiddenBindingValues.has(obj)) {
      this.forbiddenBindingValueCache.set(obj as object, true);
      return true;
    }

    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (typeof value === 'function') {
        if (forbiddenBindingValues.has(value)) {
          this.forbiddenBindingValueCache.set(obj as object, true);
          return true;
        }
        continue;
      }
      if (
        this.containsForbiddenBindingValues(value, seen, forbiddenBindingValues)
      ) {
        this.forbiddenBindingValueCache.set(obj as object, true);
        return true;
      }
    }

    this.forbiddenBindingValueCache.set(obj as object, false);
    return false;
  }
}
