/**
 * @fileoverview 手続き的処理管理機能
 *
 * イベントに基づく手続き的な処理を提供します。
 */

import Core from './core';
import Env from './env';
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
 * 手続き的処理管理クラスです。
 */
export default class Procedure {
  /** バリデーションを行うかどうか */
  private valid = false;

  /** 確認メッセージ */
  private confirmMessage: string | null = null;

  /** 送信もしくは受信データ */
  private data: Record<string, unknown> | null = null;

  /** フェッチ前実行スクリプト */
  private beforeCallback:
    | ((
        fetchUrl: string | null,
        fetchOptions: RequestInit | null,
      ) => BeforeCallbackResult | boolean | void)
    | null = null;

  /** 対象フォームフラグメント */
  private formFragment: ElementFragment;

  /** フェッチURL */
  private fetchUrl: string | null = null;

  /** フェッチオプション */
  private fetchOptions: RequestInit | null = null;

  /** フェッチ後実行スクリプト */
  private afterCallback:
    | ((
        response: Response | Record<string, unknown>,
      ) => AfterCallbackResult | boolean | void)
    | null = null;

  /** バインド対象フラグメント */
  private bindFragments: ElementFragment[] | null = null;

  /** レスポンスデータから抽出するパラメータ名のリスト */
  private bindParams: string[] | null = null;

  /** レスポンスデータをバインドする際のキー名 */
  private bindArg: string | null = null;

  async execute(): Promise<void> {
    if (this.formFragment && this.validate(this.formFragment) === false) {
      return;
    }
    const confirmed = await this.confirm();
    if (!confirmed) {
      return;
    }
    let fetchUrl = this.fetchUrl;
    let fetchOptions = this.fetchOptions;
    if (this.beforeCallback) {
      const result = this.beforeCallback(fetchUrl, fetchOptions);
      if (result === false) {
        return;
      }
      if (typeof result === 'object') {
        fetchUrl = ('fetchUrl' in result ? result.fetchUrl : fetchUrl) as
          | string
          | null;
        fetchOptions = (
          'fetchOptions' in result ? result.fetchOptions : fetchOptions
        ) as RequestInit | null;
      }
      if (fetchUrl) {
        fetch(fetchUrl, fetchOptions ? fetchOptions : undefined).then(
          async response => {
            await this.afterFetch(response);
          },
        );
      } else {
        const response = new Response();
        response.headers.set('Content-Type', 'application/json');
        response.json = async () => {
          return this.data ? this.data : {};
        };
        await this.afterFetch(response);
      }
    }
  }

  /**
   * フェッチ後の処理を実行します。
   */
  private async afterFetch(response: Response): Promise<void> {
    if (this.afterCallback) {
      const result = this.afterCallback(response);
      if (result === false) {
        return;
      }
      if (typeof result === 'object' && 'response' in result) {
        response = (
          'response' in result ? result.response : response
        ) as Response;
      }
    }
    let data: Record<string, unknown> | string | null = null;
    if (this.bindFragments && this.bindFragments.length > 0) {
      if (response.headers.get('Content-Type')?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      if (this.bindParams) {
        const newData = {} as Record<string, unknown>;
        this.bindParams.forEach(param => {
          if (data && typeof data === 'object' && param in data) {
            newData[param] = data[param];
          }
        });
        data = newData;
      }
      if (this.bindArg) {
        this.bindFragments.forEach(fragment => {
          const bindingData = fragment.getBindingData();
          bindingData[this.bindArg as string] = data;
          Core.setAttribute(
            fragment.getTarget(),
            `${Env.prefix}-bind`,
            JSON.stringify(bindingData),
          );
        });
      } else if (typeof data === 'string') {
        Log.error('Haori', 'string data cannot be bound without a bindArg.');
        return;
      } else {
        this.bindFragments.forEach(fragment => {
          fragment.setBindingData(data as Record<string, unknown>);
          Core.setAttribute(
            fragment.getTarget(),
            `${Env.prefix}-bind`,
            JSON.stringify(data),
          );
        });
      }
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
    if (this.valid === false) {
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
    if (this.confirmMessage === null) {
      return Promise.resolve(true);
    }
    return Haori.confirm(this.confirmMessage);
  }
}
