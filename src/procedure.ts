/**
 * @fileoverview 手続き的処理管理機能
 *
 * イベントに基づく手続き的な処理を提供します。
 */

import Core from './core';
import Env from './env';
import Expression from './expression';
import Form from './form';
import Fragment, {ElementFragment} from './fragment';
import Haori from './haori';
import Log from './log';
import HaoriEvent from './event';
import {checkAuthRedirect} from './auth_guard';
import Url from './url';

type ProcedureHaoriApi = Pick<
  typeof Haori,
  | 'addErrorMessage'
  | 'closeDialog'
  | 'confirm'
  | 'dialog'
  | 'openDialog'
  | 'toast'
>;

const PROCEDURE_HAORI_METHOD_NAMES = [
  'addErrorMessage',
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
    if (value === null) {
      params.append(key, '');
    } else if (Array.isArray(value)) {
      value.forEach(item => {
        params.append(key, String(item));
      });
    } else if (typeof value === 'object' || typeof value === 'function') {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }
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
}

interface ExecutionLockState {
  /** 実行中として扱う対象要素 */
  target: HTMLElement;

  /** 今回の処理で disabled 属性を付与したかどうか */
  appliedDisabledAttribute: boolean;
}

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
        const formSelector = fragment.getRawAttribute(
          Procedure.attrName(event, 'form'),
        ) as string | null;
        if (formSelector) {
          const formElement = document.body.querySelector(formSelector);
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
        try {
          options.runScript = new Function(
            'event',
            `
"use strict";
${body}
`,
          ) as (event: Event | null) => unknown;
        } catch (e) {
          Log.error('Haori', `Invalid run script: ${e}`);
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
      const bindSelector = fragment.getRawAttribute(bindAttr) as string | null;
      if (bindSelector) {
        const bindElements = document.body.querySelectorAll(bindSelector);
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
        const adjustSelector = fragment.getRawAttribute(
          Procedure.attrName(event, 'adjust'),
        ) as string | null;
        if (adjustSelector) {
          const adjustElements = document.body.querySelectorAll(adjustSelector);
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
        const historyFormSelector = fragment.getRawAttribute(
          Procedure.attrName(event, 'history-form'),
        ) as string | null;
        if (historyFormSelector) {
          const historyFormElement =
            document.body.querySelector(historyFormSelector);
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
        const selector = fragment.getRawAttribute(attrName) as string | null;
        const list: ElementFragment[] = [];
        if (selector) {
          const elements = document.body.querySelectorAll(selector);
          elements.forEach(el => {
            const frag = Fragment.get(el);
            if (frag) {
              list.push(frag as ElementFragment);
            }
          });
          if (list.length === 0) {
            Log.error('Haori', `Element not found: ${selector} (${attrName})`);
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
        const selector = fragment.getRawAttribute(
          copySourceAttrName,
        ) as string | null;
        if (selector) {
          const el = document.body.querySelector(selector);
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
        const formSelector = fragment.getRawAttribute(
          Procedure.attrName(null, 'form', true),
        ) as string | null;
        if (formSelector) {
          const formElement = document.body.querySelector(formSelector);
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

    // fetch が指定されているのにバインド先が無い場合、デフォルトで自要素にバインド
    if (
      hasFetchAttr &&
      (!options.bindFragments || options.bindFragments.length === 0)
    ) {
      options.bindFragments = [fragment];
      // 明示指定ではなく既定で補った self-bind であることを記録する。
      options.defaultSelfBind = true;
    }
    return options;
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

  /** reset-before 後に確定した historyData スナップショット */
  private historyDataSnapshot: Record<string, unknown> | null | undefined;

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
      // data-{event}-run: 任意 JS を同期実行する。await を挟む前に実行することで、
      // クリックイベント中の event.preventDefault() が間に合う。本体が false を
      // 返した場合はデフォルト動作（リンク遷移・フォーム送信）を抑止する。
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
      const payload = preparedRequest.payload;
      let fetchUrl = preparedRequest.url;
      let fetchOptions = preparedRequest.options;
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
            fetchUrl = ('fetchUrl' in result ? result.fetchUrl : fetchUrl) as
              | string
              | null;
            fetchOptions = (
              'fetchOptions' in result ? result.fetchOptions : fetchOptions
            ) as RequestInit | null;
          }
        }
      }

      const hasPayload = Object.keys(payload).length > 0;
      if (fetchUrl) {
        const finalOptions: RequestInit = {...(fetchOptions || {})};
        const requestedMethod = preparedRequest.requestedMethod;
        const method = preparedRequest.effectiveMethod;
        const isDemoQueryNormalization =
          preparedRequest.transportMode === 'query-get';
        const queryString = preparedRequest.queryString;

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

          return fetch(fetchUrl, finalOptions)
            .then(response => {
              return this.handleFetchResult(
                response,
                fetchUrl || undefined,
                startedAt,
              );
            })
            .catch(error => {
              if (fetchUrl) {
                HaoriEvent.fetchError(
                  this.options.targetFragment!.getTarget(),
                  fetchUrl,
                  error,
                );
              }
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

        const bindingData = formFragment.getBindingData();
        Object.assign(bindingData, payload);
        await Core.setBindingData(formElement, bindingData, skipFragments);
      }

      const merged = hasPayload ? payload : {};
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
    const skipDisabled = target.hasAttribute(
      `${Env.prefix}click-no-disabled`,
    );

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
    this.pushHistory();
    if (this.options.scrollTarget) {
      const el = document.querySelector<HTMLElement>(this.options.scrollTarget);
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
      return true;
    }
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
   * 対象フラグメント以下で DOM 順の最上部にある invalid 要素を返します。
   * 副作用のない checkValidity のみを使用し、検出のみを行います。
   *
   * @param fragment 対象のフラグメント
   * @returns 最初の invalid 要素、なければ null
   */
  private findFirstInvalid(fragment: ElementFragment): HTMLElement | null {
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
      const promises: Promise<unknown>[] = [];
      if (this.options.bindArg) {
        this.options.bindFragments!.forEach(fragment => {
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
              bindingData,
              new Set(),
              // マネージド fetch の bind かつ、bind 先が実行中のバインドワークを
              // 持つ（= 自分自身を await している）ときだけ reentrant（即時実行）に
              // する。これで自己デッドロックのみを解消し、idle なフラグメントへの
              // bind は従来どおり FIFO で適用順を保証する。
              this.reentrantBind && fragment.isExecutingBindingWork(),
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
              finalData,
              new Set(),
              // 自己デッドロックのみを解消する限定 reentrant（上の bindArg 分岐と同様）。
              this.reentrantBind && fragment.isExecutingBindingWork(),
            ),
          );
        });
      }
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
    const promises = this.options.copyFragments.map(fragment => {
      const bindingData = {
        ...fragment.getBindingData(),
        ...copyData,
      };
      return Core.setBindingData(fragment.getTarget(), bindingData);
    });
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * copy のコピー元データを取得します。
   */
  private resolveCopySourceData(): Record<string, unknown> {
    if (this.options.copySourceFragment) {
      const sourceTarget = this.options.copySourceFragment.getTarget();
      if (sourceTarget.tagName === 'FORM') {
        return Form.getValues(this.options.copySourceFragment);
      }
      return {...this.options.copySourceFragment.getBindingData()};
    }
    if (this.options.formFragment) {
      return Form.getValues(this.options.formFragment);
    }
    if (this.options.targetFragment) {
      return {...this.options.targetFragment.getBindingData()};
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
    if (this.options.formFragment) {
      Object.assign(payload, Form.getValues(this.options.formFragment));
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
    return {
      signature: preparedRequest.signature,
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
            v.forEach(item => formData.append(k, String(item)));
          } else if (typeof v === 'object') {
            formData.append(k, JSON.stringify(v));
          } else {
            formData.append(k, String(v));
          }
        }
        finalOptions.body = formData;
      } else if (/application\/x-www-form-urlencoded/i.test(contentType)) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(payload)) {
          if (v === undefined) {
            continue;
          }
          if (v === null) {
            params.append(k, '');
          } else if (Array.isArray(v)) {
            v.forEach(item => params.append(k, String(item)));
          } else if (typeof v === 'object') {
            params.append(k, JSON.stringify(v));
          } else {
            params.append(k, String(v));
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
      ? Form.getValues(this.options.historyFormFragment)
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
      return Form.getValues(this.options.historyFormFragment);
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
   * 行を追加します。
   *
   * @returns 処理結果のPromise
   */
  private addRow(): Promise<void> {
    if (this.options.rowAdd !== true) {
      return Promise.resolve();
    }
    const rowFragment = this.getRowFragment();
    if (!rowFragment) {
      return Promise.reject(new Error('Row fragment not found.'));
    }
    const promises: Promise<void>[] = [];
    const newFragment = rowFragment.clone();
    promises.push(
      rowFragment.getParent()!.insertAfter(newFragment, rowFragment),
    );
    promises.push(Core.evaluateAll(newFragment));
    // 追加された行のフォーム要素をリセット
    promises.push(Form.reset(newFragment as ElementFragment));
    return Promise.all(promises).then(() => undefined);
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
    const rowFragment = this.getRowFragment();
    if (!rowFragment) {
      return Promise.reject(new Error('Row fragment not found.'));
    }
    // 1行だった場合は削除しない
    const parent = rowFragment.getParent();
    if (parent) {
      const siblings = parent.getChildElementFragments().filter(child => {
        // data-each-before と data-each-after を除外
        return (
          !child.hasAttribute(`${Env.prefix}each-before`) &&
          !child.hasAttribute(`${Env.prefix}each-after`)
        );
      });
      if (siblings.length <= 1) {
        return Promise.resolve();
      }
    }
    return rowFragment.remove();
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
    const rowFragment = this.getRowFragment();
    if (!rowFragment) {
      return Promise.reject(new Error('Row fragment not found.'));
    }
    const prevFragment = rowFragment.getPrevious();
    if (!prevFragment) {
      return Promise.resolve();
    }
    const parent = rowFragment.getParent();
    if (!parent) {
      return Promise.resolve();
    }
    return parent.insertBefore(rowFragment, prevFragment);
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
    const rowFragment = this.getRowFragment();
    if (!rowFragment) {
      return Promise.reject(new Error('Row fragment not found.'));
    }
    const nextFragment = rowFragment.getNext();
    if (!nextFragment) {
      return Promise.resolve();
    }
    const parent = rowFragment.getParent();
    if (!parent) {
      return Promise.resolve();
    }
    return parent.insertAfter(rowFragment, nextFragment);
  }
}
