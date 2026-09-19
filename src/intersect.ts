/**
 * @fileoverview IntersectionObserver based trigger dispatcher.
 */

import Env from './env';
import Fragment, {ElementFragment} from './fragment';
import Log from './log';
import Procedure from './procedure';
import Selector from './selector';

/** 監視中の要素ごとに保持する登録情報。 */
interface IntersectRegistration {
  /** 手続きの宣言を読む対象のフラグメント。 */
  fragment: ElementFragment;
  /** この要素に割り当てた監視。 */
  observer: IntersectionObserver;
  /** `data-intersect-once` が指定されているかどうか。 */
  once: boolean;
  /** 手続きを実行中かどうか。 */
  running: boolean;
  /** 最後に通知された交差状態。抑止で捨てた通知も含めて記録します。 */
  intersecting: boolean;
  /** 抑止によって開始しなかった交差を覚えているかどうか。 */
  pending: boolean;
  /** 監視を作ったときの `root`。 */
  root: HTMLElement | null;
  /** 監視を作ったときの `rootMargin`。 */
  rootMargin: string;
  /** 監視を作ったときの `threshold`。 */
  threshold: number;
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

  /**
   * ノードが現在の Window に属する HTMLElement かどうかを判定します。
   *
   * @param node 判定対象ノード
   * @returns HTMLElement の場合は true
   */
  private static isHtmlElement(node: unknown): node is HTMLElement {
    if (!(node instanceof Element)) {
      return false;
    }
    const ctor = node.ownerDocument?.defaultView?.HTMLElement;
    return typeof ctor !== 'undefined' && node instanceof ctor;
  }

  /**
   * 部分木の中の `data-intersect-*` を監視へ同期します。
   *
   * 自身と配下のすべての要素について `syncElement()` を呼びます。
   *
   * @param root 走査の起点
   * @returns 戻り値はありません。
   */
  public static syncTree(root: Node): void {
    if (!(root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    if (IntersectObserver.isHtmlElement(root)) {
      IntersectObserver.syncElement(root);
    }
    root.querySelectorAll<HTMLElement>('*').forEach(element => {
      IntersectObserver.syncElement(element);
    });
  }

  /**
   * 要素の監視を、現在の `data-intersect-*` の内容へ合わせます。
   *
   * 手続きの属性が無くなっていれば監視を解除し、設定（`root` / `rootMargin` /
   * `threshold` / `once`）が変わっていれば監視を作り直します。設定が変わらない
   * 場合は監視を保ったまま、抑止が解けていれば覚えている交差を拾い直します
   * （仕様「抑止の間に来た交差」）。
   *
   * @param element 対象の要素
   * @returns 戻り値はありません。
   */
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

    // 比べる相手は `IntersectionObserver` が返す値ではなく、監視を作ったときに
    // 決めた設定にする。`rootMargin` は `0px` を `0px 0px 0px 0px` のように
    // 正規化して返すため、読み戻すと設定が変わっていなくても食い違い、再同期の
    // たびに監視を作り直してしまう（作り直すと実行中の印も覚えている交差も
    // 失われる）。
    if (
      registration &&
      registration.root === nextRoot &&
      registration.rootMargin === nextRootMargin &&
      registration.threshold === nextThreshold &&
      registration.once === nextOnce
    ) {
      registration.fragment = fragment;
      // `data-intersect-disabled` が偽へ変わったときは、抑止の間に覚えた交差を
      // ここで拾い直す（仕様「抑止の間に来た交差」）。
      IntersectObserver.runPendingIntersect(element, registration);
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
          // 抑止して開始しない通知でも状態は覚える。`IntersectionObserver` は
          // 交差状態が変化したときにしか通知しないため、ここで捨てると交差した
          // まま変化しない要素では次の機会が来ない（仕様「抑止の間に来た交差」）。
          current.intersecting = entry.isIntersecting;
          if (!entry.isIntersecting) {
            return;
          }
          if (
            current.running ||
            IntersectObserver.isDisabled(current.fragment)
          ) {
            current.pending = true;
            return;
          }
          IntersectObserver.runProcedure(element, current);
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
      // 実行中かどうかは引き継ぐ。引き継がないと、作り直した監視が配る現在の
      // 交差状態で、前の手続きが終わらないうちに次が始まる（仕様「抑止の間に
      // 来た交差」の「同じ要素の Procedure は多重に実行しません」）。覚えている
      // 交差は、作り直した監視が改めて通知するため引き継がない。
      running: registration?.running ?? false,
      intersecting: false,
      pending: false,
      root: nextRoot,
      rootMargin: nextRootMargin,
      threshold: nextThreshold,
    });
  }

  /**
   * 交差時の Procedure を開始します。
   *
   * 覚えていた交差はここで消費します。実行の完了時に、その間へ届いた交差が
   * 残っていれば拾い直します（仕様「抑止の間に来た交差」）。
   *
   * @param element 監視対象の要素
   * @param registration 対象の登録情報
   * @returns 戻り値はありません。
   */
  private static runProcedure(
    element: HTMLElement,
    registration: IntersectRegistration,
  ): void {
    registration.pending = false;
    registration.running = true;
    let succeeded = false;
    void new Procedure(registration.fragment, 'intersect')
      .runWithResult()
      .then(success => {
        succeeded = success;
      })
      .catch(error => {
        Log.error('[Haori]', 'Intersect procedure execution error:', error);
      })
      .finally(() => {
        // 実行中に監視を作り直していることがあるため、後始末は開始時の登録では
        // なく、その時点の登録に対して行う。開始時の登録を使うと、作り直した
        // 監視が解除されずに残る。
        const latest = IntersectObserver.registrations.get(element);
        if (!latest) {
          return;
        }
        latest.running = false;
        if (succeeded && latest.once) {
          latest.observer.disconnect();
          IntersectObserver.registrations.delete(element);
          return;
        }
        IntersectObserver.runPendingIntersect(element, latest);
      });
  }

  /**
   * 覚えている交差があり、対象がまだ交差していれば Procedure を開始します。
   *
   * 抑止（実行中・`data-intersect-disabled`）が解けた時点で呼び出します。
   *
   * @param element 監視対象の要素
   * @param registration 対象の登録情報
   * @returns 戻り値はありません。
   */
  private static runPendingIntersect(
    element: HTMLElement,
    registration: IntersectRegistration,
  ): void {
    if (
      !registration.pending ||
      !registration.intersecting ||
      registration.running ||
      IntersectObserver.isDisabled(registration.fragment)
    ) {
      return;
    }
    IntersectObserver.runProcedure(element, registration);
  }

  /**
   * 部分木の中の監視をすべて解除します。
   *
   * DOM から取り除かれたノードに対して呼び、監視を残さないようにします。
   *
   * @param root 走査の起点
   * @returns 戻り値はありません。
   */
  public static cleanupTree(root: Node): void {
    if (IntersectObserver.isHtmlElement(root)) {
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

  /**
   * 登録されているすべての監視を解除します。
   *
   * @returns 戻り値はありません。
   */
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
    const root = Selector.query(selector, attrName, document);
    if (IntersectObserver.isHtmlElement(root)) {
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
}
