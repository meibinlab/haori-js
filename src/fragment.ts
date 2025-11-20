/**
 * @fileoverview 仮想DOM実装
 *
 * メモリ上にノードツリーを保持し、DOMへの反映を非同期で行います。
 * DOMからの読み込みは行わず、オブザーバーとchangeイベントで更新されます。
 */
import Queue from './queue';
import Log from './log';
import Expression from './expression';
import Env from './env';

/**
 * 仮想DOMのフラグメントの抽象クラス。
 */
export default abstract class Fragment {
  /** フラグメントの対象ノードに対するキャッシュ */
  protected static readonly FRAGMENT_CACHE = new WeakMap<Node, Fragment>();

  /**
   * フラグメントを取得もしくは作成します。
   *
   * @param node 対象ノード
   * @returns フラグメント
   */
  public static get(node: HTMLElement): ElementFragment;
  public static get(node: Text): TextFragment;
  public static get(node: Comment): CommentFragment;
  public static get(node: Node | null): Fragment | null;
  public static get(node: Node | null): Fragment | null {
    if (node == null) {
      return null;
    }
    if (Fragment.FRAGMENT_CACHE.has(node)) {
      return Fragment.FRAGMENT_CACHE.get(node)!;
    }
    let fragment;
    switch (node.nodeType) {
      case Node.ELEMENT_NODE:
        fragment = new ElementFragment(node as HTMLElement);
        break;
      case Node.TEXT_NODE:
        fragment = new TextFragment(node as Text);
        break;
      case Node.COMMENT_NODE:
        fragment = new CommentFragment(node as Comment);
        break;
      default:
        Log.warn('[Haori]', 'Unsupported node type:', node.nodeType);
        return null;
    }
    return fragment;
  }

  /** 親フラグメント */
  protected parent: ElementFragment | null = null;

  /** 対象ノード */
  protected readonly target: Node;

  /** フラグメントがDOMにマウントされているかどうか */
  protected mounted = false;

  /** ノード更新スキップフラグ（オブザーバーによる無限ループ対応） */
  protected skipMutationNodes = false;

  /**
   * フラグメントのコンストラクタ。
   *
   * @param target 対象ノード
   */
  protected constructor(target: Node) {
    this.target = target;
    Fragment.FRAGMENT_CACHE.set(target, this);
  }

  /**
   * skipMutationNodesフラグの値を取得します。
   *
   * @returns skipMutationNodesの値
   */
  public isSkipMutationNodes(): boolean {
    return this.skipMutationNodes;
  }

  /**
   * フラグメントをDOMから除去します。
   *
   * @return 除去のPromise
   */
  public unmount(): Promise<void> {
    if (!this.mounted || this.skipMutationNodes) {
      return Promise.resolve();
    }
    if (this.parent) {
      const parent = this.parent;
      const prevSkip = parent.skipMutationNodes;
      return Queue.enqueue(() => {
        parent.skipMutationNodes = true;
        if (this.target.parentNode === parent.getTarget()) {
          parent.getTarget().removeChild(this.target);
        }
        this.mounted = false;
      }).finally(() => {
        parent.skipMutationNodes = prevSkip;
      }) as Promise<void>;
    } else {
      // 親フラグメント情報が無くても、DOM 上に親ノードが存在する場合は安全に除去する。
      const host = this.target.parentNode as (HTMLElement | null);
      if (host) {
        return Queue.enqueue(() => {
          if (this.target.parentNode === host) {
            host.removeChild(this.target);
          }
          this.mounted = false;
        }) as Promise<void>;
      }
      this.mounted = false;
    }
    return Promise.resolve();
  }

  /**
   * フラグメントをDOMに追加します。
   *
   * @return 追加のPromise
   */
  public mount(): Promise<void> {
    if (this.mounted || this.skipMutationNodes) {
      return Promise.resolve();
    }
    if (this.parent) {
      const parent = this.parent;
      const prevSkip = parent.skipMutationNodes;
      return Queue.enqueue(() => {
        parent.skipMutationNodes = true;
        if (this.target.parentNode !== parent.getTarget()) {
          // 既に同じ親なら何もしない
          parent.getTarget().appendChild(this.target);
        }
        this.mounted = true;
      }).finally(() => {
        parent.skipMutationNodes = prevSkip;
      }) as Promise<void>;
    }
    return Promise.resolve();
  }

