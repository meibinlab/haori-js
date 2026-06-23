/**
 * @fileoverview フォーム双方向バインディング
 *
 * フォームと入力要素の双方向バインディングを実現します。
 */

import Core from './core';
import Env from './env';
import Fragment, {ElementFragment} from './fragment';
import Haori from './haori';
import Log from './log';
import Queue from './queue';

type FormHaoriApi = Pick<typeof Haori, 'addErrorMessage' | 'clearMessages'>;

const FORM_HAORI_METHOD_NAMES = ['addErrorMessage', 'clearMessages'] as const;

/**
 * Form から利用する Haori API を解決します。
 * window.Haori が差し替えられている場合はそちらを優先します。
 *
 * @returns Form が使用する Haori API。
 */
function resolveFormHaoriApi(): FormHaoriApi {
  const scope = globalThis as typeof globalThis & {
    window?: Window & {Haori?: unknown};
  };
  const candidate = scope.window?.Haori;
  const hasRequiredMethods = FORM_HAORI_METHOD_NAMES.every(
    methodName =>
      typeof (candidate as Record<string, unknown> | undefined)?.[
        methodName
      ] === 'function',
  );
  return hasRequiredMethods ? (candidate as FormHaoriApi) : Haori;
}

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
      } else if (Form.isGroupedCheckable(fragment)) {
        // 同名のチェックボックス・ラジオボタングループ:
        // チェック済みの値だけを集め、未チェック（null）で既存値を上書きしない。
        // チェックボックスで複数チェックされている場合は配列にする。
        const value = fragment.getValue();
        const key = String(name);
        if (value === null) {
          if (!(key in values)) {
            values[key] = null;
          }
        } else if (values[key] === null || values[key] === undefined) {
          values[key] = value;
        } else if (Array.isArray(values[key])) {
          (values[key] as unknown[]).push(value);
        } else {
          values[key] = [values[key], value];
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
    return Form.setPartValues(form, values, null, force, true);
  }

  /**
   * フォーム内にある入力エレメントに値をイベントなしで設定します。
   * フォーム bindingData からの内部同期に利用します。
   *
   * @param form フォームのElementFragment
   * @param values フォームに設定する値のオブジェクト
   * @param force data-form-detach属性があるエレメントにも値を反映するかどうか
   * @returns Promise（DOMの更新が完了したら解決される）
   */
  public static syncValues(
    form: ElementFragment,
    values: Record<string, unknown>,
    force: boolean = false,
  ): Promise<void> {
    return Form.setPartValues(form, values, null, force, false);
  }

  /**
   * 値による上書きをグループ単位で扱うべき入力要素（boolean 型でない
   * チェックボックス、またはラジオボタン）かどうかを判定します。
   *
   * @param fragment 対象フラグメント
   * @returns グループ扱いの場合 true
   */
  private static isGroupedCheckable(fragment: ElementFragment): boolean {
    const element = fragment.getTarget();
    if (!(element instanceof HTMLInputElement)) {
      return false;
    }
    if (element.type === 'radio') {
      return true;
    }
    if (element.type !== 'checkbox') {
      return false;
    }
    // value="true" / value="false" は単一の boolean チェックボックスとして扱う
    return element.value !== 'true' && element.value !== 'false';
  }

  /**
   * 複数選択の select 要素かどうかを判定します。
   *
   * @param fragment 対象フラグメント
   * @returns `<select multiple>` の場合 true
   */
  private static isMultipleSelect(fragment: ElementFragment): boolean {
    const element = fragment.getTarget();
    return element instanceof HTMLSelectElement && element.multiple;
  }

  /**
   * 単一フラグメントへ値を設定します。
   *
   * @param fragment 対象フラグメント
   * @param value 設定する値
   * @param emitEvents input/change イベントを発火するかどうか
   * @returns Promise（DOMの更新が完了したら解決される）
   */
  private static applyFragmentValue(
    fragment: ElementFragment,
    value:
      | string
      | number
      | boolean
      | null
      | Array<string | number | boolean | null>,
    emitEvents: boolean,
  ): Promise<void> {
    return emitEvents
      ? fragment.setValue(value)
      : fragment.syncBindingValue(value);
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
    emitEvents: boolean = true,
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
          promises.push(
            Form.applyFragmentValue(fragment, value[index] ?? null, emitEvents),
          );
        } else if (typeof value === 'undefined') {
          // 未指定のキーは既存の入力値を維持する。
        } else if (Array.isArray(value) && Form.isGroupedCheckable(fragment)) {
          // チェックボックスグループ: 配列に自身の値が含まれるかでチェック状態を決める
          promises.push(
            Form.applyFragmentValue(
              fragment,
              value as Array<string | number | boolean | null>,
              emitEvents,
            ),
          );
        } else if (Array.isArray(value) && Form.isMultipleSelect(fragment)) {
          // 複数選択 select: 配列をそのまま選択状態へ反映する
          promises.push(
            Form.applyFragmentValue(
              fragment,
              value as Array<string | number | boolean | null>,
              emitEvents,
            ),
          );
        } else if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null
        ) {
          promises.push(Form.applyFragmentValue(fragment, value, emitEvents));
        } else {
          promises.push(
            Form.applyFragmentValue(fragment, String(value), emitEvents),
          );
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
              emitEvents,
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
                emitEvents,
              ),
            );
          } else {
            promises.push(Form.setPartValues(child, {}, i, force, emitEvents));
          }
        }
      }
    } else {
      for (const child of fragment.getChildElementFragments()) {
        promises.push(
          Form.setPartValues(child, values, null, force, emitEvents),
        );
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
        // 配下のフォームは一時フォームでのリセット対象に含まれないため個別にリセットする
        element.querySelectorAll('form').forEach(form => form.reset());
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

    // data-bind 属性で宣言された初期バインドデータを復元し、宣言キーを入力欄へ反映する
    const targetForms = Form.collectBindingTargetForms(fragment);
    for (const formFragment of targetForms) {
      const initial = Form.getInitialBindingData(formFragment);
      if (initial) {
        await Core.setBindingData(formFragment.getTarget(), initial);
      }
    }

    // リセット後の DOM 値（HTML 属性の既定値と初期バインド値）を内部値へ再同期する。
    // 同期しないと、リセット前に変更イベントで双方向バインディングへ書き込まれた
    // 値が再評価時に復元され、画面上は既定値なのに古い値が送信される。
    Form.syncValuesFromDom(fragment);

    // 双方向バインディングのバインドデータをリセット後の値で更新する。
    // バインドデータを一度も持っていないフォームは対象外とする
    // （祖先のバインドデータを参照するフォームで不要なシャドーイングを起こさないため）。
    for (const formFragment of targetForms) {
      const initial = Form.getInitialBindingData(formFragment);
      if (formFragment.getRawBindingData() === null && initial === null) {
        continue;
      }
      const values = Form.getValues(formFragment);
      const arg = formFragment.getAttribute(`${Env.prefix}form-arg`);
      // 初期 data-bind 宣言を土台にリセット後のフォーム値を重ねる。
      // change 時の Core.changeValue はフォーム値のみで置き換える（初期宣言の
      // 非フォームキーは破棄する）が、リセットは「初期状態への復元」が目的のため
      // 意図的に初期宣言キーを保持したうえでフォーム値を上書きする。
      const bindingData = {...(initial || {})};
      if (arg) {
        bindingData[String(arg)] = values;
      } else {
        Object.assign(bindingData, values);
      }
      await Core.setBindingData(formFragment.getTarget(), bindingData);
    }

    // 再評価
    await Core.evaluateAll(fragment);
  }

  /**
   * data-bind 属性で宣言された初期バインドデータを取得します。
   *
   * @param formFragment 対象のフォームフラグメント
   * @returns 初期バインドデータ。宣言がない場合は null。
   */
  private static getInitialBindingData(
    formFragment: ElementFragment,
  ): Record<string, unknown> | null {
    const raw = formFragment.getInitialBindAttribute();
    return raw === null ? null : Core.parseDataBind(raw);
  }

  /**
   * フラグメント配下の入力要素について、内部値を現在の DOM 値と再同期します。
   *
   * @param fragment 対象フラグメント
   */
  private static syncValuesFromDom(fragment: ElementFragment): void {
    const element = fragment.getTarget();
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      fragment.syncValue();
    }
    for (const child of fragment.getChildElementFragments()) {
      Form.syncValuesFromDom(child);
    }
  }

  /**
   * リセット後にバインドデータを更新すべきフォームフラグメントを収集します。
   * 対象がフォームの場合はそのフォーム、コンテナの場合は配下のすべての
   * フォームを対象とします。祖先フォームは対象外とします（行リセット等の
   * 部分リセットでフォーム全体のバインドデータを書き換えないため）。
   *
   * @param fragment 対象フラグメント
   * @returns フォームフラグメントのリスト
   */
  private static collectBindingTargetForms(
    fragment: ElementFragment,
  ): ElementFragment[] {
    const element = fragment.getTarget();
    const forms: HTMLFormElement[] = [];
    if (element instanceof HTMLFormElement) {
      forms.push(element);
    } else {
      forms.push(...Array.from(element.querySelectorAll('form')));
    }
    const fragments: ElementFragment[] = [];
    for (const form of forms) {
      const formFragment = Fragment.get(form);
      if (formFragment instanceof ElementFragment) {
        fragments.push(formFragment);
      }
    }
    return fragments;
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
    return resolveFormHaoriApi().clearMessages(
      fragment.getTarget(),
    ) as Promise<void>;
  }

  /**
   * キーに一致するフラグメントにエラーメッセージを追加します。
   * キーに一致するフラグメントが見つからない場合は、指定されたフラグメントにメッセージを追加します。
   *
   * @param fragment 対象フラグメント
   * @param key キー（ドット区切りの文字列）
   * @param message 追加するエラーメッセージ
   * @return Promise（メッセージの追加が完了したら解決される）
   */
  public static addErrorMessage(
    fragment: ElementFragment,
    key: string,
    message: string,
  ): Promise<void> {
    return Form.addMessage(fragment, key, message, 'error');
  }

  /**
   * キーに一致するフラグメントにレベル付きメッセージを追加します。
   * キーに一致するフラグメントが見つからない場合は、指定されたフラグメントにメッセージを追加します。
   *
   * @param fragment 対象フラグメント
   * @param key キー（ドット区切りの文字列）
   * @param message 追加するメッセージ
   * @param level メッセージのレベル（省略可能）
   * @return Promise（メッセージの追加が完了したら解決される）
   */
  public static addMessage(
    fragment: ElementFragment,
    key: string,
    message: string,
    level?: 'info' | 'warning' | 'error' | 'success',
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    const activeHaori = resolveFormHaoriApi();
    const addMsgFn = (activeHaori as {addMessage?: typeof Haori.addMessage})
      .addMessage;
    const doAdd = (target: HTMLElement): Promise<void> =>
      typeof addMsgFn === 'function'
        ? (addMsgFn.call(activeHaori, target, message, level) as Promise<void>)
        : (activeHaori.addErrorMessage(target, message) as Promise<void>);

    const targetFragments = Form.findFragmentsByKey(fragment, key);
    targetFragments.forEach(targetFragment => {
      promises.push(doAdd(targetFragment.getTarget() as HTMLElement));
    });
    if (targetFragments.length === 0) {
      promises.push(doAdd(fragment.getTarget() as HTMLElement));
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
   * 対象のフラグメントがフォームコンテナであればそれを返し、
   * そうでなければ先祖要素をたどってフォームコンテナを探します。
   *
   * フォームコンテナは `<form>` 要素、または `data-form` 属性を持つ任意の要素です。
   * 後者は `<table>` 内など `<form>` を直接置けない箇所で、`<tr>` などを値収集の
   * コンテナとして扱うために使用します（`data-click-form` 等が対象を探す際に利用）。
   *
   * @param fragment 探索の起点フラグメント
   * @returns フォームコンテナのフラグメント。見つからなければ null
   */
  public static getFormFragment(
    fragment: ElementFragment,
  ): ElementFragment | null {
    const element = fragment.getTarget();
    if (
      element instanceof HTMLFormElement ||
      (element instanceof HTMLElement &&
        element.hasAttribute(`${Env.prefix}form`))
    ) {
      return fragment;
    }
    const parent = fragment.getParent();
    if (parent) {
      return this.getFormFragment(parent);
    }
    return null;
  }
}
