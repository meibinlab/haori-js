/**
 * @fileoverview バインディングクラス
 *
 * このクラスは、ノードとその親子関係を管理するためのものです。
 * DOMを操作する際に、ノードのバインディングを追跡するために使用されます。
 */

import {Expression} from './expression';
import {Log} from './log';
import {Queue} from './queue';

class TextContents {
  /** プレースホルダ検出用の正規表現 */
  private static readonly PLACEHOLDER_REGEX =
    /\{\{\{([\s\S]+?)\}\}\}|\{\{([\s\S]+?)\}\}/g;

  /** コンテンツのリスト */
  contents: Content[] = [];

  /** コンテンツを追加 */
  addContent(content: Content): void {
    this.contents.push(content);
  }

  /**
   * コンストラクタ。
   *
   * @param text テキスト
   */
  constructor(text: string) {
    const regex = new RegExp(TextContents.PLACEHOLDER_REGEX, 'g');
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      // プレースホルダ前の通常テキスト
      if (match.index > lastIndex) {
        this.contents.push({
          text: text.slice(lastIndex, match.index),
          type: ExpressionType.TEXT,
        });
      }
      // プレースホルダ本体
      this.contents.push({
        text: match[1] ?? match[2],
        type: match[1]
          ? ExpressionType.RAW_EXPRESSION
          : ExpressionType.EXPRESSION,
      });
      lastIndex = regex.lastIndex;
    }
    // 最後のプレースホルダ以降の通常テキスト
    if (lastIndex < text.length) {
      this.contents.push({
        text: text.slice(lastIndex),
        type: ExpressionType.TEXT,
      });
    }
    this.checkRawExpressions();
  }

  /**
   * RAW_EXPRESSION のチェック
   */
  checkRawExpressions(): void {
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
        // RAW_EXPRESSIONをEXPRESSIONに変換
        this.contents[i].type = ExpressionType.EXPRESSION;
      }
    }
  }

  /**
   * 式評価を行い、結果を文字列として返します。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @returns 評価結果の文字列またはboolean
   */
  public evaluate(bindingValues: Record<string, unknown>): string | boolean {
    return this.contents
      .map(c => {
        if (
          c.type === ExpressionType.EXPRESSION ||
          c.type === ExpressionType.RAW_EXPRESSION
        ) {
          let result = Expression.evaluate(c.text, bindingValues);
          if (
            result === null ||
            result === undefined ||
            Number.isNaN(result) ||
            result === false
          ) {
            result = '';
          }
          return new String(result);
        }
        return c.text;
      })
      .join('');
  }

  /**
   * コンテンツが生の値を含むかどうかを取得します。
   *
   * @returns 生の値を含む場合は true、それ以外は false
   */
  public isRaw(): boolean {
    return this.contents.some(c => c.type === ExpressionType.RAW_EXPRESSION);
  }
}

class AttributeContents extends TextContents {
  /** 属性名 */
  private readonly name: string;

  /** 強制評価フラグ（if、each用） */
  private readonly forceEvaluation: boolean;

  /**
   * コンストラクタ。
   *
   * @param name 属性名
   * @param text 属性値
   */
  constructor(name: string, value: string) {
    super(value);
    this.name = name;
    this.forceEvaluation = name.startsWith('data-') || name.startsWith('hor-');
  }

  /**
   * RAW_EXPRESSION のチェック
   */
  checkRawExpressions(): void {
    for (let i = 0; i < this.contents.length; i++) {
      const content = this.contents[i];
      if (content.type === ExpressionType.RAW_EXPRESSION) {
        Log.error(
          '[Haori]',
          'Raw expressions are not allowed in attribute values.',
        );
        // RAW_EXPRESSIONをEXPRESSIONに変換
        this.contents[i].type = ExpressionType.EXPRESSION;
      }
    }
  }

  /**
   * 属性の値を取得します。
   *
   * @returns 属性の値
   */
  public getValue(): string {
    return this.contents.map(c => c.text).join('');
  }

