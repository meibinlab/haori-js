/**
 * @fileoverview 仮想DOM実装
 *
 * メモリ上にノードツリーを保持し、DOMへの反映を非同期で行います。
 * DOMからの読み込みは行わず、オブザーバーとchangeイベントで更新されます。
 */
import Queue from './queue';
import Log from './log';
import Expression from './expression';

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
  public static get(node: null): null;
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
    Fragment.FRAGMENT_CACHE.set(node, fragment);
    if (node.parentElement && Fragment.FRAGMENT_CACHE.has(node.parentElement)) {
      const parentFragment = Fragment.get(node.parentElement);
      if (parentFragment instanceof ElementFragment) {
        fragment.setParent(parentFragment);
      }
    }
    return fragment;
  }

  public static async build(node: HTMLElement): Promise<ElementFragment>;
  public static async build(node: Text): Promise<TextFragment>;
  public static async build(node: Comment): Promise<CommentFragment>;
  public static async build(
    node: HTMLElement | Text | Comment,
  ): Promise<ElementFragment | TextFragment | CommentFragment> {
    return Queue.enqueue(() => {
      return Fragment.get(node);
    }) as Promise<ElementFragment | TextFragment | CommentFragment>;
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
  }

  /**
   * フラグメントをDOMから除去します。
   */
  public unmount() {
    if (!this.mounted || this.skipMutationNodes) {
      return;
    }
    this.mounted = false;
    if (this.parent) {
      Queue.enqueue(() => {
        this.parent!.skipMutationNodes = true;
        this.parent!.getTarget().removeChild(this.target);
      }).finally(() => {
        this.parent!.skipMutationNodes = false;
      });
    }
  }

  /**
   * フラグメントをDOMに追加します。
   */
  public mount() {
    if (this.mounted || this.skipMutationNodes) {
      return;
    }
    this.mounted = true;
    if (this.parent) {
      Queue.enqueue(() => {
        this.parent!.skipMutationNodes = true;
        this.parent!.getTarget().appendChild(this.target);
      }).finally(() => {
        this.parent!.skipMutationNodes = false;
      });
    }
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public abstract clone(): Fragment;

  /**
   * フラグメントとノードを削除します。
   */
  public remove() {
    Fragment.FRAGMENT_CACHE.delete(this.target);
    this.unmount();
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

  /** valueプロパティの値 */
  private value: string | number | boolean | null = null;

  /** 属性更新スキップフラグ（オブザーバーによる無限ループ対応） */
  private skipMutationAttributes = false;

  /** 値変更スキップフラグ（更新イベントによる無限ループ対応） */
  private skipChangeValue = false;

  /**
   * エレメントフラグメントのコンストラクタ。
   * アトリビュートや子フラグメントは自動的に構築されません。
   *
   * @param target 対象エレメント
   */
  public constructor(target: HTMLElement) {
    super(target);
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
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public clone(): ElementFragment {
    const clone = new ElementFragment(
      this.target.cloneNode(true) as HTMLElement,
    );
    clone.children.push(...this.children.map(child => child.clone()));
    this.attributeMap.forEach((contents, name) => {
      clone.attributeMap.set(name, contents);
    });
    clone.bindingData = this.bindingData;
    clone.clearBindingDataCache();
    return clone;
  }

  /**
   * フラグメントとノードを削除します。
   */
  public remove() {
    this.deleteCache();
    this.unmount();
  }

  /**
   * 子要素を含んだ全てのフラグメントをキャッシュから削除します。
   */
  protected deleteCache() {
    Fragment.FRAGMENT_CACHE.delete(this.target);
    this.children.forEach(child => {
      if (child instanceof ElementFragment) {
        child.deleteCache();
      }
    });
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
   * 入力エレメントに値を設定します。
   * チェックボックとラジオボタンの場合は値に一致するかどうかをチェック状態を変更します。
   *
   * @param value 値
   * @returns エレメントの更新のPromise
   */
  public setValue(value: string | number | boolean | null): Promise<unknown> {
    if (this.skipChangeValue) {
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
      if (element.checked === newChecked) {
        return Promise.resolve();
      }
      this.skipChangeValue = true;
      return Queue.enqueue(() => {
        element.checked = newChecked;
        element.dispatchEvent(new Event('change', {bubbles: true}));
      }).finally(() => {
        this.skipChangeValue = false;
      });
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      if (this.value === value) {
        return Promise.resolve();
      }
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
      });
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
   * 入力エレメントの評価された値を取得します。
   *
   * @returns 評価された値
   */
  public getValue(): string | number | boolean | null {
    const element = this.getTarget();
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      const result = this.getAttribute('value');
      if (result === 'true') {
        return element.checked ? true : null;
      } else if (result === 'false') {
        return element.checked ? false : null;
      } else {
        return element.checked ? String(result) : null;
      }
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      return this.value;
    } else {
      Log.warn(
        '[Haori]',
        'setValue is not supported for this element type.',
        element,
      );
      return null;
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
  public setAttribute(name: string, value: string | null): Promise<unknown> {
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
    });
  }

  /**
   * 属性の値を削除します。
   *
   * @param name 属性名
   * @returns 属性の削除のPromise
   */
  public removeAttribute(name: string): Promise<unknown> {
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
    });
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
   * 新しい子ノードを参照ノードの前に挿入します。
   * 参照ノードがnullの場合、親の最後に追加されます。
   *
   * @param newChild 新しい子ノード
   * @param referenceChild 参照ノード
   */
  public insertBefore(
    newChild: Fragment,
    referenceChild: Fragment | null,
  ): void {
    if (this.skipMutationNodes) {
      return;
    }

    const newChildParent = newChild.getParent();
    if (newChildParent !== null) {
      // 既存の親から削除
      const index = newChildParent.getChildren().indexOf(newChild);
      if (index !== -1) {
        newChildParent.children.splice(index, 1);
      }
      newChild.setParent(null);
    }

    if (referenceChild === null) {
      this.children.push(newChild);
    } else {
      const index = this.getChildren().indexOf(referenceChild);
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
    this.skipMutationNodes = true;
    Queue.enqueue(() => {
      this.target.insertBefore(
        newChild.getTarget(),
        referenceChild?.getTarget() || null,
      );
    }).finally(() => {
      this.skipMutationNodes = false;
    });
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
   * エレメントを非表示にし、子ノードをDOMから削除します。
   */
  public hide(): void {
    this.visible = false;
    this.display = this.getTarget().style.display;
    this.getTarget().style.display = 'none';
    this.children.forEach(child => {
      child.unmount();
    });
  }

  /**
   * エレメントを表示し、子ノードをDOMに追加します。
   */
  public show(): void {
    this.children.forEach(child => {
      child.mount();
    });
    this.getTarget().style.display = this.display ?? '';
    this.visible = true;
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
  public setContent(text: string): Promise<unknown> {
    if (this.skipMutation || this.text === text || this.parent === null) {
      return Promise.resolve();
    }
    this.text = text;
    this.contents = new TextContents(text);
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
    });
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
  public setContent(text: string): Promise<unknown> {
    if (this.skipMutation || this.text === text) {
      return Promise.resolve();
    }
    this.text = text;
    return Queue.enqueue(() => {
      this.skipMutation = true;
      this.target.textContent = this.text;
    }).finally(() => {
      this.skipMutation = false;
    });
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
