/**
 * @fileoverview IntersectionObserver based trigger dispatcher.
 */

import Env from './env';
import Fragment, {ElementFragment} from './fragment';
import Log from './log';
import Procedure from './procedure';

interface IntersectRegistration {
  fragment: ElementFragment;
  observer: IntersectionObserver;
  once: boolean;
  running: boolean;
}

/**
 * `data-intersect-*` 属性を監視し、交差時に Procedure を実行します。
 */
export default class IntersectObserver {
  private static readonly CONFIG_KEYS = new Set([
    'root',
    'root-margin',
    'threshold',
    'disabled',
    'once',
  ]);

  private static readonly registrations = new Map<
    HTMLElement,
    IntersectRegistration
  >();

  public static syncTree(root: Node): void {
    if (!(root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    if (root instanceof HTMLElement) {
      IntersectObserver.syncElement(root);
    }
    root.querySelectorAll<HTMLElement>('*').forEach(element => {
      IntersectObserver.syncElement(element);
    });
  }

  public static syncElement(element: HTMLElement): void {
    const registration = IntersectObserver.registrations.get(element);
    const fragment = Fragment.get(element);
    if (!fragment || !IntersectObserver.shouldObserve(fragment)) {
      if (registration) {
        registration.observer.disconnect();
        IntersectObserver.registrations.delete(element);
      }
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const nextRoot = IntersectObserver.resolveRoot(fragment);
    const nextRootMargin = IntersectObserver.resolveRootMargin(fragment);
    const nextThreshold = IntersectObserver.resolveThreshold(fragment);
    const nextOnce = fragment.hasAttribute(`${Env.prefix}intersect-once`);

    if (
      registration &&
      registration.observer.root === nextRoot &&
      registration.observer.rootMargin === nextRootMargin &&
      IntersectObserver.sameThreshold(
        registration.observer.thresholds,
        nextThreshold,
      ) &&
      registration.once === nextOnce
    ) {
      registration.fragment = fragment;
      return;
    }

    if (registration) {
      registration.observer.disconnect();
      IntersectObserver.registrations.delete(element);
    }

    const observer = new IntersectionObserver(
      entries => {
        const current = IntersectObserver.registrations.get(element);
        if (!current) {
          return;
        }
        entries.forEach(entry => {
          if (!entry.isIntersecting || current.running) {
            return;
          }
          if (IntersectObserver.isDisabled(current.fragment)) {
            return;
          }
          current.running = true;
          void new Procedure(current.fragment, 'intersect')
            .runWithResult()
            .then(success => {
              if (success && current.once) {
                current.observer.disconnect();
                IntersectObserver.registrations.delete(element);
              }
            })
            .catch(error => {
              Log.error(
                '[Haori]',
                'Intersect procedure execution error:',
                error,
              );
            })
            .finally(() => {
              const latest = IntersectObserver.registrations.get(element);
              if (latest) {
                latest.running = false;
              }
            });
        });
      },
      {
        root: nextRoot,
        rootMargin: nextRootMargin,
        threshold: nextThreshold,
      },
    );

    observer.observe(element);
    IntersectObserver.registrations.set(element, {
      fragment,
      observer,
      once: nextOnce,
      running: false,
    });
  }

  public static cleanupTree(root: Node): void {
    if (root instanceof HTMLElement) {
      const registration = IntersectObserver.registrations.get(root);
      if (registration) {
        registration.observer.disconnect();
        IntersectObserver.registrations.delete(root);
      }
    }
    if (!(root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    root.querySelectorAll<HTMLElement>('*').forEach(element => {
      const registration = IntersectObserver.registrations.get(element);
      if (registration) {
        registration.observer.disconnect();
        IntersectObserver.registrations.delete(element);
      }
    });
  }

  public static disconnectAll(): void {
    IntersectObserver.registrations.forEach(registration => {
      registration.observer.disconnect();
    });
    IntersectObserver.registrations.clear();
  }

  private static shouldObserve(fragment: ElementFragment): boolean {
    return fragment.getAttributeNames().some(name => {
      if (!name.startsWith(`${Env.prefix}intersect-`)) {
        return false;
      }
      const key = name.slice(`${Env.prefix}intersect-`.length);
      return !IntersectObserver.CONFIG_KEYS.has(key);
    });
  }

  private static resolveRoot(fragment: ElementFragment): HTMLElement | null {
    const attrName = `${Env.prefix}intersect-root`;
    if (!fragment.hasAttribute(attrName)) {
      return null;
    }
    const selector = fragment.getAttribute(attrName);
    if (typeof selector !== 'string' || selector.trim() === '') {
      return null;
    }
    const root = document.querySelector(selector);
    if (root instanceof HTMLElement) {
      return root;
    }
    Log.error('[Haori]', `Intersect root element not found: ${selector}`);
    return null;
  }

  private static resolveRootMargin(fragment: ElementFragment): string {
    const attrName = `${Env.prefix}intersect-root-margin`;
    const value = fragment.getAttribute(attrName);
    if (value === null || value === false || value === '') {
      return '0px';
    }
    return String(value);
  }

  private static resolveThreshold(fragment: ElementFragment): number {
    const attrName = `${Env.prefix}intersect-threshold`;
    const value = fragment.getAttribute(attrName);
    const threshold =
      typeof value === 'number' ? value : Number.parseFloat(String(value ?? 0));
    if (Number.isNaN(threshold)) {
      return 0;
    }
    return Math.min(1, Math.max(0, threshold));
  }

  private static isDisabled(fragment: ElementFragment): boolean {
    const attrName = `${Env.prefix}intersect-disabled`;
    const value = fragment.getAttribute(attrName);
    if (value === null || value === false) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const stringValue = String(value).trim().toLowerCase();
    return stringValue !== '' && stringValue !== 'false' && stringValue !== '0';
  }

  private static sameThreshold(
    thresholds: readonly number[],
    threshold: number,
  ): boolean {
    return thresholds.length === 1 && thresholds[0] === threshold;
  }
}
