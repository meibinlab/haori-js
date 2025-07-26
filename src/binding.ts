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

  /**
   * 評価結果を結合して文字列にします。
   *
   * @param contents 評価結果の配列
   * @returns 結合された文字列
   */
  public static joinEvaluateResults(contents: unknown[]): string {
    if (contents.length === 0) {
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

  /** 強制評価フラグ（プレースホルダでなくても評価する） */
  protected forceEvaluation: boolean;

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
    this.forceEvaluation = false;

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
        // RAW_EXPRESSIONをEXPRESSIONに変換
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
    const results: unknown[] = [];
    this.contents.forEach(c => {
      if (
        this.forceEvaluation ||
        c.type === ExpressionType.EXPRESSION ||
        c.type === ExpressionType.RAW_EXPRESSION
      ) {
        const result = Expression.evaluate(c.text, bindingValues);
        results.push(result);
      } else {
        results.push(c.text);
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

  /**
   * コンテンツが生の値を含むかどうかを取得します。
   *
   * @returns 生の値を含む場合は true、それ以外は false
   */
  public isRaw(): boolean {
    return this.contents.some(c => c.type === ExpressionType.RAW_EXPRESSION);
  }

  /**
   * コンテンツのサイズを取得します。
   *
   * @returns コンテンツのサイズ
   */
  public getContentsSize(): number {
    return this.contents.length;
  }
}

class AttributeContents extends TextContents {
  /** 属性名 */
  private readonly name: string;

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
    this.BINDING_MAP.set(target, binding);
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
   * 対象ノードとその子ノードを削除します。
   *
   * @param node 対象ノード
   * @param withDom DOMも操作する場合はtrue
   */
  public static removeNode(
    node: Node,
    withDom: boolean = false,
  ): Promise<unknown> {
    const binding = this.BINDING_MAP.get(node);
    if (binding) {
      if (binding.ignoreMutationNode) {
        return Promise.resolve();
      }
      binding.children?.map(child => Binding.removeNode(child.target, withDom));
      if (binding.parent && binding.parent.children) {
        binding.parent.children = binding.parent.children.filter(
          child => child !== binding,
        );
      }
      this.BINDING_MAP.delete(node);
    }
    if (withDom) {
      return Queue.enqueue(() => {
        if (binding) {
          binding.ignoreMutationNode = true;
        }
        node.parentNode?.removeChild(node);
      })
        .catch(error => {
          Log.error('[Haori]', 'Error removing node:', error);
        })
        .finally(() => {
          if (binding) {
            binding.ignoreMutationNode = false;
          }
        });
    } else {
      return Promise.resolve();
    }
  }

  /**
   * 対象ノードの子ノードを全て削除します。
   *
   * @param node 対象ノード
   * @param withDom DOMも操作する場合はtrue
   */
  public static removeChildren(
    node: Node,
    withDom: boolean = false,
  ): Promise<void> {
    const binding = this.BINDING_MAP.get(node);
    if (binding) {
      return Promise.allSettled(
        binding.children?.map(child =>
          Binding.removeNode(child.target, withDom),
        ) || [],
      )
        .then(() => {
          binding.children = null;
        })
        .catch(error => {
          Log.error('[Haori]', 'Error removing child nodes:', error);
        });
    } else {
      return Promise.allSettled(
        Array.from(node.childNodes).map(child =>
          Binding.removeNode(child, withDom),
        ) || [],
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
  ): Promise<unknown> {
    const binding = this.BINDING_MAP.get(parent);
    let childBinding = this.BINDING_MAP.get(child);
    if (!childBinding) {
      childBinding = new Binding(child);
    } else if (childBinding.ignoreMutationNode) {
      return Promise.resolve();
    }
    if (binding) {
      binding.appendChild(childBinding);
    }
    if (withDom) {
      return Queue.enqueue(() => {
        if (childBinding) {
          childBinding.ignoreMutationNode = true;
        }
        parent.appendChild(child);
      })
        .catch(error => {
          Log.error('[Haori]', 'Error appending child node:', error);
        })
        .finally(() => {
          if (childBinding) {
            childBinding.ignoreMutationNode = false;
          }
        });
    } else {
      return Promise.resolve();
    }
  }

  /**
   * ノードを参照ノードの前に挿入します。
   *
   * @param before 挿入するノード
   * @param reference 参照ノード
   * @param withDom DOMも操作する場合はtrue
   */
  public static insertBefore(
    before: Node,
    reference: Node,
    withDom: boolean = false,
  ): Promise<unknown> {
    const beforeBinding = this.BINDING_MAP.get(before);
    if (beforeBinding && beforeBinding.ignoreMutationNode) {
      return Promise.resolve();
    }
    const targetBinding = this.BINDING_MAP.get(reference);
    if (targetBinding && beforeBinding) {
      targetBinding.insertBefore(beforeBinding);
    }
    if (withDom) {
      return Queue.enqueue(() => {
        if (beforeBinding) {
          beforeBinding.ignoreMutationNode = true;
        }
        reference.parentNode?.insertBefore(before, reference);
      })
        .catch(error => {
          Log.error('[Haori]', 'Error inserting node before reference:', error);
        })
        .finally(() => {
          if (beforeBinding) {
            beforeBinding.ignoreMutationNode = false;
          }
        });
    } else {
      return Promise.resolve();
    }
  }

  /**
   * ノードを参照ノードの後に挿入します。
   *
   * @param after 挿入するノード
   * @param reference 参照ノード
   * @param withDom DOMも操作する場合はtrue
   */
  public static insertAfter(
    after: Node,
    reference: Node,
    withDom: boolean = false,
  ): Promise<unknown> {
    const afterBinding = this.BINDING_MAP.get(after);
    if (afterBinding && afterBinding.ignoreMutationNode) {
      return Promise.resolve();
    }
    const targetBinding = this.BINDING_MAP.get(reference);
    if (targetBinding && afterBinding) {
      targetBinding.insertAfter(afterBinding);
    }
    if (withDom) {
      return Queue.enqueue(() => {
        if (afterBinding) {
          afterBinding.ignoreMutationNode = true;
        }
        reference.parentNode?.insertBefore(after, reference.nextSibling);
      })
        .catch(error => {
          Log.error('[Haori]', 'Error inserting node after reference:', error);
        })
        .finally(() => {
          if (afterBinding) {
            afterBinding.ignoreMutationNode = false;
          }
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
    value: string | null,
    withDom: boolean = false,
  ): Promise<unknown> {
    const binding = this.BINDING_MAP.get(target);
    if (binding) {
      if (binding.ignoreMutationAttributes) {
        return Promise.resolve();
      }
      binding.updateAttribute(name, value);
    }
    if (withDom) {
      return Queue.enqueue(() => {
        if (binding) {
          binding.ignoreMutationAttributes = true;
        }
        const element = target as HTMLElement;
        if (value === null) {
          element.removeAttribute(name);
        } else {
          element.setAttribute(name, value);
        }
      })
        .catch(error => {
          Log.error('[Haori]', 'Error updating attribute:', error);
        })
        .finally(() => {
          if (binding) {
            binding.ignoreMutationAttributes = false;
          }
        });
    } else {
      return Promise.resolve();
    }
  }

  /**
   * テキストコンテンツを更新します。
   *
   * @param target 対象のノード
   * @param text 更新するテキスト
   * @param withDom DOMも操作する場合はtrue
   */
  public static updateTextContent(
    target: Node,
    text: string,
    withDom: boolean = false,
  ): Promise<unknown> {
    const binding = this.BINDING_MAP.get(target);
    if (binding) {
      if (binding.ignoreMutationTextContent) {
        return Promise.resolve();
      }
      binding.updateTextContent(text);
    }
    if (withDom) {
      return Queue.enqueue(() => {
        if (binding) {
          binding.ignoreMutationTextContent = true;
        }
        const element = target as HTMLElement;
        element.textContent = text;
      })
        .catch(error => {
          Log.error('[Haori]', 'Error updating text content:', error);
        })
        .finally(() => {
          if (binding) {
            binding.ignoreMutationTextContent = false;
          }
        });
    } else {
      return Promise.resolve();
    }
  }

  /**
   * （テスト用）バインディングを全てクリアします。
   */
  public static clearBindings(): void {
    this.BINDING_MAP.clear();
  }

  /** 対象ノード */
  private readonly target: Node;

  /** 対象ノードがエレメントかどうか */
  private readonly isElement: boolean;

  /** コンテンツのリスト */
  private contents: TextContents | null;

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

  /** ノードの変更監視を無視するフラグ */
  public ignoreMutationNode: boolean = false;

  /** 属性の変更監視を無視するフラグ */
  public ignoreMutationAttributes: boolean = false;

  /** テキストコンテンツの変更監視を無視するフラグ */
  public ignoreMutationTextContent: boolean = false;

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
   * バインディングを子ノードを含めて評価します。
   */
  public evaluate(): void {
    if (this.isElement) {
      this.evaluateIf();
      this.evaluateEach();
      if (this.visible) {
        this.evaluateAttributes();
        this.evaluateContents();
      }
    } else if (this.parent && this.parent.visible) {
      this.parent.evaluateContents();
    }
    if (this.visible && this.children) {
      Promise.allSettled(this.children.map(child => child.evaluate())).catch(
        error => {
          Log.error('[Haori]', 'Error evaluating child evaluations:', error);
        },
      );
    }
  }

  /**
   * if 属性のバインディングを評価します。
   */
  protected evaluateIf(): void {
    const ifName = this.getExistsAttributeName('if');
    if (ifName === null) {
      return;
    }
    const currentIfValue = this.visible;
    const ifValue = this.getEvaluatedAttribute(ifName)![0];
    if (ifValue === false) {
      if (currentIfValue !== false) {
        // 非表示
        this.visible = false;
        const element = this.target as HTMLElement;
        Queue.enqueue(() => {
          this.ignoreMutationAttributes = true;
          this.children?.forEach(child => {
            child.ignoreMutationNode = true;
          });
          this.display = element.style.display;
          element.style.display = 'none';
          element.setAttribute(`${ifName}-false`, '');
          while (element.firstChild) {
            element.removeChild(element.firstChild);
          }
        })
          .catch(error => {
            Log.error('[Haori]', 'Error hiding element:', error);
          })
          .finally(() => {
            this.ignoreMutationAttributes = false;
            this.children?.forEach(child => {
              child.ignoreMutationNode = false;
            });
          });
      }
    } else if (currentIfValue === null) {
      // 初期表示
      this.visible = true;
    } else if (currentIfValue === false) {
      // 再表示
      this.visible = true;
      const element = this.target as HTMLElement;
      Queue.enqueue(() => {
        this.ignoreMutationAttributes = true;
        this.children?.forEach(child => {
          child.ignoreMutationNode = true;
        });
        element.style.display = this.display || '';
        element.removeAttribute(`${ifName}-false`);
        this.children?.forEach(child => {
          element.appendChild(child.target);
        });
      })
        .catch(error => {
          Log.error('[Haori]', 'Error showing element:', error);
        })
        .finally(() => {
          this.ignoreMutationAttributes = false;
          this.children?.forEach(child => {
            child.ignoreMutationNode = false;
          });
          this.evaluate();
        });
    }
  }

  /**
   * each 属性のバインディングを評価します。
   */
  protected evaluateEach(): void {
    const eachName = this.getExistsAttributeName('each');
    if (eachName === null) {
      return;
    }
    const eachValue = this.getEvaluatedAttribute(eachName)![0];
    if (!Array.isArray(eachValue)) {
      Log.error('[Haori]', 'Invalid data-each value:', eachValue);
      return;
    }
    const list = eachValue as Record<string, unknown>[];
    const element = this.target as HTMLElement;
    if (!this.template) {
      this.template = [];
      for (let i = 0; i < element.childNodes.length; i++) {
        const childNode = element.childNodes[i];
        const clonedNode = Binding.cloneNode(childNode);
        const clonedBinding = Binding.bind(clonedNode);
        this.template.push(clonedBinding);
      }
    }
    Binding.removeChildren(element, true);
    const argName = this.getAttribute('each-arg', true);
    const prefix = eachName.split('-')[0] + '-';
    this.template!.forEach(template => {
      if (!template.hasAttribute('each-before')) {
        return;
      }
      const before = template.clone();
      Binding.appendChild(this.target, before.target, true).finally(() => {
        before.evaluate();
      });
    });
    this.template!.forEach(template => {
      if (
        template.hasAttribute('each-before') ||
        template.hasAttribute('each-after')
      ) {
        return;
      }
      list.forEach((item, index) => {
        const cloned = template.clone();
        if (cloned.isElement) {
          const element = cloned.target as HTMLElement;
          // data-each-keyが指定されていればdata-row属性に値をセット
          const keyName = this.getAttribute('each-key', true);
          if (keyName && item && item[keyName] !== undefined) {
            element.setAttribute('data-row', String(item[keyName]));
          } else {
            element.setAttribute(`${prefix}row`, '');
          }
          const bindValue = argName ? {[argName]: item} : item;
          const indexName = this.getAttribute('each-index', true);
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
          console.log('TEST', bindValue);
          cloned.bindingData = bindValue;
          element.setAttribute(`${prefix}bind`, JSON.stringify(bindValue));
        }
        Binding.appendChild(this.target, cloned.target, true).finally(() => {
          cloned.evaluate();
        });
      });
    });
    this.template!.forEach(template => {
      if (!template.hasAttribute('each-after')) {
        return;
      }
      const after = template.clone();
      Binding.appendChild(this.target, after.target, true).finally(() => {
        after.evaluate();
      });
    });
  }

  /**
   * 属性の評価を行います。
   */
  protected evaluateAttributes(): void {
    if (this.attributes === null || this.attributes.size === 0) {
      return;
    }
    this.attributes.forEach((attribute, key) => {
      Queue.enqueue(() => {
        const element = this.target as HTMLElement;
        const results = attribute.evaluate(this.getBindingData());
        this.ignoreMutationAttributes = true;
        if (results.length == 1 && results[0] === false) {
          element.removeAttribute(key);
        } else {
          const value = TextContents.joinEvaluateResults(results);
          if (element.getAttribute(key) === value) {
            return;
          }
          element.setAttribute(key, value);
        }
      })
        .catch(error => {
          Log.error('[Haori]', 'Error evaluating attribute:', key, error);
        })
        .finally(() => {
          this.ignoreMutationAttributes = false;
        });
    });
  }

  /**
   * 子ノードのコンテンツをDOMに適用します。
   */
  protected evaluateContents(): void {
    if (this.children === null || this.children.length === 0) {
      return;
    }
    this.children!.forEach(child => {
      if (child.isElement) {
        return;
      }
      const result = child.getEvaluatedContents();
      if (result.isRaw) {
        if (this.children!.length > 1) {
          Log.error(
            '[Haori]',
            'Raw expressions are not allowed in multi-content bindings.',
          );
          result.isRaw = false; // RAW_EXPRESSIONをEXPRESSIONに変換
        } else {
          Queue.enqueue(() => {
            this.ignoreMutationTextContent = true;
            const element = this.target as HTMLElement;
            const html = TextContents.joinEvaluateResults(result.contents);
            if (element.innerHTML === html) {
              return;
            }
            element.innerHTML = html;
          })
            .catch(error => {
              Log.error('[Haori]', 'Error updating innerHTML:', error);
            })
            .finally(() => {
              this.ignoreMutationTextContent = false;
            });
          return;
        }
      }
      Queue.enqueue(() => {
        this.ignoreMutationTextContent = true;
        const node = child.target as Text;
        const text = TextContents.joinEvaluateResults(result.contents);
        if (node.textContent === text) {
          return;
        }
        node.textContent = text;
      })
        .catch(error => {
          Log.error('[Haori]', 'Error updating text content:', error);
        })
        .finally(() => {
          this.ignoreMutationTextContent = false;
        });
    });
  }

  /**
   * 属性を更新します。
   *
   * @param name 属性名
   * @param value 属性値
   */
  public updateAttribute(name: string, value: string | null): void {
    if (!this.isElement || !this.attributes) {
      Log.error('[Haori]', 'Cannot update attribute on non-element binding.');
      return;
    }
    if (value === null) {
      this.attributes.delete(name);
    } else {
      this.attributes.set(name, new AttributeContents(name, value));
    }
    if (name == 'data-bind' || name == 'hor-bind') {
      try {
        this.bindingData = value === null ? null : JSON.parse(value);
        this.bindingDataCache = null;
        this.evaluate();
      } catch (error) {
        Log.error('[Haori]', 'Invalid data-bind attribute:', error);
        this.bindingData = null;
      }
    } else if (
      name == 'data-if' ||
      name == 'hor-if' ||
      name == 'data-each' ||
      name == 'hor-each'
    ) {
      this.evaluate();
    }
  }

  /**
   * テキストコンテンツを更新します。
   *
   * @param text 更新するテキスト
   */
  public updateTextContent(text: string): void {
    if (this.isElement) {
      Log.error('[Haori]', 'Cannot update text content on element binding.');
      return;
    }
    this.contents = new TextContents(text);
    this.parent?.evaluateContents();
  }

  /**
   * 継承を考慮したバインディングデータを取得します。
   *
   * @returns バインディングデータのオブジェクト
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
   * 指定されたサフィックスを持つ属性が存在するかどうかを確認します。
   *
   * @param suffix 属性のサフィックス（例: "if", "each"）
   * @returns 存在する場合はtrue、そうでない場合はfalse
   */
  protected hasAttribute(suffix: string): boolean {
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
  protected getExistsAttributeName(suffix: string): string | null {
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
  protected getAttribute(
    name: string,
    isPrefix: boolean = false,
  ): string | null {
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
  protected getEvaluatedAttribute(
    name: string,
    isPrefix: boolean = false,
  ): unknown[] | null {
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
   * @returns { contents: unknown, isRaw: boolean }
   *   - contents: 評価された文字列
   *   - isRaw: トリプルプレースホルダ（非エスケープ）かどうか
   */
  protected getEvaluatedContents(): {contents: unknown[]; isRaw: boolean} {
    if (!this.contents) {
      return {contents: [], isRaw: false};
    }
    if (this.contents.getContentsSize() === 1) {
      return {
        contents: this.contents.evaluate(this.getBindingData()),
        isRaw: this.contents.isRaw(),
      };
    }
    return {
      contents: this.contents.evaluate(this.getBindingData()),
      isRaw: false,
    };
  }

  /**
   * バインディングをクローンします。ノードも複製します。
   *
   * @param binding 対象のバインディング
   * @returns クローンされたバインディング
   */
  protected clone(): Binding {
    return Binding.bind(this.target.cloneNode(true));
  }

  /**
   * 対象バインディングを削除します。子バインディングは削除されません。
   */
  public remove() {
    if (this.parent && this.parent.children) {
      this.parent.children = this.parent.children.filter(
        child => child !== this,
      );
    }
  }

  /**
   * 子バインディングを挿入します。
   *
   * @param child 挿入する子バインディング
   */
  public appendChild(child: Binding): void {
    if (!this.isElement || !this.target) {
      Log.error('[Haori]', 'Cannot append child to non-element binding.');
      return;
    }
    child.remove(); // 既存の親から削除
    if (!this.children) {
      this.children = [];
    }
    child.parent = this;
    this.children.push(child);
  }

  /**
   * 指定されたバインディングを前に挿入します。
   *
   * @param before 前に挿入するバインディング
   */
  public insertBefore(before: Binding) {
    if (!this.parent) {
      Log.error('[Haori]', 'Cannot insert before without a parent binding.');
      return;
    }
    before.remove(); // 既存の親から削除
    if (!this.parent.children) {
      this.parent.children = [];
    }
    const index = this.parent.children.indexOf(this);
    if (index >= 0) {
      this.parent.children.splice(index, 0, before);
    } else {
      this.parent.children.push(before);
    }
    before.parent = this.parent;
  }

  /**
   * 指定されたバインディングを後ろに挿入します。
   *
   * @param after 後ろに挿入するバインディング
   */
  public insertAfter(after: Binding) {
    if (!this.parent) {
      Log.error('[Haori]', 'Cannot insert after without a parent binding.');
      return;
    }
    after.remove(); // 既存の親から削除
    if (!this.parent.children) {
      this.parent.children = [];
    }
    const index = this.parent.children.indexOf(this);
    if (index >= 0) {
      this.parent.children.splice(index + 1, 0, after);
    } else {
      this.parent.children.push(after);
    }
    after.parent = this.parent;
  }
}
