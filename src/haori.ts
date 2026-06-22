import Log from './log';
import Env from './env';
import Queue from './queue';
import {
  date,
  distinct,
  findBy,
  groupBy,
  monthAdd,
  monthRange,
  number,
  pageSummary,
  pages,
  range,
  sum,
} from './builtins';
import type {
  GroupItem,
  MonthItem,
  PageItem,
  PageSummary,
  PagesOptions,
} from './builtins';

/**
 * Haoriクラスは、アプリケーション全体で使用されるユーティリティメソッドを提供します。
 * 挙動を変更する場合は必要に応じてオーバライドしてください。
 */
export default class Haori {
  /**
   * 実行モードを取得します。
   *
   * @return 実行モード。
   */
  public static get runtime(): 'embedded' | 'demo' {
    return Env.runtime;
  }

  /**
   * 実行モードを設定します。
   *
   * @param runtime 設定する実行モード。
   * @return 戻り値はありません。
   */
  public static setRuntime(runtime: string): void {
    Env.setRuntime(runtime);
  }

  /**
   * 進行中・追従して投入されるものを含め、すべてのレンダリングタスクの完了を待ちます。
   *
   * `data-each` の大量行のように複数フレームに分割される描画でも、安定して完了する
   * まで待機します。Playwright などの外部テストから、タブ切り替えやクリック後に
   * 描画完了を安全に待機するために利用できます。
   *
   * 例: `await page.evaluate(() => Haori.waitForRenders())`
   *
   * @return すべてのレンダリングが完了したら解決される Promise
   */
  public static waitForRenders(): Promise<void> {
    return Queue.waitForIdle();
  }

  /**
   * 通知ダイアログを表示します。
   *
   * @param message 表示メッセージ
   * @returns 通知が閉じられると解決されるPromise
   */
  public static dialog(message: string): Promise<void> {
    return Queue.enqueue(() => {
      window.alert(message);
    }, true) as Promise<void>;
  }

  /**
   * 通知トーストを表示します。
   *
   * @param message 表示メッセージ
   * @param level メッセージのレベル（省略時は 'info'）
   * @return 通知が表示されると解決されるPromise
   */
  public static async toast(
    message: string,
    level: 'info' | 'warning' | 'error' | 'success' = 'info',
  ): Promise<void> {
    const toast = document.createElement('div');
    toast.className = `haori-toast haori-toast-${level}`;
    toast.textContent = message;
    toast.setAttribute('popover', 'manual');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', level === 'error' ? 'assertive' : 'polite');
    document.body.appendChild(toast);
    toast.showPopover();
    setTimeout(() => {
      try {
        toast.hidePopover();
      } finally {
        toast.remove();
      }
    }, 3000);
  }

  /**
   * 確認ダイアログを表示します。
   *
   * @param message 確認メッセージ
   * @returns ユーザーがOKをクリックした場合はtrue、キャンセルした場合はfalseが解決されるPromise
   */
  public static confirm(message: string): Promise<boolean> {
    return Queue.enqueue(() => {
      return window.confirm(message);
    }, true) as Promise<boolean>;
  }

  /**
   * ダイアログを開きます。
   *
   * @param element 開くダイアログのHTML要素
   */
  public static openDialog(element: HTMLElement): Promise<void> {
    return Queue.enqueue(() => {
      if (element instanceof HTMLDialogElement) {
        // 再表示時に前回のメッセージが残らないよう、開く前にクリアする。
        Haori.clearMessagesSync(element);
        element.showModal();
      } else {
        Log.error('[Haori]', 'Element is not a dialog: ', element);
      }
    }, true) as Promise<void>;
  }

  /**
   * ダイアログを閉じます。
   *
   * @param element 閉じるダイアログのHTML要素
   */
  public static closeDialog(element: HTMLElement): Promise<void> {
    return Queue.enqueue(() => {
      if (element instanceof HTMLDialogElement) {
        element.close();
      } else {
        Log.error('[Haori]', 'Element is not a dialog: ', element);
      }
    }, true) as Promise<void>;
  }

