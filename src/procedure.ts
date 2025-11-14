/**
 * @fileoverview 手続き的処理管理機能
 *
 * イベントに基づく手続き的な処理を提供します。
 */

import Core from './core';
import Env from './env';
import Form from './form';
import Fragment, {ElementFragment} from './fragment';
import Haori from './haori';
import Log from './log';
import HaoriEvent from './event';

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

  /** フェッチ前実行スクリプト */
  beforeCallback?: (
    fetchUrl: string | null,
    fetchOptions: RequestInit | null,
  ) => BeforeCallbackResult | boolean | void;

  /** 対象フォームフラグメント */
  formFragment?: ElementFragment | null;

  /** フェッチURL */
  fetchUrl?: string | null;

  /** フェッチオプション */
  fetchOptions?: RequestInit | null;

  /** バインド対象フラグメント */
  bindFragments?: ElementFragment[] | null;

  /** レスポンスデータから抽出するパラメータ名のリスト */
  bindParams?: string[] | null;

  /** レスポンスデータをバインドする際のキー名 */
  bindArg?: string | null;

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

  /** ダイアログメッセージ */
  dialogMessage?: string | null;

  /** トーストメッセージ */
  toastMessage?: string | null;

  /** リダイレクトURL */
  redirectUrl?: string | null;
}

/**
 * 手続き的処理管理クラスです。
 */