  /**
   * フラグメントのマウント状態を取得します。
   *
   * @returns マウント状態
   */
  public isMounted(): boolean {
    return this.mounted;
  }

  /**
   * フラグメントのマウント状態を設定します。
   *
   * @param mounted マウント状態
   */
  public setMounted(mounted: boolean): void {
    this.mounted = mounted;
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public abstract clone(): Fragment;

  /**
   * フラグメントとノードを削除します。
   *
   * @param unmount DOMからの除去を行うかどうか（内部の子呼び出しの場合のみfalseとする）
   * @return 除去のPromise
   */
  public remove(unmount = true): Promise<void> {
    if (this.parent) {
      this.parent.removeChild(this);
    }
    Fragment.FRAGMENT_CACHE.delete(this.target);
    if (unmount) {
      return this.unmount();
    }
    return Promise.resolve();
  }

  /**
   * 対象ノードを取得します。
   *
   * @returns 対象ノード
   */
  public getTarget(): Node {
    return this.target;
  }

  /**
   * 親フラグメントを取得します。
   *
   * @returns 親フラグメント
   */
  public getParent(): ElementFragment | null {
    return this.parent;
  }

  /**
   * 親フラグメントを設定します。
   *
   * @param parent 親フラグメント
   */
  public setParent(parent: ElementFragment | null): void {
    this.parent = parent;
  }
}

/**
 * エレメントフラグメント。
 * DOM要素を表現し、子ノードを持つことができます。
 */
export class ElementFragment extends Fragment {
  /** inputイベントを発生させるタイプ */
  private readonly INPUT_EVENT_TYPES = [
    'text',
    'password',
    'email',
    'url',
    'tel',
    'search',
    'number',
    'range',
    'color',
    'date',
    'datetime-local',
    'month',
    'time',
    'week',
  ];

  /** 子フラグメントのリスト */
  private readonly children: Fragment[] = [];

  /** 属性名に対する属性情報のマップ */
  private readonly attributeMap = new Map<string, AttributeContents>();

  /** バインドデータ */
  private bindingData: Record<string, unknown> | null = null;

  /** バインドデータのキャッシュ */
  private bindingDataCache: Record<string, unknown> | null = null;

  /** 表示状態 */
  private visible = true;

  /** 元の display 値 */
  private display: string | null = null;

  /** each用のテンプレート */
  private template: ElementFragment | null = null;

  /** each比較用のキー */
  private listKey: string | null = null;

  /** valueプロパティの値 */
  private value: string | number | boolean | null = null;

  /** 属性更新スキップフラグ（オブザーバーによる無限ループ対応） */
  private skipMutationAttributes = false;

  /** 値変更スキップフラグ（更新イベントによる無限ループ対応） */
  private skipChangeValue = false;

  /**
   * エレメントフラグメントのコンストラクタ。
   * アトリビュートや子フラグメントの作成も行います。
   *
   * @param target 対象エレメント
   */
  public constructor(target: HTMLElement) {
    super(target);
    this.syncValue();
    target.getAttributeNames().forEach(name => {
      const value = target.getAttribute(name);
      if (value !== null && !this.attributeMap.has(name)) {
        const contents = new AttributeContents(name, value);
        this.attributeMap.set(name, contents);
      }
    });
    target.childNodes.forEach(node => {
      const childFragment = Fragment.get(node);
      childFragment!.setParent(this);
      this.children.push(childFragment!);
    });
  }

  /**
   * 子フラグメントのリストを取得します。
   *
   * @returns 子フラグメントのリスト
   */
  public getChildren(): Fragment[] {
    return this.children;
  }

  /**
   * 子エレメントフラグメントのリストを取得します。
   *
   * @returns 子エレメントフラグメントのリスト
   */
  public getChildElementFragments(): ElementFragment[] {
    return this.children.filter(
      child => child instanceof ElementFragment,
    ) as ElementFragment[];
  }

  /**
   * 子フラグメントをリストに追加します。
   * DOMの追加は行いません。
   *
   * @param child 追加する子フラグメント
   */
  public pushChild(child: Fragment) {
    this.children.push(child);
    child.setParent(this);
  }

