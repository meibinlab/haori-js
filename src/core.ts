/**
 * @fileoverview Core機能
 *
 * Fragmentの管理、属性変化の監視、条件分岐・繰り返し処理など、
 * アプリケーションの中心的な機能を提供します。
 */
import Env from './env';
import Form from './form';
import Fragment, {ElementFragment, TextFragment} from './fragment';
import Log from './log';
import Procedure from './procedure';
import Url from './url';
import {Import} from './import';
import Queue from './queue';
import HaoriEvent from './event';

/**
 * アプリケーションの中心的な制御を行うクラスです。
 * Fragment の初期化、属性変化の処理、条件分岐・繰り返し処理を管理します。
 */
export default class Core {
  /** 属性エイリアスのサフィックス */
  private static readonly ATTRIBUTE_ALIAS_SUFFIX = 'attr-';

  /** 優先処理する属性のサフィックス（処理順序で定義） */
  private static readonly PRIORITY_ATTRIBUTE_SUFFIXES = ['bind', 'if', 'each'];

  /** 遅延処理する属性のサフィックス */
  private static readonly DEFERRED_ATTRIBUTE_SUFFIXES = ['fetch', 'url-param'];

  /** evaluateAll で再評価対象から除外する特殊属性のサフィックス */
  private static readonly EVALUATE_ALL_EXCLUDED_ATTRIBUTE_SUFFIXES = [
    'bind',
    'if',
    'each',
    'fetch',
    'import',
    'url-param',
  ];

  /** 属性内プレースホルダ検出用の正規表現 */
  private static readonly ATTRIBUTE_PLACEHOLDER_REGEX =
    /\{\{\{[\s\S]+?\}\}\}|\{\{[\s\S]+?\}\}/;

  /**
   * 遅延属性かどうか（完全名で判定）を判定します。
   *
   * @param name 属性名
   * @returns 遅延属性かどうか
   */
  private static isDeferredAttributeName(name: string): boolean {
    return Core.DEFERRED_ATTRIBUTE_SUFFIXES.some(
      suffix => name === `${Env.prefix}${suffix}`,
    );
  }

  /**
   * evaluateAll で再評価対象から除外する特殊属性かどうかを判定します。
   *
   * @param name 属性名
   * @returns 除外対象かどうか
   */
  private static isEvaluateAllExcludedAttributeName(name: string): boolean {
    return Core.EVALUATE_ALL_EXCLUDED_ATTRIBUTE_SUFFIXES.some(
      suffix => name === `${Env.prefix}${suffix}`,
    );
  }

  /**
   * evaluateAll で通常属性を再評価すべきかを判定します。
   *
   * @param name 属性名
   * @param value 属性の生値
   * @returns 再評価する場合は true
   */
  private static shouldReevaluateAttribute(
    name: string,
    value: string | null,
  ): boolean {
    return (
      value !== null &&
      !Core.isEvaluateAllExcludedAttributeName(name) &&
      Core.ATTRIBUTE_PLACEHOLDER_REGEX.test(value)
    );
  }

  /**
   * data-attr-* 形式の属性名から実際に更新する属性名を取得します。
   *
   * @param name 属性名
   * @returns 実際の属性名。data-attr-* でない場合は null
   */
  private static getAliasedAttributeName(name: string): string | null {
    const aliasPrefix = `${Env.prefix}${Core.ATTRIBUTE_ALIAS_SUFFIX}`;
    if (!name.startsWith(aliasPrefix) || name.length <= aliasPrefix.length) {
      return null;
    }
    return name.slice(aliasPrefix.length);
  }

  /**
   * 実属性の変更が data-attr-* の内部反映かどうかを判定します。
   *
   * @param element 対象要素
   * @param name 変更された属性名
   * @returns data-attr-* の内部反映なら true
   */
  public static isAliasedAttributeReflection(
    element: HTMLElement,
    name: string,
  ): boolean {
    const fragment = Fragment.get(element);
    if (!(fragment instanceof ElementFragment)) {
      return false;
    }
    return fragment.hasAttribute(
      `${Env.prefix}${Core.ATTRIBUTE_ALIAS_SUFFIX}${name}`,
    );
  }