  /**
   * エラーメッセージを追加します。
   *
   * @param target メッセージを表示する要素
   * @param message エラーメッセージ
   */
  public static addErrorMessage(
    target: HTMLElement | HTMLFormElement,
    message: string,
  ): Promise<void> {
    return Haori.addMessage(target, message, 'error');
  }

  /**
   * メッセージをレベル付きで追加します。
   *
   * @param target メッセージを表示する要素
   * @param message メッセージ
   * @param level メッセージのレベル（省略可能）
   */
  public static addMessage(
    target: HTMLElement | HTMLFormElement,
    message: string,
    level?: 'info' | 'warning' | 'error' | 'success',
  ): Promise<void> {
    return Queue.enqueue(() => {
      // 仕様: 入力要素の場合は親要素に、フォーム要素の場合はフォーム自身に data-message を付与する。
      const recipient =
        target instanceof HTMLFormElement
          ? target
          : (target.parentElement ?? target);
      recipient.setAttribute('data-message', message);
      if (level !== undefined) {
        recipient.setAttribute('data-message-level', level);
      } else {
        recipient.removeAttribute('data-message-level');
      }
    }, true) as Promise<void>;
  }

  /**
   * 対象のエレメントおよびその子要素のメッセージをクリアします。
   *
   * @param parent メッセージをクリアする親要素
   */
  public static clearMessages(parent: HTMLElement): Promise<void> {
    return Queue.enqueue(() => {
      Haori.clearMessagesSync(parent);
    }, true) as Promise<void>;
  }

  /**
   * 対象のエレメントおよびその子要素のメッセージ属性を同期的に除去します。
   *
   * Queue を介さないため、別の enqueue ブロック内から実行順を保ったまま
   * 呼び出せます。{@link clearMessages} および {@link openDialog} の共通処理です。
   *
   * @param parent メッセージをクリアする親要素
   */
  private static clearMessagesSync(parent: HTMLElement): void {
    parent.removeAttribute('data-message');
    parent.removeAttribute('data-message-level');
    parent.querySelectorAll('[data-message]').forEach(element => {
      element.removeAttribute('data-message');
      element.removeAttribute('data-message-level');
    });
  }

  /**
   * 日時を指定フォーマットの文字列へ整形します。
   *
   * テンプレート式中の `haori.date(...)` と同じ実装です。
   *
   * @param value 整形対象の日時（ISO 文字列・エポックミリ秒・Date）
   * @param format フォーマット文字列（省略時は `yyyy/MM/dd HH:mm`）
   * @param timeZone IANA タイムゾーン名（例 `Asia/Tokyo`）。省略時はローカルタイムゾーン
   * @returns 整形済み文字列。整形できない場合は空文字
   */
  public static date(
    value: string | number | Date | null | undefined,
    format?: string,
    timeZone?: string,
  ): string {
    return date(value, format, timeZone);
  }

  /**
   * 数値を桁区切り・小数桁付きの文字列へ整形します。
   *
   * テンプレート式中の `haori.number(...)` と同じ実装です。
   *
   * @param value 整形対象（数値または数値文字列）
   * @param decimals 小数桁数（省略可能）
   * @returns 整形済み文字列。整形できない場合は空文字
   */
  public static number(
    value: number | string | null | undefined,
    decimals?: number,
  ): string {
    return number(value, decimals);
  }

  /**
   * 整数の配列を生成します（終端は排他）。
   *
   * テンプレート式中の `haori.range(...)` と同じ実装です。
   *
   * @param start `end` 省略時は終端、指定時は開始値
   * @param end 終端（排他）
   * @param step 刻み幅（省略時は 1）
   * @returns 整数配列
   */
  public static range(start: number, end?: number, step?: number): number[] {
    return range(start, end, step);
  }