  /**
   * 式評価を行い、結果を文字列として返します。
   * 単一の評価式で結果が null、undefined、NaN、またはfalseの場合はfalseを返します（属性を除去するため）。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @returns 評価結果の文字列またはboolean
   */
  public evaluate(bindingValues: Record<string, unknown>): string | boolean {
    if (this.contents.length === 1) {
      const content = this.contents[0];
      const result =
        this.forceEvaluation ||
        content.type === ExpressionType.RAW_EXPRESSION ||
        content.type === ExpressionType.EXPRESSION
          ? Expression.evaluate(content.text, bindingValues)
          : content.text;
      if (
        result === null ||
        result === undefined ||
        Number.isNaN(result) ||
        result === false
      ) {
        return false;
      }
      return new String(result).toString();
    } else if (this.forceEvaluation) {
      Log.error(
        '[Haori]',
        'Multiple expressions are not allowed for "if" or "each" attributes.',
      );
      return '';
    } else {
      return super.evaluate(bindingValues);
    }
  }

  /**
   * 属性名を取得します。
   *
   * @returns 属性名
   */
  public getName(): string {
    return this.name;
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

  /** 生の値 */
  RAW_EXPRESSION,
}

/**
 * コンテンツのインターフェース。
 */
interface Content {
  /** テキストコンテンツ */
  text: string;

  /** 評価式かどうか */
  type: ExpressionType;
}

/**
 * バインディングクラス。
 * ノードとその親子関係を管理します。
 */
export class Binding {
  /** 対象ノードに対するバインディングのマップ */
  private static readonly BINDING_MAP = new Map<Node, Binding>();

  /**
   * バインディングの初期化処理を行います。
   *
   * @param target 対象ノード
   * @return バインディングオブジェクト
   */
  public static bind(target: Node): Binding {
    let binding = this.BINDING_MAP.get(target);
    if (binding) {
      return binding;
    }
    binding = new Binding(target);
    binding.parent = target.parentNode
      ? this.BINDING_MAP.get(target.parentNode as Node) || null
      : null;
    if (target.childNodes && target.childNodes.length > 0) {
      binding.children = [];
      for (let i = 0; i < target.childNodes.length; i++) {
        const child = target.childNodes[i];
        const childBinding = this.bind(child);
        binding.children.push(childBinding);
      }
    }
    this.BINDING_MAP.set(target, binding);
    return binding;
  }

  /**
   * 属性の値を取得します。
   *
   * @param target 対象のエレメント
   * @param suffix 属性のサフィックス（例: "if", "each"）
   * @returns 属性の値またはnull
   */
  private static getAttribute(target: Node, suffix: string): string | null {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const element = target as HTMLElement;
    let value = element.getAttribute(`data-${suffix}`);
    if (value === null) {
      value = element.getAttribute(`hor-${suffix}`);
    }
    return value;
  }

  /**
   * バインディングを評価します。
   */
  public static evaluate(binding: Binding): void {
    if (!binding || !binding.isElement) {
      return;
    }
    this.evaluateIf(binding);
    this.evaluateEach(binding);
    if (binding.visible) {
      this.evaluateAttributes(binding);
      this.evaluateContents(binding);
    }
  }

  /**
   * if 属性のバインディングを評価します。
   *
   * @param binding 対象のバインディング
   */
  private static evaluateIf(binding: Binding): void {
    const ifName = binding.getExistsAttributeName('if');
    if (ifName === null) {
      return;
    }
    const currentIfValue = binding.visible;
    const ifValue = binding.getEvaluatedAttribute(ifName);
    if (ifValue === false) {
      if (currentIfValue !== false) {
        // 非表示
        binding.visible = false;
        const element = binding.target as HTMLElement;
        Queue.enqueue(() => {
          binding.display = element.style.display;
          element.style.display = 'none';
          element.setAttribute(`${ifName}-false`, '');
          while (element.firstChild) {
            element.removeChild(element.firstChild);
          }
        });
      }
    } else if (currentIfValue === null) {
      // 初期表示
      binding.visible = true;
    } else if (currentIfValue === false) {
      // 再表示
      binding.visible = true;
      const element = binding.target as HTMLElement;
      Queue.enqueue(() => {
        element.style.display = binding.display || '';
        element.removeAttribute(`${ifName}-false`);
        binding.children?.forEach(child => {
          element.appendChild(child.target);
        });
      });
    }
  }

