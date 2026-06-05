import Log from './log';
import Env from './env';
import Queue from './queue';
import {date, number, pages, range} from './builtins';
import type {PageItem, PagesOptions} from './builtins';

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
      parent.removeAttribute('data-message');
      parent.removeAttribute('data-message-level');
      parent.querySelectorAll('[data-message]').forEach(element => {
        element.removeAttribute('data-message');
        element.removeAttribute('data-message-level');
      });
    }, true) as Promise<void>;
  }

  /**
   * 日時を指定フォーマットの文字列へ整形します。
   *
   * テンプレート式中の `haori.date(...)` と同じ実装です。
   *
   * @param value 整形対象の日時（ISO 文字列・エポックミリ秒・Date）
   * @param format フォーマット文字列（省略時は `yyyy/MM/dd HH:mm`）
   * @returns 整形済み文字列。整形できない場合は空文字
   */
  public static date(
    value: string | number | Date | null | undefined,
    format?: string,
  ): string {
    return date(value, format);
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
}