  /**
   * 子フラグメントをリストから削除します。
   * DOMからの削除は行いません。
   *
   * @param child 削除する子フラグメント
   */
  public removeChild(child: Fragment): void {
    const index = this.children.indexOf(child);
    if (index < 0) {
      Log.warn('[Haori]', 'Child fragment not found.', child);
      return;
    }
    this.children.splice(index, 1);
    child.setParent(null);
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public clone(): ElementFragment {
    const clone = new ElementFragment(
      this.target.cloneNode(false) as HTMLElement,
    );
    this.children.forEach(child => {
      const childClone = child.clone();
      clone.getTarget().appendChild(childClone.getTarget());
      clone.pushChild(childClone);
    });
    clone.mounted = false;
    clone.bindingData = this.bindingData;
    clone.clearBindingDataCache();
    clone.visible = this.visible;
    clone.display = this.display;
    clone.template = this.template;
    return clone;
  }

  /**
   * フラグメントとノードを削除します。
   *
   * @param unmount DOMからの除去を行うかどうか（内部の子呼び出しの場合のみfalseとする）
   * @return 除去のPromise
   */
  public remove(unmount = true): Promise<void> {
    const promises: Promise<void>[] = [];
    this.children.forEach(child => {
      promises.push(child.remove(false));
    });
    this.children.length = 0;
    this.attributeMap.clear();
    this.bindingData = null;
    this.bindingDataCache = null;
    if (this.template) {
      promises.push(this.template.remove(false));
      this.template = null;
    }
    promises.push(super.remove(unmount));
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * フラグメントの対象エレメントを取得します。
   *
   * @returns フラグメントの対象エレメント
   */
  public getTarget(): HTMLElement {
    return this.target as HTMLElement;
  }

  /**
   * 継承を考慮したバインドデータを取得します。
   *
   * @returns バインドデータのオブジェクト
   */
  public getBindingData(): Record<string, unknown> {
    if (this.bindingDataCache) {
      return this.bindingDataCache;
    }
    this.bindingDataCache = {};
    if (this.parent) {
      Object.assign(this.bindingDataCache, this.parent.getBindingData());
    }
    if (this.bindingData) {
      Object.assign(this.bindingDataCache, this.bindingData);
    }
    return this.bindingDataCache;
  }

  /**
   * 生のバインドデータを取得します。
   *
   * @returns 生のバインドデータ
   */
  public getRawBindingData(): Record<string, unknown> | null {
    return this.bindingData;
  }

  /**
   * バインドデータを設定します。
   *
   * @param data バインドデータ
   */
  public setBindingData(data: Record<string, unknown>): void {
    this.bindingData = data;
    this.clearBindingDataCache();
  }

  /**
   * バインドデータのキャッシュをクリアします。
   */
  public clearBindingDataCache(): void {
    this.bindingDataCache = null;
    this.children.forEach(child => {
      if (child instanceof ElementFragment) {
        child.clearBindingDataCache();
      }
    });
  }

  /**
   * フラグメントのテンプレートを取得します。
   *
   * @returns テンプレート
   */
  public getTemplate(): ElementFragment | null {
    return this.template;
  }

  /**
   * フラグメントのテンプレートを設定します。
   *
   * @param template フラグメントのテンプレート
   */
  public setTemplate(template: ElementFragment | null): void {
    this.template = template;
  }

  /**
   * 比較用リストキーを設定します。
   *
   * @param key 比較用リストキー
   */
  public setListKey(key: string): void {
    this.listKey = key;
  }

  /**
   * 比較用リストキーを取得します。
   *
   * @returns 比較用リストキー
   */
  public getListKey(): string | null {
    return this.listKey;
  }

  /**
   * 入力エレメントに値を設定します。
   * チェックボックとラジオボタンの場合は値に一致するかどうかでチェック状態を変更します。
   *
   * @param value 値
   * @returns エレメントの更新のPromise
   */
  public setValue(value: string | number | boolean | null): Promise<void> {
    if (this.skipChangeValue) {
      return Promise.resolve();
    }
    if (this.value === value) {
      return Promise.resolve();
    }
    const element = this.getTarget();
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      const result = this.getAttribute('value');
      let newChecked: boolean;
      if (result === 'true') {
        newChecked = value === true;
      } else if (result === 'false') {
        newChecked = value === false;
      } else {
        newChecked = result === String(value);
      }
      this.value = newChecked ? value : null;
      if (element.checked === newChecked) {
        return Promise.resolve();
      }
      this.skipChangeValue = true;
      return Queue.enqueue(() => {
        element.checked = newChecked;
        element.dispatchEvent(new Event('change', {bubbles: true}));
      }).finally(() => {
        this.skipChangeValue = false;
      }) as Promise<void>;
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      this.value = value;
      this.skipChangeValue = true;
      return Queue.enqueue(() => {
        element.value = value === null ? '' : String(value);
        if (
          (element instanceof HTMLInputElement &&
            this.INPUT_EVENT_TYPES.includes(element.type)) ||
          element instanceof HTMLTextAreaElement
        ) {
          element.dispatchEvent(new Event('input', {bubbles: true}));
        }
        element.dispatchEvent(new Event('change', {bubbles: true}));
      }).finally(() => {
        this.skipChangeValue = false;
      }) as Promise<void>;
    } else {
      Log.warn(
        '[Haori]',
        'setValue is not supported for this element type.',
        element,
      );
      return Promise.resolve();
    }
  }

  /**
   * 入力エレメントの値を取得します。
   * DOM要素の現在の値と同期します。
   *
   * @returns 入力エレメントの値
   */
  public getValue(): string | number | boolean | null {
    return this.value;
  }

  /**
   * 内部の値をクリアします。エレメントのvalue値は変化しません。
   */
  public clearValue() {
    this.value = null;
  }

  /**
   * 内部の値をDOMの値と同期します。
   * changeイベント時など、DOM値が変更された後に呼び出されます。
   */
  public syncValue() {
    const element = this.getTarget();
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox' || element.type === 'radio') {
        if (element.checked) {
          const value = element.value;
          if (value === 'true') {
            this.value = true;
          } else if (value === 'false') {
            this.value = false;
          } else {
            this.value = value;
          }
        } else {
          // チェックボックスがOFFの場合
          const value = element.value;
          if (value === 'true') {
            this.value = false;
          } else if (value === 'false') {
            this.value = true;
          } else {
            this.value = null;
          }
        }
      } else {
        this.value = element.value;
      }
    } else if (element instanceof HTMLTextAreaElement) {
      this.value = element.value;
    } else if (element instanceof HTMLSelectElement) {
      this.value = element.value;
    }
  }