  /**
   * each 属性のバインディングを評価します。
   *
   * @param binding 対象のバインディング
   */
  private static evaluateEach(binding: Binding): void {
    const eachName = binding.getExistsAttributeName('each');
    if (eachName === null) {
      return;
    }
    const eachValue = binding.getAttribute(eachName);
    if (!Array.isArray(eachValue)) {
      Log.error('[Haori]', 'Invalid data-each value:', eachValue);
      return;
    }
    if (eachValue) {
      const list = eachValue as Record<string, unknown>[];
      const element = binding.target as HTMLElement;
      if (!binding.template) {
        binding.template = [];
        for (let i = 0; i < element.childNodes.length; i++) {
          const childNode = element.childNodes[i];
          const clonedNode = Binding.cloneNode(childNode);
          const clonedBinding = Binding.bind(clonedNode);
          binding.template.push(clonedBinding);
        }
      }
      Queue.enqueue(() => {
        Binding.removeChildren(element);
      });
      const argName = binding.getAttribute('each-arg', true);
      const prefix = eachName.split('-')[0] + '-';
      binding.template!.forEach(template => {
        if (!template.hasAttribute('each-before')) {
          return;
        }
        Queue.enqueue(() => {
          const before = template.clone();
          binding.insertChild(before);
        });
      });
      binding.template!.forEach(template => {
        if (
          template.hasAttribute('each-before') &&
          template.hasAttribute('each-after')
        ) {
          return;
        }
        list.forEach((item, index) => {
          Queue.enqueue(() => {
            const target = template.clone();
            if (target.isElement) {
              const element = target.target as HTMLElement;
              // data-each-keyが指定されていればdata-row属性に値をセット
              const keyName = Binding.getAttribute(element, 'each-key');
              if (keyName && item && item[keyName] !== undefined) {
                element.setAttribute('data-row', String(item[keyName]));
              } else {
                element.setAttribute(`${prefix}row`, '');
              }
              const bindValue = argName ? {[argName]: item} : item;
              const indexName = Binding.getAttribute(element, 'each-index');
              if (indexName) {
                if (argName) {
                  if (
                    !bindValue[argName] ||
                    typeof bindValue[argName] !== 'object'
                  ) {
                    bindValue[argName] = {};
                  }
                  (bindValue[argName] as Record<string, unknown>)[indexName] =
                    index;
                } else {
                  bindValue[indexName] = index;
                }
              }
              element.setAttribute(`${prefix}bind`, JSON.stringify(bindValue));
            }
            binding.insertChild(target);
          });
        });
      });
      binding.template!.forEach(template => {
        if (!template.hasAttribute('each-after')) {
          return;
        }
        Queue.enqueue(() => {
          const after = template.clone();
          binding.insertChild(after);
        });
      });
    }
  }

  /**
   * 属性の評価を行います。
   *
   * @param binding 対象のバインディング
   */
  private static evaluateAttributes(binding: Binding): void {
    if (binding.attributes === null || binding.attributes.size === 0) {
      return;
    }
    binding.attributes.forEach((attribute, key) => {
      Queue.enqueue(() => {
        const element = binding.target as HTMLElement;
        const value = attribute.evaluate(binding.getBindingData());
        if (value === false) {
          element.removeAttribute(key);
        } else {
          element.setAttribute(key, value.toString());
        }
      });
    });
  }

  /**
   * コンテンツをDOMに適用します。
   *
   * @param binding 対象のバインディング
   */
  private static evaluateContents(binding: Binding): void {
    if (binding.children === null || binding.children.length === 0) {
      return;
    }
    binding.children!.forEach(child => {
      if (child.isElement) {
        return;
      }
      const text = child.getEvaluatedContents();
      if (text.isRaw) {
        if (binding.children!.length > 1) {
          Log.error(
            '[Haori]',
            'Raw expressions are not allowed in multi-content bindings.',
          );
          text.isRaw = false; // RAW_EXPRESSIONをEXPRESSIONに変換
        } else {
          Queue.enqueue(() => {
            const element = binding.target as HTMLElement;
            element.innerHTML = text.contents as string;
          });
          return;
        }
      }
      Queue.enqueue(() => {
        const node = child.target as Text;
        node.textContent = text.contents as string;
      });
    });
  }

  /**
   * ノードをバインディングを含めてクローンします。
   *
   * @param node 対象ノード
   * @returns クローンされたノード
   */
  public static cloneNode(node: Node): Node {
    const binding = this.BINDING_MAP.get(node);
    if (binding) {
      const newBinding = Binding.bind(node.cloneNode(true));
      return newBinding.target;
    } else {
      return node.cloneNode(true);
    }
  }