  /**
   * プレースホルダを含む通常属性を再評価します。
   * 内部状態の更新は同期的に行い、DOM 反映は fragment 側の非同期更新に委ねます。
   *
   * @param fragment 対象フラグメント
   * @returns 再評価完了の Promise
   */
  private static reevaluateInterpolatedAttributes(
    fragment: ElementFragment,
  ): Promise<void> {
    let chain = Promise.resolve();
    for (const name of fragment.getAttributeNames()) {
      const rawValue = fragment.getRawAttribute(name);
      if (!Core.shouldReevaluateAttribute(name, rawValue)) {
        continue;
      }
      chain = chain.then(() =>
        Core.setAttribute(fragment.getTarget(), name, rawValue),
      );
    }
    return chain.then(() => undefined);
  }

  /**
   * 指定された要素と、その子要素をスキャンし、Fragmentを生成します。
   *
   * @param element スキャン対象の要素
   * @returns Promise (スキャンが完了したときに解決される)
   */
  public static scan(element: HTMLElement): Promise<void> {
    const fragment = Fragment.get(element);
    if (!fragment) {
      return Promise.resolve();
    }
    // DOMに組み込まれている場合はmountedをtrueにする
    if (element.parentNode) {
      const parentFragment = Fragment.get(element.parentNode as HTMLElement);
      if (parentFragment?.isMounted()) {
        fragment.setMounted(true);
      } else if (document.body.contains(element)) {
        // document.bodyに含まれている場合はマウント済みとする
        fragment.setMounted(true);
      } else {
        fragment.setMounted(false);
      }
    }
    let attributeChain = Promise.resolve();
    const processedAttributes = new Set<string>();
    for (const suffix of Core.PRIORITY_ATTRIBUTE_SUFFIXES) {
      // 優先属性の処理
      const name = Env.prefix + suffix;
      if (fragment.hasAttribute(name)) {
        attributeChain = attributeChain.then(() =>
          Core.setAttribute(
            fragment.getTarget(),
            name,
            fragment.getRawAttribute(name),
          ),
        );
        processedAttributes.add(name);
      }
    }
    for (const name of fragment.getAttributeNames()) {
      if (processedAttributes.has(name) || Core.isDeferredAttributeName(name)) {
        // すでに処理済みもしくは遅延処理の属性はスキップ
        continue;
      }
      const value = fragment.getRawAttribute(name);
      if (value !== null) {
        attributeChain = attributeChain.then(() =>
          Core.setAttribute(fragment.getTarget(), name, value),
        );
      }
    }
    for (const suffix of Core.DEFERRED_ATTRIBUTE_SUFFIXES) {
      // 遅延属性の処理
      const name = Env.prefix + suffix;
      if (fragment.hasAttribute(name)) {
        attributeChain = attributeChain.then(() =>
          Core.setAttribute(
            fragment.getTarget(),
            name,
            fragment.getRawAttribute(name),
          ),
        );
        processedAttributes.add(name);
      }
    }
    return attributeChain
      .then(() => {
        const childPromises: Promise<void>[] = [];
        fragment.getChildren().forEach(child => {
          if (child instanceof ElementFragment) {
            childPromises.push(Core.scan(child.getTarget()));
          } else if (child instanceof TextFragment) {
            childPromises.push(Core.evaluateText(child));
          }
        });
        return Promise.all(childPromises).then(() => undefined);
      })
      .then(() => undefined);
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
    const aliasedAttributeName = Core.getAliasedAttributeName(name);
    if (aliasedAttributeName !== null) {
      if (value === null) {
        return fragment.removeAliasedAttribute(name, aliasedAttributeName);
      }
      return fragment.setAliasedAttribute(name, aliasedAttributeName, value);
    }
    const promises: Promise<void>[] = [];
    switch (name) {
      case `${Env.prefix}bind`: {
        if (value === null) {
          fragment.clearBindingDataCache();
          fragment.setBindingData({});
        } else {
          fragment.setBindingData(Core.parseDataBind(value));
        }
        break;
      }
      case `${Env.prefix}if`:
        promises.push(Core.evaluateIf(fragment));
        break;
      case `${Env.prefix}each`:
        promises.push(Core.evaluateEach(fragment));
        break;
      case `${Env.prefix}fetch`:
        promises.push(
          new Procedure(fragment, null).run().then(() => undefined),
        );
        break;
      case `${Env.prefix}import`: {
        if (typeof value === 'string') {
          const target = fragment.getTarget();
          const startedAt = performance.now();
          target.setAttribute(`${Env.prefix}importing`, '');
          HaoriEvent.importStart(target, value);

          promises.push(
            Import.load(value)
              .then(html => {
                const bytes = new TextEncoder().encode(html).length;
                // DOM 更新はキュー内で実行する
                return Queue.enqueue(() => {
                  target.innerHTML = html;
                }).then(() => {
                  target.removeAttribute(`${Env.prefix}importing`);
                  HaoriEvent.importEnd(target, value, bytes, startedAt);
                  if (!document.body.hasAttribute('data-haori-ready')) {
                    // 初期化中だけ明示スキャンし、Observer 起動後の二重初期化を避ける。
                    const childPromises: Promise<void>[] = [];
                    target.childNodes.forEach(node => {
                      const child = Fragment.get(node);
                      if (child instanceof ElementFragment) {
                        childPromises.push(Core.scan(child.getTarget()));
                      } else if (child instanceof TextFragment) {
                        childPromises.push(Core.evaluateText(child));
                      }
                    });
                    return Promise.all(childPromises).then(() => undefined);
                  }
                  return undefined;
                });
              })
              .catch(error => {
                target.removeAttribute(`${Env.prefix}importing`);
                HaoriEvent.importError(target, value, error);
                Log.error('[Haori]', 'Failed to import HTML:', value, error);
              }) as unknown as Promise<void>,
          );
        }
        break;
      }
      case `${Env.prefix}url-param`: {
        const arg = fragment.getAttribute(`${Env.prefix}url-arg`);
        const params = Url.readParams();
        if (arg === null) {
          promises.push(Core.setBindingData(element, params));
        } else {
          const data = fragment.getRawBindingData() || {};
          data[String(arg)] = params;
          promises.push(Core.setBindingData(element, data));
        }
        break;
      }
    }
    if (value === null) {
      promises.push(fragment.removeAttribute(name));
    } else {
      promises.push(fragment.setAttribute(name, value));
    }
    return Promise.all(promises).then(() => undefined);
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
    const fragment = Fragment.get(element) as ElementFragment;
    const previous = fragment.getRawBindingData();
    fragment.setBindingData(data);
    let chain = fragment.setAttribute(
      `${Env.prefix}bind`,
      JSON.stringify(data),
    );
    if (element.tagName === 'FORM') {
      const arg = fragment.getAttribute(`${Env.prefix}form-arg`);
      const formValues =
        arg &&
        data[String(arg)] &&
        typeof data[String(arg)] === 'object' &&
        !Array.isArray(data[String(arg)])
          ? (data[String(arg)] as Record<string, unknown>)
          : arg
            ? {}
            : data;
      chain = chain.then(() => Form.syncValues(fragment, formValues));
    }
    chain = chain.then(() => Core.evaluateAll(fragment));

    // bindchangeイベントを発火
    HaoriEvent.bindChange(element, previous, data, 'manual');

    return chain.then(() => undefined);
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
    // skipMutationNodesが設定されている場合は処理をスキップ
    if (parent.isSkipMutationNodes()) {
      return;
    }
    const next = Fragment.get(node.nextSibling);
    const fragment = Fragment.get(node);
    if (fragment) {
      parent.insertBefore(fragment, next);
      if (fragment instanceof ElementFragment) {
        // 新規追加ノードは属性評価（bind/if/each/import など含む）のフルスキャンを行う。
        // これにより、取り込まれた断片内の data-import の入れ子や data-bind も正しく処理される。
        Core.scan(fragment.getTarget());
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
      const parent = fragment.getParent();
      // skipMutationNodesが設定されている場合は処理をスキップ
      if (parent && parent.isSkipMutationNodes()) {
        return;
      }
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
    promises.push(Core.reevaluateInterpolatedAttributes(fragment));
    if (fragment.hasAttribute(`${Env.prefix}if`)) {
      promises.push(Core.evaluateIf(fragment));
    }
    if (fragment.hasAttribute(`${Env.prefix}each`)) {
      return Promise.all(promises)
        .then(() => Core.evaluateEach(fragment))
        .then(() => {
          const childPromises: Promise<void>[] = [];
          fragment.getChildren().forEach(child => {
            if (child instanceof ElementFragment) {
              childPromises.push(Core.evaluateAll(child));
            } else if (child instanceof TextFragment) {
              childPromises.push(Core.evaluateText(child));
            }
          });
          return Promise.all(childPromises).then(() => undefined);
        });
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
      promises.push(
        fragment.hide().then(() => {
          HaoriEvent.hide(fragment.getTarget());
        }),
      );
    } else {
      const childPromises: Promise<void>[] = [];
      fragment.getChildren().forEach(child => {
        if (child instanceof ElementFragment) {
          childPromises.push(Core.evaluateAll(child));
        } else if (child instanceof TextFragment) {
          childPromises.push(Core.evaluateText(child));
        }
      });
      promises.push(
        fragment.show().then(() => {
          HaoriEvent.show(fragment.getTarget());
        }),
      );
      promises.push(Promise.all(childPromises).then(() => undefined));
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
      let found = false;
      fragment.getChildren().forEach(child => {
        if (found) {
          return;
        }
        if (child instanceof ElementFragment) {
          if (
            child.hasAttribute(`${Env.prefix}each-before`) ||
            child.hasAttribute(`${Env.prefix}each-after`)
          ) {
            return;
          }
          // 最初のElementFragmentをテンプレートとして採用
          template = child.clone();
          fragment.setTemplate(template);
          found = true;
          // 元のchildはchildrenから除外
          fragment.removeChild(child);
          // DOMからも必ず除去
          const templateTarget = child.getTarget();
          if (templateTarget.parentNode) {
            templateTarget.parentNode.removeChild(templateTarget);
          }
          child.setMounted(false);
        }
        // TextNodeやCommentNodeはテンプレートにならないので無視
      });
      const data = fragment.getAttribute(`${Env.prefix}each`);
      if (!Array.isArray(data)) {
        Log.error('[Haori]', 'Invalid each attribute:', data);
        return Promise.reject(new Error('Invalid each attribute.'));
      }
      // テンプレートのunmount完了後にupdateDiffを実行
      return this.updateDiff(fragment, data);
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
    const template = parent.getTemplate();
    if (template === null) {
      Log.error('[Haori]', 'Template is not set for each element.');
      return Promise.resolve();
    }
    let indexKey = parent.getAttribute(`${Env.prefix}each-index`);
    if (indexKey) {
      indexKey = String(indexKey);
    }
    const keyArg = parent.getAttribute(`${Env.prefix}each-key`);
    const itemArg = parent.getAttribute(`${Env.prefix}each-arg`);
    const keyDataMap: Map<
      string,
      {item: (typeof newList)[0]; itemIndex: number}
    > = new Map();
    const newKeys: string[] = [];
    newList.forEach((item, itemIndex) => {
      const listKey = Core.createListKey(
        item,
        keyArg ? String(keyArg) : null,
        itemIndex,
      );
      newKeys.push(listKey);
      keyDataMap.set(listKey, {item, itemIndex});
    });
    const removalPromises: Promise<void>[] = [];
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
        removalPromises.push(child.remove());
        return false;
      }
      return true;
    });
    const srcKeys = childElements.map(child => child.getListKey());
    const baseInsertIndex = parent
      .getChildren()
      .filter(child => child instanceof ElementFragment)
      .filter(child => child.hasAttribute(`${Env.prefix}each-before`)).length;
    let chain = Promise.resolve();
    newKeys.forEach((newKey, loopIndex) => {
      const srcIndex = srcKeys.indexOf(newKey);
      const {item, itemIndex} = keyDataMap.get(newKey)!;
      let child: ElementFragment;
      if (srcIndex !== -1) {
        // 既存の要素を再利用
        child = childElements[srcIndex];
        // 既存要素にも必ずバインドデータを再セットし、キャッシュもクリア
        chain = chain.then(() =>
          Core.updateRowFragment(
            child,
            item,
            indexKey as string | null,
            itemIndex,
            itemArg ? String(itemArg) : null,
            newKey,
          )
            .then(() => Core.evaluateAll(child))
            .then(() => Core.scheduleEvaluateAll(child)),
        );
      } else {
        // 新しい要素を追加
        child = template.clone();
        const currentInsertIndex = baseInsertIndex + loopIndex;
        chain = chain.then(() =>
          Core.updateRowFragment(
            child,
            item,
            indexKey as string | null,
            itemIndex,
            itemArg ? String(itemArg) : null,
            newKey,
          ).then(() =>
            parent
              .insertBefore(
                child,
                parent.getChildren()[currentInsertIndex] || null,
              )
              .then(() => Core.evaluateAll(child))
              .then(() => Core.scheduleEvaluateAll(child)),
          ),
        );
      }
    });
    return Promise.all(removalPromises)
      .then(() => chain)
      .then(() => {
        // eachupdateイベントを発火
        const validNewKeys = newKeys.filter(
          (key): key is string => key !== null,
        );
        const validSrcKeys = srcKeys.filter(
          (key): key is string => key !== null,
        );
        const addedKeys = validNewKeys.filter(
          key => !validSrcKeys.includes(key),
        );
        const removedKeys = validSrcKeys.filter(
          key => !validNewKeys.includes(key),
        );
        HaoriEvent.eachUpdate(
          parent.getTarget(),
          addedKeys,
          removedKeys,
          validNewKeys,
        );
        return undefined;
      });
  }

