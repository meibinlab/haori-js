/**
 * @fileoverview 監視機能
 *
 * Observerクラスは、DOMの変更を監視し、バインディングの更新を行います。
 * MutationObserverを使用して、属性の変更、ノードの追加・削除、テキストノードの変更を監視します。
 */
import Core from './core';
import Env from './env';
import EventDispatcher from './event_dispatcher';
import IntersectObserver from './intersect';
import Log from './log';
import Queue from './queue';
import VisibleRangeObserver from './visible_range';

/**
 * 監視対象の要素を管理するためのクラスです。
 */
export class Observer {
  private static _initialized = false;

  /** 稼働中の MutationObserver 一覧 */
  private static readonly _mutationObservers: MutationObserver[] = [];

  /**
   * 既存の MutationObserver をすべて停止します。
   */
  private static disconnectMutationObservers(): void {
    Observer._mutationObservers.forEach(observer => {
      observer.disconnect();
    });
    Observer._mutationObservers.length = 0;
  }

  /**
   * 初期化メソッド。
   * ドキュメントのheadとbodyを監視対象として設定します。
   */
  public static async init() {
    if (Observer._initialized) {
      return;
    }
    Observer._initialized = true;
    Observer.disconnectMutationObservers();
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
    await Queue.wait();
    document.body.setAttribute('data-haori-ready', '');
    Observer.observe(document.head);
    Observer.observe(document.body);
    new EventDispatcher().start();
    IntersectObserver.syncTree(document.body);
    VisibleRangeObserver.syncTree(document.body);
  }

  /**
   * 指定ノードが「外部管理」サブツリーに属するかどうかを判定します。
   *
   * `data-external` 属性を持つ要素とその子孫で発生した DOM 変更は、外部の
   * select 拡張ライブラリ（Choices.js など）が生成・更新する DOM とみなし、
   * Haori の監視・自動更新の対象から除外します。これにより、外部生成 DOM が
   * Haori に破壊・干渉されることを防ぎます。`data-each` による `<option>` の
   * 配列バインドは Haori のバインド評価パイプラインが駆動するため、監視除外
   * 下でも維持されます。
   *
   * @param node 判定対象のノード（要素・テキスト・コメントいずれも可）
   * @returns 外部管理サブツリーに属する場合 true
   */
  private static isExternallyManaged(node: Node | null): boolean {
    const element =
      node instanceof Element ? node : (node?.parentElement ?? null);
    return element?.closest(`[${Env.prefix}external]`) != null;
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
          // 外部管理サブツリー（data-external 配下）で発生した変更は、外部の
          // select 拡張ライブラリ等が生成・更新する DOM とみなして無視する。
          if (Observer.isExternallyManaged(mutation.target)) {
            continue;
          }
          switch (mutation.type) {
            case 'attributes': {
              const element = mutation.target as HTMLElement;
              if (
                mutation.attributeName &&
                element.hasAttribute('data-haori-click-lock') &&
                (mutation.attributeName === 'disabled' ||
                  mutation.attributeName === 'data-haori-click-lock')
              ) {
                break;
              }
              if (
                mutation.attributeName &&
                Core.isAliasedAttributeReflection(
                  element,
                  mutation.attributeName,
                )
              ) {
                break;
              }
              Core.setAttribute(
                element,
                mutation.attributeName!,
                element.getAttribute(mutation.attributeName!),
                true,
              );
              IntersectObserver.syncElement(element);
              VisibleRangeObserver.syncElement(element);
              break;
            }
            case 'childList': {
              Array.from(mutation.removedNodes).forEach(node => {
                IntersectObserver.cleanupTree(node);
                VisibleRangeObserver.cleanupTree(node);
                Core.removeNode(node);
              });
              Array.from(mutation.addedNodes).forEach(node => {
                if (!(node.parentElement instanceof Element)) {
                  return;
                }
                Core.addNode(node.parentElement, node);
                IntersectObserver.syncTree(node);
                VisibleRangeObserver.syncTree(node);
              });
              // 行の増減があったコンテナ自身の監視対象を取り直す
              // （data-each-visible は親コンテナに付与され、行はその子のため）。
              if (mutation.target instanceof Element) {
                VisibleRangeObserver.syncElement(
                  mutation.target as HTMLElement,
                );
              }
              break;
            }
            case 'characterData': {
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
    Observer._mutationObservers.push(observer);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Observer.init);
} else {
  Observer.init();
}