  /**
   * 対象ノードをバインディングごと削除します。
   *
   * @param node 対象ノード
   */
  public static removeNode(node: Node): Promise<void> {
    const binding = this.BINDING_MAP.get(node);
    if (binding) {
      binding.children?.map(child => Binding.removeNode(child.target));
      if (binding.parent && binding.parent.children) {
        binding.parent.children = binding.parent.children.filter(
          child => child !== binding,
        );
      }
      this.BINDING_MAP.delete(node);
    }
    return Queue.enqueue(() => {
      node.parentNode?.removeChild(node);
    });
  }

  /**
   * 対象ノードの子ノードをバインディングごと全て削除します。
   *
   * @param node 対象ノード
   */
  public static removeChildren(node: Node): Promise<void> {
    const binding = this.BINDING_MAP.get(node);
    if (binding) {
      return Promise.allSettled(
        binding.children?.map(child => Binding.removeNode(child.target)) || [],
      )
        .then(() => {
          binding.children = null;
        })
        .catch(error => {
          Log.error('[Haori]', 'Error removing child nodes:', error);
        });
    } else {
      return Promise.allSettled(
        Array.from(node.childNodes).map(child => Binding.removeNode(child)) ||
          [],
      )
        .then(() => {})
        .catch(error => {
          Log.error('[Haori]', 'Error removing child nodes:', error);
        });
    }
  }

  /**
   * 子ノードを親ノードに追加します。
   *
   * @param parent 親ノード
   * @param child 子ノード
   * @param withDom DOMも操作する場合はtrue
   */
  public static appendChild(
    parent: Node,
    child: Node,
    withDom: boolean = false,
  ): Promise<void> {
    const binding = this.BINDING_MAP.get(parent);
    let childBinding = this.BINDING_MAP.get(child);
    if (!childBinding) {
      childBinding = new Binding(child);
    }
    if (binding) {
      binding.insertChild(childBinding);
    }
    if (withDom) {
      return Queue.enqueue(() => {
        parent.appendChild(child);
      });
    } else {
      return Promise.resolve();
    }
  }

  /**
   * 属性の変更を反映します。
   *
   * @param target 対象のノード
   * @param name 属性名
   * @param value 属性値
   * @param withDom DOMも操作する場合はtrue
   */
  public static updateAttribute(
    target: Node,
    name: string,
    value: string,
    withDom: boolean = false,
  ): Promise<void> {
    const binding = this.BINDING_MAP.get(target);
    if (binding) {
      binding.updateAttribute(name, value);
    }
    if (withDom) {
      return Queue.enqueue(() => {
        const element = target as HTMLElement;
        element.setAttribute(name, value);
      });
    } else {
      return Promise.resolve();
    }
  }

  /** 対象ノード */
  private readonly target: Node;

  /** 対象ノードがエレメントかどうか */
  private readonly isElement: boolean;

  /** コンテンツのリスト */
  private readonly contents: TextContents | null;

  /** 属性のマップ */
  private readonly attributes: Map<string, AttributeContents> | null;

  /** 親バインディング */
  private parent: Binding | null = null;

  /** 子バインディングのリスト */
  private children: Binding[] | null = null;

  /** data-bind のデータ */
  private bindingData: Record<string, unknown> | null = null;

  /** data のキャッシュ */
  private bindingDataCache: Record<string, unknown> | null = null;

  /** 表示状態（data-if 用） */
  private visible: boolean = true;

  /** data-if 用の元の display 値 */
  private display: string | null = null;

  /** data-each 用のテンプレート */
  private template: Binding[] | null = null;

  /**
   * コンストラクタ。
   *
   * @param target 対象ノード
   */
  constructor(target: Node) {
    this.target = target;
    this.isElement = target.nodeType === Node.ELEMENT_NODE;
    if (this.isElement) {
      const element = target as HTMLElement;
      this.contents = null;
      this.attributes = new Map();
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        this.attributes.set(
          attr.name,
          new AttributeContents(attr.name, attr.value),
        );
      }
      const data = Binding.getAttribute(element, 'bind');
      if (data) {
        try {
          this.bindingData = JSON.parse(data as string);
        } catch (e) {
          Log.error('[Haori]', 'Invalid data-bind attribute:', e);
          this.bindingData = null;
        }
      }
    } else {
      this.contents = new TextContents(target.textContent || '');
      this.attributes = null;
    }
  }

