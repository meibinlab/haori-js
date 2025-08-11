/**
 * @fileoverview Core機能
 *
 * Fragmentの管理、属性変化の監視、条件分岐・繰り返し処理など、
 * アプリケーションの中心的な機能を提供します。
 */
import Env from './env';
import Fragment, {
  ElementFragment,
  TextFragment,
} from './fragment';
import Log from './log';

/**
 * アプリケーションの中心的な制御を行うクラスです。
 * Fragment の初期化、属性変化の処理、条件分岐・繰り返し処理を管理します。
 */
export default class Common {
  /** 優先処理する属性のサフィックス（処理順序で定義） */
  private static readonly PRIORITY_ATTRIBUTE_SUFFIXES = ['bind', 'if', 'each'];

  /**
   * 指定された要素と、その子要素をスキャンし、Fragmentを生成します。
   *
   * @param element スキャン対象の要素
   */
  public static scan(element: HTMLElement): void {
    const parent = Fragment.get(element);
    const childNodes = Array.from(element.childNodes);
    for (const child of childNodes) {
      switch (child.nodeType) {
        case Node.ELEMENT_NODE: {
          const childElement = child as HTMLElement;
          const fragment = Fragment.get(child as HTMLElement);
          parent.pushChild(fragment);
          const processedAttributes = new Set<string>();
          for (const suffix of Common.PRIORITY_ATTRIBUTE_SUFFIXES) {
            // 優先属性の処理
            const name = Env.prefix + suffix;
            if (childElement.hasAttribute(name)) {
              Common.setAttribute(
                childElement,
                name,
                childElement.getAttribute(name),
              );
              processedAttributes.add(name);
            }
          }
          for (const name of childElement.getAttributeNames()) {
            if (processedAttributes.has(name)) {
              // すでに処理済みの属性はスキップ
              continue;
            }
            const value = childElement.getAttribute(name);
            if (value) {
              Common.setAttribute(childElement, name, value);
            }
          }
          Common.scan(child as HTMLElement);
          break;
        }
        case Node.TEXT_NODE: {
          const fragment = Fragment.get(child as Text);
          parent.pushChild(fragment);
          break;
        }
        case Node.COMMENT_NODE: {
          const fragment = Fragment.get(child as Comment);
          parent.pushChild(fragment);
          break;
        }
      }
    }
  }

  /**
   * エレメントに属性を設定します。
   * 属性固有の処理も行います。
   *
   * @param element エレメント
   * @param name 属性名
   * @param value 属性値
   */
  public static setAttribute(
    element: HTMLElement,
    name: string,
    value: string | null,
  ): void {
    const fragment = Fragment.get(element);
    switch (name) {
      case `${Env.prefix}bind`: {
        if (value === null) {
          fragment.clearBindingDataCache();
        } else {
          fragment.setBindingData(Common.parseDataBind(value));
        }
        Common.evaluateAll(fragment);
        break;
      }
      case `${Env.prefix}if`:
        Common.evaluateIf(fragment);
        break;
      case `${Env.prefix}each`:
        Common.evaluateEach(fragment);
        break;
    }
    if (value === null) {
      fragment.removeAttribute(name);
    } else {
      fragment.setAttribute(name, value);
    }
  }

  /**
   * data-bind 属性の値をパースします。
   *
   * @param data data-bind 属性の値
   * @returns パースされたデータオブジェクト
   */
  private static parseDataBind(data: string): Record<string, unknown> {
    if (data.startsWith('{') || data.startsWith('[')) {
      // JSONとしてパース
      try {
        return JSON.parse(data);
      } catch (e) {
        Log.error('[Haori]', 'Invalid JSON in data-bind:', e);
        return {};
      }
    } else {
      // URLSearchParamsでパース
      const params = new URLSearchParams(data);
      const result: Record<string, unknown> = {};
      for (const [key, value] of params.entries()) {
        if (result[key] !== undefined) {
          // すでに値がある場合は配列化
          if (Array.isArray(result[key])) {
            (result[key] as string[]).push(value);
          } else {
            result[key] = [result[key], value];
          }
        } else {
          result[key] = value;
        }
      }
      return result;
    }
  }

  public static addNode(parentElement: HTMLElement, node: Node) {
    const parent = Fragment.get(parentElement);
    const next = Fragment.get(node.nextSibling);
    const fragment = Fragment.get(node);
    if (fragment) {
      parent.insertBefore(fragment, next);
      if (fragment instanceof ElementFragment) {
        Common.evaluateAll(fragment);
      } else if (fragment instanceof TextFragment) {
        Common.evaluateText(fragment);
      }
    }
  }

