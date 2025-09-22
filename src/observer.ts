/**
 * @fileoverview 監視機能
 *
 * Observerクラスは、DOMの変更を監視し、バインディングの更新を行います。
 * MutationObserverを使用して、属性の変更、ノードの追加・削除、テキストノードの変更を監視します。
 */
import Core from './core';
import EventDispatcher from './event_dispatcher';
import Log from './log';

/**
 * 監視対象の要素を管理するためのクラスです。
 */
export class Observer {
  /**
   * 初期化メソッド。
   * ドキュメントのheadとbodyを監視対象として設定します。
   */
  public static async init() {
    const results = await Promise.allSettled([
      Core.scan(document.head),
      Core.scan(document.body),
    ]);
    const [headResult, bodyResult] = results;
    if (headResult.status !== 'fulfilled') {
      Log.error('[Haori]', 'Failed to build head fragment:', headResult.reason);
    }
    if (bodyResult.status !== 'fulfilled') {
      Log.error('[Haori]', 'Failed to build body fragment:', bodyResult.reason);
    }
    Observer.observe(document.head);
    Observer.observe(document.body);
    new EventDispatcher().start();
  }

  /**
   * 指定された要素を監視します。
   *
   * @param root 監視対象の要素
   */
  public static observe(root: HTMLElement | Document) {
    const observer = new MutationObserver(async mutations => {
      for (const mutation of mutations) {
        try {
          switch (mutation.type) {
            case 'attributes': {
              // 属性の変更
              Log.info(
                '[Haori]',
                'Attribute changed:',
                mutation.target,
                mutation.attributeName,
              );
              const element = mutation.target as HTMLElement;
              Core.setAttribute(
                element,
                mutation.attributeName!,
                element.getAttribute(mutation.attributeName!),
              );
              break;
            }
            case 'childList': {
              // ノードの追加・削除
              Log.info(
                '[Haori]',
                'Child list changed:',
                Array.from(mutation.removedNodes).map(node => node.nodeName),
                Array.from(mutation.addedNodes).map(node => node.nodeName),
              );
              Array.from(mutation.removedNodes).forEach(node => {
                Core.removeNode(node);
              });
              Array.from(mutation.addedNodes).forEach(node => {
                if (!(node.parentElement instanceof HTMLElement)) {
                  return;
                }
                Core.addNode(node.parentElement, node);
              });
              break;
            }
            case 'characterData': {
              // テキストノードの変更
              Log.info(
                '[Haori]',
                'Character data changed:',
                mutation.target,
                mutation.target.textContent,
              );
              if (
                mutation.target instanceof Text ||
                mutation.target instanceof Comment
              ) {
                Core.changeText(mutation.target, mutation.target.textContent!);
              } else {
                Log.warn(
                  '[Haori]',
                  'Unsupported character data type:',
                  mutation.target,
                );
              }
              break;
            }
            default:
              Log.warn('[Haori]', 'Unknown mutation type:', mutation.type);
              continue;
          }
        } catch (error) {
          Log.error('[Haori]', 'Error processing mutation:', error);
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