  /**
   * 属性の値を評価して設定します。
   * 評価値がfalseの場合は属性を削除します。
   * 矯正評価属性の場合は元の値を設定します。
   *
   * @param name 属性名
   * @param value 属性値
   * @returns 属性の更新のPromise
   */
  public setAttribute(name: string, value: string | null): Promise<void> {
    if (this.skipMutationAttributes) {
      return Promise.resolve();
    }
    if (value === null) {
      return this.removeAttribute(name);
    }
    const contents = new AttributeContents(name, value);
    this.attributeMap.set(name, contents);
    this.skipMutationAttributes = true;
    const element = this.getTarget();
    const result = contents.isForceEvaluation()
      ? value
      : this.getAttribute(name);
    return Queue.enqueue(() => {
      if (result === null || result === false) {
        element.removeAttribute(name);
      } else {
        const string = String(result);
        if (element.getAttribute(name) !== string) {
          element.setAttribute(name, string);
        }
      }
    }).finally(() => {
      this.skipMutationAttributes = false;
    }) as Promise<void>;
  }

  /**
   * 属性の値を削除します。
   *
   * @param name 属性名
   * @returns 属性の削除のPromise
   */
  public removeAttribute(name: string): Promise<void> {
    if (this.skipMutationAttributes) {
      return Promise.resolve();
    }
    this.attributeMap.delete(name);
    this.skipMutationAttributes = true;
    const element = this.getTarget();
    return Queue.enqueue(() => {
      element.removeAttribute(name);
    }).finally(() => {
      this.skipMutationAttributes = false;
    }) as Promise<void>;
  }

