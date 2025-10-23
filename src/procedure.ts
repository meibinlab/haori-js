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
  targetFragment: ElementFragment;

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
  private static buildOptions(
    fragment: ElementFragment,
    event: string | null,
  ): ProcedureOptions {
    const options: ProcedureOptions = {
      targetFragment: fragment,
    };
    if (event) {
      if (fragment.existsAttribute(`${Env.prefix}-${event}-valid`)) {
        options.valid = true;
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-confirm`)) {
        options.confirmMessage = fragment.getAttribute(
          `${Env.prefix}-${event}-confirm`,
        ) as string;
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-data`)) {
        options.data = Core.parseDataBind(
          fragment.getRawAttribute(`${Env.prefix}-${event}-data`) as string,
        );
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-form`)) {
        const formSelector = fragment.getRawAttribute(
          `${Env.prefix}-${event}-form`,
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
                ` (${Env.prefix}-${event}-form)`,
            );
          }
        }
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-before-run`)) {
        const body = fragment.getRawAttribute(
          `${Env.prefix}-${event}-before-run`,
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
    if (
      fragment.existsAttribute(`${Env.prefix}${event ? '-' + event : ''}-fetch`)
    ) {
      options.fetchUrl = fragment.getAttribute(
        `${Env.prefix}${event ? '-' + event : ''}-fetch`,
      ) as string;
    }
    const fetchOptions: RequestInit = {};
    if (
      fragment.existsAttribute(
        `${Env.prefix}${event ? '-' + event : ''}-fetch-method`,
      )
    ) {
      fetchOptions.method = fragment.getAttribute(
        `${Env.prefix}${event ? '-' + event : ''}-fetch-method`,
      ) as string;
    }
    if (
      fragment.existsAttribute(
        `${Env.prefix}${event ? '-' + event : ''}-fetch-headers`,
      )
    ) {
      const headersString = fragment.getRawAttribute(
        `${Env.prefix}${event ? '-' + event : ''}-fetch-headers`,
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
    if (
      fragment.existsAttribute(
        `${Env.prefix}${event ? '-' + event : ''}-fetch-content-type`,
      )
    ) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Content-Type': fragment.getAttribute(
          `${Env.prefix}${event ? '-' + event : ''}-fetch-content-type`,
        ) as string,
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
    }
    if (Object.keys(fetchOptions).length > 0) {
      options.fetchOptions = fetchOptions;
    }
    if (fragment.existsAttribute(`${Env.prefix}-${event ?? 'fetch'}-bind`)) {
      const bindSelector = fragment.getRawAttribute(
        `${Env.prefix}-${event ?? 'fetch'}-bind`,
      ) as string | null;
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
            `Bind element not found: ${bindSelector}` +
              ` (${Env.prefix}-${event ?? 'fetch'}-bind)`,
          );
        }
      }
    }
    if (
      fragment.existsAttribute(`${Env.prefix}-${event ?? 'fetch'}-bind-arg`)
    ) {
      options.bindArg = fragment.getRawAttribute(
        `${Env.prefix}-${event ?? 'fetch'}-bind-arg`,
      ) as string | null;
    }
    if (
      fragment.existsAttribute(`${Env.prefix}-${event ?? 'fetch'}-bind-params`)
    ) {
      const paramsString = fragment.getRawAttribute(
        `${Env.prefix}-${event ?? 'fetch'}-bind-params`,
      ) as string;
      options.bindParams = paramsString.split('&').map(p => p.trim());
    }
    if (event) {
      if (fragment.existsAttribute(`${Env.prefix}-${event}-adjust`)) {
        const adjustSelector = fragment.getRawAttribute(
          `${Env.prefix}-${event}-adjust`,
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
                ` (${Env.prefix}-${event}-adjust)`,
            );
          }
        }
        if (fragment.existsAttribute(`${Env.prefix}-${event}-adjust-value`)) {
          const valueString = fragment.getRawAttribute(
            `${Env.prefix}-${event}-adjust-value`,
          ) as string;
          const value = Number(valueString);
          if (!isNaN(value)) {
            options.adjustValue = value;
          }
        }
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-row-add`)) {
        options.rowAdd = true;
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-row-remove`)) {
        options.rowRemove = true;
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-row-prev`)) {
        options.rowMovePrev = true;
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-row-next`)) {
        options.rowMoveNext = true;
      }
      if (fragment.existsAttribute(`${Env.prefix}-${event}-after-run`)) {
        const body = fragment.getRawAttribute(
          `${Env.prefix}-${event}-after-run`,
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
      if (fragment.existsAttribute(`${Env.prefix}-${event}-dialog`)) {
        options.dialogMessage = fragment.getAttribute(
          `${Env.prefix}-${event}-dialog`,
        ) as string;
      }
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
    if (typeof value !== 'object' || value === null) return false;
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
      if (fetchUrl) {
        return fetch(fetchUrl, fetchOptions || undefined).then(response => {
          return this.handleFetchResult(response);
        });
      } else {
        const response = new Response(JSON.stringify(this.options.data ?? {}), {
          headers: {'Content-Type': 'application/json'},
        });
        return this.handleFetchResult(response);
      }
    });
  }

  /**
   * フェッチ後の処理を実行します。
   */
  private handleFetchResult(response: Response): Promise<void> {
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
    let dialogPromise: Promise<void>;
    if (this.options.dialogMessage) {
      dialogPromise = Haori.dialog(this.options.dialogMessage);
    } else {
      dialogPromise = Promise.resolve();
    }
    return dialogPromise.then(() => {
      if (this.options.toastMessage) {
        Haori.toast(this.options.toastMessage, 'info');
      }
      return Promise.all(promises).then(() => {
        if (this.options.redirectUrl) {
          window.location.href = this.options.redirectUrl;
        }
        return Promise.resolve();
      });
    });
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
    const rowFragment = this.options.targetFragment.closestByAttribute(
      `${Env.prefix}-row`,
    );
    if (!rowFragment) {
      Log.error(
        'Haori',
        `Row fragment not found: ${this.options.targetFragment.getTarget()}`,
      );
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
      return Promise.reject(
        new Error(
          `Row fragment not found: ${this.options.targetFragment.getTarget()}`,
        ),
      );
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
      return Promise.reject(
        new Error(
          `Row fragment not found: ${this.options.targetFragment.getTarget()}`,
        ),
      );
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
      return Promise.reject(
        new Error(
          `Row fragment not found: ${this.options.targetFragment.getTarget()}`,
        ),
      );
    }
    const prevFragment = rowFragment.getPrevious();
    if (!prevFragment) {
      return Promise.resolve();
    }
    return prevFragment.insertBefore(rowFragment, prevFragment);
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
      return Promise.reject(
        new Error(
          `Row fragment not found: ${this.options.targetFragment.getTarget()}`,
        ),
      );
    }
    const nextFragment = rowFragment.getNext();
    if (!nextFragment) {
      return Promise.resolve();
    }
    return nextFragment.insertAfter(rowFragment, nextFragment);
  }
}
