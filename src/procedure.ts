/**
 * @fileoverview 手続き的処理管理機能
 *
 * イベントに基づく手続き的な処理を提供します。
 */

import Core from './core';
import Dev from './dev';
import Env from './env';
import Expression from './expression';
import Form from './form';
import Fragment, {ElementFragment} from './fragment';
import Haori from './haori';
import Log from './log';
import HaoriEvent from './event';
import {checkAuthRedirect} from './auth_guard';
import Selector from './selector';
import Store, {StoreKind} from './store';
import Url from './url';

type ProcedureHaoriApi = Pick<
  typeof Haori,
  | 'addErrorMessage'
  | 'clearMessages'
  | 'closeDialog'
  | 'confirm'
  | 'dialog'
  | 'openDialog'
  | 'toast'
>;

const PROCEDURE_HAORI_METHOD_NAMES = [
  'addErrorMessage',
  'clearMessages',
  'closeDialog',
  'confirm',
  'dialog',
  'openDialog',
  'toast',
] as const;

const PROCEDURE_HISTORY_STATE_KEY = '__haoriHistoryState__';

/** click ロック中であることを示す内部マーカー属性名 */
const PROCEDURE_CLICK_LOCK_MARKER = 'data-haori-click-lock';

/**
 * Procedure から利用する Haori API を解決します。
 * window.Haori が差し替えられている場合はそちらを優先します。
 *
 * @returns Procedure が使用する Haori API。
 */
function resolveProcedureHaoriApi(): ProcedureHaoriApi {
  const scope = globalThis as typeof globalThis & {
    window?: Window & {Haori?: unknown};
  };
  const candidate = scope.window?.Haori;
  const hasRequiredMethods = PROCEDURE_HAORI_METHOD_NAMES.every(
    methodName =>
      typeof (candidate as Record<string, unknown> | undefined)?.[
        methodName
      ] === 'function',
  );
  return hasRequiredMethods ? (candidate as ProcedureHaoriApi) : Haori;
}

const QUERY_TRANSPORT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * URL クエリ化の対象メソッドかどうかを判定します。
 *
 * @param method 判定対象の HTTP メソッド。
 * @return クエリ送信対象なら true。
 */
function isQueryTransportMethod(method: string): boolean {
  return QUERY_TRANSPORT_METHODS.has(method.toUpperCase());
}

/**
 * 送信データを URLSearchParams に追加します。
 *
 * @param params 追加先の URLSearchParams。
 * @param payload 追加対象の送信データ。
 * @return 戻り値はありません。
 */
function appendPayloadToSearchParams(
  params: URLSearchParams,
  payload: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach(item => {
        params.append(key, serializePayloadValue(item));
      });
    } else {
      params.append(key, serializePayloadValue(value));
    }
  }
}

/**
 * 送信データの 1 つの値を、テキストで送る経路（クエリ / urlencoded / multipart）の
 * 値へ変換します。
 *
 * オブジェクトと配列は JSON 文字列にします。`String()` に任せると `[object Object]`
 * になり、サーバ側で元の構造を復元できません。単一のオブジェクト値は以前から JSON
 * 文字列にしていたため、配列の要素も同じ規則へ揃えます（`data-form-list` の行データを
 * GET で送る構成が該当します）。
 *
 * 入れ子の構造をそのまま送りたい場合は JSON body（既定の POST）を使ってください。
 * テキストで送る経路は 1 つの値が 1 つの文字列になるため、構造を保つには要素ごとの
 * JSON 文字列にするしかありません。
 *
 * @param value 変換対象の値。
 * @return テキスト表現。`null` / `undefined` は空文字。
 */
function serializePayloadValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object' || typeof value === 'function') {
    // 関数は JSON.stringify が undefined を返し、循環参照は例外を投げる。どちらも
    // 送れる表現が無いので空文字に落とす（送信そのものは止めない）。
    try {
      return JSON.stringify(value) ?? '';
    } catch {
      return '';
    }
  }
  return String(value);
}

/**
 * 送信データをクエリ文字列へ付加した URL を返します。
 *
 * @param fetchUrl 元のフェッチ URL。
 * @param payload 追加対象の送信データ。
 * @return クエリ文字列を付加した URL。
 */
function appendPayloadToUrl(
  fetchUrl: string,
  payload: Record<string, unknown>,
): string {
  const url = new URL(fetchUrl, window.location.href);
  const params = new URLSearchParams(url.search);
  appendPayloadToSearchParams(params, payload);
  url.search = params.toString();
  return url.toString();
}

/**
 * demo ランタイム向け正規化の結果です。
 */
interface DemoRuntimeNormalization {
  /** 正規化後の URL。 */
  url: string;

  /** 正規化後の送信オプション。 */
  options: RequestInit;

  /** 正規化前に要求されていた HTTP メソッド。 */
  requestedMethod: string;

  /** 実際に送信する HTTP メソッド。 */
  effectiveMethod: string;

  /** この呼び出しで正規化を適用したかどうか。 */
  normalized: boolean;

  /** 正規化を適用した場合のクエリ文字列。 */
  queryString?: string;
}

/**
 * 送信 body をクエリ化できる形へ変換します。
 *
 * @param body 変換対象の body。
 * @return 変換結果。`dropped` が true の場合はクエリ化できない内容を含む。
 */
function extractPayloadFromBody(body: BodyInit | null | undefined): {
  payload: Record<string, unknown>;
  dropped: boolean;
} {
  if (body === null || body === undefined) {
    return {payload: {}, dropped: false};
  }
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed === '') {
      return {payload: {}, dropped: false};
    }
    if (trimmed.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed)
        ) {
          return {payload: parsed as Record<string, unknown>, dropped: false};
        }
      } catch {
        // JSON として読めない場合はクエリ化できない内容として扱う。
      }
      return {payload: {}, dropped: true};
    }
    if (trimmed.includes('=')) {
      return {
        payload: searchParamsToPayload(new URLSearchParams(trimmed)),
        dropped: false,
      };
    }
    return {payload: {}, dropped: true};
  }
  if (body instanceof URLSearchParams) {
    return {payload: searchParamsToPayload(body), dropped: false};
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const payload: Record<string, unknown> = {};
    let dropped = false;
    for (const [key, value] of body.entries()) {
      if (typeof value !== 'string') {
        // File / Blob はクエリへ載せられない。
        dropped = true;
        continue;
      }
      appendPayloadEntry(payload, key, value);
    }
    return {payload, dropped};
  }
  // Blob / ArrayBuffer / ReadableStream などはクエリ化できない。
  return {payload: {}, dropped: true};
}

/**
 * URLSearchParams を送信データへ変換します。
 *
 * @param params 変換対象。
 * @return 送信データ。同一キーが複数ある場合は配列になる。
 */
function searchParamsToPayload(
  params: URLSearchParams,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    appendPayloadEntry(payload, key, value);
  }
  return payload;
}

/**
 * 送信データへ 1 件追加します。同一キーが重なる場合は配列へまとめます。
 *
 * @param payload 追加先の送信データ。
 * @param key キー名。
 * @param value 値。
 * @return 戻り値はありません。
 */
function appendPayloadEntry(
  payload: Record<string, unknown>,
  key: string,
  value: string,
): void {
  const existing = payload[key];
  if (existing === undefined) {
    payload[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    payload[key] = [existing, value];
  }
}

/**
 * 応答データへユーザー編集分を再上書きします。
 *
 * 編集分に現れるキーだけを上書きし、それ以外は応答の値を残します。応答が返した
 * 派生値や正規化結果（サーバが計算した合計や整形済みコードなど）を、編集していない
 * 項目については保つためです。配列は位置合わせで要素ごとに再帰し、`data-form-list`
 * の行に対応させます。編集分の配列に含まれる空オブジェクトは、行位置を保つための
 * 場所取りなので上書きしません。
 *
 * @param base 応答データ（基底）。
 * @param edits 上書きするユーザー編集分。
 * @return 上書き後のデータ。
 */
function mergeUserEdits(base: unknown, edits: unknown): unknown {
  if (Array.isArray(edits)) {
    const merged = Array.isArray(base) ? base.slice() : [];
    let applied = false;
    edits.forEach((edit, index) => {
      if (edit === null || edit === undefined) {
        return;
      }
      if (
        typeof edit === 'object' &&
        !Array.isArray(edit) &&
        Object.keys(edit as Record<string, unknown>).length === 0
      ) {
        return;
      }
      merged[index] = mergeUserEdits(merged[index], edit);
      applied = true;
    });
    // 場所取りだけで実際の上書きが無ければ応答の値をそのまま残す。基底が配列で
    // ない場合に空配列で潰さないためでもある。
    return applied ? merged : base;
  }
  if (edits !== null && typeof edits === 'object') {
    const baseObject =
      base !== null && typeof base === 'object' && !Array.isArray(base)
        ? {...(base as Record<string, unknown>)}
        : {};
    for (const [key, value] of Object.entries(
      edits as Record<string, unknown>,
    )) {
      baseObject[key] = mergeUserEdits(baseObject[key], value);
    }
    return baseObject;
  }
  return edits;
}

/**
 * 送信オプションが送信データとしての body を持つかどうかを判定します。
 *
 * `data-{event}-before-run` の上書きが送信データの置き換えかどうかの判定に使います。
 * ヘッダーだけを差し替えるような上書きは body を持たないため対象外です。空文字の
 * body は送るデータが無いのと同じなので持たないものとして扱います。
 *
 * @param fetchOptions 判定対象の送信オプション。
 * @return 送信データとしての body を持つ場合は true。
 */
function hasRequestBody(fetchOptions: RequestInit | null): boolean {
  const body = fetchOptions?.body;
  if (body === undefined || body === null) {
    return false;
  }
  return typeof body === 'string' ? body !== '' : true;
}

/**
 * demo ランタイムでの送信内容をクエリ付き GET へ正規化します。
 *
 * `data-runtime="demo"` は静的ファイルサーバ上でデモを動かすための実行モードで、
 * body を伴うメソッドは送信できません（405 になります）。`data-{event}-before-run`
 * が `fetchOptions` を返して正規化を打ち消す場合にも成立させるため、送信直前へ
 * もう一度適用できる独立した関数にしています。すでに正規化済み（メソッドが
 * GET / HEAD / OPTIONS）なら何もしないため、二重適用でも副作用はありません。
 *
 * @param fetchUrl 送信先 URL。
 * @param fetchOptions 送信オプション。
 * @return 正規化結果。
 */
function normalizeRequestForDemoRuntime(
  fetchUrl: string,
  fetchOptions: RequestInit | null,
): DemoRuntimeNormalization {
  const options: RequestInit = {...(fetchOptions || {})};
  const requestedMethod = (options.method || 'GET').toUpperCase();
  if (Env.runtime !== 'demo' || isQueryTransportMethod(requestedMethod)) {
    return {
      url: fetchUrl,
      options,
      requestedMethod,
      effectiveMethod: requestedMethod,
      normalized: false,
    };
  }

  const {payload, dropped} = extractPayloadFromBody(
    options.body as BodyInit | null | undefined,
  );
  let url = fetchUrl;
  if (Object.keys(payload).length > 0) {
    url = appendPayloadToUrl(url, payload);
  }
  if (dropped) {
    Log.warn(
      'Haori',
      `The ${requestedMethod} body cannot be converted into a query string` +
        ' and is dropped by the demo runtime normalization. Send the values' +
        ` with ${Env.prefix}{event}-data / ${Env.prefix}{event}-form, or use` +
        ' the embedded runtime.',
    );
  }
  delete options.body;
  options.method = 'GET';
  const headers = new Headers(
    (options.headers as HeadersInit | undefined) || undefined,
  );
  headers.delete('Content-Type');
  options.headers = headers;

  return {
    url,
    options,
    requestedMethod,
    effectiveMethod: 'GET',
    normalized: true,
    queryString: new URL(url, window.location.href).search || undefined,
  };
}

/**
 * 自動再評価用に解決したフェッチシグネチャです。
 */
export interface ResolvedFetchSignature {
  /** 比較用シグネチャ。無効な場合は null */
  signature: string | null;

  /** 未解決参照が含まれていたかどうか */
  hasUnresolvedReference: boolean;
}

interface ResolvedDataAttribute {
  value: Record<string, unknown> | null;
  hasUnresolvedReference: boolean;
}

interface PreparedFetchRequest {
  url: string | null;
  /**
   * 送信データをクエリへ載せる前の URL。
   *
   * demo ランタイムでは送信データを URL のクエリへ移すため、`url` には正規化で
   * 付与したクエリが含まれます。`data-{event}-before-run` が body を伴う
   * `fetchOptions` を返した場合は、その body が送信データの置き換えになるため、
   * 再正規化はこの URL を基点にします（付与済みのクエリを引き継がない）。
   */
  baseUrl: string | null;
  options: RequestInit | null;
  payload: Record<string, unknown>;
  hasUnresolvedReference: boolean;
  requestedMethod: string;
  effectiveMethod: string;
  queryString?: string;
  transportMode: 'http' | 'query-get';
  signature: string | null;
}

interface PayloadResolution {
  payload: Record<string, unknown>;
  hasUnresolvedReference: boolean;
}

function normalizeRequestBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) {
    return null;
  }
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof FormData) {
    return Array.from(body.entries()).map(([key, value]) => {
      if (value instanceof File) {
        return [
          key,
          {
            type: 'file',
            name: value.name,
            size: value.size,
            mimeType: value.type,
          },
        ];
      }
      return [key, String(value)];
    });
  }
  return String(body);
}

/**
 * 値（配列・オブジェクトの内部を含む）に File / Blob が含まれるかどうかを判定します。
 * `data-form-object` / `data-form-list` によるネスト配下の File も検出します。
 *
 * @param value 判定対象の値。
 * @returns File / Blob が含まれる場合は true。
 */
function containsBinaryValue(value: unknown): boolean {
  if (value instanceof Blob) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsBinaryValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      containsBinaryValue,
    );
  }
  return false;
}

/**
 * 送信データに、multipart の FormData 構築で実体のまま扱えない位置の File / Blob が
 * 含まれるかどうかを判定します。
 *
 * FormData へ実体のまま載せられるのは「直下の値」と「直下の配列の要素」だけです。
 * それより深い位置（`data-form-object` / `data-form-list` 配下）の File は
 * `JSON.stringify` されて `{}` になり送信できません。トップレベルの File と混在して
 * いても検出できるよう、深い位置の有無だけを独立に判定します。
 *
 * @param payload 判定対象の送信データ。
 * @returns 送信できない位置に File / Blob がある場合は true。
 */
function hasUnsendableNestedBinaryValue(
  payload: Record<string, unknown>,
): boolean {
  return Object.values(payload).some(value => {
    if (value instanceof Blob) {
      // 直下の File は FormData へ実体のまま載る。
      return false;
    }
    if (Array.isArray(value)) {
      // 直下の配列も要素単位で載るため、要素が Blob でない場合のみ内部を調べる。
      return value.some(
        item => !(item instanceof Blob) && containsBinaryValue(item),
      );
    }
    return containsBinaryValue(value);
  });
}

/**
 * バインドデータ・history クエリ向けにフォーム値を収集します。
 *
 * 送信用の収集（`Form.getValues`）と異なり、File / Blob を文字列へ正規化した値を
 * 返します。バインドや history へ渡す経路はすべてこの関数を通し、正規化の適用漏れ
 * （`data-bind` 属性や URL が `{}` になる）を防ぎます。
 *
 * @param fragment 値を収集するフォームコンテナのフラグメント。
 * @returns File / Blob を文字列へ置き換えたフォーム値。
 */
function collectFormValuesForBinding(
  fragment: ElementFragment,
): Record<string, unknown> {
  return sanitizeBinaryForBinding(Form.getValues(fragment));
}

/**
 * バインドデータ向けに File / Blob をファイル名（Blob は空文字）へ正規化します。
 *
 * File / Blob は列挙可能なプロパティを持たないため、そのままバインドデータへ入れると
 * `JSON.stringify` で `{}` に潰れ、`data-bind` 属性や history のクエリが壊れます。
 * 式からは選択有無やファイル名を参照できれば十分なため、文字列へ置き換えます。
 * 送信用の送信データは変換しないため、multipart 送信には影響しません。
 *
 * @param payload 変換対象の送信データ。
 * @returns File / Blob を文字列へ置き換えた新しいオブジェクト。
 */
function sanitizeBinaryForBinding(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const convert = (value: unknown): unknown => {
    if (value instanceof File) {
      return value.name;
    }
    if (value instanceof Blob) {
      return '';
    }
    if (Array.isArray(value)) {
      return value.map(convert);
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(
        value as Record<string, unknown>,
      )) {
        result[key] = convert(item);
      }
      return result;
    }
    return value;
  };
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    sanitized[key] = convert(value);
  }
  return sanitized;
}