  /**
   * 属性を更新します。
   *
   * @param name 属性名
   * @param value 属性値
   */
  public updateAttribute(name: string, value: string): void {
    if (!this.isElement || !this.attributes) {
      Log.error('[Haori]', 'Cannot update attribute on non-element binding.');
      return;
    }
    this.attributes.set(name, new AttributeContents(name, value));
    if (name == 'data-bind' || name == 'hor-bind') {
      try {
        this.bindingData = JSON.parse(value);
        this.bindingDataCache = null;
      } catch (error) {
        Log.error('[Haori]', 'Invalid data-bind attribute:', error);
        this.bindingData = null;
      }
    }
  }

  /**
   * 継承を考慮したバインディングデータを取得します。
   *
   * @returns バインディングデータのオブジェクト
   */
  private getBindingData(): Record<string, unknown> {
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
   * 指定されたサフィックスを持つ属性が存在するかどうかを確認します。
   *
   * @param suffix 属性のサフィックス（例: "if", "each"）
   * @returns 存在する場合はtrue、そうでない場合はfalse
   */
  private hasAttribute(suffix: string): boolean {
    if (!this.isElement || !this.attributes) {
      return false;
    }
    return (
      this.attributes.has(`data-${suffix}`) ||
      this.attributes.has(`hor-${suffix}`)
    );
  }

  /**
   * 属性が存在するかどうかを確認します。
   * 存在する場合は属性名を返します。
   *
   * @param suffix 属性のサフィックス（例: "if", "each"）
   * @returns 属性が存在するなら属性名を、存在しないならnullを返します
   */
  private getExistsAttributeName(suffix: string): string | null {
    if (!this.isElement || !this.attributes) {
      return null;
    }
    const attr =
      this.attributes.get(`data-${suffix}`) ||
      this.attributes.get(`hor-${suffix}`);
    return attr ? attr.getName() : null;
  }

  /**
   * 属性の値を取得します。
   *
   * @param name 属性名
   * @param isPrefix プレフィックスを使用するかどうか（デフォルトはfalse）
   * @returns 属性の値またはnull
   */
  private getAttribute(name: string, isPrefix: boolean = false): string | null {
    if (!this.isElement || !this.attributes) {
      return null;
    }
    const attr = isPrefix
      ? (this.attributes.get(`data-${name}`) ??
        this.attributes.get(`hor-${name}`))
      : this.attributes.get(name);
    return attr ? attr.getValue() : null;
  }

  /**
   * 評価済みの属性の値を取得します。
   *
   * @param name 属性名
   * @param isPrefix プレフィックスを使用するかどうか（デフォルトはfalse）
   * @returns 属性の値またはnull
   */
  private getEvaluatedAttribute(
    name: string,
    isPrefix: boolean = false,
  ): string | boolean | null {
    if (!this.isElement || !this.attributes) {
      return null;
    }
    const attr = isPrefix
      ? (this.attributes.get(`data-${name}`) ??
        this.attributes.get(`hor-${name}`))
      : this.attributes.get(name);
    return attr ? attr.evaluate(this.getBindingData()) : null;
  }

  /**
   * コンテンツを評価し、結果の文字列を返します。
   *
   * @returns { contents: string, isRaw: boolean }
   *   - contents: 評価された文字列
   *   - isRaw: トリプルプレースホルダ（非エスケープ）かどうか
   */
  private getEvaluatedContents(): {contents: string; isRaw: boolean} {
    if (!this.contents) {
      return {contents: '', isRaw: false};
    }
    if (this.contents.contents.length === 1) {
      return {
        contents: this.contents.evaluate(this.getBindingData()) as string,
        isRaw: this.contents.isRaw(),
      };
    }
    return {
      contents: this.contents.evaluate(this.getBindingData()) as string,
      isRaw: false,
    };
  }

  /**
   * バインディングをクローンします。ノードも複製します。
   *
   * @param binding 対象のバインディング
   * @returns クローンされたバインディング
   */
  private clone(): Binding {
    return Binding.bind(this.target.cloneNode(true));
  }

  /**
   * 子バインディングを挿入します。
   *
   * @param child 挿入する子バインディング
   */
  private insertChild(child: Binding): void {
    if (!this.isElement || !this.target) {
      Log.error('[Haori]', 'Cannot insert child to non-element binding.');
      return;
    }
    if (!this.children) {
      this.children = [];
    }
    child.parent = this;
    this.children.push(child);
  }
}