  /**
   * 属性の評価された値を取得します。
   * 複数の評価値がある場合は結合して返します。
   *
   * @param name 属性名
   * @returns 評価された値
   */
  public getAttribute(name: string): string | false | unknown | null {
    const contents = this.attributeMap.get(name);
    if (contents === undefined) {
      return null;
    }
    const results = contents.evaluate(this.getBindingData());
    if (results.length === 1) {
      return results[0];
    }
    return TextContents.joinEvaluateResults(results);
  }

  /**
   * 属性の生の値を取得します。
   *
   * @param name 属性名
   * @returns 生の属性値
   */
  public getRawAttribute(name: string): string | null {
    const contents = this.attributeMap.get(name);
    if (contents === undefined) {
      return null;
    }
    return contents.getValue();
  }

  /**
   * 属性名のリストを取得します。
   *
   * @return 属性名のリスト
   */
  public getAttributeNames(): string[] {
    return Array.from(this.attributeMap.keys());
  }

  /**
   * 属性の有無を確認します。
   *
   * @param name 属性名
   * @returns 属性の有無
   */
  public hasAttribute(name: string): boolean {
    return this.attributeMap.has(name);
  }

  /**
   * 子ノードを参照ノードの前に挿入します。
   * 参照ノードがnullの場合、親の最後に追加されます。
   *
   * @param newChild 新しい子ノード
   * @param referenceChild 参照ノード
   * @return 挿入のPromise
   */
  public insertBefore(
    newChild: Fragment,
    referenceChild: Fragment | null,
  ): Promise<void> {
    if (this.skipMutationNodes) {
      return Promise.resolve();
    }

    // 循環参照チェック
    if (newChild === this) {
      Log.error('[Haori]', 'Cannot insert element as child of itself');
      return Promise.reject(new Error('Self-insertion not allowed'));
    }

    // 祖先チェック
    const ancestors = new Set<Fragment>();
    let ancestor = this.parent;
    while (ancestor) {
      ancestors.add(ancestor);
      ancestor = ancestor.getParent();
    }
    if (ancestors.has(newChild)) {
      Log.error('[Haori]', 'Cannot create circular reference');
      return Promise.reject(new Error('Circular reference detected'));
    }

    // 同じ親内での移動かどうかを確認
    const isSameParent = newChild.getParent() === this;
    let newChildIndex = -1;
    let referenceIndex = -1;

    if (isSameParent) {
      newChildIndex = this.children.indexOf(newChild);
      if (referenceChild !== null) {
        referenceIndex = this.children.indexOf(referenceChild);
      }
    }

    const newChildParent = newChild.getParent();
    if (newChildParent !== null) {
      // 既存の親から削除
      newChildParent.removeChild(newChild);
    }

    if (referenceChild === null) {
      this.children.push(newChild);
    } else {
      let index: number;
      if (isSameParent) {
        // 同じ親内での移動の場合、削除後のインデックスを調整
        if (newChildIndex !== -1 && newChildIndex < referenceIndex) {
          // 削除する要素が参照要素より前にあった場合、インデックスは1つ減る
          index = referenceIndex - 1;
        } else {
          index = referenceIndex;
        }
      } else {
        index = this.children.indexOf(referenceChild);
      }

      if (index === -1) {
        Log.warn(
          '[Haori]',
          'Reference child not found in children.',
          referenceChild,
        );
        this.children.push(newChild);
      } else {
        this.children.splice(index, 0, newChild);
      }
    }

    newChild.setParent(this);
    newChild.setMounted(this.mounted);

    const prevSkip = this.skipMutationNodes;
    this.skipMutationNodes = true;
    return Queue.enqueue(() => {
      this.target.insertBefore(
        newChild.getTarget(),
        referenceChild?.getTarget() || null,
      );
    }).finally(() => {
      this.skipMutationNodes = prevSkip;
    }) as Promise<void>;
  }