  public static removeNode(node: Node) {
    const fragment = Fragment.get(node);
    if (fragment) {
      fragment.remove();
    }
  }

  public static changeText(node: Text | Comment, text: string) {
    const fragment = Fragment.get(node);
    if (fragment) {
      fragment.setContent(text);
    }
  }

  public static changeValue(element: HTMLElement, value: string) {
    const fragment = Fragment.get(element);
    if (fragment) {
      fragment.setValue(value);
    }
  }

  public static evaluateAll(fragment: ElementFragment) {
    if (fragment.hasAttribute(`${Env.prefix}if`)) {
      Common.evaluateIf(fragment);
    }
    if (fragment.hasAttribute(`${Env.prefix}each`)) {
      Common.evaluateEach(fragment);
    }
    fragment.getChildren().forEach(child => {
      if (child instanceof ElementFragment) {
        Common.evaluateAll(child);
      } else if (child instanceof TextFragment) {
        Common.evaluateText(child);
      }
    });
  }

  public static evaluateText(fragment: TextFragment) {
    return fragment.evaluate();
  }

  public static evaluateIf(fragment: ElementFragment) {
    const condition = fragment.getAttribute(`${Env.prefix}if`);
    if (
      condition === false ||
      condition === undefined ||
      condition === null ||
      Number.isNaN(condition)
    ) {
      if (fragment.isVisible()) {
        fragment.hide();
      }
    } else {
      if (!fragment.isVisible()) {
        fragment.show();
        Common.evaluateAll(fragment);
      }
    }
  }

  public static evaluateEach(fragment: ElementFragment) {
    const template = fragment.getTemplate();
    if (template.length === 0) {
      // テンプレートの作成
      fragment.getChildren().forEach(child => {
        if (child instanceof ElementFragment) {
          if (
            child.hasAttribute(`${Env.prefix}each-before`) ||
            child.hasAttribute(`${Env.prefix}each-after`)
          ) {
            return;
          }
          template.push(child);
          child.unmount();
        } else {
          Log.error(
            '[Haori]',
            'Unsupported child node type:',
            child.getTarget().nodeType,
          );
        }
      });
    }
    if (!fragment.isVisible || !fragment.isMounted()) {
      return;
    }
    const data = fragment.getAttribute(`${Env.prefix}each`);
    let keyArg = fragment.getAttribute(`${Env.prefix}each-key`);
    if (keyArg) {
      keyArg = String(keyArg);
    }
    let indexKey = fragment.getAttribute(`${Env.prefix}each-index`);
    if (indexKey) {
      indexKey = String(indexKey);
    }
    if (!Array.isArray(data)) {
      Log.error('[Haori]', 'Invalid each attribute:', data);
      return;
    }
    let firstAfter: ElementFragment | null = null;
    fragment.getChildren().forEach(child => {
      if (child instanceof ElementFragment) {
        if (child.hasAttribute(`${Env.prefix}each-after`)) {
          if (firstAfter == null) {
            firstAfter = child;
          }
          return;
        }
        if (child.hasAttribute(`${Env.prefix}each-before`)) {
          return;
        }
        // TODO 比較処理を実装して、同じデータがある場合は再利用する
        child.remove();
      }
    });
    (data as Record<string, unknown>[]).forEach((item, index) => {
      template.forEach(child => {
        const newChild = child.clone();
        const arg = fragment.getAttribute(`${Env.prefix}each-arg`);
        let data;
        if (indexKey) {
          item[indexKey as string] = index;
        }
        if (arg === null) {
          data = item;
        } else {
          data = newChild.getBindingData() || {};
          data[String(arg)] = item;
        }
        if (keyArg) {
          const key = data[keyArg as string];
          let listKey: string;
          if (key === null || key === undefined) {
            listKey = crypto.randomUUID();
          } else if (typeof key == 'object') {
            listKey = JSON.stringify(key);
          } else {
            listKey = String(data[keyArg as string]);
          }
          newChild.setListKey(listKey);
          newChild.setAttribute(`${Env.prefix}row`, listKey);
        }
        newChild.setBindingData(data);
        newChild.setAttribute(`${Env.prefix}bind`, JSON.stringify(data));
        fragment.insertBefore(newChild, firstAfter);
        Common.evaluateAll(newChild);
      });
    });
  }
}
