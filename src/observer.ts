import {Binding} from './binding';
import {Log} from './log';

/**
 * Observerクラスは、DOMの変更を監視し、バインディングの更新を行います。
 * MutationObserverを使用して、属性の変更、ノードの追加・削除、テキストノードの変更を監視します。
 */
export class Observer {
  /**
   * 初期化メソッド。
   * ドキュメントのheadとbodyを監視対象として設定します。
   */
  public static init() {
    Promise.allSettled([
      Binding.bind(document.head).evaluate(),
      Binding.bind(document.body).evaluate(),
    ])
      .then(() => {
        Observer.observe(document.head);
        Observer.observe(document.body);
      })
      .catch(error => {
        console.error('[Haori]', 'Failed to initialize binding:', error);
      });
  }

  /**
   * 指定された要素を監視します。
   *
   * @param root 監視対象の要素
   */
  public static observe(root: HTMLElement | Document) {
    const observer = new MutationObserver(async mutations => {
      for (const mutation of mutations) {
        switch (mutation.type) {
          case 'attributes':
            // 属性の変更
            Log.info(
              '[Haori]',
              'Attribute changed:',
              mutation.target,
              mutation.attributeName,
            );
            Binding.updateAttribute(
              mutation.target,
              mutation.attributeName!,
              (mutation.target as HTMLElement).getAttribute(
                mutation.attributeName!,
              ),
            );
            break;
          case 'childList':
            // ノードの追加・削除
            Log.info(
              '[Haori]',
              'Child list changed:',
              Array.from(mutation.removedNodes).map(node => node.nodeName),
              Array.from(mutation.addedNodes).map(node => node.nodeName),
            );
            Array.from(mutation.removedNodes).forEach(node => {
              Binding.removeNode(node);
            });
            Array.from(mutation.addedNodes).forEach(node => {
              Binding.bind(node);
              if (!node.parentElement) {
                return;
              }
              if (node instanceof HTMLElement) {
                if (node.nextSibling) {
                  Binding.insertBefore(node, node.nextSibling);
                } else if (node.previousElementSibling) {
                  Binding.insertAfter(node, node.previousElementSibling);
                } else {
                  Binding.appendChild(node.parentElement, node);
                }
              } else {
                Binding.appendChild(node.parentElement, node);
              }
            });
            break;
          case 'characterData':
            // テキストノードの変更
            Log.info(
              '[Haori]',
              'Character data changed:',
              mutation.target,
              mutation.target.textContent,
            );
            Binding.updateTextContent(
              mutation.target,
              mutation.target.textContent!,
            );
            break;
          default:
            continue;
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    Log.info('[Haori]', 'Observer initialized for', root);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Observer.init);
} else {
  Observer.init();
}