  /**
   * 指定した参照ノードの後に子ノードを挿入します。
   *
   * @param newChild 子ノード
   * @param referenceChild 参照ノード
   * @returns 挿入のPromise
   */
  public insertAfter(
    newChild: Fragment,
    referenceChild: Fragment | null,
  ): Promise<void> {
    if (referenceChild == null) {
      return this.insertBefore(newChild, null);
    }
    const index = this.children.indexOf(referenceChild);
    if (index === -1) {
      Log.warn(
        '[Haori]',
        'Reference child not found in children.',
        referenceChild,
      );
      return this.insertBefore(newChild, null);
    }
    return this.insertBefore(newChild, this.children[index + 1] || null);
  }

  /**
   * 前のエレメントフラグメントを取得します。
   * 存在しない場合はnullを返します。
   *
   * @return 前のエレメントフラグメントまたはnull
   */
  public getPrevious(): ElementFragment | null {
    const parent = this.getParent();
    if (parent === null) {
      return null;
    }
    const siblings = parent.getChildElementFragments();
    const index = siblings.indexOf(this);
    if (index <= 0) {
      return null;
    }
    return siblings[index - 1];
  }

  /**
   * 次のエレメントフラグメントを取得します。
   * 存在しない場合はnullを返します。
   *
   * @return 次のエレメントフラグメントまたはnull
   */
  public getNext(): ElementFragment | null {
    const parent = this.getParent();
    if (parent === null) {
      return null;
    }
    const siblings = parent.getChildElementFragments();
    const index = siblings.indexOf(this);
    if (index < 0 || index + 1 >= siblings.length) {
      return null;
    }
    return siblings[index + 1];
  }

  /**
   * 表示状態を返します。
   *
   * @returns 表示状態
   */
  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * エレメントを非表示にします。
   *
   * @returns エレメントの非表示のPromise
   */
  public hide(): Promise<void> {
    this.visible = false;
    this.display = this.getTarget().style.display;
    this.getTarget().style.display = 'none';
    this.getTarget().setAttribute(`${Env.prefix}if-false`, '');
    return Promise.resolve();
  }

  /**
   * エレメントを表示します。
   *
   * @return エレメントの表示のPromise
   */
  public show(): Promise<void> {
    this.getTarget().style.display = this.display ?? '';
    this.getTarget().removeAttribute(`${Env.prefix}if-false`);
    this.visible = true;
    return Promise.resolve();
  }

  /**
   * 指定した属性名を持つ最も近い親要素を返します。
   * 見つからない場合はnullを返します。
   *
   * @param name 属性名
   * @returns 最も近い親要素またはnull
   */
  public closestByAttribute(name: string): ElementFragment | null {
    if (this.hasAttribute(name)) {
      return this;
    }
    const parent = this.getParent();
    if (parent === null) {
      return null;
    }
    return parent.closestByAttribute(name);
  }
}

/**
 * テキストフラグメント。
 * テキストノードを表現します。
 */
export class TextFragment extends Fragment {
  /** 未評価のテキスト文字列 */
  private text: string;

  /** コンテンツ */
  private contents: TextContents;

  /** 更新スキップフラグ（オブザーバーによる無限ループ対応） */
  private skipMutation = false;

  /**
   * テキストフラグメントのコンストラクタ。
   * 対象テキストノードの内容を初期化します。
   *
   * @param target 対象テキストノード
   */
  public constructor(target: Text) {
    super(target);
    this.text = target.textContent || '';
    this.contents = new TextContents(this.text);
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public clone(): TextFragment {
    const clone = new TextFragment(this.target.cloneNode(true) as Text);
    clone.mounted = false;
    clone.text = this.text;
    clone.contents = this.contents;
    return clone;
  }

  /**
   * フラグメントの対象ノードを取得します。
   *
   * @returns フラグメントの対象ノード
   */
  public getTarget(): Text {
    return this.target as Text;
  }

  /**
   * コンテンツを更新します。
   *
   * @param text テキスト
   * @returns 更新のPromise
   */
  public setContent(text: string): Promise<void> {
    if (this.skipMutation || this.text === text) {
      return Promise.resolve();
    }
    this.text = text;
    this.contents = new TextContents(text);
    return this.evaluate();
  }

  /**
   * フラグメントを評価します。
   *
   * @returns 評価結果のPromise
   */
  public evaluate(): Promise<void> {
    if (this.contents.isRawEvaluate && this.parent === null) {
      return Promise.reject(
        new Error('Parent fragment is required for raw evaluation'),
      );
    }
    return Queue.enqueue(() => {
      this.skipMutation = true;
      if (this.contents.isRawEvaluate) {
        this.parent!.getTarget().innerHTML = this.contents.evaluate(
          this.parent!.getBindingData(),
        )[0] as string;
      } else if (this.contents.isEvaluate) {
        this.target.textContent = TextContents.joinEvaluateResults(
          this.contents.evaluate(this.parent!.getBindingData()),
        );
      } else {
        this.target.textContent = this.text;
      }
    }).finally(() => {
      this.skipMutation = false;
    }) as Promise<void>;
  }
}

/**
 * コメントフラグメント。
 * コメントノードを表現します。
 */
export class CommentFragment extends Fragment {
  /** コメント文字列 */
  private text: string;