  /**
   * 番号ページネーション用の表示要素列を生成します。
   *
   * テンプレート式中の `haori.pages(...)` と同じ実装です。
   *
   * @param totalPages 総ページ数
   * @param current 現在ページ（0 始まり）
   * @param options 表示調整オプション（window・boundary）
   * @returns 表示要素の配列
   */
  public static pages(
    totalPages: number,
    current: number,
    options?: PagesOptions,
  ): PageItem[] {
    return pages(totalPages, current, options);
  }

  /**
   * `YYYY-MM` 形式の年月文字列に月数を加算します。
   *
   * テンプレート式中の `haori.monthAdd(...)` と同じ実装です。
   *
   * @param value 基準となる年月（`YYYY-MM` 形式）
   * @param delta 加算する月数（負数で過去方向）
   * @returns 加算後の年月（`YYYY-MM` 形式）。不正な入力は空文字
   */
  public static monthAdd(
    value: string | null | undefined,
    delta: number,
  ): string {
    return monthAdd(value, delta);
  }

  /**
   * 基準月から過去方向へ `count + 1` 個の年月配列を降順で返します。
   *
   * テンプレート式中の `haori.monthRange(...)` と同じ実装です。
   *
   * @param count 基準月から遡る月数（戻り値の要素数は `count + 1`）
   * @param base 基準月（`YYYY-MM` 形式、省略時は現在月）
   * @returns 年月情報の降順配列。不正な入力は空配列
   */
  public static monthRange(count: number, base?: string): MonthItem[] {
    return monthRange(count, base);
  }

  /**
   * ページレスポンスから表示用サマリーを作ります。
   *
   * テンプレート式中の `haori.pageSummary(...)` と同じ実装です。
   *
   * @param page ページ情報（`number`・`size`・`totalElements`／`totalCount` 等）
   * @param visibleCount 現在表示している件数（省略可）
   * @returns 表示サマリー
   */
  public static pageSummary(
    page: Record<string, unknown> | null | undefined,
    visibleCount?: number,
  ): PageSummary {
    return pageSummary(page, visibleCount);
  }

  /**
   * 配列から `item[key]` が指定値に一致する最初の要素を返します。
   *
   * テンプレート式中の `haori.findBy(...)` と同じ実装です。比較は文字列化して
   * 行い、一致が無ければ null を返します。
   *
   * @param array 検索対象の配列
   * @param key 比較に使うプロパティ名
   * @param value 一致させたい値（文字列化して比較）
   * @returns 一致した最初の要素。無ければ null
   */
  public static findBy(array: unknown, key: string, value: unknown): unknown {
    return findBy(array, key, value);
  }

  /**
   * 配列の数値合計を返します。
   *
   * テンプレート式中の `haori.sum(...)` と同じ実装です。`key` 省略時は要素自体を、
   * 指定時は `item[key]` を合計し、数値化できない値は無視します。
   *
   * @param array 集計対象の配列
   * @param key 合計するプロパティ名（省略時は要素自体）
   * @returns 数値の合計。対象が無ければ 0
   */
  public static sum(array: unknown, key?: string): number {
    return sum(array, key);
  }

  /**
   * 配列から重複を取り除いた新しい配列を返します。
   *
   * テンプレート式中の `haori.distinct(...)` と同じ実装です。`key` 省略時は要素
   * 自体で、指定時は `item[key]` で重複を判定します（比較は文字列化）。
   *
   * @param array 対象の配列
   * @param key 重複判定に使うプロパティ名（省略時は要素自体）
   * @returns 重複排除後の新しい配列。非配列は空配列
   */
  public static distinct(array: unknown, key?: string): unknown[] {
    return distinct(array, key);
  }

  /**
   * 配列を `item[key]` ごとのグループへ分けて返します。
   *
   * テンプレート式中の `haori.groupBy(...)` と同じ実装です。戻り値は
   * `{key, items}` の配列で、`data-each` で繰り返してグループ描画できます。
   *
   * @param array 対象の配列
   * @param key グループ分けに使うプロパティ名
   * @returns グループ情報の配列。非配列は空配列
   */
  public static groupBy(array: unknown, key: string): GroupItem[] {
    return groupBy(array, key);
  }
}
