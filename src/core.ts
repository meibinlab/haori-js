/**
 * @fileoverview Core機能
 *
 * Fragmentの管理、属性変化の監視、条件分岐・繰り返し処理など、
 * アプリケーションの中心的な機能を提供します。
 */
import Env from './env';
import {Form} from './form';
import Fragment, {ElementFragment, TextFragment} from './fragment';
import Log from './log';

/**
 * アプリケーションの中心的な制御を行うクラスです。
 * Fragment の初期化、属性変化の処理、条件分岐・繰り返し処理を管理します。
 */
export default class Core {
  /** 優先処理する属性のサフィックス（処理順序で定義） */
  private static readonly PRIORITY_ATTRIBUTE_SUFFIXES = ['bind', 'if', 'each'];

  /**
   * 指定された要素と、その子要素をスキャンし、Fragmentを生成します。
   *
   * @param element スキャン対象の要素
   */
  public static scan(element: HTMLElement): void {
    const fragment = Fragment.get(element);
    if (!fragment) {
      return;
    }
    const processedAttributes = new Set<string>();
    for (const suffix of Core.PRIORITY_ATTRIBUTE_SUFFIXES) {
      // 優先属性の処理
      const name = Env.prefix + suffix;
      if (fragment.hasAttribute(name)) {
        Core.setAttribute(
          fragment.getTarget(),
          name,
          fragment.getRawAttribute(name),
        );
        processedAttributes.add(name);
      }
    }
    for (const name of fragment.getAttributeNames()) {
      if (processedAttributes.has(name)) {
        // すでに処理済みの属性はスキップ
        continue;
      }
      const value = fragment.getRawAttribute(name);
      if (value !== null) {
        Core.setAttribute(fragment.getTarget(), name, value);
      }
    }
    fragment.getChildren().forEach(child => {
      if (child instanceof ElementFragment) {
        Core.scan(child.getTarget());
      } else if (child instanceof TextFragment) {
        Core.evaluateText(child);
      }
    });
  }

