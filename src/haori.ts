import Log from './log';
import Queue from './queue';

/**
 * Haoriクラスは、アプリケーション全体で使用されるユーティリティメソッドを提供します。
 * 挙動を変更する場合は必要に応じてオーバライドしてください。
 */
export class Haori {
  /**
   * アラートダイアログを表示します。
   *
   * @param message アラートメッセージ
   * @returns アラートが閉じられると解決されるPromise
   */
  public static alert(message: string): Promise<void> {
    return Queue.enqueue(() => {
      window.alert(message);
    }, true) as Promise<void>;
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
   * 通知メッセージを表示します。
   *
   * @param message 通知メッセージ
   * @param level メッセージのレベル（'info' | 'warning' | 'error'）
   */
  public static message(
    message: string,
    level: 'info' | 'warning' | 'error',
  ): Promise<void> {
    return Haori.alert(`[${level.toUpperCase()}] ${message}`);
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
    return Queue.enqueue(() => {
      target.parentElement?.setAttribute('data-message', message);
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
      parent.querySelectorAll('[data-message]').forEach(element => {
        element.removeAttribute('data-message');
      });
    }, true) as Promise<void>;
  }
}
