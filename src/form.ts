/**
 * @fileoverview フォーム双方向バインディング
 *
 * フォームと入力要素の双方向バインディングを実現します。
 */

import Core from './core';
import Env from './env';
import {ElementFragment} from './fragment';
import Haori from './haori';
import Log from './log';
import Queue from './queue';

/**
 * Formクラスは、フォームの双方向バインディングを提供します。
 * 入力要素の値をフォームにバインドし、フォームのバインド値を入力要素に反映します。
 */
export default class Form {
  /**
   * フォーム内にある入力エレメントの値をオブジェクトとして取得します。
   * data-form-object属性があると、そのエレメント内の値はオブジェクトとして処理されます。
   * 入力エレメントにdata-form-list属性があると、そのエレメントの値はリストとして処理されます。
   * 入力エレメント以外にdata-form-list属性があると、そのエレメントの値はオブジェクトのリストとして処理されます。
   *
   * @param form フォームのElementFragment
   */
  public static getValues(form: ElementFragment): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    return Form.getPartValues(form, values);
  }

  /**
   * フォーム内の各入力エレメントから値を取得し、オブジェクトとして返します。
   * 入力エレメントのname属性、data-form-object属性、data-form-list属性に基づいて値を整理します。
   *
   * @param fragment 対象のElementFragment
   * @param values オブジェクトに追加する値のオブジェクト
   * @returns values と同じオブジェクト
   */
  private static getPartValues(
    fragment: ElementFragment,
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const name = fragment.getAttribute('name');
    const objectName = fragment.getAttribute(`${Env.prefix}form-object`);
    const listName = fragment.getAttribute(`${Env.prefix}form-list`);
    if (name) {
      if (listName) {
        if (Array.isArray(values[String(name)])) {
          (values[String(name)] as unknown[]).push(fragment.getValue());
        } else {
          values[String(name)] = [fragment.getValue()];
        }
      } else {
        values[String(name)] = fragment.getValue();
      }
      if (objectName) {
        Log.warn(
          'Haori',
          `Element cannot have both ${Env.prefix}form-object` +
            ' and name attributes.',
        );
      }
      for (const child of fragment.getChildElementFragments()) {
        Form.getPartValues(child, values);
      }
    } else if (objectName) {
      const childValues: Record<string, unknown> = {};
      for (const child of fragment.getChildElementFragments()) {
        Form.getPartValues(child, childValues);
      }
      if (Object.keys(childValues).length > 0) {
        values[String(objectName)] = childValues;
      }
      if (listName) {
        Log.warn(
          'Haori',
          `Element cannot have both ${Env.prefix}form-list` +
            ` and ${Env.prefix}form-object attributes.`,
        );
      }
    } else if (listName) {
      const childList: Record<string, unknown>[] = [];
      for (const child of fragment.getChildElementFragments()) {
        const childValues: Record<string, unknown> = {};
        Form.getPartValues(child, childValues);
        if (Object.keys(childValues).length > 0) {
          childList.push(childValues);
        }
      }
      if (childList.length > 0) {
        values[String(listName)] = childList;
      }
    } else {
      for (const child of fragment.getChildElementFragments()) {
        Form.getPartValues(child, values);
      }
    }
    return values;
  }

  /**
   * フォーム内にある入力エレメントに値を設定します。
   * フォームのdata-bind属性に値が反映されます。
   *
   * @param form フォームのElementFragment
   * @param values フォームに設定する値のオブジェクト
   * @param force data-form-detach属性があるエレメントにも値を反映するかどうか
   * @returns Promise（DOMの更新が完了したら解決される）
   */
  public static setValues(
    form: ElementFragment,
    values: Record<string, unknown>,
    force: boolean = false,
  ): Promise<void> {
    return Form.setPartValues(form, values, null, force);
  }

  /**
   * フラグメント内にある各入力エレメントに値を設定します。
   *
   * @param fragment 対象フラグメント
   * @param values フラグメントに設定する値のオブジェクト
   * @param index 配列の場合のインデックス
   * @param force data-form-detach属性があるエレメントにも値を反映するかどうか
   * @returns Promise（DOMの更新が完了したら解決される）
   */
  private static setPartValues(
    fragment: ElementFragment,
    values: Record<string, unknown>,
    index: number | null = null,
    force: boolean = false,
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    const name = fragment.getAttribute('name');
    const objectName = fragment.getAttribute(`${Env.prefix}form-object`);
    const listName = fragment.getAttribute(`${Env.prefix}form-list`);
    const detach = fragment.getAttribute(`${Env.prefix}form-detach`);
    if (name) {
      if (!detach || force) {
        const value = values[String(name)];
        if (listName && Array.isArray(value) && index !== null) {
          promises.push(fragment.setValue(value[index]));
        } else if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null
        ) {
          promises.push(fragment.setValue(value));
        } else {
          promises.push(fragment.setValue(String(value)));
        }
      }
    } else if (objectName) {
      const childValues = values[String(objectName)];
      if (childValues && typeof childValues === 'object') {
        for (const child of fragment.getChildElementFragments()) {
          promises.push(
            Form.setPartValues(
              child,
              childValues as Record<string, unknown>,
              null,
              force,
            ),
          );
        }
      }
    } else if (listName) {
      const childList = values[String(listName)];
      if (Array.isArray(childList)) {
        const children = fragment.getChildElementFragments();
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (childList.length > i) {
            promises.push(
              Form.setPartValues(
                child,
                childList[i] as Record<string, unknown>,
                i,
                force,
              ),
            );
          } else {
            promises.push(Form.setPartValues(child, {}, i, force));
          }
        }
      }
    } else {
      for (const child of fragment.getChildElementFragments()) {
        promises.push(Form.setPartValues(child, values, null, force));
      }
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * 対象フラグメントとその子孫要素の値を初期化します。
   * 値の初期化とメッセージのクリアを行います。
   *
   * @param fragment 対象フラグメント
   * @returns すべての初期化処理が完了するPromise
   */
  public static async reset(fragment: ElementFragment): Promise<void> {
    // 値をクリア
    Form.clearValues(fragment);

    // メッセージをクリアし、data-eachの複製を削除
    await Promise.all([
      Form.clearMessages(fragment),
      Form.clearEachClones(fragment),
    ]);

    // フォーム要素をリセット
    await Queue.enqueue(() => {
      const element = fragment.getTarget();
      if (element instanceof HTMLFormElement) {
        element.reset();
      } else {
        const parent = element.parentElement;
        if (parent) {
          const next = element.nextElementSibling;
          const form = document.createElement('form');
          form.appendChild(element);
          form.reset();
          parent.insertBefore(element, next);
        }
      }
    });

    // 再評価
    await Core.evaluateAll(fragment);
  }

  /**
   * data-each によって生成された複製（テンプレート以外）を削除します。
   * 既存のテンプレートは保持し、その後の再評価で必要に応じて再生成されます。
   * 対象エレメント自体がdata-eachを持つ場合はその子の複製を削除しますが、
   * 対象エレメント自体は削除しません。
   */
  private static clearEachClones(fragment: ElementFragment): Promise<void> {
    const tasks: Promise<void>[] = [];

    const removeClones = (f: ElementFragment) => {
      if (f.hasAttribute(`${Env.prefix}each`)) {
        for (const child of f.getChildElementFragments()) {
          const isBefore = child.hasAttribute(`${Env.prefix}each-before`);
          const isAfter = child.hasAttribute(`${Env.prefix}each-after`);
          if (!isBefore && !isAfter) {
            tasks.push(child.remove());
          }
        }
      }
    };

    const processChildren = (f: ElementFragment) => {
      removeClones(f);
      for (const child of f.getChildElementFragments()) {
        processChildren(child);
      }
    };

    // 対象フラグメント自体のクローンを削除し、子エレメント以下を再帰処理
    removeClones(fragment);
    for (const child of fragment.getChildElementFragments()) {
      processChildren(child);
    }

    return Promise.all(tasks).then(() => undefined);
  }

  /**
   * 再帰的に値を初期化します。
   *
   * @param fragment 対象フラグメント
   */
  private static clearValues(fragment: ElementFragment): void {
    fragment.clearValue();
    for (const child of fragment.getChildElementFragments()) {
      Form.clearValues(child);
    }
  }

  /**
   * フラグメントとその子要素のメッセージをクリアします。
   *
   * @param fragment 対象フラグメント
   * @returns Promise（メッセージのクリアが完了したら解決される）
   */
  public static clearMessages(fragment: ElementFragment): Promise<void> {
    return Haori.clearMessages(fragment.getTarget()) as Promise<void>;
  }

  /**
   * キーに一致するフラグメントにエラーメッセージを追加します。
   * キーに一致するフラグメントが見つからない場合は、指定されたフラグメントにメッセージを追加します。
   *
   * @param fragment 対象フラグメント
   * @param key キー（ドット区切りの文字列）
   * @param message 追加するエラーメッセージ]
   * @return Promise（メッセージの追加が完了したら解決される）
   */
  public static addErrorMessage(
    fragment: ElementFragment,
    key: string,
    message: string,
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    const targetFragments = Form.findFragmentsByKey(fragment, key);
    targetFragments.forEach(targetFragment => {
      promises.push(Haori.addErrorMessage(targetFragment.getTarget(), message));
    });
    if (targetFragments.length === 0) {
      promises.push(Haori.addErrorMessage(fragment.getTarget(), message));
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * 指定されたキーに一致するフラグメントを検索します。
   *
   * @param fragment 対象フラグメント
   * @param key キー（ドット区切りの文字列）
   * @returns 一致するフラグメントの配列
   */
  public static findFragmentsByKey(
    fragment: ElementFragment,
    key: string,
  ): ElementFragment[] {
    return Form.findFragmentByKeyParts(fragment, key.split('.'));
  }

  /**
   * 指定されたキーに一致するフラグメントを検索します。
   * data-form-list属性で指定された場合はdata-row属性を持つ子要素の位置と添字が一致するものを対象とします。
   *
   * @param fragment 対象フラグメント
   * @param parts キーのパーツ
   * @returns 一致するフラグメントの配列
   */
  private static findFragmentByKeyParts(
    fragment: ElementFragment,
    parts: string[],
  ): ElementFragment[] {
    const results: ElementFragment[] = [];
    const key = parts[0];
    if (parts.length == 1) {
      const name = fragment.getAttribute('name');
      if (name === key) {
        results.push(fragment);
      }
    }
    if (fragment.hasAttribute(`${Env.prefix}form-object`)) {
      if (parts.length > 1) {
        const objectName = fragment.getAttribute(`${Env.prefix}form-object`);
        if (objectName === key) {
          fragment.getChildElementFragments().forEach(child => {
            results.push(...Form.findFragmentByKeyParts(child, parts.slice(1)));
          });
        }
      }
    } else if (fragment.hasAttribute(`${Env.prefix}form-list`)) {
      if (parts.length > 1) {
        const listName = fragment.getAttribute(`${Env.prefix}form-list`);
        const firstPoint = key.lastIndexOf('[');
        const lastPoint = key.lastIndexOf(']');
        if (firstPoint !== -1 && lastPoint !== -1 && firstPoint < lastPoint) {
          const rawKey = key.substring(0, firstPoint);
          if (listName === rawKey) {
            const indexString = key.substring(firstPoint + 1, lastPoint);
            const index = Number(indexString);
            if (isNaN(index)) {
              Log.error('Haori', `Invalid index: ${key}`);
            } else {
              const rows = fragment
                .getChildElementFragments()
                .filter(child => child.hasAttribute(`${Env.prefix}row`));
              if (index < rows.length) {
                results.push(
                  ...Form.findFragmentByKeyParts(rows[index], parts.slice(1)),
                );
              }
            }
          }
        }
      }
    } else {
      fragment.getChildElementFragments().forEach(child => {
        results.push(...Form.findFragmentByKeyParts(child, parts));
      });
    }
    return results;
  }

  /**
   * 対象のフラグメントがフォームフラグメントであればそれを返し、
   * そうでなければ先祖要素をたどってフォームフラグメントを探します。
   *
   * @param fragment
   */
  public static getFormFragment(
    fragment: ElementFragment,
  ): ElementFragment | null {
    const element = fragment.getTarget();
    if (element instanceof HTMLFormElement) {
      return fragment;
    }
    const parent = fragment.getParent();
    if (parent) {
      return this.getFormFragment(parent);
    }
    return null;
  }
}