  /** 更新スキップフラグ（オブザーバーによる無限ループ対応） */
  private skipMutation = false;

  /**
   * コメントフラグメントのコンストラクタ。
   * 対象コメントノードの内容を初期化します。
   *
   * @param target 対象コメントノード
   */
  public constructor(target: Comment) {
    super(target);
    this.text = target.textContent || '';
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public clone(): Fragment {
    const clone = new CommentFragment(this.target.cloneNode(true) as Comment);
    clone.mounted = false;
    clone.text = this.text;
    return clone;
  }

  /**
   * フラグメントの対象ノードを取得します。
   *
   * @returns フラグメントの対象ノード
   */
  public getTarget(): Comment {
    return this.target as Comment;
  }

  /**
   * コンテンツを更新します。
   *
   * @param text テキスト
   * @return 更新のPromise
   */
  public setContent(text: string): Promise<void> {
    if (this.skipMutation || this.text === text) {
      return Promise.resolve();
    }
    this.text = text;
    return Queue.enqueue(() => {
      this.skipMutation = true;
      this.target.textContent = this.text;
    }).finally(() => {
      this.skipMutation = false;
    }) as Promise<void>;
  }
}

/**
 * 値の種別。
 */
enum ExpressionType {
  /** テキスト */
  TEXT,

  /** 評価式 */
  EXPRESSION,

  /** 生の評価式 */
  RAW_EXPRESSION,
}

/**
 * コンテンツのインターフェース。
 */
interface Content {
  /** コンテンツの内容 */
  text: string;

  /** 値の種別 */
  type: ExpressionType;
}

/**
 * テキストコンテンツを管理するクラスです。
 * 一度生成されると内部は変更しません。
 */
class TextContents {
  /** プレースホルダ検出用の正規表現 */
  protected static readonly PLACEHOLDER_REGEX =
    /\{\{\{([\s\S]+?)\}\}\}|\{\{([\s\S]+?)\}\}/g;

  /**
   * 評価結果を結合して文字列にします。
   *
   * @param contents 評価結果の配列
   * @returns 結合された文字列
   */
  public static joinEvaluateResults(contents: unknown[] | null): string {
    if (contents === null || contents.length === 0) {
      return '';
    }
    return contents
      .map(c => {
        if (c === null || c === undefined || c === false || Number.isNaN(c)) {
          return '';
        } else if (typeof c !== 'string') {
          return String(c);
        } else {
          return c;
        }
      })
      .join('');
  }

  /** コンテンツのリスト */
  protected readonly contents: Content[] = [];

  /** 評価式が含まれるかどうか */
  public readonly isEvaluate: boolean = false;

  /** 生の評価式が含まれるかどうか */
  public readonly isRawEvaluate: boolean = false;

  /** 評価前の値 */
  private readonly value: string;