  /**
   * エレメントに属性を設定します。
   * 属性固有の処理も行います。
   *
   * @param element エレメント
   * @param name 属性名
   * @param value 属性値
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static setAttribute(
    element: HTMLElement,
    name: string,
    value: string | null,
  ): Promise<void> {
    const fragment = Fragment.get(element);
    switch (name) {
      case `${Env.prefix}bind`: {
        if (value === null) {
          fragment.clearBindingDataCache();
        } else {
          fragment.setBindingData(Core.parseDataBind(value));
        }
        Core.evaluateAll(fragment);
        break;
      }
      case `${Env.prefix}if`:
        Core.evaluateIf(fragment);
        break;
      case `${Env.prefix}each`:
        Core.evaluateEach(fragment);
        break;
    }
    if (value === null) {
      return fragment.removeAttribute(name);
    } else {
      return fragment.setAttribute(name, value);
    }
  }

  /**
   * エレメントに属性を設定し、評価を行います。
   *
   * @param element エレメント
   * @param name 属性名
   * @param value 属性値
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static setBindingData(
    element: HTMLElement,
    data: Record<string, unknown>,
  ): Promise<void> {
    const fragment = Fragment.get(element);
    fragment.setBindingData(data);
    const promises: Promise<void>[] = [];
    promises.push(
      fragment.setAttribute(`${Env.prefix}bind`, JSON.stringify(data)),
    );
    promises.push(Core.evaluateAll(fragment));
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * data-bind 属性の値をパースします。
   *
   * @param data data-bind 属性の値
   * @returns パースされたデータオブジェクト
   */
  public static parseDataBind(data: string): Record<string, unknown> {
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

  /**
   * ノードを親要素に追加し評価を行います。
   *
   * @param parentElement 親エレメント
   * @param node 追加するノード
   */
  public static addNode(parentElement: HTMLElement, node: Node) {
    const parent = Fragment.get(parentElement);
    const next = Fragment.get(node.nextSibling);
    const fragment = Fragment.get(node);
    if (fragment) {
      parent.insertBefore(fragment, next);
      if (fragment instanceof ElementFragment) {
        Core.evaluateAll(fragment);
      } else if (fragment instanceof TextFragment) {
        Core.evaluateText(fragment);
      }
    }
  }

  /**
   * ノードを親要素から削除します。
   *
   * @param node 削除するノード
   */
  public static removeNode(node: Node) {
    const fragment = Fragment.get(node);
    if (fragment) {
      fragment.remove();
    }
  }

  /**
   * ノードのテキストを変更します。
   *
   * @param node 変更するノード
   * @param text 新しいテキスト
   */
  public static changeText(node: Text | Comment, text: string) {
    const fragment = Fragment.get(node);
    if (fragment) {
      fragment.setContent(text);
    }
  }

  /**
   * エレメントの値を変更します。
   * フォームの双方向バインディングを考慮し、フォームのバインドデータも更新します。
   *
   * @param element 変更するエレメント
   * @param value 新しい値
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static changeValue(
    element: HTMLElement,
    value: string,
  ): Promise<void> {
    const fragment = Fragment.get(element);
    if (fragment.getValue() === value) {
      return Promise.resolve();
    }
    const promises: Promise<void>[] = [];
    promises.push(fragment.setValue(value));
    const formFragment = Core.getFormFragment(fragment);
    if (formFragment) {
      const values = Form.getValues(formFragment);
      const arg = formFragment.getAttribute(`${Env.prefix}form-arg`);
      let bindingData;
      if (arg) {
        bindingData = formFragment.getRawBindingData();
        if (!bindingData) {
          bindingData = {};
        }
        bindingData[String(arg)] = values;
      } else {
        bindingData = values;
      }
      promises.push(Core.setBindingData(formFragment.getTarget(), bindingData));
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * フォームフラグメントを取得します。
   *
   * @param fragment フラグメント
   * @returns フォームフラグメントまたはnull
   */
  private static getFormFragment(
    fragment: ElementFragment,
  ): ElementFragment | null {
    if (fragment.getTarget() instanceof HTMLFormElement) {
      return fragment;
    }
    const parent = fragment.getParent();
    if (parent) {
      return Core.getFormFragment(parent);
    }
    return null;
  }

  /**
   * フラグメントとその子要素を評価します。
   *
   * @param fragment 対象フラグメント
   * @return Promise (DOM操作が完了したときに解決される)
   */
  public static evaluateAll(fragment: ElementFragment): Promise<void> {
    const promises: Promise<void>[] = [];
    if (fragment.hasAttribute(`${Env.prefix}if`)) {
      promises.push(Core.evaluateIf(fragment));
    }
    if (fragment.hasAttribute(`${Env.prefix}each`)) {
      promises.push(Core.evaluateEach(fragment));
    }
    fragment.getChildren().forEach(child => {
      if (child instanceof ElementFragment) {
        promises.push(Core.evaluateAll(child));
      } else if (child instanceof TextFragment) {
        promises.push(Core.evaluateText(child));
      }
    });
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * テキストフラグメントを評価します。
   *
   * @param fragment 対象フラグメント
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static evaluateText(fragment: TextFragment): Promise<void> {
    return fragment.evaluate();
  }

  /**
   * if要素を評価します。
   * 値がfalse、null、undefined、NaNの場合は非表示にし、それ以外の場合は表示します。
   *
   * @param fragment 対象フラグメント
   * @return Promise (DOM操作が完了したときに解決される)
   */
  public static evaluateIf(fragment: ElementFragment): Promise<void> {
    const promises: Promise<void>[] = [];
    const condition = fragment.getAttribute(`${Env.prefix}if`);
    if (
      condition === false ||
      condition === undefined ||
      condition === null ||
      Number.isNaN(condition)
    ) {
      if (fragment.isVisible()) {
        promises.push(fragment.hide());
      }
    } else {
      if (!fragment.isVisible()) {
        promises.push(fragment.show());
        promises.push(Core.evaluateAll(fragment));
      }
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * each要素を評価します。
   * 非表示または未マウントの場合は処理をスキップします。
   *
   * @param fragment 対象フラグメント
   */
  public static evaluateEach(fragment: ElementFragment): Promise<void> {
    if (!fragment.isVisible() || !fragment.isMounted()) {
      return Promise.resolve();
    }
    let template = fragment.getTemplate();
    if (template === null) {
      // テンプレートの作成
      fragment.getChildren().forEach(child => {
        if (child instanceof ElementFragment) {
          if (
            child.hasAttribute(`${Env.prefix}each-before`) ||
            child.hasAttribute(`${Env.prefix}each-after`)
          ) {
            return;
          }
          if (template === null) {
            template = child;
            child.unmount();
          } else {
            Log.warn('[Haori]', 'Template must be a single child element.');
          }
        } else {
          Log.error(
            '[Haori]',
            'Unsupported child node type:',
            child.getTarget().nodeType,
          );
        }
      });
      fragment.setTemplate(template);
    }
    const data = fragment.getAttribute(`${Env.prefix}each`);
    if (!Array.isArray(data)) {
      Log.error('[Haori]', 'Invalid each attribute:', data);
      return Promise.reject(new Error('Invalid each attribute.'));
    }
    return this.updateDiff(fragment, data);
  }

  /**
   * 差分を更新します。
   *
   * @param parent 親フラグメント
   * @param newList 新しいリスト
   */
  private static updateDiff(
    parent: ElementFragment,
    newList: (Record<string, unknown> | string | number)[],
  ): Promise<void> {
    let indexKey = parent.getAttribute(`${Env.prefix}each-index`);
    if (indexKey) {
      indexKey = String(indexKey);
    }
    const keyArg = parent.getAttribute(`${Env.prefix}each-key`);
    const keyDataMap: Map<
      string,
      {item: (typeof newList)[0]; itemIndex: number}
    > = new Map();
    const newKeys: string[] = [];
    newList.forEach((item, itemIndex) => {
      const listKey = Core.createListKey(item, keyArg ? String(keyArg) : null);
      if (parent.getTemplate() !== null) {
        newKeys.push(listKey);
        keyDataMap.set(listKey, {item, itemIndex});
      }
    });
    const promises: Promise<void>[] = [];
    let childElements = parent
      .getChildren()
      .filter(child => child instanceof ElementFragment)
      .filter(
        child =>
          !child.hasAttribute(`${Env.prefix}each-before`) &&
          !child.hasAttribute(`${Env.prefix}each-after`),
      );
    childElements = childElements.filter(child => {
      const index = newKeys.indexOf(String(child.getListKey()));
      if (index === -1) {
        promises.push(child.remove());
        return false;
      }
      return true;
    });
    const srcKeys = childElements.map(child => child.getListKey());
    let insertIndex = parent
      .getChildren()
      .filter(child => child instanceof ElementFragment)
      .filter(child => child.hasAttribute(`${Env.prefix}each-before`)).length;
    newKeys.forEach(newKey => {
      const srcIndex = srcKeys.indexOf(newKey);
      const {item, itemIndex} = keyDataMap.get(newKey)!;
      let child;
      if (srcIndex !== -1) {
        // 既存の要素を再利用
        child = childElements[srcIndex];
      } else {
        // 新しい要素を追加
        child = parent.getTemplate()!.clone();
      }
      Core.updateRowFragment(
        child,
        item,
        indexKey as string | null,
        itemIndex,
        keyArg ? String(keyArg) : null,
        newKey,
      );
      promises.push(
        parent.insertBefore(child, parent.getChildren()[insertIndex] || null),
      );
      promises.push(Core.evaluateAll(child));
      insertIndex++;
    });
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * リスト比較用のキーを生成します。
   *
   * @param item 対象オブジェクト
   * @param keyArg リストキーに使用するプロパティ名
   * @returns リストキー
   */
  private static createListKey(
    item: Record<string, unknown> | string | number,
    keyArg: string | null,
  ): string {
    let listKey: string;
    if (typeof item === 'object' && item !== null) {
      if (keyArg) {
        const key = item[keyArg as string];
        if (key === null || key === undefined) {
          listKey = crypto.randomUUID();
        } else if (typeof key == 'object') {
          listKey = JSON.stringify(key);
        } else {
          listKey = String(key);
        }
      } else {
        listKey = crypto.randomUUID();
      }
    } else {
      listKey = String(item);
    }
    return listKey;
  }

  /**
   * 行フラグメントにデータを設定します。
   *
   * @param rowFragment 行フラグメント
   * @param data 行データ
   * @param indexKey インデックスキー
   * @param index インデックス番号
   * @param arg バインドデータパラメータ名
   * @param listKey リストキー
   */
  private static updateRowFragment(
    rowFragment: ElementFragment,
    data: Record<string, unknown> | string | number,
    indexKey: string | null,
    index: number,
    arg: string | null,
    listKey: string,
  ): void {
    let bindingData = data;
    if (typeof data === 'object' && data !== null) {
      bindingData = {...data};
      if (indexKey) {
        bindingData[indexKey] = index;
      }
      if (arg) {
        bindingData = {
          [arg]: bindingData,
        };
      }
    } else {
      if (arg) {
        bindingData = {
          [arg]: data,
        };
        if (indexKey) {
          bindingData[indexKey] = index;
        }
      } else {
        Log.error(
          '[Haori]',
          `Primitive value requires '${Env.prefix}each-arg' attribute: ${data}`,
        );
        return;
      }
    }
    rowFragment.setListKey(listKey);
    rowFragment.setAttribute(`${Env.prefix}row`, listKey);
    rowFragment.setBindingData(bindingData as Record<string, unknown>);
  }
}