function buildFetchSignature(url: string, options: RequestInit): string {
  const headers = new Headers(
    (options.headers as HeadersInit | undefined) || undefined,
  );
  const normalizedHeaders = Array.from(headers.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return JSON.stringify({
    url,
    method: String(options.method || 'GET').toUpperCase(),
    headers: normalizedHeaders,
    body: normalizeRequestBody((options.body as BodyInit | undefined) || null),
  });
}

/**
 * フェッチ前実行スクリプト戻り値型。
 */
export interface BeforeCallbackResult {
  /** 処理を停止する場合は true */
  stop?: boolean;

  /** 上書きするフェッチURL */
  fetchUrl?: string | null;

  /** 上書きするフェッチオプション */
  fetchOptions?: RequestInit | null;
}

/**
 * フェッチ後実行スクリプト戻り値型。
 */
export interface AfterCallbackResult {
  /** 処理を停止する場合は true */
  stop?: boolean;

  /** レスポンスとして使用するデータ */
  response?: Response;
}

/**
 * Procedureクラスのオプションインターフェース。
 */
export interface ProcedureOptions {
  /** 処理対象のフラグメント */
  targetFragment?: ElementFragment;

  /** バリデーションを行うかどうか */
  valid?: boolean;

  /** 確認メッセージ */
  confirmMessage?: string | null;

  /** 送信もしくは受信データ */
  data?: Record<string, unknown> | null;

  /** data 属性の評価元となる属性名 */
  dataAttrName?: string | null;

  /**
   * クリック等のイベント時に実行する任意 JS（data-{event}-run）。
   * 本体が false を返した場合、呼び出し側が event.preventDefault() を行う。
   */
  runScript?: ((event: Event | null) => unknown) | null;

  /** フェッチ前実行スクリプト */
  beforeCallback?: (
    fetchUrl: string | null,
    fetchOptions: RequestInit | null,
  ) => BeforeCallbackResult | boolean | void;

  /** 対象フォームフラグメント */
  formFragment?: ElementFragment | null;

  /**
   * フォームコンテナが無い change / input で、値収集の対象とする入力要素自身の
   * フラグメント。`<form>` や `data-form` の外に置いた単独の入力（同意チェック等）
   * でも、その要素の `name` と値を送信データへ含められるようにします。
   */
  selfValueFragment?: ElementFragment | null;

  /** フェッチURL */
  fetchUrl?: string | null;

  /** フェッチ関連属性に未解決参照が含まれていたかどうか */
  fetchHasUnresolvedReference?: boolean | null;

  /** フェッチオプション */
  fetchOptions?: RequestInit | null;

  /** バインド対象フラグメント */
  bindFragments?: ElementFragment[] | null;

  /**
   * `bindFragments` が明示指定ではなく、fetch 時の既定 self-bind（バインド先
   * 未指定時に自要素を補う処理）によって設定されたものかどうか。
   * 既定 self-bind の場合、ユーザーは bind を意図していない（fetch して
   * toast/close/reload だけしたい）ことが多いため、bind できないデータ
   * （bindArg 無しの文字列）が返っても reject せず警告スキップする判断に使う。
   */
  defaultSelfBind?: boolean;

  /** レスポンスデータから抽出するパラメータ名のリスト */
  bindParams?: string[] | null;

  /** レスポンスデータのうち既存配列へ追記するパラメータ名のリスト */
  bindAppendParams?: string[] | null;

  /**
   * バインド対象の既存 binding data へ浅くマージするかどうか。
   * true の場合、解決済みデータで全置換せず、未指定キーを保持したまま上書きする。
   */
  bindMerge?: boolean;

  /**
   * フェッチ状態（loading/success/error）を `_fetch` として注入する対象要素群。
   * `data-fetch-state` / `data-{event}-fetch-state` で指定する。値が空の場合は
   * 自要素を対象とし、CSS セレクタ指定時は該当要素群を対象とする。
   */
  fetchStateFragments?: ElementFragment[] | null;

  /** レスポンスデータをバインドする際のキー名 */
  bindArg?: string | null;

  /**
   * バインド前にレスポンスデータへ適用する変換式。
   * 式の中ではレスポンス全体を `response` として参照できる
   * （例 `response.map(item => ({...item, id: null}))`）。bind-arg / bind-params /
   * bind-append より前に適用される。
   */
  bindTransform?: string | null;

  /** フェッチ後実行スクリプト */
  afterCallback?: (
    response: Response | Record<string, unknown>,
  ) => AfterCallbackResult | boolean | void;

  /** 値を変更するフラグメント */
  adjustFragments?: ElementFragment[] | null;

  /** 変更する値の増減値 */
  adjustValue?: number | null;

  /** 行追加の有無 */
  rowAdd?: boolean | null;

  /** 行削除の有無 */
  rowRemove?: boolean | null;

  /** 前の行へ移動するかどうか */
  rowMovePrev?: boolean | null;

  /** 次の行へ移動するかどうか */
  rowMoveNext?: boolean | null;

  /** 送信前にリセットするフラグメント */
  resetBeforeFragments?: ElementFragment[] | null;

  /** リセットするフラグメント */
  resetFragments?: ElementFragment[] | null;

  /** 再フェッチするフラグメント */
  refetchFragments?: ElementFragment[] | null;

  /** クリックするフラグメント */
  clickFragments?: ElementFragment[] | null;

  /** ダイアログを開くフラグメント */
  openFragments?: ElementFragment[] | null;

  /** ダイアログを閉じるフラグメント */
  closeFragments?: ElementFragment[] | null;

  /** コピー先フラグメント */
  copyFragments?: ElementFragment[] | null;

  /** コピー元フラグメント（data-click-copy-source で指定） */
  copySourceFragment?: ElementFragment | null;

  /** コピー対象パラメータ名のリスト */
  copyParams?: string[] | null;

  /** ダイアログメッセージ */
  dialogMessage?: string | null;

  /** トーストメッセージ */
  toastMessage?: string | null;

  /** トーストレベル */
  toastLevel?: 'info' | 'warning' | 'error' | 'success' | null;

  /** history.pushState で追加する URL */
  historyUrl?: string | null;

  /** history.pushState の URL に追記するクエリパラメータ */
  historyData?: Record<string, unknown> | null;

  /** history.pushState の URL に追記するクエリパラメータの評価元属性名 */
  historyDataAttrName?: string | null;

  /** reset-before 後に確定した historyData のスナップショット */
  historyDataSnapshot?: Record<string, unknown> | null;

  /** history.pushState の URL に追記するフォームフラグメント */
  historyFormFragment?: ElementFragment | null;

  /** reset-before 後に確定した historyForm のスナップショット */
  historyFormSnapshot?: Record<string, unknown> | null;

  /** 破棄するストレージレコードのキー（data-{event}-store-clear） */
  storeClearKey?: string | null;

  /** 破棄するストレージレコードの種別 */
  storeClearKind?: StoreKind | null;

  /** リダイレクトURL */
  redirectUrl?: string | null;

  /**
   * 戻り先リダイレクトに用いる URL クエリ名。
   *
   * `redirectUrl`（`data-{event}-redirect`）が指定されている場合のみ有効で、
   * 成功後の遷移直前に現在ページの当該クエリ値を読み取り、安全な同一オリジンの
   * ローカルパスであればその値へ遷移します（オープンリダイレクト対策）。安全で
   * ない／値が無い場合は `redirectUrl` へフォールバックします。
   */
  redirectReturnParam?: string | null;

  /** エラー時に最初のエラー要素へスクロールするかどうか */
  scrollOnError?: boolean | null;

  /** 成功時にスクロールする要素のCSSセレクター */
  scrollTarget?: string | null;

  /**
   * 手続きの実行条件（`data-{event}-if` / `data-fetch-if`）の式。
   *
   * 属性の再描画を待たずに実行時に同期評価するため、評価済みの値ではなく生の
   * テンプレートを保持します。
   */
  conditionExpression?: string | null;

  /** 実行条件の属性名（ログ出力用） */
  conditionAttributeName?: string | null;

  /**
   * バインド先・コピー先のうち編集可能な行にあたるものと、その `data-each`
   * コンテナの対応。
   *
   * 値が `null` の要素は `data-each-before` / `data-each-after` の固定要素で、行
   * として扱えないことを表します。属性を読んだ時点で記録します
   * （`recordRowWriteTargets()` を参照）。
   */
  rowWriteTargets?: Map<ElementFragment, ElementFragment | null> | null;
}

interface ExecutionLockState {
  /** 実行中として扱う対象要素 */
  target: HTMLElement;

  /** 今回の処理で disabled 属性を付与したかどうか */
  appliedDisabledAttribute: boolean;
}

/**
 * 編集可能な行への書き込み要求。
 *
 * `data-each` と `data-form-list` を併用したコンテナの行では、入力欄の値は配列の
 * 要素データが権威です（行フラグメントのバインドデータは描画のたびに作り直される
 * 一時スコープ）。そのため行を指した copy / bind は、行へ直接書くのではなく対応
 * する配列要素を書き換え、所有者へ書き戻します。
 */
interface RowWrite {
  /** `data-each` かつ `data-form-list` のコンテナ */
  container: ElementFragment;

  /** 書き込み先の行フラグメント */
  row: ElementFragment;

  /** ログ出力に用いる属性名 */
  attributeName: string;

  /**
   * 要素データの書き換え内容。
   *
   * 書き戻す直前に呼び出されるため、参照する配列・編集状態は常に最新です。
   *
   * @param item 現在の要素データ
   * @returns 書き換え後の要素データ
   */
  apply: (item: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * 書き込み先の解決結果。
 *
 * `row` は編集可能な行として配列要素へ書き戻すもの、`skip` は行だったものが失われ
 * ている等で書き込まないもの、`plain` は行ではなくその要素自身のバインドデータを
 * 更新するものです。
 */
type RowWriteResolution =
  | {kind: 'row'; container: ElementFragment}
  | {kind: 'skip'}
  | {kind: 'plain'};

/**
 * 手続き的処理管理クラスです。
 */
export default class Procedure {
  /** data 属性内のテンプレート式検出用正規表現 */
  private static readonly DATA_PLACEHOLDER_REGEX =
    /\{\{\{([\s\S]+?)\}\}\}|\{\{([\s\S]+?)\}\}/g;

  /** 属性全体が単一テンプレート式かを判定する正規表現 */
  private static readonly SINGLE_PLACEHOLDER_REGEX =
    /^(\{\{\{[\s\S]+?\}\}\}|\{\{[\s\S]+?\}\})$/;

  /** click 手続きの再入を防ぐ対象要素の集合 */
  private static readonly RUNNING_CLICK_TARGETS = new WeakSet<HTMLElement>();

  /** この Procedure が扱うイベント種別 */
  private readonly eventType: string | null;

  /**
   * 起点となった DOM イベント（data-{event}-run の preventDefault 用）。
   * イベント駆動でない実行や、イベントを渡さない経路では null。
   */
  private readonly domEvent: Event | null;

  /**
   * イベント属性名を正しく生成します。
   * 例: ("click", "fetch") => "data-click-fetch"
   *    (null, "fetch") => "data-fetch"
   *    ("change", "bind-arg") => "data-change-bind-arg"
   * 非イベント変種が "data-fetch-xxx" として存在するものについては、event が null の場合にそちらを返します。
   */
  private static attrName(
    event: string | null,
    key: string,
    hasFetchFallback: boolean = false,
  ): string {
    if (event) {
      return `${Env.prefix}${event}-${key}`;
    }
    return hasFetchFallback
      ? `${Env.prefix}fetch-${key}`
      : `${Env.prefix}${key}`;
  }

  /**
   * data 属性のテンプレート式評価結果を URLSearchParams 向けに組み立てます。
   *
   * @param rawAttribute 生の属性値
   * @param bindingValues バインディング値
   * @returns パラメータ形式として扱える文字列
   */
  private static resolveDataParamString(
    rawAttribute: string,
    bindingValues: Record<string, unknown>,
  ): string {
    return Procedure.resolveDataParamStringDetailed(rawAttribute, bindingValues)
      .value;
  }

  /**
   * data 属性のテンプレート式評価結果を URLSearchParams 向けに組み立てます。
   *
   * @param rawAttribute 生の属性値
   * @param bindingValues バインディング値
   * @returns パラメータ形式として扱える文字列と未解決参照の有無
   */
  private static resolveDataParamStringDetailed(
    rawAttribute: string,
    bindingValues: Record<string, unknown>,
  ): {value: string; hasUnresolvedReference: boolean} {
    let hasUnresolvedReference = false;
    const value = rawAttribute.replace(
      Procedure.DATA_PLACEHOLDER_REGEX,
      (
        _matched: string,
        rawExpression: string | undefined,
        expression: string | undefined,
      ): string => {
        const result = Expression.evaluateDetailed(
          rawExpression ?? expression ?? '',
          bindingValues,
        );
        hasUnresolvedReference =
          hasUnresolvedReference || result.unresolvedReference;
        if (
          result.value === null ||
          result.value === undefined ||
          Number.isNaN(result.value)
        ) {
          return '';
        }
        if (typeof result.value === 'object') {
          return encodeURIComponent(JSON.stringify(result.value));
        }
        return encodeURIComponent(String(result.value));
      },
    );
    return {value, hasUnresolvedReference};
  }

  /**
   * JSON 文字列中のテンプレート式かどうかを判定します。
   *
   * @param source 生の属性値
   * @param offset プレースホルダ開始位置
   * @returns JSON 文字列中なら true
   */
  private static isJsonStringContext(source: string, offset: number): boolean {
    let inString = false;
    let escaped = false;
    for (let index = 0; index < offset; index += 1) {
      const char = source[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
      }
    }
    return inString;
  }

  /**
   * JSON 値コンテキスト向けにテンプレート式の評価結果を直列化します。
   *
   * @param result テンプレート式の評価結果
   * @returns JSON 値として埋め込める文字列
   */
  private static stringifyJsonTemplateValue(result: unknown): string {
    if (result === undefined || Number.isNaN(result)) {
      return 'null';
    }
    try {
      const serialized = JSON.stringify(result);
      return serialized ?? JSON.stringify(String(result));
    } catch {
      return JSON.stringify(String(result));
    }
  }

  /**
   * JSON 文字列コンテキスト向けにテンプレート式の評価結果を直列化します。
   *
   * @param result テンプレート式の評価結果
   * @returns JSON 文字列へ安全に埋め込める文字列
   */
  private static stringifyJsonTemplateStringContent(result: unknown): string {
    if (result === null || result === undefined || Number.isNaN(result)) {
      return '';
    }
    const value =
      typeof result === 'object'
        ? Procedure.stringifyJsonTemplateValue(result)
        : String(result);
    return JSON.stringify(value).slice(1, -1);
  }

  /**
   * JSON 形式 data 属性内のテンプレート式を安全に解決します。
   *
   * @param rawAttribute 生の属性値
   * @param bindingValues バインディング値
   * @returns JSON として解釈可能な文字列
   */
  private static resolveDataJsonString(
    rawAttribute: string,
    bindingValues: Record<string, unknown>,
  ): string {
    return Procedure.resolveDataJsonStringDetailed(rawAttribute, bindingValues)
      .value;
  }

  /**
   * JSON 形式 data 属性内のテンプレート式を安全に解決します。
   *
   * @param rawAttribute 生の属性値
   * @param bindingValues バインディング値
   * @returns JSON として解釈可能な文字列と未解決参照の有無
   */
  private static resolveDataJsonStringDetailed(
    rawAttribute: string,
    bindingValues: Record<string, unknown>,
  ): {value: string; hasUnresolvedReference: boolean} {
    let hasUnresolvedReference = false;
    const value = rawAttribute.replace(
      Procedure.DATA_PLACEHOLDER_REGEX,
      (
        _matched: string,
        rawExpression: string | undefined,
        expression: string | undefined,
        offset: number,
      ): string => {
        const result = Expression.evaluateDetailed(
          rawExpression ?? expression ?? '',
          bindingValues,
        );
        hasUnresolvedReference =
          hasUnresolvedReference || result.unresolvedReference;
        return Procedure.isJsonStringContext(rawAttribute, offset)
          ? Procedure.stringifyJsonTemplateStringContent(result.value)
          : Procedure.stringifyJsonTemplateValue(result.value);
      },
    );
    return {value, hasUnresolvedReference};
  }

  /**
   * data 属性を評価済みの値として取得します。
   *
   * @param fragment フラグメント
   * @param attrName 属性名
   * @returns 送信データ
   */
  private static resolveDataAttribute(
    fragment: ElementFragment,
    attrName: string,
  ): Record<string, unknown> | null {
    return Procedure.resolveDataAttributeDetailed(fragment, attrName).value;
  }

  /**
   * data 属性を評価済みの値として取得し、未解決参照の有無を返します。
   *
   * @param fragment フラグメント
   * @param attrName 属性名
   * @returns 送信データと未解決参照の有無
   */
  private static resolveDataAttributeDetailed(
    fragment: ElementFragment,
    attrName: string,
  ): ResolvedDataAttribute {
    const rawAttribute = fragment.getRawAttribute(attrName);
    const attributeEvaluation = fragment.getAttributeEvaluation(attrName);
    const dataAttribute = attributeEvaluation?.value ?? null;
    const hasUnresolvedReference =
      attributeEvaluation?.hasUnresolvedReference ?? false;
    if (
      dataAttribute &&
      typeof dataAttribute === 'object' &&
      !Array.isArray(dataAttribute)
    ) {
      return {
        value: dataAttribute as Record<string, unknown>,
        hasUnresolvedReference,
      };
    }
    if (typeof dataAttribute !== 'string' || rawAttribute === null) {
      return {value: null, hasUnresolvedReference};
    }
    const trimmed = rawAttribute.trim();
    if (Procedure.SINGLE_PLACEHOLDER_REGEX.test(trimmed)) {
      return {
        value: Core.parseDataBind(dataAttribute),
        hasUnresolvedReference,
      };
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const resolved = Procedure.resolveDataJsonStringDetailed(
        rawAttribute,
        fragment.getBindingData(),
      );
      return {
        value: Core.parseDataBind(resolved.value),
        hasUnresolvedReference:
          hasUnresolvedReference || resolved.hasUnresolvedReference,
      };
    }
    const resolved = Procedure.resolveDataParamStringDetailed(
      rawAttribute,
      fragment.getBindingData(),
    );
    return {
      value: Core.parseDataBind(resolved.value),
      hasUnresolvedReference:
        hasUnresolvedReference || resolved.hasUnresolvedReference,
    };
  }

  /**
   * オプションをフラグメントの属性から構築します。
   *
   * @param fragment フラグメント
   * @param event イベント名
   * @return 構築されたオプション
   */
  private static buildOptions(
    fragment: ElementFragment,
    event: string | null,
  ): ProcedureOptions {
    const options: ProcedureOptions = {
      targetFragment: fragment,
    };
    // 実行条件（data-{event}-if / 非イベントは data-fetch-if）。属性の再描画を
    // 待たずに実行時へ同期評価するため、生のテンプレートを控える。
    const conditionAttrName = event
      ? Procedure.attrName(event, 'if')
      : Procedure.attrName(null, 'if', true);
    if (fragment.hasAttribute(conditionAttrName)) {
      const raw = fragment.getRawAttribute(conditionAttrName);
      if (typeof raw === 'string' && raw.trim() !== '') {
        options.conditionExpression = Form.unwrapConditionExpression(raw);
        options.conditionAttributeName = conditionAttrName;
      } else {
        Log.warn('Haori', `${conditionAttrName} に条件式が指定されていません。`);
      }
    }
    if (event) {
      // validate（spec: data-???-validate）
      if (fragment.hasAttribute(Procedure.attrName(event, 'validate'))) {
        options.valid = true;
      }
      // confirm
      if (fragment.hasAttribute(Procedure.attrName(event, 'confirm'))) {
        options.confirmMessage = (
          fragment.getAttribute(Procedure.attrName(event, 'confirm')) as string
        ).replace(/\\n/g, '\n');
      }
      // data（イベント）
      if (fragment.hasAttribute(Procedure.attrName(event, 'data'))) {
        options.dataAttrName = Procedure.attrName(event, 'data');
      }
      // form（イベント）
      if (fragment.hasAttribute(Procedure.attrName(event, 'form'))) {
        const formSelector = Selector.read(
          fragment,
          Procedure.attrName(event, 'form'),
        );
        if (formSelector) {
          const formElement = Selector.query(
            formSelector,
            Procedure.attrName(event, 'form'),
          );
          if (formElement !== null) {
            options.formFragment = Form.getFormFragment(
              Fragment.get(formElement) as ElementFragment,
            );
          } else {
            Log.error(
              'Haori',
              `Form element not found: ${formSelector}` +
                ` (${Procedure.attrName(event, 'form')})`,
            );
          }
        } else {
          // 属性はあるが値が省略された場合は自要素もしくは先祖の form を対象
          options.formFragment = Form.getFormFragment(fragment);
        }
      } else if (event === 'change' || event === 'input') {
        // change / input イベントの場合、data-{event}-form 属性がなくても自動的に
        // フォームを検索し、入力値を双方向バインディングへ反映する。
        options.formFragment = Form.getFormFragment(fragment);
        if (
          options.formFragment === null &&
          Procedure.isNamedInputFragment(fragment)
        ) {
          // フォームコンテナが無い場合は、対象要素自身を値収集の対象とする。
          // これがないと送信データが空になり、data-{event}-bind でバインド先を
          // 空オブジェクトで全置換してしまう（単独の同意チェックボックス等）。
          //
          // 対象は name を持つ入力要素自身に限定する。コンテナ要素を対象にすると
          // Form.getValues が子孫を再帰収集するため、data-form を宣言していない
          // 要素（data-each-rendered-change を付けた data-each コンテナ等）で
          // 配下の全入力が意図せず収集されてしまう。
          options.selfValueFragment = fragment;
        }
      }
      if (fragment.hasAttribute(`${Env.prefix}${event}-before-run`)) {
        const body = fragment.getRawAttribute(
          `${Env.prefix}${event}-before-run`,
        ) as string;
        try {
          options.beforeCallback = new Function(
            'fetchUrl',
            'fetchOptions',
            `
"use strict";
${body}
`,
          ) as (
            fetchUrl: string | null,
            fetchOptions: RequestInit | null,
          ) => BeforeCallbackResult | boolean | void;
        } catch (e) {
          Log.error('Haori', `Invalid before script: ${e}`);
        }
      }
      // data-{event}-run: フェッチを伴わない任意 JS をクリック等で実行する。
      // before-run と異なり {{...}} を展開した値（getAttribute）を本体にする。
      const runAttrName = Procedure.attrName(event, 'run');
      if (fragment.hasAttribute(runAttrName)) {
        const body = String(fragment.getAttribute(runAttrName) ?? '');
        // まず本体を「単一式」として評価できるか試す。式化できる場合は
        // `return (body)` で戻り値を捕捉し、`return` を明示しない素の関数呼び出し
        // （例: data-click-run="save()"）でも、戻り値の Promise を await（多重実行
        // 防止）し、同期的な false で preventDefault できるようにする。複数文・明示
        // return・if 文などは式化に失敗するため、従来どおりの文ブロックとして生成し、
        // その場合の戻り値は本体内の明示的な return に従う。末尾の `\n` は本体末尾の
        // 行コメントが閉じ括弧を巻き込まないようにするため。
        let runScript: ((event: Event | null) => unknown) | null = null;
        try {
          runScript = new Function(
            'event',
            `"use strict"; return (\n${body}\n);`,
          ) as (event: Event | null) => unknown;
        } catch {
          try {
            runScript = new Function('event', `"use strict";\n${body}\n`) as (
              event: Event | null,
            ) => unknown;
          } catch (e) {
            Log.error('Haori', `Invalid run script: ${e}`);
          }
        }
        if (runScript) {
          options.runScript = runScript;
        }
      }
    }
    // fetch URL（イベントあり/なし）
    const fetchAttrName = Procedure.attrName(event, 'fetch');
    const hasFetchAttr = fragment.hasAttribute(fetchAttrName);
    if (hasFetchAttr) {
      const fetchEvaluation = fragment.getAttributeEvaluation(fetchAttrName);
      if (fetchEvaluation) {
        options.fetchHasUnresolvedReference =
          fetchEvaluation.hasUnresolvedReference;
        options.fetchUrl = fetchEvaluation.hasUnresolvedReference
          ? null
          : (fetchEvaluation.value as string | null);
      }
    }
    const fetchOptions: RequestInit = {};
    // fetch-method（イベントあり/なし）
    // event: data-{event}-fetch-method, non-event: data-fetch-method
    if (event) {
      const fetchMethodAttrEvent = Procedure.attrName(event, 'fetch-method');
      if (fragment.hasAttribute(fetchMethodAttrEvent)) {
        const fetchMethodEvaluation =
          fragment.getAttributeEvaluation(fetchMethodAttrEvent);
        if (fetchMethodEvaluation?.hasUnresolvedReference) {
          options.fetchHasUnresolvedReference = true;
        } else {
          fetchOptions.method = fetchMethodEvaluation?.value as string;
        }
      }
    } else {
      const fetchMethodAttrNonEvent = Procedure.attrName(null, 'method', true);
      if (fragment.hasAttribute(fetchMethodAttrNonEvent)) {
        const fetchMethodEvaluation = fragment.getAttributeEvaluation(
          fetchMethodAttrNonEvent,
        );
        if (fetchMethodEvaluation?.hasUnresolvedReference) {
          options.fetchHasUnresolvedReference = true;
        } else {
          fetchOptions.method = fetchMethodEvaluation?.value as string;
        }
      }
    }
    // fetch-headers（イベントあり/なし）
    // event: data-{event}-fetch-headers, non-event: data-fetch-headers
    if (event) {
      const fetchHeadersAttrEvent = Procedure.attrName(event, 'fetch-headers');
      if (fragment.hasAttribute(fetchHeadersAttrEvent)) {
        const headersString = fragment.getRawAttribute(
          fetchHeadersAttrEvent,
        ) as string;
        try {
          fetchOptions.headers = Core.parseDataBind(headersString) as Record<
            string,
            string
          >;
        } catch (e) {
          Log.error('Haori', `Invalid fetch headers: ${e}`);
        }
      }
    } else {
      const fetchHeadersAttrNonEvent = Procedure.attrName(
        null,
        'headers',
        true,
      );
      if (fragment.hasAttribute(fetchHeadersAttrNonEvent)) {
        const headersString = fragment.getRawAttribute(
          fetchHeadersAttrNonEvent,
        ) as string;
        try {
          fetchOptions.headers = Core.parseDataBind(headersString) as Record<
            string,
            string
          >;
        } catch (e) {
          Log.error('Haori', `Invalid fetch headers: ${e}`);
        }
      }
    }
    // fetch-content-type（イベントあり/なし）
    // event: data-{event}-fetch-content-type
    // non-event: data-fetch-content-type
    if (event) {
      const fetchCTAttrEvent = Procedure.attrName(event, 'fetch-content-type');
      if (fragment.hasAttribute(fetchCTAttrEvent)) {
        const fetchContentTypeEvaluation =
          fragment.getAttributeEvaluation(fetchCTAttrEvent);
        if (fetchContentTypeEvaluation?.hasUnresolvedReference) {
          options.fetchHasUnresolvedReference = true;
        }
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Content-Type': fetchContentTypeEvaluation?.value as string,
        };
      } else if (
        fetchOptions.method &&
        fetchOptions.method !== 'GET' &&
        fetchOptions.method !== 'HEAD' &&
        fetchOptions.method !== 'OPTIONS'
      ) {
        // only set default Content-Type when one is not already provided
        let hasContentType = false;
        if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
          const headersObj = fetchOptions.headers as Record<string, unknown>;
          hasContentType = 'Content-Type' in headersObj;
        }
        if (!hasContentType) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            'Content-Type': 'application/json',
          };
        }
      } else if (
        fetchOptions.method &&
        (fetchOptions.method === 'GET' ||
          fetchOptions.method === 'HEAD' ||
          fetchOptions.method === 'OPTIONS')
      ) {
        // 仕様: GET/HEAD/OPTIONS 既定は application/x-www-form-urlencoded
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        };
      }
    } else {
      const fetchCTAttrNonEvent = Procedure.attrName(
        null,
        'content-type',
        true,
      );
      if (fragment.hasAttribute(fetchCTAttrNonEvent)) {
        const fetchContentTypeEvaluation =
          fragment.getAttributeEvaluation(fetchCTAttrNonEvent);
        if (fetchContentTypeEvaluation?.hasUnresolvedReference) {
          options.fetchHasUnresolvedReference = true;
        }
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Content-Type': fetchContentTypeEvaluation?.value as string,
        };
      } else if (
        fetchOptions.method &&
        fetchOptions.method !== 'GET' &&
        fetchOptions.method !== 'HEAD' &&
        fetchOptions.method !== 'OPTIONS'
      ) {
        // only set default Content-Type when one is not already provided
        let hasContentType = false;
        if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
          const headersObj = fetchOptions.headers as Record<string, unknown>;
          hasContentType = 'Content-Type' in headersObj;
        }
        if (!hasContentType) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            'Content-Type': 'application/json',
          };
        }
      } else if (
        fetchOptions.method &&
        (fetchOptions.method === 'GET' ||
          fetchOptions.method === 'HEAD' ||
          fetchOptions.method === 'OPTIONS')
      ) {
        // 仕様: GET/HEAD/OPTIONS 既定は application/x-www-form-urlencoded
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        };
      }
    }
    if (Object.keys(fetchOptions).length > 0) {
      options.fetchOptions = fetchOptions;
    }
    // bind（イベントあり/なし: 非イベントは data-fetch-bind）
    const bindAttr = event
      ? Procedure.attrName(event, 'bind')
      : Procedure.attrName(null, 'bind', true);
    if (fragment.hasAttribute(bindAttr)) {
      const bindSelector = Selector.read(fragment, bindAttr);
      if (bindSelector) {
        const bindElements = Selector.queryAll(bindSelector, bindAttr);
        if (bindElements.length > 0) {
          options.bindFragments = [];
          bindElements.forEach(element => {
            const fragment = Fragment.get(element);
            if (fragment) {
              options.bindFragments!.push(fragment as ElementFragment);
            }
          });
        } else {
          Log.error(
            'Haori',
            `Bind element not found: ${bindSelector} (${bindAttr})`,
          );
        }
      }
    }
    const bindArgAttrEvent = Procedure.attrName(event, 'bind-arg');
    const bindArgAttrNonEventLegacy = Procedure.attrName(
      null,
      'arg',
      true,
    ); // data-fetch-arg
    const bindArgAttrNonEventNew = Procedure.attrName(
      null,
      'bind-arg',
      true,
    ); // data-fetch-bind-arg (less common)
    if (event) {
      if (fragment.hasAttribute(bindArgAttrEvent)) {
        options.bindArg = fragment.getRawAttribute(bindArgAttrEvent) as
          | string
          | null;
      }
    } else {
      // Prefer legacy `data-fetch-arg` for non-event usage.
      // Fallback to `data-fetch-bind-arg` if legacy is not present.
      if (fragment.hasAttribute(bindArgAttrNonEventLegacy)) {
        options.bindArg = fragment.getRawAttribute(
          bindArgAttrNonEventLegacy,
        ) as string | null;
      } else if (fragment.hasAttribute(bindArgAttrNonEventNew)) {
        options.bindArg = fragment.getRawAttribute(bindArgAttrNonEventNew) as
          | string
          | null;
      }
    }
    const bindParamsAttr = event
      ? Procedure.attrName(event, 'bind-params')
      : Procedure.attrName(null, 'bind-params', true);
    if (fragment.hasAttribute(bindParamsAttr)) {
      const paramsString = fragment.getRawAttribute(bindParamsAttr) as string;
      options.bindParams = paramsString.split('&').map(p => p.trim());
    }
    const bindAppendAttr = event
      ? Procedure.attrName(event, 'bind-append')
      : Procedure.attrName(null, 'bind-append', true);
    if (fragment.hasAttribute(bindAppendAttr)) {
      const paramsString = fragment.getRawAttribute(bindAppendAttr) as string;
      options.bindAppendParams = paramsString
        .split('&')
        .map(p => p.trim())
        .filter(Boolean);
    }
    const bindMergeAttr = event
      ? Procedure.attrName(event, 'bind-merge')
      : Procedure.attrName(null, 'bind-merge', true);
    if (fragment.hasAttribute(bindMergeAttr)) {
      options.bindMerge = true;
    }
    const bindTransformAttr = event
      ? Procedure.attrName(event, 'bind-transform')
      : Procedure.attrName(null, 'bind-transform', true);
    if (fragment.hasAttribute(bindTransformAttr)) {
      options.bindTransform = fragment.getRawAttribute(bindTransformAttr) as
        | string
        | null;
    }
    const copyParamsAttr = event
      ? Procedure.attrName(event, 'copy-params')
      : null;
    if (copyParamsAttr && fragment.hasAttribute(copyParamsAttr)) {
      const paramsString = fragment.getRawAttribute(copyParamsAttr) as string;
      options.copyParams = paramsString
        .split('&')
        .map(param => param.trim())
        .filter(Boolean);
    }
    if (event) {
      if (fragment.hasAttribute(Procedure.attrName(event, 'adjust'))) {
        const adjustSelector = Selector.read(
          fragment,
          Procedure.attrName(event, 'adjust'),
        );
        if (adjustSelector) {
          const adjustElements = Selector.queryAll(
            adjustSelector,
            Procedure.attrName(event, 'adjust'),
          );
          if (adjustElements.length > 0) {
            options.adjustFragments = [];
            adjustElements.forEach(element => {
              const fragment = Fragment.get(element);
              if (fragment) {
                options.adjustFragments!.push(fragment as ElementFragment);
              }
            });
          } else {
            Log.error(
              'Haori',
              `Adjust element not found: ${adjustSelector}` +
                ` (${Procedure.attrName(event, 'adjust')})`,
            );
          }
        }
        if (fragment.hasAttribute(Procedure.attrName(event, 'adjust-value'))) {
          const valueString = fragment.getRawAttribute(
            Procedure.attrName(event, 'adjust-value'),
          ) as string;
          const value = Number(valueString);
          if (!isNaN(value)) {
            options.adjustValue = value;
          }
        }
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'row-add'))) {
        options.rowAdd = true;
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'row-remove'))) {
        options.rowRemove = true;
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'row-prev'))) {
        options.rowMovePrev = true;
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'row-next'))) {
        options.rowMoveNext = true;
      }
      if (fragment.hasAttribute(`${Env.prefix}${event}-after-run`)) {
        const body = fragment.getRawAttribute(
          `${Env.prefix}${event}-after-run`,
        ) as string;
        try {
          options.afterCallback = new Function(
            'response',
            `
"use strict";
${body}
`,
          ) as (
            response: Response | Record<string, unknown>,
          ) => AfterCallbackResult | boolean | void;
        } catch (e) {
          Log.error('Haori', `Invalid after script: ${e}`);
        }
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'dialog'))) {
        options.dialogMessage = (
          fragment.getAttribute(Procedure.attrName(event, 'dialog')) as string
        ).replace(/\\n/g, '\n');
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'toast'))) {
        options.toastMessage = fragment.getAttribute(
          Procedure.attrName(event, 'toast'),
        ) as string;
        const rawLevel = fragment.getRawAttribute(
          Procedure.attrName(event, 'toast-level'),
        );
        const validLevels = ['info', 'warning', 'error', 'success'] as const;
        type ToastLevel = (typeof validLevels)[number];
        const isValidLevel = validLevels.includes(rawLevel as ToastLevel);
        options.toastLevel = isValidLevel ? (rawLevel as ToastLevel) : null;
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'redirect'))) {
        options.redirectUrl = fragment.getAttribute(
          Procedure.attrName(event, 'redirect'),
        ) as string;
        // 戻り先クエリ名は redirect が指定されている場合のみ有効とする。
        const returnParamAttr = Procedure.attrName(
          event,
          'redirect-return-param',
        );
        if (fragment.hasAttribute(returnParamAttr)) {
          options.redirectReturnParam = fragment.getAttribute(
            returnParamAttr,
          ) as string;
        }
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'scroll-error'))) {
        options.scrollOnError = true;
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'scroll'))) {
        options.scrollTarget = fragment.getAttribute(
          Procedure.attrName(event, 'scroll'),
        ) as string;
      }
      // history（data-{event}-history / history-data / history-form）
      if (fragment.hasAttribute(Procedure.attrName(event, 'history'))) {
        options.historyUrl = fragment.getAttribute(
          Procedure.attrName(event, 'history'),
        ) as string | null;
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'history-data'))) {
        options.historyDataAttrName = Procedure.attrName(event, 'history-data');
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'history-form'))) {
        const historyFormSelector = Selector.read(
          fragment,
          Procedure.attrName(event, 'history-form'),
        );
        if (historyFormSelector) {
          const historyFormElement = Selector.query(
            historyFormSelector,
            Procedure.attrName(event, 'history-form'),
          );
          if (historyFormElement !== null) {
            options.historyFormFragment = Form.getFormFragment(
              Fragment.get(historyFormElement) as ElementFragment,
            );
          } else {
            Log.error(
              'Haori',
              `Form element not found: ${historyFormSelector}` +
                ` (${Procedure.attrName(event, 'history-form')})`,
            );
          }
        } else {
          options.historyFormFragment = Form.getFormFragment(fragment);
        }
      }

      // reset/refetch/click/open/close（イベント、CSSセレクタ）
      const selectorAttrs = [
        'reset-before',
        'reset',
        'refetch',
        'click',
        'copy',
        'open',
        'close',
      ] as const;
      selectorAttrs.forEach(attrKey => {
        const attrName = Procedure.attrName(event, attrKey);
        if (!fragment.hasAttribute(attrName)) {
          return;
        }
        const selector = Selector.read(fragment, attrName);
        const list: ElementFragment[] = [];
        if (selector) {
          const elements = Selector.queryAll(selector, attrName);
          elements.forEach(el => {
            const frag = Fragment.get(el);
            if (frag) {
              list.push(frag as ElementFragment);
            }
          });
          if (list.length === 0) {
            Log.error('Haori', `Element not found: ${selector} (${attrName})`);
          }
        } else if (attrKey === 'open' || attrKey === 'close') {
          // open/close で値が省略されている場合は、自要素ではなく自要素の
          // 祖先方向で最も近い <dialog> を対象にする。ダイアログ内の閉じる
          // ボタンに data-click-close を値なしで付与しても、ボタン自身では
          // なくダイアログ本体が閉じられるようにするため。
          const dialog = fragment.getTarget().closest('dialog');
          if (dialog) {
            list.push(Fragment.get(dialog));
          } else {
            Log.error('Haori', `Ancestor <dialog> not found (${attrName})`);
          }
        } else {
          // 値が省略されている場合は自要素を対象
          list.push(fragment);
        }
        if (list.length > 0) {
          switch (attrKey) {
            case 'reset-before':
              options.resetBeforeFragments = list;
              break;
            case 'reset':
              options.resetFragments = list;
              break;
            case 'refetch':
              options.refetchFragments = list;
              break;
            case 'click':
              options.clickFragments = list;
              break;
            case 'copy':
              options.copyFragments = list;
              break;
            case 'open':
              options.openFragments = list;
              break;
            case 'close':
              options.closeFragments = list;
              break;
          }
        }
      });

      // copy-source（単一セレクタ）
      const copySourceAttrName = Procedure.attrName(event, 'copy-source');
      if (fragment.hasAttribute(copySourceAttrName)) {
        const selector = Selector.read(fragment, copySourceAttrName);
        if (selector) {
          const el = Selector.query(selector, copySourceAttrName);
          if (el !== null) {
            const frag = Fragment.get(el);
            if (frag) {
              options.copySourceFragment = frag as ElementFragment;
            } else {
              Log.error(
                'Haori',
                `Element is not managed by Haori: ${selector}` +
                  ` (${copySourceAttrName})`,
              );
            }
          } else {
            Log.error(
              'Haori',
              `Element not found: ${selector} (${copySourceAttrName})`,
            );
          }
        } else {
          // 値が省略されている場合は自要素を対象
          options.copySourceFragment = fragment;
        }
      }
    }

    // 非イベントの data / form（data-fetch-data / data-fetch-form）も取り込む
    if (!event) {
      if (fragment.hasAttribute(Procedure.attrName(null, 'data', true))) {
        options.dataAttrName = Procedure.attrName(null, 'data', true);
      }
      if (fragment.hasAttribute(Procedure.attrName(null, 'form', true))) {
        const formSelector = Selector.read(
          fragment,
          Procedure.attrName(null, 'form', true),
        );
        if (formSelector) {
          const formElement = Selector.query(
            formSelector,
            Procedure.attrName(null, 'form', true),
          );
          if (formElement !== null) {
            options.formFragment = Form.getFormFragment(
              Fragment.get(formElement) as ElementFragment,
            );
          } else {
            Log.error(
              'Haori',
              `Form element not found: ${formSelector} (` +
                `${Procedure.attrName(null, 'fetch-form', true)})`,
            );
          }
        } else {
          // 属性はあるが値が省略された場合は自要素もしくは先祖の form を対象
          options.formFragment = Form.getFormFragment(fragment);
        }
      }
    }

    // fetch-state（フェッチ状態 _fetch の注入先。イベント・非イベント双方で
    // 解釈する。値省略時は自要素、CSS セレクタ指定時は該当要素群を対象とする）
    const fetchStateAttrName = event
      ? Procedure.attrName(event, 'fetch-state')
      : Procedure.attrName(null, 'state', true);
    if (fragment.hasAttribute(fetchStateAttrName)) {
      const selector = Selector.read(fragment, fetchStateAttrName);
      const list: ElementFragment[] = [];
      if (selector) {
        const elements = Selector.queryAll(selector, fetchStateAttrName);
        elements.forEach(el => {
          const frag = Fragment.get(el);
          if (frag) {
            list.push(frag as ElementFragment);
          }
        });
        if (list.length === 0) {
          Log.error(
            'Haori',
            `Element not found: ${selector} (${fetchStateAttrName})`,
          );
        }
      } else {
        // 値が省略されている場合は自要素を対象
        list.push(fragment);
      }
      if (list.length > 0) {
        options.fetchStateFragments = list;
      }
    }

    // store-clear（ストレージレコードの破棄。イベント・非イベント双方で解釈する。
    // 属性値はストレージキーで、式は使用できない）
    const storeClearAttrName = event
      ? Procedure.attrName(event, 'store-clear')
      : Procedure.attrName(null, 'store-clear', true);
    if (fragment.hasAttribute(storeClearAttrName)) {
      const rawKey = fragment.getRawAttribute(storeClearAttrName) as
        | string
        | null;
      const key = rawKey === null ? '' : rawKey.trim();
      if (key === '') {
        Log.error(
          'Haori',
          `ストレージキーが指定されていません (${storeClearAttrName})`,
        );
      } else {
        options.storeClearKey = key;
        const rawKind = fragment.getRawAttribute(
          `${storeClearAttrName}-type`,
        ) as string | null;
        const kind = rawKind === null ? 'session' : rawKind.trim();
        if (kind === 'local' || kind === 'session') {
          options.storeClearKind = kind;
        } else {
          Log.warn(
            'Haori',
            `${storeClearAttrName}-type は session または local を指定して` +
              `ください（session として扱います）: ${kind}`,
          );
          options.storeClearKind = 'session';
        }
      }
    }

    // fetch が指定されているのにバインド先が無い場合、デフォルトで自要素にバインド
    if (
      hasFetchAttr &&
      (!options.bindFragments || options.bindFragments.length === 0)
    ) {
      options.bindFragments = [fragment];
      // 明示指定ではなく既定で補った self-bind であることを記録する。
      options.defaultSelfBind = true;
    }
    Procedure.recordRowWriteTargets(options);
    return options;
  }

  /**
   * バインド先・コピー先のうち、編集可能な行にあたるものを記録します。
   *
   * 記録は属性を読んだこの時点で行います。応答が届くまでに行が削除されると親子
   * 関係が失われ、後から「行だったか」を判定できなくなるためです（判定できないと、
   * 消えた行への書き込みを黙って別の場所へ書いてしまいます）。
   *
   * 値が `null` の要素は `data-each-before` / `data-each-after` の固定要素です。
   * 行として扱えないため、書き込み時に警告してスキップします。
   *
   * @param options 記録先の手続きオプション
   * @returns 戻り値はありません。
   */
  private static recordRowWriteTargets(options: ProcedureOptions): void {
    const targets = new Map<ElementFragment, ElementFragment | null>();
    const candidates = [
      ...(options.bindFragments ?? []),
      ...(options.copyFragments ?? []),
    ];
    for (const candidate of candidates) {
      const container = candidate.getParent();
      if (
        !container ||
        !container.hasAttribute(`${Env.prefix}each`) ||
        !container.hasAttribute(`${Env.prefix}form-list`)
      ) {
        // 編集可能な行のコンテナ配下ではない。従来どおり自身へ書き込む。
        continue;
      }
      targets.set(
        candidate,
        Procedure.getRowFragments(container).includes(candidate)
          ? container
          : null,
      );
    }
    if (targets.size > 0) {
      options.rowWriteTargets = targets;
    }
  }

  /**
   * `name` を持つ入力要素（input / select / textarea）のフラグメントかどうかを
   * 判定します。フォームコンテナが無い change / input で、対象要素自身を値収集の
   * 対象としてよいかの判定に使います。
   *
   * @param fragment 判定対象のフラグメント
   * @returns `name` を持つ入力要素の場合は true
   */
  private static isNamedInputFragment(fragment: ElementFragment): boolean {
    const element = fragment.getTarget();
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      return false;
    }
    // `data-form-name` は収集キーを宣言する属性で、DOM の `name` を持たない入力も
    // 値収集の対象になる（ラジオボタンのグループ名と収集キーを分ける構成）。
    return (
      element.getAttribute('name') !== null ||
      fragment.hasAttribute(`${Env.prefix}form-name`)
    );
  }

  /**
   * ElementFragment の構造的タイプガード。
   *
   * @param value チェックする値
   * @returns ElementFragment である場合は true、それ以外は false
   */
  private static isElementFragment(value: unknown): value is ElementFragment {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.getTarget === 'function' &&
      typeof obj.getChildElementFragments === 'function'
    );
  }

  /** オプション */
  private readonly options: ProcedureOptions;

  /**
   * bind 結果の反映（`Core.setBindingData`）を reentrant（即時実行）の候補とするか。
   * マネージド `data-fetch` の自動再評価（`Core.executeManagedFetch`）から生成
   * された Procedure に対して立てる。マネージド fetch はバインドワークの内部
   * （`reevaluateReactiveSpecialAttributes`）から起動・await されるため、その
   * bind が同一フラグメントを指す（`data-fetch-bind` が自身を指す等）場合に
   * FIFO キューへ積むと、実行中のバインドワークと相互に待ち合って自己
   * デッドロックする（0.17.1〜0.17.2 の `data-click-open` 不発の退行）。
   *
   * 実際に reentrant 実行するのは、このフラグに加えて bind 先フラグメントが
   * 実行中のバインドワークを持つ（`isExecutingBindingWork()`）場合に限る。これで
   * 自己デッドロックのみを解消し、idle なフラグメントへの bind は従来どおり FIFO で
   * 適用順を保証する。
   */
  private reentrantBind = false;

  /**
   * フォームコンテナを持たない change / input で、収集値が空だったかどうか。
   * bind による全置換でバインド先を破壊しないための抑止判定に使います。
   * `data-click-bind` などで意図的に空へクリアする使い方は抑止しません。
   */
  private suppressEmptyReplaceBind = false;

  /** reset-before 後に確定した historyData スナップショット */
  private historyDataSnapshot: Record<string, unknown> | null | undefined;

  /**
   * 送信データを確定した時点のユーザー編集の通し番号。
   *
   * 応答をフォームへバインドするとき、この番号より後に編集された入力欄の値は
   * 応答より新しいため、応答データへ上書きし直します。これがないと、送信後に
   * 行った編集が「送信時点の内容を反映した応答」で静かに巻き戻ります。
   */
  private requestUserEditSequence: number | null = null;

  /**
   * 双方向コミット由来のバインドかどうか。
   *
   * `change` / `input` でフェッチを伴わない場合、バインドするデータは入力欄から
   * 収集した値そのものです。これは「外部から新しい値が供給された」のではなく
   * 「編集値をバインドデータへ写した」だけなので、ユーザー編集の印を解除しません
   * （バインド先を指定しない暗黙のコミットと同じ扱い）。解除すると、続く再評価で
   * 宣言バインドが確定済みの編集値を評価結果へ巻き戻します。
   */
  private twoWayCommitBind = false;

  /** reset-before 後に確定した historyForm スナップショット */
  private historyFormSnapshot: Record<string, unknown> | null | undefined;

  /**
   * オプションを指定してProcedureクラスのインスタンスを生成します。
   *
   * @param options オプション
   */
  constructor(options: ProcedureOptions);

  /**
   * フラグメントの属性からオプションを生成してProcedureクラスのインスタンスを生成します。
   *
   * @param fragment フラグメント
   * @param event イベント名
   * @param domEvent 起点となった DOM イベント（data-{event}-run の preventDefault 用）
   */
  constructor(
    fragment: ElementFragment,
    event: string | null,
    domEvent?: Event | null,
  );

  /**
   * コンストラクタ。
   *
   * @param arg1 オプションもしくはフラグメント
   * @param arg2 イベント名
   * @param domEvent 起点となった DOM イベント
   */
  constructor(
    arg1: ProcedureOptions | ElementFragment,
    arg2: string | null = null,
    domEvent: Event | null = null,
  ) {
    if (Procedure.isElementFragment(arg1)) {
      this.options = Procedure.buildOptions(arg1, arg2);
      this.eventType = arg2;
    } else {
      this.options = arg1;
      this.eventType = null;
    }
    this.domEvent = domEvent;
  }

  /**
   * 非イベント data-fetch の自動再評価用シグネチャを解決します。
   *
   * @param fragment 対象フラグメント
   * @returns フェッチシグネチャと未解決参照の有無
   */
  public static resolveAutoFetchSignature(
    fragment: ElementFragment,
  ): ResolvedFetchSignature {
    return new Procedure(fragment, null).resolveFetchSignature();
  }

  /**
   * 一連の処理を実行します。オプションが空の場合は即座にresolveされます。
   *
   * @returns 実行結果のPromise
   */
  run(): Promise<void> {
    return this.runWithResult().then(() => undefined);
  }

  /**
   * bind 結果の反映を reentrant（即時実行）で行うよう指定します。マネージド
   * `data-fetch` の自動再評価から生成した Procedure に対して使います。
   */
  public markReentrantBind(): void {
    this.reentrantBind = true;
  }

  /**
   * 一連の処理を実行し、成功したかどうかを返します。
   *
   * @returns 成功した場合は true、途中停止や失敗時は false
   */
  runWithResult(): Promise<boolean> {
    return this.execute();
  }

  /**
   * 一連の処理を実行します。成功結果を内部で扱うための実体です。
   *
   * @returns 実行成功時は true、停止や失敗時は false
   */
  private async execute(): Promise<boolean> {
    const executionLock = this.acquireExecutionLock();
    if (executionLock === false) {
      return false;
    }

    try {
      if (Object.keys(this.options).length === 0) {
        return false;
      }
      if (
        this.options.formFragment &&
        this.validate(this.options.formFragment) === false
      ) {
        return false;
      }
      if (!this.options.formFragment && this.options.targetFragment) {
        // 検証が走らない構成で data-validity が宣言されていれば開発モードで知らせる。
        // 宣言は対象要素の配下ではなく祖先のフォーム内にあるため、そこを調べる。
        Form.warnUnvalidatedCustomValidity(
          Form.getFormFragment(this.options.targetFragment),
          `${Env.prefix}${this.eventType ?? 'fetch'}-form が解決できません`,
        );
      }
      // data-{event}-if: 手続きの実行条件。ネイティブ検証の後（入力欄単位のエラーを
      // 先に見せる）、data-{event}-run の前（条件が偽なら run の副作用も起こさない）
      // に、属性の再描画を待たず同期評価する。
      if (!this.evaluateExecutionCondition()) {
        return false;
      }
      // data-{event}-run: 任意 JS を同期実行する。await を挟む前に実行することで、
      // クリックイベント中の event.preventDefault() が間に合う。本体が同期的に
      // false を返した場合はデフォルト動作（リンク遷移・フォーム送信）を抑止する。
      // 戻り値が Promise（thenable）の場合は完了まで await し、その間ロック
      // （disabled / RUNNING_CLICK_TARGETS）を保持することで、async ハンドラでも
      // 多重実行（2 度押しによる重複送信等）を防ぐ。await 後に後続処理（fetch 等）へ
      // 進むため、run と fetch を併用した場合は run 完了後に fetch が直列実行される。
      if (this.options.runScript) {
        const sourceElement = this.options.targetFragment?.getTarget() ?? null;
        try {
          const result = this.options.runScript.call(
            sourceElement,
            this.domEvent,
          );
          if (result === false && this.domEvent) {
            this.domEvent.preventDefault();
          }
          // 戻り値が thenable の場合のみ完了を待つ。preventDefault は同期段で確定
          // 済みのため、ここでの await は多重実行防止（ロック保持）のためだけに行う。
          if (
            result != null &&
            typeof (result as {then?: unknown}).then === 'function'
          ) {
            await result;
          }
        } catch (e) {
          Log.error('Haori', `Run script execution error: ${e}`);
        }
      }
      const confirmed = await this.confirm();
      if (!confirmed) {
        return false;
      }
      if (
        this.options.resetBeforeFragments &&
        this.options.resetBeforeFragments.length > 0
      ) {
        await Promise.all(
          this.options.resetBeforeFragments.map(fragment =>
            Form.reset(fragment),
          ),
        );
        this.captureHistorySnapshots();
      }
      const preparedRequest = this.prepareFetchRequest();
      // 送信データを確定した時点を記録する。ここから後の編集は応答より新しいので、
      // 応答をフォームへバインドするときに上書きし直す。シグネチャ比較のための
      // 事前組み立て（resolveFetchSignature）では記録せず、実際に送る経路でだけ
      // 記録する。
      this.requestUserEditSequence = ElementFragment.currentUserEditSequence();
      const payload = preparedRequest.payload;
      let fetchUrl = preparedRequest.url;
      let fetchOptions = preparedRequest.options;
      let urlOverridden = false;
      let optionsOverridden = false;
      if (this.options.beforeCallback) {
        const result = this.options.beforeCallback(
          fetchUrl || null,
          fetchOptions || null,
        );
        if (result !== undefined && result !== null) {
          if (result === false || (typeof result === 'object' && result.stop)) {
            return false;
          }
          if (typeof result === 'object') {
            urlOverridden = 'fetchUrl' in result;
            optionsOverridden = 'fetchOptions' in result;
            fetchUrl = (urlOverridden ? result.fetchUrl : fetchUrl) as
              | string
              | null;
            fetchOptions = (
              optionsOverridden ? result.fetchOptions : fetchOptions
            ) as RequestInit | null;
          }
        }
      }

      const hasPayload = Object.keys(payload).length > 0;
      if (fetchUrl) {
        // demo ランタイムの正規化は送信直前にもう一度適用する。
        // `data-{event}-before-run` の `fetchOptions` 上書きは prepareFetchRequest
        // の後に適用されるため、ここで再適用しないと上書きが正規化を打ち消し、
        // 静的ファイルサーバへ実 POST が飛んで 405 になる。すでに正規化済み
        // （メソッドが GET）なら何もしないため、通常経路への影響はない。
        //
        // 上書きが body を持つ場合は、その body が送信データの置き換えになる
        // （embedded ランタイムでは body ごと差し替わる）。demo ランタイムでは
        // 送信データを URL のクエリへ移してあるため、そのまま再正規化すると
        // 置き換えではなく追記になり、同じキーが二重に載る。基点を正規化前の
        // URL へ戻して embedded と同じ「置き換え」に揃える。`fetchUrl` も
        // 上書きされた場合は、その URL をそのまま尊重する。
        //
        // 基点を戻すのは、上書きの body が実際にクエリへ移る場合だけに限る。
        // 上書きがメソッドを GET のままにして body を付けた場合、再正規化は
        // 何もしないため body はクエリにならず、収集済みの送信データだけが
        // 消えてしまう（この組み合わせは fetch 自体が TypeError になる）。
        const overrideMethod = (
          fetchOptions?.method || 'GET'
        ).toUpperCase();
        const overrideReplacesPayload =
          !urlOverridden &&
          optionsOverridden &&
          preparedRequest.transportMode === 'query-get' &&
          hasRequestBody(fetchOptions) &&
          !isQueryTransportMethod(overrideMethod);
        const normalizeBase = overrideReplacesPayload
          ? (preparedRequest.baseUrl ?? fetchUrl)
          : fetchUrl;
        const renormalized = normalizeRequestForDemoRuntime(
          normalizeBase,
          fetchOptions,
        );
        fetchUrl = renormalized.url;
        const finalOptions: RequestInit = {...renormalized.options};
        // 正規化前に要求されていたメソッドは、上書きが無ければ
        // prepareFetchRequest 段階の値が本来の要求値になる。
        const requestedMethod = renormalized.normalized
          ? renormalized.requestedMethod
          : preparedRequest.requestedMethod;
        const method = renormalized.effectiveMethod;
        const isDemoQueryNormalization =
          preparedRequest.transportMode === 'query-get' ||
          renormalized.normalized;
        const queryString =
          renormalized.queryString ?? preparedRequest.queryString;

        if (isDemoQueryNormalization) {
          Log.info('Haori demo fetch normalization', {
            runtime: Env.runtime,
            requestedMethod,
            effectiveMethod: method,
            transportMode: 'query-get',
            url: fetchUrl,
            payload: hasPayload ? payload : undefined,
            queryString,
          });
        }

        // fetchstartイベントを発火
        if (this.options.targetFragment && fetchUrl) {
          const startedAt = performance.now();
          const fetchStartMetadata = {
            runtime: Env.runtime,
            requestedMethod,
            effectiveMethod: method,
            transportMode: isDemoQueryNormalization ? 'query-get' : 'http',
            ...(isDemoQueryNormalization ? {queryString} : {}),
          };

          HaoriEvent.fetchStart(
            this.options.targetFragment.getTarget(),
            fetchUrl,
            finalOptions,
            hasPayload ? payload : undefined,
            fetchStartMetadata,
          );

          // フェッチ開始: loading 状態を注入する。
          await this.injectFetchState('loading');

          return fetch(fetchUrl, finalOptions)
            .then(response => {
              return this.handleFetchResult(
                response,
                fetchUrl || undefined,
                startedAt,
              );
            })
            .catch(async error => {
              if (fetchUrl) {
                HaoriEvent.fetchError(
                  this.options.targetFragment!.getTarget(),
                  fetchUrl,
                  error,
                );
              }
              // ネットワーク断・タイムアウト等: error 状態を注入する。
              await this.injectFetchState(
                'error',
                null,
                error instanceof Error ? error.message : String(error),
              );
              throw error;
            });
        }
        return fetch(fetchUrl, finalOptions).then(response => {
          return this.handleFetchResult(response, fetchUrl || undefined);
        });
      }

      // fetchUrlが無い場合(changeイベント等)、bindFragmentsが無ければformFragmentにバインド
      if (
        (!this.options.bindFragments ||
          this.options.bindFragments.length === 0) &&
        this.options.formFragment &&
        hasPayload
      ) {
        // 双方向バインディング: フォーム値を自動的にバインディングデータに反映
        const formFragment = this.options.formFragment;
        const formElement = formFragment.getTarget();
        const skipFragments = new Set<ElementFragment>();
        if (
          executionLock &&
          executionLock.appliedDisabledAttribute &&
          this.options.targetFragment
        ) {
          skipFragments.add(this.options.targetFragment);
        }

        // 土台はフォーム自身のバインドデータに限る。`getBindingData()` は祖先との
        // マージ結果（かつキャッシュそのもの）なので、それを書き込むと祖先のキーが
        // フォームへ焼き付き、以降その祖先の更新がフォーム自身の古いコピーに
        // シャドーされて届かなくなる。
        const bindingData: Record<string, unknown> = {
          ...(formFragment.getRawBindingData() ?? {}),
        };
        // File / Blob はバインドデータへ入れると JSON 化で `{}` に潰れ
        // `data-bind` 属性を壊すため、ファイル名へ正規化して反映する。
        const formValues = sanitizeBinaryForBinding(payload);
        // data-form-arg 指定時は、そのキー配下が入力欄と対応する（Core.changeValue
        // と Form.reset の書き込み先に合わせる）。平坦に書くと参照キーと書込キーが
        // 食い違い、宣言バインドの参照元が更新されない。
        const formArg = formFragment.getAttribute(`${Env.prefix}form-arg`);
        if (formArg) {
          const key = String(formArg);
          // 祖先が当該キーを所有する場合はその値を土台に収集値を重ねる。収集値だけで
          // 置き換えると入力欄に無いフィールド（`id` など）が抜け落ち、このコピーが
          // 祖先をシャドーするためフォーム内の式から参照できなくなる。祖先が当該キーを
          // 更新したときはコピーを解除して入れ直すため（`Form.syncAncestorArgForms()`）、
          // 古い値が残り続けることはない。
          const ancestor = Form.resolveAncestorArgOwner(formFragment, key);
          bindingData[key] = ancestor
            ? {...ancestor.value, ...formValues}
            : formValues;
        } else {
          Object.assign(bindingData, formValues);
        }
        // 双方向コミットは値の供給ではないため、ユーザー編集の印は解除しない。
        // 解除すると、この再評価で宣言バインドが編集値を評価結果へ巻き戻す。
        await Core.setBindingData(
          formElement,
          bindingData,
          skipFragments,
          false,
          true,
          null,
        );
      }

      // フォームコンテナを持たない change / input で収集値が空のまま bind すると、
      // 全置換でバインド先を破壊するため bindResult 側で抑止できるよう記録する。
      this.suppressEmptyReplaceBind =
        !hasPayload &&
        !this.options.formFragment &&
        (this.eventType === 'change' || this.eventType === 'input');
      // ここはフェッチ URL が無い経路なので、`change` / `input` のバインドは
      // 収集した編集値をそのまま写す双方向コミットである。値の供給ではないため、
      // 後続の bindResult でユーザー編集の印を解除しない（上の暗黙コミットと同じ）。
      this.twoWayCommitBind =
        this.eventType === 'change' || this.eventType === 'input';
      // File / Blob はバインドデータへ入れると JSON 化で `{}` に潰れるため、
      // ファイル名へ正規化してから bind する（送信用の payload には影響しない）。
      const merged = hasPayload ? sanitizeBinaryForBinding(payload) : {};
      const response = new Response(JSON.stringify(merged), {
        headers: {'Content-Type': 'application/json'},
      });
      return this.handleFetchResult(response);
    } finally {
      this.releaseExecutionLock(executionLock);
    }
  }

  /**
   * click 手続きの重複実行を防ぐためのロックを取得します。
   *
   * @returns ロック情報。取得不要なら null、取得失敗なら false。
   */
  private acquireExecutionLock(): ExecutionLockState | null | false {
    if (this.eventType !== 'click' || !this.options.targetFragment) {
      return null;
    }

    const targetFragment = this.options.targetFragment;
    const target = targetFragment.getTarget();
    if (
      Procedure.RUNNING_CLICK_TARGETS.has(target) ||
      target.matches(':disabled') ||
      target.hasAttribute('disabled') ||
      target.hasAttribute(PROCEDURE_CLICK_LOCK_MARKER)
    ) {
      return false;
    }

    // data-click-no-disabled が指定されている場合は native disabled を付与しない。
    // Bootstrap など他ライブラリの click ハンドラや CSS が disabled 要素を無視する
    // 問題を避けつつ、内部マーカーと RUNNING_CLICK_TARGETS で多重実行は防止する。
    const skipDisabled = target.hasAttribute(`${Env.prefix}click-no-disabled`);

    Procedure.RUNNING_CLICK_TARGETS.add(target);
    target.setAttribute(PROCEDURE_CLICK_LOCK_MARKER, '');
    if (!skipDisabled) {
      target.setAttribute('disabled', '');
    }
    return {
      target,
      appliedDisabledAttribute: !skipDisabled,
    };
  }

  /**
   * 取得済みの実行ロックを解放します。
   *
   * @param executionLock 解放対象のロック情報。
   * @returns 戻り値はありません。
   */
  private releaseExecutionLock(
    executionLock: ExecutionLockState | null | false,
  ): void {
    if (!executionLock) {
      return;
    }

    Procedure.RUNNING_CLICK_TARGETS.delete(executionLock.target);
    // マーカーは常に解除する（解除し損ねると再クリックできなくなるため）。
    executionLock.target.removeAttribute(PROCEDURE_CLICK_LOCK_MARKER);
    if (executionLock.appliedDisabledAttribute) {
      executionLock.target.removeAttribute('disabled');
    }
  }

  /**
   * フェッチ後の処理を実行します。
   */
  private async handleFetchResult(
    response: Response,
    url?: string,
    startedAt?: number,
  ): Promise<boolean> {
    const activeHaori = resolveProcedureHaoriApi();
    // エラー応答時は以後の処理を停止し、メッセージを伝播
    if (!response.ok) {
      // 認証エラー（401/403）はグローバル属性に従いログイン等へ遷移する。
      // 遷移する場合は以後の処理（エラー表示等）を行わず停止する。
      if (checkAuthRedirect(response.status)) {
        return false;
      }
      if (this.options.targetFragment && url) {
        HaoriEvent.fetchError(
          this.options.targetFragment.getTarget(),
          url,
          new Error(`${response.status} ${response.statusText}`),
          response.status,
          startedAt,
        );
      }
      await this.handleFetchError(response);
      // HTTP エラー応答（4xx/5xx）: error 状態を注入する。
      await this.injectFetchState(
        'error',
        response.status,
        response.statusText || null,
      );
      return false;
    }

    // fetchendイベントを発火
    if (this.options.targetFragment && url && startedAt) {
      HaoriEvent.fetchEnd(
        this.options.targetFragment.getTarget(),
        url,
        response.status,
        startedAt,
      );
    }

    if (this.options.afterCallback) {
      const result = this.options.afterCallback(response);
      if (result !== undefined && result !== null) {
        if (result === false || (typeof result === 'object' && result.stop)) {
          return false;
        }
        if (typeof result === 'object' && 'response' in result) {
          response = (
            'response' in result ? result.response : response
          ) as Response;
        }
      }
    }
    const promises: Promise<unknown>[] = [];
    promises.push(this.bindResult(response));
    promises.push(this.adjust());
    promises.push(this.addRow());
    promises.push(this.removeRow());
    promises.push(this.movePrevRow());
    promises.push(this.moveNextRow());
    await Promise.all(promises);

    // フェッチ成功: success 状態を注入する（bind 反映後に行い、注入先が
    // bind 対象自身でも _fetch が最新データへ載るようにする）。
    await this.injectFetchState('success', response.status, null);

    if (this.options.resetFragments && this.options.resetFragments.length > 0) {
      await Promise.all(
        this.options.resetFragments.map(fragment => Form.reset(fragment)),
      );
    }

    await this.copy();

    const deferredPromises: Promise<unknown>[] = [];
    if (
      this.options.refetchFragments &&
      this.options.refetchFragments.length > 0
    ) {
      this.options.refetchFragments.forEach(fragment => {
        deferredPromises.push(new Procedure(fragment, null).run());
      });
    }
    if (this.options.clickFragments && this.options.clickFragments.length > 0) {
      // bind 後の最新 DOM を参照させるため click 前に再評価する。
      // 複数フラグメントは直列実行：各 click が前の evaluateAll 完了後に発火する。
      for (const fragment of this.options.clickFragments) {
        await Core.evaluateAll(fragment);
        const target = fragment.getTarget();
        if (typeof target.click === 'function') {
          target.click();
        } else {
          target.dispatchEvent(
            new MouseEvent('click', {bubbles: true, cancelable: true}),
          );
        }
      }
    }
    if (this.options.openFragments && this.options.openFragments.length > 0) {
      this.options.openFragments.forEach(fragment => {
        const target = fragment.getTarget();
        if (target instanceof HTMLElement) {
          deferredPromises.push(activeHaori.openDialog(target));
        } else {
          Log.error('Haori', 'Element is not an HTML element: ', target);
        }
      });
    }
    if (this.options.closeFragments && this.options.closeFragments.length > 0) {
      this.options.closeFragments.forEach(fragment => {
        const target = fragment.getTarget();
        if (target instanceof HTMLElement) {
          deferredPromises.push(activeHaori.closeDialog(target));
        } else {
          Log.error('Haori', 'Element is not an HTML element: ', target);
        }
      });
    }
    // 仕様順序: 先に各種操作（bind/adjust/row/reset/refetch/click/open/close）を完了
    await Promise.all(deferredPromises);
    // その後にダイアログ/トーストを表示
    if (this.options.dialogMessage) {
      await activeHaori.dialog(this.options.dialogMessage);
    }
    if (this.options.toastMessage) {
      await activeHaori.toast(
        this.options.toastMessage,
        this.options.toastLevel ?? 'info',
      );
    }
    this.clearStore();
    this.pushHistory();
    if (this.options.scrollTarget) {
      const el = Selector.query<HTMLElement>(
        this.options.scrollTarget,
        Procedure.attrName(this.eventType, 'scroll'),
        document,
      );
      el?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }
    if (this.options.redirectUrl) {
      let destination = this.options.redirectUrl;
      // 戻り先クエリ名が指定されていれば、安全なローカルパスのみ遷移先に採用する。
      const returnParam = this.options.redirectReturnParam;
      if (returnParam) {
        // クエリ値は URLSearchParams で1回だけデコードして読み取る（二重デコード回避）。
        const params = new URLSearchParams(window.location.search);
        const raw = params.get(returnParam);
        if (raw !== null) {
          const trimmed = raw.trim();
          if (Url.isSafeLocalPath(trimmed)) {
            destination = trimmed;
          } else {
            Log.warn(
              'Haori',
              '戻り先パスが安全なローカルパスではないため、既定の遷移先へ' +
                `フォールバックします: ${raw}`,
            );
          }
        }
      }
      window.location.href = destination;
    }
    return true;
  }

  /**
   * `data-{event}-store-clear` で指定されたストレージレコードを破棄します。
   *
   * 破棄後もミラーは停止せず、宣言要素の書き出し基準を現在値へ更新します
   * （以後は値が変わったときだけ再保存されます）。未指定の場合は何もしません。
   */
  private clearStore(): void {
    const key = this.options.storeClearKey;
    if (!key) {
      return;
    }
    Store.clear(key, this.options.storeClearKind ?? 'session');
  }

  /**
   * history.pushState を実行します。
   *
   * `historyUrl` / `historyData` / `historyFormFragment` の内容を基に URL を組み立て、
   * `history.pushState()` を呼び出します。いずれも未指定の場合は何もしません。
   * 不正 URL・オリジン違反・例外は `Log.error` でログ出力してスキップし、後続処理は継続します。
   */
  private pushHistory(): void {
    const hasHistoryUrl =
      this.options.historyUrl !== undefined && this.options.historyUrl !== null;
    const historyDataValues = this.resolveHistoryDataValues();
    const historyFormValues = this.resolveHistoryFormValues();
    const hasHistoryData =
      historyDataValues !== undefined && historyDataValues !== null;
    const hasHistoryForm =
      historyFormValues !== undefined && historyFormValues !== null;

    if (!hasHistoryUrl && !hasHistoryData && !hasHistoryForm) {
      return;
    }

    try {
      const baseUrlString = hasHistoryUrl
        ? (this.options.historyUrl as string)
        : window.location.pathname;
      const url = new URL(baseUrlString, window.location.href);

      if (url.origin !== window.location.origin) {
        const errorMessage =
          'history.pushState: cross-origin URL is not allowed: ' +
          url.toString();
        Log.error('Haori', errorMessage);
        return;
      }

      const appendParams = (values: Record<string, unknown>): void => {
        for (const [k, v] of Object.entries(values)) {
          if (v === undefined || v === null) {
            continue;
          }
          if (Array.isArray(v)) {
            v.forEach(item => url.searchParams.append(k, String(item)));
          } else if (typeof v === 'object') {
            url.searchParams.set(k, JSON.stringify(v));
          } else {
            url.searchParams.set(k, String(v));
          }
        }
      };

      if (hasHistoryData) {
        appendParams(historyDataValues as Record<string, unknown>);
      }
      if (hasHistoryForm) {
        appendParams(historyFormValues as Record<string, unknown>);
      }

      history.pushState(
        {[PROCEDURE_HISTORY_STATE_KEY]: true},
        '',
        url.toString(),
      );
    } catch (e) {
      Log.error('Haori', `history.pushState failed: ${e}`);
    }
  }

  /**
   * フェッチエラー応答のメッセージを適切な要素へ伝播します。
   */
  private async handleFetchError(response: Response): Promise<boolean> {
    // ベースとなるフォーム/フラグメントを決定
    let baseFragment: ElementFragment | null = null;
    if (this.options.formFragment) {
      baseFragment = this.options.formFragment;
    } else if (this.options.targetFragment) {
      baseFragment =
        Form.getFormFragment(this.options.targetFragment) ||
        this.options.targetFragment;
    }

    // フェッチ単位で既存メッセージを1度だけクリアする。
    // 再試行のたびにエラー表示が積み増される（累積する）のを防ぐため、
    // メッセージ描画を始める前に対象スコープを初期化する。
    // 同一応答内の複数メッセージはクリア後に追加されるため従来どおり並ぶ。
    // baseFragment が無い場合は document.body を対象とし、ページ全体の
    // 管理メッセージをクリアする（広く許容する方針）。
    const clearTarget = baseFragment ? baseFragment.getTarget() : document.body;
    await resolveProcedureHaoriApi().clearMessages(clearTarget);

    const addGeneralMessage = async (message: string) => {
      const targetEl = baseFragment ? baseFragment.getTarget() : document.body;
      await resolveProcedureHaoriApi().addErrorMessage(targetEl, message);
    };

    const scrollToFirstError = () => {
      if (!this.options.scrollOnError) {
        return;
      }
      const root = baseFragment ? baseFragment.getTarget() : document.body;
      // addErrorMessage はフォーム以外の target に対して parentElement へエラーを付与するため、
      // root 自身・parentElement・root 配下の順で探索する
      const errorTarget =
        root.getAttribute('data-message-level') === 'error'
          ? root
          : root.parentElement?.getAttribute('data-message-level') === 'error'
            ? root.parentElement
            : root.querySelector<HTMLElement>('[data-message-level="error"]');
      errorTarget?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    };

    // コンテンツタイプに応じて解析
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        // 代表的な形式に対応
        const entries: Array<{key?: string; message: string}> = [];
        if (Array.isArray(data)) {
          // トップレベル JSON 配列 [{ "key": "field", "message": "..." }] 形式
          // （一部のサーバ実装が返す例外ハンドラ／バリデーションメッセージ等）。
          // 各要素を errors と同等に扱い、key へ振り分ける。
          // 同一 key は改行連結し、key 省略要素はフォーム全体エラーとする。
          // ステータスコードには依存しない（400 だけでなく 409 等でも振り分く）。
          const byKey = new Map<string, string[]>();
          const general: string[] = [];
          for (const item of data) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              const rawKey = (item as Record<string, unknown>).key;
              const rawMessage = (item as Record<string, unknown>).message;
              const key =
                typeof rawKey === 'string' && rawKey.length > 0 ? rawKey : null;
              const message =
                typeof rawMessage === 'string'
                  ? rawMessage
                  : rawMessage != null
                    ? String(rawMessage)
                    : '';
              if (message.length === 0) {
                continue;
              }
              if (key !== null) {
                const list = byKey.get(key) ?? [];
                list.push(message);
                byKey.set(key, list);
              } else {
                general.push(message);
              }
            } else if (typeof item === 'string' && item.length > 0) {
              general.push(item);
            }
          }
          for (const [k, msgs] of byKey) {
            entries.push({key: k, message: msgs.join('\n')});
          }
          for (const m of general) {
            entries.push({message: m});
          }
        } else if (data && typeof data === 'object') {
          if (typeof data.message === 'string') {
            entries.push({message: data.message});
          }
          if (Array.isArray(data.messages)) {
            for (const m of data.messages) {
              if (typeof m === 'string') {
                entries.push({message: m});
              }
            }
          }
          if (data.errors && typeof data.errors === 'object') {
            for (const [k, v] of Object.entries(data.errors)) {
              if (Array.isArray(v)) {
                entries.push({key: k, message: v.join('\n')});
              } else if (typeof v === 'string') {
                entries.push({key: k, message: v});
              } else if (v != null) {
                entries.push({key: k, message: String(v)});
              }
            }
          }
          // キー: 値（文字列/配列）形式にフォールバック
          if (entries.length === 0) {
            for (const [k, v] of Object.entries(data)) {
              if (k === 'message' || k === 'messages' || k === 'errors') {
                continue;
              }
              if (Array.isArray(v)) {
                entries.push({key: k, message: v.join('\n')});
              } else if (typeof v === 'string') {
                entries.push({key: k, message: v});
              }
            }
          }
        }
        if (entries.length === 0) {
          // 汎用メッセージ
          await addGeneralMessage(`${response.status} ${response.statusText}`);
          scrollToFirstError();
          return false;
        }
        // メッセージを反映
        for (const e of entries) {
          if (e.key && baseFragment) {
            await Form.addErrorMessage(baseFragment, e.key, e.message);
          } else {
            await addGeneralMessage(e.message);
          }
        }
        scrollToFirstError();
        return false;
      } catch {
        // JSON 解析失敗時はテキストにフォールバック
      }
    }
    // テキストとして処理
    try {
      const text = await response.text();
      if (text && text.trim().length > 0) {
        await addGeneralMessage(text.trim());
      } else {
        await addGeneralMessage(`${response.status} ${response.statusText}`);
      }
    } catch {
      await addGeneralMessage(`${response.status} ${response.statusText}`);
    }
    scrollToFirstError();
    return false;
  }

  /**
   * 対象のフラグメント以下の入力要素に対してバリデーションを実行します。
   * バリデーションエラーがある場合は、最初のエラー要素にフォーカスを移動します。
   *
   * @param fragment 対象のフラグメント
   * @returns バリデーション結果（true: 成功, false: 失敗）
   */
  validate(fragment: ElementFragment): boolean {
    if (this.options.valid !== true) {
      Form.warnUnvalidatedCustomValidity(
        fragment,
        `${Env.prefix}${this.eventType ?? 'fetch'}-validate の指定がありません`,
      );
      return true;
    }
    // data-validity の条件を検証の直前に同期評価して setCustomValidity へ反映する。
    // 属性の再描画（requestAnimationFrame）に任せると、直前に直した入力が
    // クリック時点では反映されておらず、判定を誤る。
    Form.applyCustomValidity(fragment);
    const firstInvalid = this.findFirstInvalid(fragment);
    if (firstInvalid === null) {
      return true;
    }
    // 検出フェーズ（findFirstInvalid）は checkValidity で副作用なく走査済み。
    // reportValidity と focus は確定した 1 要素にだけ呼び出す。
    (
      firstInvalid as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    ).reportValidity();
    firstInvalid.focus();
    if (this.options.scrollOnError) {
      firstInvalid.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }
    return false;
  }

  /**
   * `data-{event}-if` の実行条件を評価します。
   *
   * 評価スコープはバインディングデータ（継承込み）にフォームの収集値を重ねた値です
   * （`Form.buildConditionScope()`）。クリック時点で最新なのは収集値だけなので、
   * 直前に変更した入力を必ず条件へ含められます。
   *
   * 参照が解決できない場合は「条件を満たしていない」と扱い実行しません。ブロック
   * 目的の宣言なので、解決できないときは安全側へ倒します。
   *
   * @param quiet ログを出さずに判定だけ行う（シグネチャ算出からの呼び出し用）
   * @returns 実行してよい場合は true
   */
  private evaluateExecutionCondition(quiet = false): boolean {
    const expression = this.options.conditionExpression;
    if (!expression) {
      return true;
    }
    const fragment = this.options.targetFragment;
    if (!fragment) {
      return true;
    }
    const attributeName =
      this.options.conditionAttributeName ?? `${Env.prefix}if`;
    // 収集値を重ねたスコープで評価する。クリック時点で最新なのは収集値だけなので、
    // 直前に変更した入力を必ず条件へ含められる。
    const scope = Form.buildConditionScope(
      fragment,
      this.options.formFragment ?? null,
    );
    const result = Expression.evaluateDetailed(expression, scope);
    if (result.unresolvedReference) {
      if (!quiet) {
        Log.warn(
          'Haori',
          `${attributeName} の参照が解決できないため実行しません: ${expression}`,
        );
      }
      return false;
    }
    if (!result.value) {
      if (!quiet && Dev.isEnabled()) {
        Log.warn(
          'Haori',
          `${attributeName} の条件が偽のため手続きを中断しました: ${expression}`,
        );
      }
      return false;
    }
    return true;
  }

  /**
   * 対象フラグメント以下で DOM 順の最上部にある invalid 要素を返します。
   * 副作用のない checkValidity のみを使用し、検出のみを行います。
   *
   * @param fragment 対象のフラグメント
   * @returns 最初の invalid 要素、なければ null
   */
  private findFirstInvalid(fragment: ElementFragment): HTMLElement | null {
    // data-if が偽の分岐（data-if-false 属性付き）配下は検証対象外とする。値収集
    // （Form.getValues）と基準を揃える。非表示のあいだは配下の入力へ disabled を
    // 付けて制約検証から外しているため通常はここへ到達しないが、非表示になった後に
    // 差し込まれた要素まで取りこぼさないよう、走査でも除外する。
    if (fragment.getTarget().hasAttribute(`${Env.prefix}if-false`)) {
      return null;
    }
    // 子要素を逆順に処理することで、DOM 順の先頭要素が最後に found を上書きし、
    // 最終的に最上部の invalid 要素が返る
    let found: HTMLElement | null = null;
    for (const child of fragment.getChildElementFragments().reverse()) {
      const result = this.findFirstInvalid(child);
      if (result !== null) {
        found = result;
      }
    }
    // 自身は子より DOM 上位にあるため、invalid なら子の結果を上書きする
    if (!this.checkOne(fragment)) {
      return fragment.getTarget();
    }
    return found;
  }

  /**
   * 対象のフラグメントに対して、副作用なく有効性を検査します。
   * reportValidity は使わず checkValidity のみ呼び出します。
   *
   * @param fragment 対象のフラグメント
   * @returns 有効なら true、無効なら false
   */
  private checkOne(fragment: ElementFragment): boolean {
    const target = fragment.getTarget();
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return target.checkValidity();
    }
    return true;
  }

  /**
   * 確認メッセージを表示し、ユーザーの確認を求めます。
   * メッセージが設定されていない場合は、即座に成功とみなします。
   *
   * @returns ユーザーの確認結果を含むPromise（true: 確認, false: キャンセル）
   */
  private confirm(): Promise<boolean> {
    const message = this.options.confirmMessage;
    if (message === null || message === undefined) {
      return Promise.resolve(true);
    }
    return resolveProcedureHaoriApi().confirm(message);
  }

  /**
   * 結果データを対象のフラグメントにバインドします。
   *
   * @param response フェッチのレスポンスオブジェクト
   */
  private bindResult(response: Response): Promise<void> {
    if (
      !this.options.bindFragments ||
      this.options.bindFragments.length === 0
    ) {
      return Promise.resolve();
    }
    const isJson = response.headers
      .get('Content-Type')
      ?.includes('application/json');
    return response.text().then(text => {
      // 2xx 空ボディ（204 No Content / 本文なし 200 / Spring の void 戻り値等）は
      // バインド対象が無いものとして正常スキップする。fetch 時の既定 self-bind
      // により bindFragments が自要素へ設定されていても、ここで reject すると
      // handleFetchResult の後続処理（toast / close / click / refetch）まで
      // Promise.all 経由で巻き込んで止めてしまうため、空ボディは resolve で抜ける。
      if (text === '') {
        return undefined;
      }
      // 非空ボディのみパースする。非 JSON はそのまま文字列として扱い、
      // 不正 JSON は JSON.parse の throw により従来どおり reject させる。
      let data = isJson ? JSON.parse(text) : text;
      // bind-transform: バインド前にレスポンス全体を式変換する（`response` で参照）。
      // bind-params / bind-arg / bind-append より前に適用する。
      if (this.options.bindTransform) {
        try {
          data = Expression.evaluate(this.options.bindTransform, {
            response: data,
          });
        } catch (e) {
          Log.error('Haori', `Invalid bind-transform: ${e}`);
        }
      }
      if (this.options.bindParams) {
        const newData = {} as Record<string, unknown>;
        this.options.bindParams.forEach(param => {
          if (data && typeof data === 'object' && param in data) {
            newData[param] = data[param];
          }
        });
        data = newData;
      }
      // フォームコンテナを持たない change / input で収集値が空だった場合、そのまま
      // bind するとバインド先を空オブジェクトで全置換し、既存の表示データを破壊して
      // しまう（`name` の付け忘れが典型）。キー指定（bind-arg）やマージ（bind-merge）が
      // ある場合は「空で置く」意図が明確なので従来どおり反映し、全置換のみ抑止する。
      //
      // 抑止はこの経路に限定する。`data-click-bind` で意図的にバインド先を空へ
      // クリアする使い方は従来どおり有効に保つ。
      if (
        this.suppressEmptyReplaceBind &&
        !this.options.bindArg &&
        !this.options.bindMerge &&
        data !== null &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Object.keys(data as Record<string, unknown>).length === 0
      ) {
        Log.warn(
          'Haori',
          'Skipped binding because the input has no value to collect;' +
            ' the bind target would be replaced with an empty object.' +
            ' Add a name attribute to the input, or specify' +
            ` ${Env.prefix}${this.eventType}-form.`,
        );
        return undefined;
      }
      const promises: Promise<unknown>[] = [];
      // 行を指したバインドは配列の要素データへ書き戻す（`applyRowWrites()`）。
      const bindAttributeName = this.eventType
        ? Procedure.attrName(this.eventType, 'bind')
        : Procedure.attrName(null, 'bind', true);
      const rowWrites: RowWrite[] = [];
      if (this.options.bindArg) {
        this.options.bindFragments!.forEach(fragment => {
          const resolution = this.resolveRowWrite(fragment, bindAttributeName);
          if (resolution.kind === 'skip') {
            return;
          }
          if (resolution.kind === 'row') {
            const bindArg = this.options.bindArg as string;
            rowWrites.push({
              container: resolution.container,
              row: fragment,
              attributeName: bindAttributeName,
              apply: item => {
                const next = {...item};
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                  const currentValue = item[bindArg];
                  const currentObject =
                    currentValue !== null &&
                    typeof currentValue === 'object' &&
                    !Array.isArray(currentValue)
                      ? (currentValue as Record<string, unknown>)
                      : {};
                  next[bindArg] = this.mergeAppendBindingData(
                    fragment,
                    data as Record<string, unknown>,
                    currentObject,
                  );
                } else {
                  next[bindArg] = data;
                }
                return this.reconcileRowUserEdits(fragment, next);
              },
            });
            return;
          }
          // バインド先の「自身の」最新 binding（getRawBindingData）を基底にして
          // bindArg キーだけを更新する。getBindingData()（継承込み）を基底にすると
          // 継承キーが own の data-bind に混入してしまうため、own のみを対象にする。
          // 読み取り〜書き込み（fragment.setBindingData）は await を挟まず同期で行われ、
          // 並行・リアクティブな複数 bind-arg が重なっても呼び出し単位で原子的に
          // 反映される（各呼び出しは直前の更新後の最新 own を読む）。
          const bindingData = {...(fragment.getRawBindingData() ?? {})};
          const bindArg = this.options.bindArg as string;
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            const currentValue = bindingData[bindArg];
            const currentObject =
              currentValue &&
              typeof currentValue === 'object' &&
              !Array.isArray(currentValue)
                ? (currentValue as Record<string, unknown>)
                : {};
            bindingData[bindArg] = this.mergeAppendBindingData(
              fragment,
              data as Record<string, unknown>,
              currentObject,
            );
          } else {
            bindingData[bindArg] = data;
          }
          promises.push(
            Core.setBindingData(
              fragment.getTarget(),
              this.reconcileUserEditsForBind(fragment, bindingData),
              new Set(),
              // マネージド fetch の bind かつ、bind 先が実行中のバインドワークを
              // 持つ（= 自分自身を await している）ときだけ reentrant（即時実行）に
              // する。これで自己デッドロックのみを解消し、idle なフラグメントへの
              // bind は従来どおり FIFO で適用順を保証する。
              this.reentrantBind && fragment.isExecutingBindingWork(),
              true,
              // ユーザー編集の印は reconcileUserEditsForBind が送信時点を基準に
              // 解除済み。ここで既定の全解除を行うと、応答より後の編集まで巻き戻る。
              null,
            ),
          );
        });
      } else if (typeof data === 'string') {
        // 既定 self-bind（バインド先未指定で自要素を補ったケース）では、ユーザーは
        // bind を意図していない（fetch して toast/close/reload だけしたい）ことが
        // 多い。bind できない文字列応答が返っても reject すると handleFetchResult
        // の後続（toast / close / click / refetch）を巻き込んで止めてしまうため、
        // 警告にとどめてスキップする。一方、明示的に bind 先を指定した場合は
        // bindArg 無しの文字列 bind は誤用なので従来どおり reject して気付けるようにする。
        if (this.options.defaultSelfBind) {
          Log.warn(
            'Haori',
            'string data is not bound because no bind target was specified.',
          );
          return undefined;
        }
        Log.error('Haori', 'string data cannot be bound without a bindArg.');
        return Promise.reject(
          new Error('string data cannot be bound without a bindArg.'),
        );
      } else {
        this.options.bindFragments!.forEach(fragment => {
          const resolution = this.resolveRowWrite(fragment, bindAttributeName);
          if (resolution.kind === 'skip') {
            return;
          }
          if (resolution.kind === 'row') {
            rowWrites.push({
              container: resolution.container,
              row: fragment,
              attributeName: bindAttributeName,
              apply: item => {
                // 既定は全置換（要素データに無いキーの入力欄は空になる）。
                // `bind-merge` 指定時だけ要素データへ浅くマージする。
                const resolvedData = this.mergeAppendBindingData(
                  fragment,
                  data as Record<string, unknown>,
                  item,
                );
                const next = this.options.bindMerge
                  ? {...item, ...resolvedData}
                  : resolvedData;
                return this.reconcileRowUserEdits(fragment, next);
              },
            });
            return;
          }
          const resolvedData = this.mergeAppendBindingData(
            fragment,
            data as Record<string, unknown>,
          );
          // bind-merge 指定時は全置換せず、対象要素自身の既存 binding data へ
          // 浅くマージして未指定キー（例: 一覧の items）を保持する。
          const finalData = this.options.bindMerge
            ? {...(fragment.getRawBindingData() ?? {}), ...resolvedData}
            : resolvedData;
          promises.push(
            Core.setBindingData(
              fragment.getTarget(),
              this.reconcileUserEditsForBind(fragment, finalData),
              new Set(),
              // 自己デッドロックのみを解消する限定 reentrant（上の bindArg 分岐と同様）。
              this.reentrantBind && fragment.isExecutingBindingWork(),
              true,
              // ユーザー編集の印は reconcileUserEditsForBind が送信時点を基準に
              // 解除済み（上の bindArg 分岐と同様）。
              null,
            ),
          );
        });
      }
      promises.push(this.applyRowWrites(rowWrites));
      return Promise.all(promises).then(() => {
        // バインドと対象配下の再評価（data-if / data-each 等）の完了後に
        // bindcomplete を発火し、外部スクリプトが同期処理を行えるようにする。
        const bindArg = this.options.bindArg ?? null;
        this.options.bindFragments!.forEach(fragment => {
          HaoriEvent.bindComplete(fragment.getTarget(), bindArg);
        });
        return undefined;
      });
    });
  }

  /**
   * バインドの反映内容とユーザー編集の権威関係を調整します。
   *
   * 行うことは 2 つです。
   *
   * 1. **送信より前の編集の印を解除する**。バインドは明示的な値の供給なので、
   *    リクエストを組み立てた時点までの編集は応答（またはバインド指定）に権威を
   *    譲ります。解除しないと、宣言バインドの再適用が抑止されたままになり
   *    「再取得したのに古い入力が残る」状態になります。
   *    ただしフェッチを伴わない `change` / `input` のバインドは例外で、解除しません
   *    （`twoWayCommitBind`）。供給されるデータが入力欄から収集した編集値そのもの
   *    であり、権威を譲る相手がいないためです。解除すると、参照キーと書込キーが
   *    別の構成（`data-attr-value="{{record.a}}"` の欄を `bind-arg="draft"` へ
   *    書き込む等）で、確定済みの編集が未更新の参照キーの評価結果で消えます。
   * 2. **送信より後の編集を応答データへ上書きし直す**。応答はリクエストを
   *    組み立てた時点の内容を反映したものなので、その後の編集より古い情報です。
   *    そのままバインドすると利用者の入力が画面からも収集値からも静かに消えます。
   *    バインドデータの段階で上書きするため、入力欄への書き戻し
   *    （`Form.syncValues`）と宣言バインドの再評価（`data-attr-*` など）の双方が
   *    この 1 か所で整合します。
   *
   * 上書き（2）の対象は、`<form>` へのバインドと、配下に `data-form-arg` フォームを
   * 持つ要素へのバインドです。後者は祖先が所有するレコードをフォームが編集する構成で、
   * 祖先の更新がそのフォームの入力欄へ流し込まれます
   * （`Form.syncAncestorArgForms()`）。それ以外のバインドでは入力欄への書き戻しが
   * 起きないため、上書きは不要です。
   *
   * @param fragment バインド先のフラグメント
   * @param data バインドする応答データ
   * @return ユーザー編集分を上書きしたデータ
   */
  private reconcileUserEditsForBind(
    fragment: ElementFragment,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const baseline = this.requestUserEditSequence;
    if (baseline === null) {
      return data;
    }
    // ポーリングは利用者が要求した再取得ではなく、数秒ごとに自動で繰り返される。
    // 他のフェッチと同じ扱いにすると、入力してからしばらく置いた値が次の取得で
    // 静かに消える。そのため印は解除せず、これまでの編集すべてを応答へ上書きし直す。
    const isAutomaticPoll = this.eventType === 'poll';
    if (!isAutomaticPoll && !this.twoWayCommitBind) {
      // 送信時点までの編集は応答に権威を譲る。それより後の編集の印は残るため、
      // 飛行中の通信の応答で新しい編集が消えることはない。
      Core.clearUserEditMarks(fragment, baseline);
    }
    if (!(fragment.getTarget() instanceof HTMLFormElement)) {
      return this.reconcileAncestorArgFormEdits(
        fragment,
        data,
        isAutomaticPoll ? 0 : baseline,
      );
    }
    const edited = Form.getValuesEditedAfter(
      fragment,
      isAutomaticPoll ? 0 : baseline,
    );
    if (Object.keys(edited).length === 0) {
      return data;
    }
    // data-form-arg 指定時は、そのキー配下だけが入力欄と対応する。
    const formArg = fragment.getAttribute(`${Env.prefix}form-arg`);
    if (formArg) {
      const key = String(formArg);
      const scoped = data[key];
      const base =
        scoped && typeof scoped === 'object' && !Array.isArray(scoped)
          ? (scoped as Record<string, unknown>)
          : {};
      return {...data, [key]: mergeUserEdits(base, edited)};
    }
    return mergeUserEdits(data, edited) as Record<string, unknown>;
  }

  /**
   * 編集可能な行へのバインドについて、送信後の編集を要素データへ上書きし直します。
   *
   * `reconcileUserEditsForBind()` はバインド先が `<form>` でない場合、配下の
   * `data-form-arg` フォーム向けの経路へ進むため、行の入力欄の編集は保護されません。
   * 行では入力欄の `name` が要素データのキーと直接対応するので、行から収集した編集
   * 分をそのまま要素データへ重ねます。
   *
   * 呼び出しは書き戻す直前（`applyRowWrites()` の中）なので、収集する編集は常に
   * 最新です。
   *
   * @param row 行のフラグメント
   * @param item バインド後の要素データ
   * @returns ユーザー編集分を上書きした要素データ
   */
  private reconcileRowUserEdits(
    row: ElementFragment,
    item: Record<string, unknown>,
  ): Record<string, unknown> {
    const baseline = this.requestUserEditSequence;
    if (baseline === null) {
      return item;
    }
    // ポーリングは利用者が要求した再取得ではないため、印は解除せずこれまでの編集
    // すべてを応答へ上書きし直す（`reconcileUserEditsForBind()` と同じ規則）。
    const isAutomaticPoll = this.eventType === 'poll';
    if (!isAutomaticPoll && !this.twoWayCommitBind) {
      Core.clearUserEditMarks(row, baseline);
    }
    const edited = Form.getValuesEditedAfter(
      row,
      isAutomaticPoll ? 0 : baseline,
    );
    if (Object.keys(edited).length === 0) {
      return item;
    }
    return mergeUserEdits(item, edited) as Record<string, unknown>;
  }

  /**
   * 祖先へのバインドについて、配下の `data-form-arg` フォームで送信後に行われた
   * 編集を応答データへ上書きし直します。
   *
   * 祖先が所有するレコードは、更新時にそのキーを指定したフォームの入力欄へ
   * 流し込まれます（`Form.syncAncestorArgForms()`）。応答は送信時点の内容を
   * 反映したものなので、そのまま流し込むと送信後の編集が画面からも収集値からも
   * 静かに消えます。フォーム自身へのバインドと同じ扱いに揃えます。
   *
   * @param fragment バインド先のフラグメント
   * @param data バインドする応答データ
   * @param baseline この通し番号より後の編集を保護する
   * @return ユーザー編集分を上書きしたデータ
   */
  private reconcileAncestorArgFormEdits(
    fragment: ElementFragment,
    data: Record<string, unknown>,
    baseline: number,
  ): Record<string, unknown> {
    let result = data;
    for (const {form, key} of Form.collectArgForms(fragment)) {
      if (!Object.prototype.hasOwnProperty.call(result, key)) {
        // 応答が当該キーを含まない場合は流し込みが起きないため対象外。
        continue;
      }
      const edited = Form.getValuesEditedAfter(form, baseline);
      if (Object.keys(edited).length === 0) {
        continue;
      }
      const scoped = result[key];
      const base =
        scoped && typeof scoped === 'object' && !Array.isArray(scoped)
          ? (scoped as Record<string, unknown>)
          : {};
      result = {...result, [key]: mergeUserEdits(base, edited)};
    }
    return result;
  }

  /**
   * bind-append 指定があるキーについて、既存配列と結合したデータを返します。
   */
  private mergeAppendBindingData(
    fragment: ElementFragment,
    data: Record<string, unknown>,
    currentData: Record<string, unknown> = fragment.getBindingData(),
  ): Record<string, unknown> {
    if (
      !this.options.bindAppendParams ||
      this.options.bindAppendParams.length === 0
    ) {
      return data;
    }

    const merged = {...data};
    const current = currentData;
    for (const key of this.options.bindAppendParams) {
      const incoming = merged[key];
      const existing = current[key];
      if (Array.isArray(existing) && Array.isArray(incoming)) {
        merged[key] = existing.concat(incoming);
      }
    }
    return merged;
  }

  /**
   * 指定されたフラグメントへバインディングデータをコピーします。
   */
  private copy(): Promise<void> {
    if (
      !this.options.copyFragments ||
      this.options.copyFragments.length === 0
    ) {
      return Promise.resolve();
    }

    const sourceData = this.resolveCopySourceData();
    const copyData = this.pickCopyData(sourceData);
    const attributeName = Procedure.attrName(this.eventType, 'copy');
    const rowWrites: RowWrite[] = [];
    const promises: Promise<void>[] = [];
    this.options.copyFragments.forEach(fragment => {
      const resolution = this.resolveRowWrite(fragment, attributeName);
      if (resolution.kind === 'skip') {
        return;
      }
      if (resolution.kind === 'row') {
        // 編集可能な行では配列の要素データが権威なので、そこへマージする。行へ
        // 直接書いても入力欄には届かず、次の再描画で消える。
        rowWrites.push({
          container: resolution.container,
          row: fragment,
          attributeName,
          apply: item => ({...item, ...copyData}),
        });
        return;
      }
      // コピーは明示的な値の供給なので、setBindingData の既定どおり
      // コピー先のユーザー編集の印を解除する。
      //
      // 基底はコピー先「自身の」バインドデータに限る。`getBindingData()` は祖先と
      // のマージ結果なので、それを書き込むと祖先のキーがコピー先へ焼き付き、以降
      // その祖先の更新が古いコピーにシャドーされて届かなくなる（双方向コミットや
      // bind-arg が生データを基底にしているのと同じ理由）。
      const bindingData = {
        ...(fragment.getRawBindingData() ?? {}),
        ...copyData,
      };
      promises.push(Core.setBindingData(fragment.getTarget(), bindingData));
    });
    promises.push(this.applyRowWrites(rowWrites));
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * copy のコピー元データを取得します。
   *
   * 入力欄を持つフォームからは収集値を、それ以外の要素からはその要素「自身の」
   * バインドデータを取ります。`getBindingData()`（祖先とのマージ結果）を使うと、
   * 祖先が持つ無関係なキー（一覧の配列など）までコピーされ、コピー先へ焼き付いて
   * 以降の祖先の更新をシャドーします。フォームからの収集がその要素の入力欄だけを
   * 対象にしているのと扱いを揃えます。
   *
   * @returns コピー元のデータ
   */
  private resolveCopySourceData(): Record<string, unknown> {
    // コピー先はバインドデータになるため、File はファイル名へ正規化する
    // （そのまま入れると JSON 化で `{}` に潰れ data-bind 属性が壊れる）。
    if (this.options.copySourceFragment) {
      const sourceTarget = this.options.copySourceFragment.getTarget();
      if (sourceTarget.tagName === 'FORM') {
        return collectFormValuesForBinding(this.options.copySourceFragment);
      }
      return {...(this.options.copySourceFragment.getRawBindingData() ?? {})};
    }
    if (this.options.formFragment) {
      return collectFormValuesForBinding(this.options.formFragment);
    }
    if (this.options.targetFragment) {
      return {...(this.options.targetFragment.getRawBindingData() ?? {})};
    }
    return {};
  }

  /**
   * data 属性とフォーム値を統合した送信データを作成します。
   *
   * @returns 送信データ。
   */
  private buildPayload(): Record<string, unknown> {
    return this.buildPayloadResolution().payload;
  }

  /**
   * data 属性とフォーム値を統合した送信データを作成し、未解決参照の有無を返します。
   *
   * @returns 送信データと未解決参照の有無。
   */
  private buildPayloadResolution(): PayloadResolution {
    const payload: Record<string, unknown> = {};
    let hasUnresolvedReference = false;
    // フォームコンテナが無い change / input では、対象要素自身の値のみを収集する。
    const valueSource =
      this.options.formFragment ?? this.options.selfValueFragment;
    if (valueSource) {
      Object.assign(payload, Form.getValues(valueSource));
    }
    if (this.options.data && typeof this.options.data === 'object') {
      Object.assign(payload, this.options.data);
    }
    if (this.options.targetFragment && this.options.dataAttrName) {
      const resolvedData = Procedure.resolveDataAttributeDetailed(
        this.options.targetFragment,
        this.options.dataAttrName,
      );
      hasUnresolvedReference =
        hasUnresolvedReference || resolvedData.hasUnresolvedReference;
      if (resolvedData.value) {
        Object.assign(payload, resolvedData.value);
      }
    }
    return {payload, hasUnresolvedReference};
  }

  /**
   * 現在の data-fetch 実行内容を比較用シグネチャへ正規化します。
   *
   * @returns フェッチシグネチャと未解決参照の有無。
   */
  private resolveFetchSignature(): ResolvedFetchSignature {
    const preparedRequest = this.prepareFetchRequest();
    if (
      preparedRequest.signature === null ||
      !this.options.conditionExpression
    ) {
      return {
        signature: preparedRequest.signature,
        hasUnresolvedReference: preparedRequest.hasUnresolvedReference,
      };
    }
    // `data-fetch-if` の判定結果もシグネチャに含める。含めないと、条件が偽で見送った
    // 後に条件だけが真へ変わっても「同じ内容」と判定されて再取得が起きない。
    return {
      signature: `${preparedRequest.signature}|if=${String(
        this.evaluateExecutionCondition(true),
      )}`,
      hasUnresolvedReference: preparedRequest.hasUnresolvedReference,
    };
  }

  /**
   * 現在のオプションから送信前の fetch リクエストを組み立てます。
   *
   * @returns リクエスト情報。
   */
  private prepareFetchRequest(): PreparedFetchRequest {
    const payloadResolution = this.buildPayloadResolution();
    const payload = payloadResolution.payload;
    const hasUnresolvedReference =
      Boolean(this.options.fetchHasUnresolvedReference) ||
      payloadResolution.hasUnresolvedReference;

    if (!this.options.fetchUrl || hasUnresolvedReference) {
      return {
        url: null,
        baseUrl: null,
        options: null,
        payload,
        hasUnresolvedReference,
        requestedMethod: 'GET',
        effectiveMethod: 'GET',
        transportMode: 'http',
        signature: null,
      };
    }

    let fetchUrl = this.options.fetchUrl;
    const finalOptions: RequestInit = {...(this.options.fetchOptions || {})};
    const headers = new Headers(
      (finalOptions.headers as HeadersInit | undefined) || undefined,
    );
    const requestedMethod = (finalOptions.method || 'GET').toUpperCase();
    const isDemoQueryNormalization =
      Env.runtime === 'demo' && !isQueryTransportMethod(requestedMethod);
    const method = isDemoQueryNormalization ? 'GET' : requestedMethod;

    finalOptions.method = method;

    // File / Blob は multipart/form-data 以外では送信できない（JSON では `{}`、
    // クエリや urlencoded では `[object File]` になる）。原因が分かりにくいため、
    // multipart 以外で File を含む送信を検出したら明示的に警告する。
    if (Object.keys(payload).length > 0 && containsBinaryValue(payload)) {
      const declaredContentType = headers.get('Content-Type') || '';
      const isMultipart =
        method !== 'GET' &&
        method !== 'HEAD' &&
        method !== 'OPTIONS' &&
        /multipart\/form-data/i.test(declaredContentType);
      if (!isMultipart) {
        Log.warn(
          'Haori',
          'A File value cannot be sent without' +
            ` ${Env.prefix}fetch-content-type="multipart/form-data"` +
            ' and a body method such as POST.',
        );
      } else if (hasUnsendableNestedBinaryValue(payload)) {
        // data-form-object / data-form-list 配下の File は FormData で
        // JSON 文字列化され `{}` になるため送信できない。トップレベルの File と
        // 混在していても取りこぼさないよう、位置ごとに独立して判定する。
        Log.warn(
          'Haori',
          'A File value nested under' +
            ` ${Env.prefix}form-object / ${Env.prefix}form-list` +
            ' cannot be sent. Place file inputs at the top level of the' +
            ' collected form values.',
        );
      }
    }

    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      if (Object.keys(payload).length > 0) {
        fetchUrl = appendPayloadToUrl(fetchUrl, payload);
      }
    } else if (Object.keys(payload).length > 0) {
      const contentType = headers.get('Content-Type') || '';
      if (/multipart\/form-data/i.test(contentType)) {
        headers.delete('Content-Type');
        const formData = new FormData();
        for (const [k, v] of Object.entries(payload)) {
          if (v === undefined || v === null) {
            formData.append(k, '');
          } else if (v instanceof Blob) {
            formData.append(k, v);
          } else if (Array.isArray(v)) {
            // 複数選択の input[type=file] は File の配列で収集されるため、
            // 配列要素も Blob なら実体のまま追加する（文字列化しない）。
            v.forEach(item => {
              if (item instanceof Blob) {
                formData.append(k, item);
              } else {
                formData.append(k, serializePayloadValue(item));
              }
            });
          } else {
            formData.append(k, serializePayloadValue(v));
          }
        }
        finalOptions.body = formData;
      } else if (/application\/x-www-form-urlencoded/i.test(contentType)) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(payload)) {
          if (v === undefined) {
            continue;
          }
          if (Array.isArray(v)) {
            v.forEach(item => params.append(k, serializePayloadValue(item)));
          } else {
            params.append(k, serializePayloadValue(v));
          }
        }
        finalOptions.body = params;
      } else {
        headers.set('Content-Type', 'application/json');
        finalOptions.body = JSON.stringify(payload);
      }
    }

    finalOptions.headers = headers;
    let queryString: string | undefined;

    if (isDemoQueryNormalization) {
      queryString = new URL(fetchUrl, window.location.href).search || undefined;
      headers.delete('Content-Type');
    }

    return {
      url: fetchUrl,
      baseUrl: this.options.fetchUrl,
      options: finalOptions,
      payload,
      hasUnresolvedReference: false,
      requestedMethod,
      effectiveMethod: method,
      queryString,
      transportMode: isDemoQueryNormalization ? 'query-get' : 'http',
      signature: buildFetchSignature(fetchUrl, finalOptions),
    };
  }

  /**
   * reset-before 後の history 用スナップショットを保存します。
   */
  private captureHistorySnapshots(): void {
    if (this.options.targetFragment && this.options.historyDataAttrName) {
      this.historyDataSnapshot = Procedure.resolveDataAttribute(
        this.options.targetFragment,
        this.options.historyDataAttrName,
      );
    } else {
      this.historyDataSnapshot = undefined;
    }

    this.historyFormSnapshot = this.options.historyFormFragment
      ? collectFormValuesForBinding(this.options.historyFormFragment)
      : undefined;
  }

  /**
   * history-data の評価値を取得します。
   *
   * @returns history-data の評価値。
   */
  private resolveHistoryDataValues():
    | Record<string, unknown>
    | null
    | undefined {
    if (this.historyDataSnapshot !== undefined) {
      return this.historyDataSnapshot;
    }
    if (this.options.targetFragment && this.options.historyDataAttrName) {
      return Procedure.resolveDataAttribute(
        this.options.targetFragment,
        this.options.historyDataAttrName,
      );
    }
    return this.options.historyData;
  }

  /**
   * history-form の評価値を取得します。
   *
   * @returns history-form の評価値。
   */
  private resolveHistoryFormValues():
    | Record<string, unknown>
    | null
    | undefined {
    if (this.historyFormSnapshot !== undefined) {
      return this.historyFormSnapshot;
    }
    if (this.options.historyFormFragment) {
      // File は履歴 URL のクエリでは `[object File]` / `{}` になり復元もできない
      // ため、ファイル名へ正規化する。
      return collectFormValuesForBinding(this.options.historyFormFragment);
    }
    return undefined;
  }

  /**
   * copy-params が指定されている場合は include / exclude を考慮して抽出します。
   */
  private pickCopyData(
    sourceData: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.options.copyParams || this.options.copyParams.length === 0) {
      return sourceData;
    }

    const includeParams = new Set<string>();
    const excludeParams = new Set<string>();

    this.options.copyParams.forEach(param => {
      const trimmedParam = param.trim();
      if (!trimmedParam) {
        return;
      }
      if (trimmedParam.startsWith('!')) {
        const excludedParam = trimmedParam.slice(1).trim();
        if (excludedParam) {
          excludeParams.add(excludedParam);
        }
        return;
      }
      includeParams.add(trimmedParam);
    });

    const filtered: Record<string, unknown> = {};
    const sourceKeys =
      includeParams.size > 0
        ? Array.from(includeParams)
        : Object.keys(sourceData);

    sourceKeys.forEach(param => {
      if (!(param in sourceData)) {
        return;
      }
      if (excludeParams.has(param)) {
        return;
      }
      filtered[param] = sourceData[param];
    });

    return filtered;
  }

  /**
   * 値の増減を行います。
   */
  private adjust(): Promise<void> {
    if (
      !this.options.adjustFragments ||
      this.options.adjustFragments.length === 0
    ) {
      return Promise.resolve();
    }
    const adjustValue = this.options.adjustValue ?? 0;
    const promises: Promise<void>[] = [];
    for (const fragment of this.options.adjustFragments) {
      let valueString = fragment.getValue();
      if (
        valueString === null ||
        valueString === undefined ||
        valueString === ''
      ) {
        valueString = '0';
      }
      let value = Number(valueString);
      if (isNaN(value)) {
        value = 0;
      }
      value += adjustValue;
      promises.push(fragment.setValue(String(value)));
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * 行フラグメントを取得します。
   *
   * @returns 行フラグメントまたはnull
   */
  private getRowFragment(): ElementFragment | null {
    if (!this.options.targetFragment) {
      Log.error('Haori', 'Target fragment is not specified for row operation.');
      return null;
    }
    const rowFragment = this.options.targetFragment.closestByAttribute(
      `${Env.prefix}row`,
    );
    if (!rowFragment) {
      Log.error('Haori', 'Row fragment not found.');
      return null;
    }
    return rowFragment;
  }

  /**
   * 行操作の対象となる `data-each` コンテナを解決します。
   *
   * `data-{event}-row-*` に CSS セレクタを指定した場合はその要素を、値を省略した
   * 場合は対象要素が属する行（`data-row`）の親コンテナを返します。セレクタ指定は、
   * 行の外に置いた「追加」ボタンや、行が 0 件で複製元が存在しない状態からの追加に
   * 対応するためのものです。
   *
   * @param attributeKey 属性のキー（`row-add` など）
   * @returns `data-each` コンテナのフラグメント。解決できない場合は null
   */
  private resolveRowContainer(attributeKey: string): ElementFragment | null {
    const target = this.options.targetFragment;
    if (!target) {
      Log.error('Haori', 'Target fragment is not specified for row operation.');
      return null;
    }
    const attrName = Procedure.attrName(this.eventType, attributeKey);
    const selector = Selector.read(target, attrName);
    if (selector !== null && selector.trim() !== '') {
      const element = Selector.query(selector, attrName, document);
      if (element === null) {
        Log.error(
          'Haori',
          `Row container not found: ${selector} (${attrName})`,
        );
        return null;
      }
      const fragment = Fragment.get(element as HTMLElement);
      if (!(fragment instanceof ElementFragment)) {
        Log.error(
          'Haori',
          `Row container is not initialized: ${selector} (${attrName})`,
        );
        return null;
      }
      if (!fragment.hasAttribute(`${Env.prefix}each`)) {
        Log.error(
          'Haori',
          `Row container must have ${Env.prefix}each:` +
            ` ${selector} (${attrName})`,
        );
        return null;
      }
      return fragment;
    }
    const rowFragment = this.getRowFragment();
    return rowFragment ? rowFragment.getParent() : null;
  }

  /**
   * `data-each` コンテナが参照している配列と、その所有者を解決します。
   *
   * `data-each` の式を単純な識別子パス（`contracts` / `form.contracts` など）と
   * みなし、根の識別子を持つ最も近い祖先（自身を含む）のバインディングデータを
   * 所有者として扱います。関数呼び出しや演算を含む式は書き戻し先を一意に決められ
   * ないため、エラーログを出して null を返します。
   *
   * @param container `data-each` コンテナのフラグメント
   * @returns 所有者・所有者データ・配列。解決できない場合は null
   */
  private static resolveEachArray(container: ElementFragment): {
    owner: ElementFragment;
    ownerData: Record<string, unknown>;
    array: unknown[];
    path: string[];
  } | null {
    const expression = container.getRawAttribute(`${Env.prefix}each`);
    if (expression === null) {
      Log.error(
        'Haori',
        `Row container has no ${Env.prefix}each expression.`,
      );
      return null;
    }
    const path = expression.trim().split('.');
    const isIdentifierPath =
      path.length > 0 && path.every(part => /^[A-Za-z_$][\w$]*$/.test(part));
    if (!isIdentifierPath) {
      Log.error(
        'Haori',
        'Row operations require a plain identifier path for ' +
          `${Env.prefix}each (got: ${expression}).`,
      );
      return null;
    }
    // 根の識別子を持つ最も近い祖先（自身を含む）を所有者とする。
    let owner: ElementFragment | null = container;
    let ownerData: Record<string, unknown> | null = null;
    while (owner) {
      const data = owner.getRawBindingData();
      if (data && path[0] in data) {
        ownerData = data;
        break;
      }
      owner = owner.getParent();
    }
    if (!owner || !ownerData) {
      Log.error(
        'Haori',
        `Binding data owner not found for ${Env.prefix}each="${expression}".`,
      );
      return null;
    }
    let current: unknown = ownerData;
    for (const part of path) {
      if (
        current === null ||
        typeof current !== 'object' ||
        Array.isArray(current)
      ) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (!Array.isArray(current)) {
      Log.error(
        'Haori',
        `${Env.prefix}each="${expression}" does not resolve to an array.`,
      );
      return null;
    }
    return {owner, ownerData, array: current, path};
  }

  /**
   * 指定パスの値を差し替えた新しいオブジェクトを返します。
   *
   * パス上のオブジェクトを浅くコピーして組み立て、元のオブジェクトは変更しません。
   * バインディングデータを直接書き換えると `haori:bindchange` の変更前後が同一
   * オブジェクトになり、外部から変化を検知できなくなるためです。
   *
   * @param data 元のバインディングデータ
   * @param path 差し替える値までのキーの並び
   * @param value 差し替える値
   * @returns 差し替え後のバインディングデータ
   */
  private static withPathValue(
    data: Record<string, unknown>,
    path: string[],
    value: unknown,
  ): Record<string, unknown> {
    const next: Record<string, unknown> = {...data};
    let cursor = next;
    for (let index = 0; index < path.length - 1; index += 1) {
      const key = path[index];
      const child = cursor[key] as Record<string, unknown>;
      const cloned: Record<string, unknown> = {...child};
      cursor[key] = cloned;
      cursor = cloned;
    }
    cursor[path[path.length - 1]] = value;
    return next;
  }

  /**
   * `data-each` コンテナ配下の行フラグメント一覧を返します。
   *
   * `data-each-before` / `data-each-after` の固定要素は除外します。
   *
   * @param container `data-each` コンテナのフラグメント
   * @returns 行フラグメントの配列（描画順）
   */
  private static getRowFragments(
    container: ElementFragment,
  ): ElementFragment[] {
    return container
      .getChildElementFragments()
      .filter(
        child =>
          !child.hasAttribute(`${Env.prefix}each-before`) &&
          !child.hasAttribute(`${Env.prefix}each-after`),
      );
  }

  /**
   * 書き込み先が編集可能な行かどうかを判定し、書き込み方法を決めます。
   *
   * 判定には属性を読んだ時点の記録（`recordRowWriteTargets()`）を使います。応答が
   * 届くまでに行が削除された場合は親子関係が失われるため、その場では判定できま
   * せん。
   *
   * @param fragment 書き込み先のフラグメント
   * @param attributeName ログ出力に用いる属性名
   * @returns `row` は配列要素へ書き戻す、`skip` は書き込まない、`plain` は従来
   *     どおりその要素自身のバインドデータを更新する
   */
  private resolveRowWrite(
    fragment: ElementFragment,
    attributeName: string,
  ): RowWriteResolution {
    const targets = this.options.rowWriteTargets;
    if (!targets || !targets.has(fragment)) {
      return {kind: 'plain'};
    }
    const container = targets.get(fragment) ?? null;
    if (container === null) {
      // `data-each-before` / `data-each-after` の固定要素。行ではないため、行デー
      // タへの書き込みとしては扱えない。
      Log.warn(
        'Haori',
        'Target is not a row of the' +
          ` ${Env.prefix}each container (${attributeName}).`,
      );
      return {kind: 'skip'};
    }
    if (!Procedure.getRowFragments(container).includes(fragment)) {
      // 応答を待つ間に行が削除された場合。無関係な行やデタッチ済みの行へ書かない。
      Log.warn(
        'Haori',
        'The target row is no longer in the' +
          ` ${Env.prefix}each container; the write was skipped` +
          ` (${attributeName}).`,
      );
      return {kind: 'skip'};
    }
    return {kind: 'row', container};
  }

  /**
   * 行への書き込みを、`data-each` が参照する配列へ反映します。
   *
   * コンテナごとにまとめて 1 回だけ書き戻します。行単位に書き戻すと、各呼び出しが
   * それぞれ配列のコピーを作るため、後の書き込みが前の書き込みを消します。
   *
   * @param writes 行への書き込み要求
   * @returns 反映完了の Promise
   */
  private applyRowWrites(writes: RowWrite[]): Promise<void> {
    if (writes.length === 0) {
      return Promise.resolve();
    }
    const groups = new Map<ElementFragment, RowWrite[]>();
    for (const write of writes) {
      const group = groups.get(write.container);
      if (group) {
        group.push(write);
      } else {
        groups.set(write.container, [write]);
      }
    }
    const promises: Promise<void>[] = [];
    groups.forEach((group, container) => {
      // 配列は書き戻す直前に読み直す。手続きの開始時点で読んだコピーを使うと、
      // 送信から応答までの間に他の行で確定した編集を巻き戻してしまう。
      const resolved = Procedure.resolveEachArray(container);
      if (!resolved) {
        // resolveEachArray がエラーログを出す。手続きは止めない。
        return;
      }
      const nextArray = resolved.array.slice();
      let changed = false;
      for (const write of group) {
        const index = Procedure.resolveRowArrayIndex(write, nextArray);
        if (index === null) {
          continue;
        }
        const item = nextArray[index];
        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
          // プリミティブ配列の行は入力欄の name と対応付けられない
          // （`Core.applyRowFormValues` と同じ条件）。
          Log.warn(
            'Haori',
            'Row data is not an object; the write was skipped' +
              ` (${write.attributeName}).`,
          );
          continue;
        }
        const nextItem = write.apply(item as Record<string, unknown>);
        if (Procedure.isSameRowItem(item, nextItem)) {
          // 内容が変わらないなら書き戻さない。書き戻すと所有者の再評価が走り、
          // 行内の `data-fetch` が再発火して往復が止まらなくなる（同じ値を書く
          // 二度目のコピーで無用な再描画を起こさないためでもある）。
          continue;
        }
        nextArray[index] = nextItem;
        changed = true;
      }
      if (!changed) {
        return;
      }
      const write = Core.setBindingData(
        resolved.owner.getTarget(),
        Procedure.withPathValue(resolved.ownerData, resolved.path, nextArray),
        new Set(),
        // マネージド `data-fetch` はバインドワークの内部から起動・await される。
        // 所有者が実行中のバインドワークを持つときに FIFO キューへ積むと、相互に
        // 待ち合って自己デッドロックするため、その場合だけ reentrant（即時実行）に
        // する（`bindResult()` の各分岐と同じ扱い）。
        this.reentrantBind && resolved.owner.isExecutingBindingWork(),
        true,
        // 対象は配列の一部の要素だけなので、他の行の編集の印は解除しない。要素
        // データが入れ替わる再利用行の印は差分更新（Core.updateDiff）が個別に
        // 解除する（`spliceRows()` と同じ扱い）。
        null,
      );
      if (Core.isEachUpdateRunning(container)) {
        // 行の描画中に起動された処理（行の中の `data-fetch` など）からの書き戻し。
        // 完了を待つと、描画ループ側はこの処理を含む行の初期化の完了を待っている
        // ため相互に待ち合って止まる。バインドデータは `Core.setBindingData()` が
        // 同期で確定しており、描画は進行中のループが再実行で拾うため待たない。
        write.catch(error => {
          Log.error('Haori', 'Failed to write row data.', error);
        });
        return;
      }
      promises.push(write);
    });
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * 行の要素データが同じ内容かどうかを判定します。
   *
   * 直列化できない値（循環参照など）は「変わった」と扱います。キーの並びが違えば
   * 別物と判定しますが、書き戻した後は同じ並びになるため往復は 1 回で収束します。
   *
   * @param before 書き込み前の要素データ
   * @param after 書き込み後の要素データ
   * @returns 同じ内容なら true
   */
  private static isSameRowItem(before: unknown, after: unknown): boolean {
    if (before === after) {
      return true;
    }
    try {
      return JSON.stringify(before) === JSON.stringify(after);
    } catch {
      return false;
    }
  }

  /**
   * 行に対応する配列要素のインデックスを解決します。
   *
   * `data-each-key` 指定時はキーで対応付けます。位置で決めると、応答を待つ間に
   * 並べ替えや行の増減があったとき別のレコードへ書いてしまいます。
   *
   * @param write 行への書き込み要求
   * @param array 現在の配列
   * @returns 配列のインデックス。解決できない場合は null
   */
  private static resolveRowArrayIndex(
    write: RowWrite,
    array: unknown[],
  ): number | null {
    const position = Procedure.getRowFragments(write.container).indexOf(
      write.row,
    );
    if (position === -1) {
      // 応答を待つ間に行が削除された場合。無関係な行へ書かないよう捨てる。
      Log.warn(
        'Haori',
        'The target row is no longer in the' +
          ` ${Env.prefix}each container; the write was skipped` +
          ` (${write.attributeName}).`,
      );
      return null;
    }
    const keyArg = write.container.getAttribute(`${Env.prefix}each-key`);
    const listKey = write.row.getListKey();
    if (keyArg && listKey !== null) {
      const found = array.findIndex(
        (item, index) =>
          Core.createListKey(
            item as Record<string, unknown> | string | number,
            String(keyArg),
            index,
          ) === listKey,
      );
      if (found === -1) {
        Log.warn(
          'Haori',
          'No array element matches the target row key' +
            ` "${listKey}"; the write was skipped` +
            ` (${write.attributeName}).`,
        );
        return null;
      }
      return found;
    }
    if (position >= array.length) {
      Log.warn(
        'Haori',
        'The target row index is out of range; the write was skipped' +
          ` (${write.attributeName}).`,
      );
      return null;
    }
    return position;
  }

  /**
   * 行を追加します。
   *
   * @returns 処理結果のPromise
   */
  private addRow(): Promise<void> {
    if (this.options.rowAdd !== true) {
      return Promise.resolve();
    }
    // 行の DOM を複製するのではなく、`data-each` が参照している配列へ空の要素を
    // 挿入し、再描画に行の生成を任せる。DOM だけを複製すると配列が追従せず、
    // 次のバインド更新（fetch 結果の反映など）で差分更新が古い配列から再描画して
    // 追加が黙って取り消される。`data-row` キーの重複も起きる。
    return this.spliceRows('row-add', (array, index) => {
      array.splice(index + 1, 0, {});
      return true;
    });
  }

  /**
   * 行を削除します。
   *
   * @returns 処理結果のPromise
   */
  private removeRow(): Promise<void> {
    if (this.options.rowRemove !== true) {
      return Promise.resolve();
    }
    // `data-{event}-row-remove-empty` を指定した場合のみ 0 件まで削除できる。
    // 既定で最後の 1 行を残すのは従来仕様であり、変更すると「最低 1 行は消えない」
    // 前提で作られた既存画面の挙動が変わるため、オプトインとする。
    const allowEmpty = this.options.targetFragment?.hasAttribute(
      Procedure.attrName(this.eventType, 'row-remove-empty'),
    );
    return this.spliceRows('row-remove', (array, index) => {
      if (index < 0 || index >= array.length) {
        return false;
      }
      if (!allowEmpty && array.length <= 1) {
        return false;
      }
      array.splice(index, 1);
      return true;
    });
  }

  /**
   * 前の行へ移動します。
   *
   * @returns 処理結果のPromise
   */
  private movePrevRow(): Promise<void> {
    if (this.options.rowMovePrev !== true) {
      return Promise.resolve();
    }
    return this.spliceRows('row-prev', (array, index) => {
      if (index <= 0 || index >= array.length) {
        return false;
      }
      const [moved] = array.splice(index, 1);
      array.splice(index - 1, 0, moved);
      return true;
    });
  }

  /**
   * 次の行へ移動します。
   *
   * @returns 処理結果のPromise
   */
  private moveNextRow(): Promise<void> {
    if (this.options.rowMoveNext !== true) {
      return Promise.resolve();
    }
    return this.spliceRows('row-next', (array, index) => {
      if (index < 0 || index >= array.length - 1) {
        return false;
      }
      const [moved] = array.splice(index, 1);
      array.splice(index + 1, 0, moved);
      return true;
    });
  }

  /**
   * `data-each` が参照する配列を書き換えて行を増減・並べ替えします。
   *
   * 対象コンテナと配列の所有者を解決し、`mutate` で配列を書き換えたうえで所有者へ
   * `Core.setBindingData()` を適用します。DOM の行は差分更新で再描画されるため、
   * DOM とバインディングデータが常に一致します。
   *
   * `mutate` の第 2 引数は操作対象の行インデックスです。属性値でコンテナを指定した
   * 場合（行の外に置いたボタン）は末尾の行を指し、`row-add` では末尾へ追加されます。
   *
   * @param attributeKey 属性のキー（`row-add` など）
   * @param mutate 配列を書き換える関数。書き換えた場合は true を返す
   * @returns 処理結果の Promise
   */
  private spliceRows(
    attributeKey: string,
    mutate: (array: unknown[], index: number) => boolean,
  ): Promise<void> {
    const container = this.resolveRowContainer(attributeKey);
    if (!container) {
      return Promise.reject(new Error('Row container not found.'));
    }
    const resolved = Procedure.resolveEachArray(container);
    if (!resolved) {
      return Promise.reject(new Error('Row array not resolved.'));
    }
    const target = this.options.targetFragment;
    const ownRow = target
      ? target.closestByAttribute(`${Env.prefix}row`)
      : null;
    const rows = Procedure.getRowFragments(container);
    // 自身が行の内側にあればその行を、外側（属性値でコンテナ指定）なら末尾を対象とする。
    const index = ownRow ? rows.indexOf(ownRow) : rows.length - 1;
    // 元の配列は変更せず、コピーを書き換えて差し替える。
    const nextArray = resolved.array.slice();
    if (!mutate(nextArray, index)) {
      return Promise.resolve();
    }
    return Core.setBindingData(
      resolved.owner.getTarget(),
      Procedure.withPathValue(resolved.ownerData, resolved.path, nextArray),
      new Set(),
      false,
      true,
      // 対象は配列の 1 要素だけなので、他の行の編集の印は解除しない。要素データが
      // 入れ替わる再利用行の印は差分更新（Core.updateDiff）が個別に解除する。
      null,
    );
  }

  /**
   * フェッチ状態を `_fetch` として対象要素群のバインディングデータへ注入します。
   *
   * `data-fetch-state` / `data-{event}-fetch-state` で指定された要素に対し、
   * `loading` / `success` / `error` の各状態を `_fetch` キーで設定します。
   * `reflectToAttribute=false` で呼ぶため data-bind 属性は汚さず、bindchange
   * イベントも発火しませんが、対象要素の再評価（data-if 等）は実行されます。
   * 指定要素が無い場合は何もしません。
   *
   * @param status フェッチ状態（'loading' | 'success' | 'error'）
   * @param statusCode HTTP ステータスコード（無い場合は null）
   * @param message エラーメッセージ等（無い場合は null）
   * @returns 注入完了の Promise
   */
  private async injectFetchState(
    status: 'loading' | 'success' | 'error',
    statusCode: number | null = null,
    message: string | null = null,
  ): Promise<void> {
    const targets = this.options.fetchStateFragments;
    if (!targets || targets.length === 0) {
      return;
    }
    const state = {
      status,
      loading: status === 'loading',
      success: status === 'success',
      error: status === 'error',
      statusCode,
      message,
    };
    await Promise.all(
      targets.map(fragment => {
        const element = fragment.getTarget();
        const data = {
          ...(fragment.getRawBindingData() ?? {}),
          _fetch: state,
        };
        return Core.setBindingData(
          element,
          data,
          new Set(),
          false,
          false,
          null,
        );
      }),
    );
  }
}
