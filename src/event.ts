/**
 * @fileoverview Haoriイベント発火ユーティリティ
 *
 * Haoriライブラリが発火するカスタムイベントの統一的な発火機能を提供します。
 */

/**
 * Haoriイベントを発火するユーティリティクラス
 */
export default class HaoriEvent {
  /**
   * カスタムイベントを発火します。
   *
   * @param target イベントを発火する対象要素
   * @param eventName イベント名（haori:プレフィックスは自動追加）
   * @param detail イベントの詳細データ
   * @param options イベントオプション
   */
  public static dispatch(
    target: EventTarget,
    eventName: string,
    detail?: unknown,
    options?: {
      bubbles?: boolean;
      cancelable?: boolean;
      composed?: boolean;
    },
  ): boolean {
    const event = new CustomEvent(`haori:${eventName}`, {
      bubbles: options?.bubbles ?? true,
      cancelable: options?.cancelable ?? false,
      composed: options?.composed ?? true,
      detail,
    });

    return target.dispatchEvent(event);
  }

  /**
   * readyイベントを発火します。
   *
   * @param version ライブラリバージョン
   */
  public static ready(version?: string): void {
    HaoriEvent.dispatch(document, 'ready', {version});
  }

  /**
   * renderイベントを発火します。
   *
   * @param target 評価対象要素
   */
  public static render(target: HTMLElement): void {
    HaoriEvent.dispatch(target, 'render', {target});
  }

  /**
   * importstartイベントを発火します。
   *
   * @param target data-import要素
   * @param url インポート対象URL
   */
  public static importStart(target: HTMLElement, url: string): void {
    HaoriEvent.dispatch(target, 'importstart', {
      url,
      startedAt: performance.now(),
    });
  }

  /**
   * importendイベントを発火します。
   *
   * @param target data-import要素
   * @param url インポート対象URL
   * @param bytes 取得バイト数
   * @param startedAt 開始時刻
   */
  public static importEnd(
    target: HTMLElement,
    url: string,
    bytes: number,
    startedAt: number,
  ): void {
    HaoriEvent.dispatch(target, 'importend', {
      url,
      bytes,
      durationMs: performance.now() - startedAt,
    });
  }

  /**
   * importerrorイベントを発火します。
   *
   * @param target data-import要素
   * @param url インポート対象URL
   * @param error エラー内容
   */
  public static importError(
    target: HTMLElement,
    url: string,
    error: unknown,
  ): void {
    HaoriEvent.dispatch(target, 'importerror', {url, error});
  }

  /**
   * bindchangeイベントを発火します。
   *
   * @param target バインド対象要素
   * @param previous 変更前のデータ
   * @param next 変更後のデータ
   * @param reason 変更理由
   */
  public static bindChange(
    target: HTMLElement,
    previous: Record<string, unknown> | null,
    next: Record<string, unknown>,
    reason: 'form' | 'fetch' | 'manual' | 'import' | 'other' = 'other',
  ): void {
    const changedKeys: string[] = [];

    // 変更されたキーを検出
    const prevKeys = new Set(Object.keys(previous || {}));
    const nextKeys = new Set(Object.keys(next));
    const allKeys = new Set([...prevKeys, ...nextKeys]);

    for (const key of allKeys) {
      const prevValue = previous?.[key];
      const nextValue = next[key];
      if (prevValue !== nextValue) {
        changedKeys.push(key);
      }
    }

    HaoriEvent.dispatch(target, 'bindchange', {
      previous: previous || {},
      next,
      changedKeys,
      reason,
    });
  }

  /**
   * eachupdateイベントを発火します。
   *
   * @param target data-each要素
   * @param added 追加された行のキー
   * @param removed 削除された行のキー
   * @param order 現在の順序
   */
  public static eachUpdate(
    target: HTMLElement,
    added: string[],
    removed: string[],
    order: string[],
  ): void {
    HaoriEvent.dispatch(target, 'eachupdate', {
      added,
      removed,
      order,
      total: order.length,
    });
  }

  /**
   * rowaddイベントを発火します。
   *
   * @param target 行要素
   * @param key 行キー
   * @param index インデックス
   * @param item 行データ
   */
  public static rowAdd(
    target: HTMLElement,
    key: string,
    index: number,
    item: unknown,
  ): void {
    HaoriEvent.dispatch(target, 'rowadd', {key, index, item});
  }

  /**
   * rowremoveイベントを発火します。
   *
   * @param target 行要素
   * @param key 行キー
   * @param index インデックス
   */
  public static rowRemove(
    target: HTMLElement,
    key: string,
    index: number,
  ): void {
    HaoriEvent.dispatch(target, 'rowremove', {key, index});
  }

  /**
   * rowmoveイベントを発火します。
   *
   * @param target 行要素
   * @param key 行キー
   * @param from 移動前インデックス
   * @param to 移動後インデックス
   */
  public static rowMove(
    target: HTMLElement,
    key: string,
    from: number,
    to: number,
  ): void {
    HaoriEvent.dispatch(target, 'rowmove', {key, from, to});
  }

  /**
   * showイベントを発火します。
   *
   * @param target data-if要素
   */
  public static show(target: HTMLElement): void {
    HaoriEvent.dispatch(target, 'show', {visible: true});
  }

  /**
   * hideイベントを発火します。
   *
   * @param target data-if要素
   */
  public static hide(target: HTMLElement): void {
    HaoriEvent.dispatch(target, 'hide', {visible: false});
  }

  /**
   * fetchstartイベントを発火します。
   *
   * @param target 起点要素
   * @param url フェッチURL
   * @param options フェッチオプション
   * @param payload 送信データ
   */
  public static fetchStart(
    target: HTMLElement,
    url: string,
    options?: RequestInit,
    payload?: Record<string, unknown>,
  ): void {
    HaoriEvent.dispatch(target, 'fetchstart', {
      url,
      options: options || {},
      payload,
      startedAt: performance.now(),
    });
  }

  /**
   * fetchendイベントを発火します。
   *
   * @param target 起点要素
   * @param url フェッチURL
   * @param status HTTPステータス
   * @param startedAt 開始時刻
   */
  public static fetchEnd(
    target: HTMLElement,
    url: string,
    status: number,
    startedAt: number,
  ): void {
    HaoriEvent.dispatch(target, 'fetchend', {
      url,
      status,
      durationMs: performance.now() - startedAt,
    });
  }

  /**
   * fetcherrorイベントを発火します。
   *
   * @param target 起点要素
   * @param url フェッチURL
   * @param error エラー内容
   * @param status HTTPステータス（存在する場合）
   * @param startedAt 開始時刻（存在する場合）
   */
  public static fetchError(
    target: HTMLElement,
    url: string,
    error: unknown,
    status?: number,
    startedAt?: number,
  ): void {
    HaoriEvent.dispatch(target, 'fetcherror', {
      url,
      status,
      error,
      durationMs: startedAt ? performance.now() - startedAt : undefined,
    });
  }
}
