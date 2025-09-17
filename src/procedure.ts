/**
 * @fileoverview 手続き的処理管理機能
 *
 * イベントに基づく手続き的な処理を提供します。
 */

import Core from './core';
import {ElementFragment} from './fragment';
import {Haori} from './haori';
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

  /** フェッチ後実行スクリプト */
  afterCallback?: (
    response: Response | Record<string, unknown>,
  ) => AfterCallbackResult | boolean | void;

  /** バインド対象フラグメント */
  bindFragments?: ElementFragment[] | null;

  /** レスポンスデータから抽出するパラメータ名のリスト */
  bindParams?: string[] | null;

  /** レスポンスデータをバインドする際のキー名 */
  bindArg?: string | null;

  /** 値を変更するフラグメント */
  adjustFragments?: ElementFragment[] | null;

  /** 変更する値の増減値 */
  adjustValue?: number | null;
}

/**
 * 手続き的処理管理クラスです。
 */
export default class Procedure {
  /** オプション */
  private readonly options: ProcedureOptions;

  /**
   * Procedureクラスのコンストラクタです。
   *
   * @param options オプション
   */
  constructor(options: ProcedureOptions = {}) {
    this.options = options;
  }

  run(): Promise<void> {
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
      if (fetchUrl) {
        return fetch(fetchUrl, fetchOptions || undefined).then(response => {
          return this.handleFetchResult(response);
        });
      } else {
        const response = new Response();
        response.headers.set('Content-Type', 'application/json');
        response.json = async () => {
          return this.options.data ?? {};
        };
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
      if (result === false || (typeof result === 'object' && result.stop)) {
        return Promise.resolve();
      }
      if (typeof result === 'object' && 'response' in result) {
        response = (
          'response' in result ? result.response : response
        ) as Response;
      }
    }
    const promises: Promise<void>[] = [];
    promises.push(this.bindResult(response));
    promises.push(this.adjust());
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * 対象のフラグメント以下の入力要素に対してバリデーションを実行します。
   * バリデーションエラーがある場合は、最初のエラー要素にフォーカスを移動します。
   *
   * @param fragment 対象のフラグメント
   * @returns バリデーション結果（true: 成功, false: 失敗）
   */
  validate(fragment: ElementFragment): boolean {
    if (this.options.valid === false) {
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
    if (
      this.options.confirmMessage === null ||
      this.options.confirmMessage === undefined
    ) {
      return Promise.resolve(true);
    }
    return Haori.confirm(this.options.confirmMessage);
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
}
