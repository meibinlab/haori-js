import Fragment from './fragment';
import Log from './log';

/**
 * @fileoverview 監視機能
 *
 * Observerクラスは、DOMの変更を監視し、バインディングの更新を行います。
 * MutationObserverを使用して、属性の変更、ノードの追加・削除、テキストノードの変更を監視します。
 */
export class Observer {
  /**
   * 初期化メソッド。
   * ドキュメントのheadとbodyを監視対象として設定します。
   */
  public static async init() {
    const results = await Promise.allSettled([
      Fragment.build(document.head),
      Fragment.build(document.body),
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
              Fragment.get(element)?.setAttribute(
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
                Fragment.get(node)?.remove();
              });
              Array.from(mutation.addedNodes).forEach(node => {
                if (!(node.parentElement instanceof HTMLElement)) {
                  return;
                }
                const parent = Fragment.get(node.parentElement);
                const target = Fragment.get(node);
                if (parent && target) {
                  const next = node.nextSibling
                    ? Fragment.get(node.nextSibling)
                    : null;
                  parent.insertBefore(target, next);
                } else {
                  Log.warn(
                    '[Haori]',
                    'Failed to get fragments for node insertion:',
                    {
                      node: node.nodeName,
                      parent: node.parentElement?.nodeName,
                      hasParent: !!parent,
                      hasTarget: !!target,
                    },
                  );
                }
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
              if (mutation.target instanceof Text) {
                const fragment = Fragment.get(mutation.target);
                fragment?.setContent(mutation.target.textContent!);
              } else if (mutation.target instanceof Comment) {
                const fragment = Fragment.get(mutation.target);
                fragment?.setContent(mutation.target.textContent!);
              }
              break;
            }
            default:
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