  /**
   * コンストラクタ。
   *
   * @param text テキスト
   */
  constructor(text: string) {
    this.value = text;

    const matches = [...text.matchAll(TextContents.PLACEHOLDER_REGEX)];
    let lastIndex = 0;

    let hasEvaluate = false;
    let hasRawEvaluate = false;
    for (const match of matches) {
      // プレースホルダ前の通常テキスト
      if (match.index > lastIndex) {
        this.contents.push({
          text: text.slice(lastIndex, match.index),
          type: ExpressionType.TEXT,
        });
      }
      // プレースホルダ本体
      const content = {
        text: match[1] ?? match[2],
        type: match[1]
          ? ExpressionType.RAW_EXPRESSION
          : ExpressionType.EXPRESSION,
      };
      hasEvaluate = true;
      hasRawEvaluate =
        hasRawEvaluate || content.type === ExpressionType.RAW_EXPRESSION;
      this.contents.push(content);
      lastIndex = match.index! + match[0].length;
    }
    // 最後のプレースホルダ以降の通常テキスト
    if (lastIndex < text.length) {
      this.contents.push({
        text: text.slice(lastIndex),
        type: ExpressionType.TEXT,
      });
    }
    this.isEvaluate = hasEvaluate;
    this.isRawEvaluate = hasRawEvaluate;
    this.checkRawExpressions();
  }

  /**
   * 評価前の値を取得します。
   *
   * @returns 評価前の値
   */
  public getValue(): string {
    return this.value;
  }

  /**
   * RAW_EXPRESSION のチェックを行います。
   */
  protected checkRawExpressions(): void {
    for (let i = 0; i < this.contents.length; i++) {
      const content = this.contents[i];
      if (
        content.type === ExpressionType.RAW_EXPRESSION &&
        this.contents.length > 1
      ) {
        Log.error(
          '[Haori]',
          'Raw expressions are not allowed in multi-content expressions.',
        );
        this.contents[i].type = ExpressionType.EXPRESSION;
      }
    }
  }

  /**
   * 式評価を行い、結果を返します。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @returns 評価結果のリスト
   */
  public evaluate(bindingValues: Record<string, unknown>): unknown[] {
    if (!this.isEvaluate && !this.isRawEvaluate) {
      return this.contents.map(c => c.text);
    }
    const results: unknown[] = [];
    this.contents.forEach(c => {
      try {
        if (
          c.type === ExpressionType.EXPRESSION ||
          c.type === ExpressionType.RAW_EXPRESSION
        ) {
          const result = Expression.evaluate(c.text, bindingValues);
          results.push(result);
        } else {
          results.push(c.text);
        }
      } catch (error) {
        Log.error(
          '[Haori]',
          `Error evaluating text expression: ${c.text}`,
          error,
        );
        results.push('');
      }
    });
    return results;
  }
}

/**
 * 属性のコンテンツを管理するクラスです。
 * 一度生成されると内部は変更しません。
 */
class AttributeContents extends TextContents {
  /** 強制評価する属性名 */
  private static readonly FORCE_EVALUATION_ATTRIBUTES = [
    'data-if',
    'hor-if',
    'data-each',
    'hor-each',
  ];

  /** 強制評価フラグ（プレースホルダでなくても評価する） */
  private readonly forceEvaluation: boolean;

  /**
   * コンストラクタ。
   *
   * @param name 属性名
   * @param text 属性値
   */
  constructor(name: string, value: string) {
    super(value);
    this.forceEvaluation =
      AttributeContents.FORCE_EVALUATION_ATTRIBUTES.includes(name);
  }

  /**
   * 強制評価フラグを取得します。
   *
   * @returns 強制評価フラグ
   */
  public isForceEvaluation(): boolean {
    return this.forceEvaluation;
  }

  /**
   * 式評価を行い、結果を返します。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @returns 評価結果のリスト
   */
  public evaluate(bindingValues: Record<string, unknown>): unknown[] {
    if (!this.isEvaluate && !this.forceEvaluation) {
      return this.contents.map(c => c.text);
    }
    const results: unknown[] = [];
    this.contents.forEach(c => {
      try {
        if (
          (this.forceEvaluation && c.type === ExpressionType.TEXT) ||
          c.type === ExpressionType.EXPRESSION ||
          c.type === ExpressionType.RAW_EXPRESSION
        ) {
          const result = Expression.evaluate(c.text, bindingValues);
          results.push(result);
        } else {
          results.push(c.text);
        }
      } catch (error) {
        Log.error(
          '[Haori]',
          `Error evaluating attribute expression: ${c.text}`,
          error,
        );
        results.push('');
      }
    });
    if (this.forceEvaluation && results.length > 1) {
      Log.error(
        '[Haori]',
        'each or if expressions must have a single content.',
        results,
      );
      return [results[0]];
    }
    return results;
  }
}
