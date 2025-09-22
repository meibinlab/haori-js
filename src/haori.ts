import Log from './log';
import Queue from './queue';

/**
 * Haoriクラスは、アプリケーション全体で使用されるユーティリティメソッドを提供します。
 * 挙動を変更する場合は必要に応じてオーバライドしてください。
 */
export default class Haori {
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
   * @param level メッセージのレベル（'info' | 'warning' | 'error'）
   * @return 通知が表示されると解決されるPromise
   */
  public static async toast(
    message: string,
    level: 'info' | 'warning' | 'error',
  ): Promise<void> {
    const toast = document.createElement('div');
    toast.className = `haori-toast haori-toast-${level}`;
    toast.textContent = message;
    toast.setAttribute('popover', 'manual');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
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