export default class Procedure {
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
        options.confirmMessage = fragment.getAttribute(
          Procedure.attrName(event, 'confirm'),
        ) as string;
      }
      // data（イベント）
      if (fragment.hasAttribute(Procedure.attrName(event, 'data'))) {
        options.data = Core.parseDataBind(
          fragment.getRawAttribute(Procedure.attrName(event, 'data')) as string,
        );
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
    }
    // fetch URL（イベントあり/なし）
    const fetchAttrName = Procedure.attrName(event, 'fetch');
    const hasFetchAttr = fragment.hasAttribute(fetchAttrName);
    if (hasFetchAttr) {
      options.fetchUrl = fragment.getAttribute(fetchAttrName) as string;
    }
    const fetchOptions: RequestInit = {};
    // fetch-method（イベントあり/なし）
    const fetchMethodAttr = Procedure.attrName(event, 'fetch-method', true);
    if (fragment.hasAttribute(fetchMethodAttr)) {
      fetchOptions.method = fragment.getAttribute(fetchMethodAttr) as string;
    }
    // fetch-headers（イベントあり/なし）
    const fetchHeadersAttr = Procedure.attrName(event, 'fetch-headers', true);
    if (fragment.hasAttribute(fetchHeadersAttr)) {
      const headersString = fragment.getRawAttribute(
        fetchHeadersAttr,
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
    // fetch-content-type（イベントあり/なし）
    const fetchCTAttr = Procedure.attrName(event, 'fetch-content-type', true);
    if (fragment.hasAttribute(fetchCTAttr)) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Content-Type': fragment.getAttribute(fetchCTAttr) as string,
      };
    } else if (
      fetchOptions.method &&
      fetchOptions.method !== 'GET' &&
      fetchOptions.method !== 'HEAD' &&
      fetchOptions.method !== 'OPTIONS'
    ) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Content-Type': 'application/json',
      };
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
    const bindArgAttr = event
      ? Procedure.attrName(event, 'bind-arg')
      : Procedure.attrName(null, 'arg', true);
    if (fragment.hasAttribute(bindArgAttr)) {
      options.bindArg = fragment.getRawAttribute(bindArgAttr) as string | null;
    }
    const bindParamsAttr = event
      ? Procedure.attrName(event, 'bind-params')
      : Procedure.attrName(null, 'bind-params', true);
    if (fragment.hasAttribute(bindParamsAttr)) {
      const paramsString = fragment.getRawAttribute(bindParamsAttr) as string;
      options.bindParams = paramsString.split('&').map(p => p.trim());
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
        if (
          fragment.hasAttribute(Procedure.attrName(event, 'adjust-value'))
        ) {
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
        options.dialogMessage = fragment.getAttribute(
          Procedure.attrName(event, 'dialog'),
        ) as string;
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'toast'))) {
        options.toastMessage = fragment.getAttribute(
          Procedure.attrName(event, 'toast'),
        ) as string;
      }
      if (fragment.hasAttribute(Procedure.attrName(event, 'redirect'))) {
        options.redirectUrl = fragment.getAttribute(
          Procedure.attrName(event, 'redirect'),
        ) as string;
      }

      // reset/refetch/click/open/close（イベント、CSSセレクタ）
      const selectorAttrs = [
        'reset',
        'refetch',
        'click',
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
            case 'reset':
              options.resetFragments = list;
              break;
            case 'refetch':
              options.refetchFragments = list;
              break;
            case 'click':
              options.clickFragments = list;
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
    }

    // 非イベントの data / form（data-fetch-data / data-fetch-form）も取り込む
    if (!event) {
      if (
        fragment.hasAttribute(Procedure.attrName(null, 'fetch-data', true))
      ) {
        const raw = fragment.getRawAttribute(
          Procedure.attrName(null, 'fetch-data', true),
        ) as string;
        options.data = Core.parseDataBind(raw);
      }
      if (
        fragment.hasAttribute(Procedure.attrName(null, 'fetch-form', true))
      ) {
        const formSelector = fragment.getRawAttribute(
          Procedure.attrName(null, 'fetch-form', true),
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
   */
  constructor(fragment: ElementFragment, event: string | null);

  /**
   * コンストラクタ。
   *
   * @param arg1 オプションもしくはフラグメント
   * @param arg2 イベント名
   */
  constructor(
    arg1: ProcedureOptions | ElementFragment,
    arg2: string | null = null,
  ) {
    if (Procedure.isElementFragment(arg1)) {
      this.options = Procedure.buildOptions(arg1, arg2);
    } else {
      this.options = arg1;
    }
  }

  /**
   * 一連の処理を実行します。オプションが空の場合は即座にresolveされます。
   *
   * @returns 実行結果のPromise
   */
  run(): Promise<void> {
    if (Object.keys(this.options).length === 0) {
      return Promise.resolve();
    }
    if (
      this.options.formFragment &&
      this.validate(this.options.formFragment) === false
    ) {
      return Promise.resolve();
    }
    return this.confirm().then(confirmed => {
      if (!confirmed) {
        return Promise.resolve();
      }
      let fetchUrl = this.options.fetchUrl;
      let fetchOptions = this.options.fetchOptions;
      if (this.options.beforeCallback) {
        const result = this.options.beforeCallback(
          fetchUrl || null,
          fetchOptions || null,
        );
        if (result !== undefined && result !== null) {
          if (result === false || (typeof result === 'object' && result.stop)) {
            return Promise.resolve();
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

      // フォーム値と data を統合してペイロードを作成
      const payload: Record<string, unknown> = {};
      if (this.options.formFragment) {
        const formValues = Form.getValues(this.options.formFragment);
        Object.assign(payload, formValues);
      }
      if (this.options.data && typeof this.options.data === 'object') {
        Object.assign(payload, this.options.data);
      }

      const hasPayload = Object.keys(payload).length > 0;
      if (fetchUrl) {
        const finalOptions: RequestInit = {...(fetchOptions || {})};
        const headers = new Headers(
          (finalOptions.headers as HeadersInit | undefined) || undefined,
        );
        const method = (finalOptions.method || 'GET').toUpperCase();

        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
          if (hasPayload) {
            const url = new URL(fetchUrl!, window.location.href);
            const params = new URLSearchParams(url.search);
            for (const [k, v] of Object.entries(payload)) {
              if (v === undefined) {
                continue;
              }
              if (v === null) {
                params.append(k, '');
              } else if (Array.isArray(v)) {
                v.forEach(item => {
                  params.append(k, String(item));
                });
              } else if (typeof v === 'object' || typeof v === 'function') {
                params.append(k, JSON.stringify(v));
              } else {
                params.append(k, String(v));
              }
            }
            url.search = params.toString();
            fetchUrl = url.toString();
          }
        } else if (hasPayload) {
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

        // fetchstartイベントを発火
        if (this.options.targetFragment && fetchUrl) {
          const startedAt = performance.now();
          HaoriEvent.fetchStart(
            this.options.targetFragment.getTarget(),
            fetchUrl,
            finalOptions,
            hasPayload ? payload : undefined,
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
        } else if (fetchUrl) {
          return fetch(fetchUrl, finalOptions).then(response => {
            return this.handleFetchResult(response, fetchUrl || undefined);
          });
        } else {
          return Promise.resolve();
        }
      } else {
        const merged = hasPayload ? payload : {};
        const response = new Response(JSON.stringify(merged), {
          headers: {'Content-Type': 'application/json'},
        });
        return this.handleFetchResult(response);
      }
    });
  }

  /**
   * フェッチ後の処理を実行します。
   */
  private handleFetchResult(
    response: Response,
    url?: string,
    startedAt?: number,
  ): Promise<void> {
    // エラー応答時は以後の処理を停止し、メッセージを伝播
    if (!response.ok) {
      if (this.options.targetFragment && url) {
        HaoriEvent.fetchError(
          this.options.targetFragment.getTarget(),
          url,
          new Error(`${response.status} ${response.statusText}`),
          response.status,
          startedAt,
        );
      }
      return this.handleFetchError(response);
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
          return Promise.resolve();
        }
        if (typeof result === 'object' && 'response' in result) {
          response = (
            'response' in result ? result.response : response
          ) as Response;
        }
      }
    }
    const promises: Promise<void>[] = [];
    promises.push(this.bindResult(response));
    promises.push(this.adjust());
    promises.push(this.addRow());
    promises.push(this.removeRow());
    promises.push(this.movePrevRow());
    promises.push(this.moveNextRow());
    if (this.options.resetFragments && this.options.resetFragments.length > 0) {
      this.options.resetFragments.forEach(fragment => {
        promises.push(Form.reset(fragment));
      });
    }
    if (
      this.options.refetchFragments &&
      this.options.refetchFragments.length > 0
    ) {
      this.options.refetchFragments.forEach(fragment => {
        promises.push(new Procedure(fragment, null).run());
      });
    }
    if (this.options.clickFragments && this.options.clickFragments.length > 0) {
      this.options.clickFragments.forEach(fragment => {
        const target = fragment.getTarget();
        if (typeof target.click === 'function') {
          target.click();
        } else {
          target.dispatchEvent(
            new MouseEvent('click', {bubbles: true, cancelable: true}),
          );
        }
      });
    }
    if (this.options.openFragments && this.options.openFragments.length > 0) {
      this.options.openFragments.forEach(fragment => {
        const target = fragment.getTarget();
        if (target instanceof HTMLDialogElement) {
          promises.push(Haori.openDialog(target));
        } else {
          Log.error('Haori', 'Element is not a dialog: ', target);
        }
      });
    }
    if (this.options.closeFragments && this.options.closeFragments.length > 0) {
      this.options.closeFragments.forEach(fragment => {
        const target = fragment.getTarget();
        if (target instanceof HTMLDialogElement) {
          promises.push(Haori.closeDialog(target));
        } else {
          Log.error('Haori', 'Element is not a dialog: ', target);
        }
      });
    }
    // 仕様順序: 先に各種操作（bind/adjust/row/reset/refetch/click/open/close）を完了
    return Promise.all(promises)
      .then(() => {
        // その後にダイアログ/トーストを表示
        if (this.options.dialogMessage) {
          return Haori.dialog(this.options.dialogMessage);
        }
        return Promise.resolve();
      })
      .then(() => {
        if (this.options.toastMessage) {
          return Haori.toast(this.options.toastMessage, 'info');
        }
        return Promise.resolve();
      })
      .then(() => {
        if (this.options.redirectUrl) {
          window.location.href = this.options.redirectUrl;
        }
        return Promise.resolve();
      });
  }

  /**
   * フェッチエラー応答のメッセージを適切な要素へ伝播します。
   */
  private async handleFetchError(response: Response): Promise<void> {
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
      await Haori.addErrorMessage(targetEl, message);
    };

    // コンテンツタイプに応じて解析
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        // 代表的な形式に対応
        const entries: Array<{key?: string; message: string}> = [];
        if (data && typeof data === 'object') {
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
          return;
        }
        // メッセージを反映
        for (const e of entries) {
          if (e.key && baseFragment) {
            await Form.addErrorMessage(baseFragment, e.key, e.message);
          } else {
            await addGeneralMessage(e.message);
          }
        }
        return;
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
    const target = fragment.getTarget();
    let result = this.validateOne(fragment);
    if (!result) {
      target.focus();
    }
    // エラー要素のフォーカスを最上部に移動するため、子要素は逆順で処理
    fragment
      .getChildElementFragments()
      .reverse()
      .forEach(child => {
        result &&= this.validate(child);
      });
    return result;
  }

  /**
   * 対象のフラグメントに対してバリデーションを実行します。
   *
   * @param fragment 対象のフラグメント
   * @returns バリデーション結果（true: 成功, false: 失敗）
   */
  private validateOne(fragment: ElementFragment): boolean {
    const target = fragment.getTarget();
    if (target instanceof HTMLInputElement) {
      return target.reportValidity();
    }
    if (target instanceof HTMLSelectElement) {
      return target.reportValidity();
    }
    if (target instanceof HTMLTextAreaElement) {
      return target.reportValidity();
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
    return Haori.confirm(message);
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
    const promise = response.headers
      .get('Content-Type')
      ?.includes('application/json')
      ? response.json()
      : response.text();
    return promise.then(data => {
      if (this.options.bindParams) {
        const newData = {} as Record<string, unknown>;
        this.options.bindParams.forEach(param => {
          if (data && typeof data === 'object' && param in data) {
            newData[param] = data[param];
          }
        });
        data = newData;
      }
      const promises: Promise<void>[] = [];
      if (this.options.bindArg) {
        this.options.bindFragments!.forEach(fragment => {
          const bindingData = fragment.getBindingData();
          bindingData[this.options.bindArg as string] = data;
          promises.push(Core.setBindingData(fragment.getTarget(), bindingData));
        });
      } else if (typeof data === 'string') {
        Log.error('Haori', 'string data cannot be bound without a bindArg.');
        return Promise.reject(
          new Error('string data cannot be bound without a bindArg.'),
        );
      } else {
        this.options.bindFragments!.forEach(fragment => {
          promises.push(
            Core.setBindingData(
              fragment.getTarget(),
              data as Record<string, unknown>,
            ),
          );
        });
      }
      return Promise.all(promises).then(() => undefined);
    });
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