  /**
   * リスト比較用のキーを生成します。
   *
   * @param item 対象オブジェクト
   * @param keyArg リストキーに使用するプロパティ名
   * @param index 配列のインデックス
   * @returns リストキー
   */
  private static createListKey(
    item: Record<string, unknown> | string | number,
    keyArg: string | null,
    index: number,
  ): string {
    let listKey: string;
    if (typeof item === 'object' && item !== null) {
      if (keyArg) {
        const key = item[keyArg as string];
        if (key === null || key === undefined) {
          listKey = `__index_${index}`;
        } else if (typeof key == 'object') {
          listKey = JSON.stringify(key);
        } else {
          listKey = String(key);
        }
      } else {
        // data-each-key がない場合はインデックスをキーとして使用
        listKey = `__index_${index}`;
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
   * @returns 行メタデータの更新完了 Promise
   */
  private static updateRowFragment(
    rowFragment: ElementFragment,
    data: Record<string, unknown> | string | number,
    indexKey: string | null,
    index: number,
    arg: string | null,
    listKey: string,
  ): Promise<void> {
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
        return Promise.resolve();
      }
    }
    rowFragment.setListKey(listKey);
    rowFragment.setBindingData(bindingData as Record<string, unknown>);
    return rowFragment.setAttribute(`${Env.prefix}row`, listKey);
  }

  /**
   * フラグメントの再評価を次のイベントループで実行します。
   *
   * @param fragment 再評価対象のフラグメント
   */
  private static scheduleEvaluateAll(fragment: ElementFragment): void {
    setTimeout(() => {
      void Core.evaluateAll(fragment);
    }, 100);
  }
}
