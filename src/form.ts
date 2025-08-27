/**
 * @fileoverview フォーム双方向バインディング
 *
 * フォームと入力要素の双方向バインディングを実現します。
 */

import Env from './env';
import {ElementFragment} from './fragment';
import {Haori} from './haori';
import Log from './log';
import Queue from './queue';

/**
 * Formクラスは、フォームの双方向バインディングを提供します。
 * 入力要素の値をフォームにバインドし、フォームのバインド値を入力要素に反映します。
 */
export class Form {
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
   */
  public static setValues(
    form: ElementFragment,
    values: Record<string, unknown>,
    force: boolean = false,
  ): void {
    Form.setPartValues(form, values, null, force);
  }

  /**
   * フラグメント内にある各入力エレメントに値を設定します。
   *
   * @param fragment 対象フラグメント
   * @param values フラグメントに設定する値のオブジェクト
   * @param index 配列の場合のインデックス
   * @param force data-form-detach属性があるエレメントにも値を反映するかどうか
   */
  private static setPartValues(
    fragment: ElementFragment,
    values: Record<string, unknown>,
    index: number | null = null,
    force: boolean = false,
  ): void {
    const name = fragment.getAttribute('name');
    const objectName = fragment.getAttribute(`${Env.prefix}form-object`);
    const listName = fragment.getAttribute(`${Env.prefix}form-list`);
    const detach = fragment.getAttribute(`${Env.prefix}form-detach`);
    if (name) {
      if (!detach || force) {
        const value = values[String(name)];
        if (listName && Array.isArray(value) && index !== null) {
          fragment.setValue(value[index]);
        } else if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null
        ) {
          fragment.setValue(value);
        } else {
          fragment.setValue(String(value));
        }
      }
    } else if (objectName) {
      const childValues = values[String(objectName)];
      if (childValues && typeof childValues === 'object') {
        for (const child of fragment.getChildElementFragments()) {
          Form.setPartValues(
            child,
            childValues as Record<string, unknown>,
            null,
            force,
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
            Form.setPartValues(
              child,
              childList[i] as Record<string, unknown>,
              i,
              force,
            );
          } else {
            Form.setPartValues(child, {}, i, force);
          }
        }
      }
    } else {
      for (const child of fragment.getChildElementFragments()) {
        Form.setPartValues(child, values, null, force);
      }
    }
  }

  public static reset(fragment: ElementFragment): Promise<void> {
    Form.clearValues(fragment);
    const clearMessagePromise = Form.clearMessages(fragment);
    const resetPromise = Queue.enqueue(() => {
      const element = fragment.getTarget();
      if (element instanceof HTMLFormElement) {
        element.reset();
      } else {
        const parent = element.parentElement;
        const next = element.nextElementSibling;
        const form = document.createElement('form');
        form.appendChild(element);
        form.reset();
        parent!.insertBefore(element, next);
      }
    }) as Promise<void>;
    return Promise.all([clearMessagePromise, resetPromise]).then(() => void 0);
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
   * @returns すべてのクリア処理が完了するPromise
   */
  public static clearMessages(fragment: ElementFragment): Promise<void> {
    const thisPromise = Haori.clearMessages(
      fragment.getTarget(),
    ) as Promise<void>;
    const childPromises = fragment.getChildElementFragments().map(child => {
      return Form.clearMessages(child);
    });
    return Promise.all([thisPromise, ...childPromises]).then(() => void 0);
  }

  public static addErrorMessage(key: string, message: string): void {}
}
