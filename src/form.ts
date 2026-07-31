/**
 * @fileoverview フォーム双方向バインディング
 *
 * フォームと入力要素の双方向バインディングを実現します。
 */

import Core from './core';
import Dev from './dev';
import Env from './env';
import Expression from './expression';
import Fragment, {ElementFragment} from './fragment';
import Haori from './haori';
import Log from './log';
import Queue from './queue';

/** `data-validity` のメッセージを省略したときの既定文言 */
const DEFAULT_VALIDITY_MESSAGE = '入力内容を確認してください';

type FormHaoriApi = Pick<typeof Haori, 'addErrorMessage' | 'clearMessages'>;

const FORM_HAORI_METHOD_NAMES = ['addErrorMessage', 'clearMessages'] as const;

/** 自動生成した DOM の `name` であることを示す内部マーカー属性名 */
const GENERATED_GROUP_NAME_MARKER = 'data-haori-group-name';

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
   * 初期 `data-bind` からの入力欄復元を適用済みのフォーム要素。
   *
   * 復元は「そのフォームを初めてスキャンしたとき」の一度だけ行います。再スキャン
   * （`data-if` の表示切替など）で繰り返すと、利用者が編集した入力欄を初期値へ
   * 巻き戻してしまうためです。
   */
  private static readonly INITIAL_RESTORED_FORMS = new WeakSet<HTMLElement>();

  /**
   * `data-form-arg` のキーを祖先から流し込んだ最後の内容（JSON 文字列）。
   *
   * 祖先のバインド更新は、当該キーの値が実際に変わったときだけ入力欄へ反映します。
   * 変わっていない更新（同じ祖先の別キーの更新など）でも反映すると、利用者が
   * 確定した編集を同じ値で上書きし直して巻き戻してしまうためです。
   */
  private static readonly LAST_ANCESTOR_ARG_VALUES = new WeakMap<
    HTMLElement,
    string
  >();

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
   * 入力エレメントから収集する値を解決します。
   *
   * `input[type=file]` は選択されたファイルを File オブジェクトとして返します
   * （内部値は `C:\fakepath\...` の擬似パス文字列にしかならず送信に使えないため、
   * DOM の `files` から直接取得する）。`multiple` 指定時は File の配列、単一選択時は
   * File または未選択を表す null を返します。それ以外の要素は内部値を返します。
   *
   * @param fragment 対象のElementFragment
   * @returns 収集する値
   */
  private static resolveCollectedValue(fragment: ElementFragment): unknown {
    const element = fragment.getTarget();
    if (Form.isFileInput(fragment)) {
      const input = element as HTMLInputElement;
      const files = input.files ? Array.from(input.files) : [];
      if (input.multiple) {
        return files;
      }
      return files.length > 0 ? files[0] : null;
    }
    // boolean チェックボックスは DOM の checked を真として収集する。内部値は
    // バインドからの書き戻しで先に更新され DOM 反映が Queue 待ちになるなど、
    // DOM と食い違う瞬間があり、そこで収集すると「画面はチェック済みなのに
    // 送信値は false」という見た目と送信値の不一致になる。グループ扱いの
    // チェックボックス・ラジオ（isGroupedCheckable）が DOM を真としているのと
    // 扱いを揃え、チェック状態は常に画面の見たままを送るようにする。
    if (Form.isBooleanCheckbox(fragment)) {
      const input = element as HTMLInputElement;
      // value="false" は「チェック時に false」を表す反転指定。
      return input.value === 'false' ? !input.checked : input.checked;
    }
    return fragment.getValue();
  }

  /**
   * boolean 値として扱うチェックボックスかどうかを判定します。
   *
   * `value="true"` は「チェック時に `true`」、`value="false"` は「チェック時に
   * `false`」を表す単一の真偽値入力で、同名グループとしては扱いません。
   *
   * @param fragment 対象フラグメント
   * @returns boolean チェックボックスの場合 true
   */
  private static isBooleanCheckbox(fragment: ElementFragment): boolean {
    const element = fragment.getTarget();
    return (
      element instanceof HTMLInputElement &&
      element.type === 'checkbox' &&
      (element.value === 'true' || element.value === 'false')
    );
  }

  /** ラジオグループのスコープへ割り当てた識別番号 */
  private static readonly GROUP_SCOPE_IDS = new WeakMap<
    ElementFragment,
    number
  >();

  /** ラジオグループのスコープ識別番号の連番 */
  private static groupScopeSequence = 0;

  /**
   * 入力要素の収集キーを解決します。
   *
   * `data-form-name` があればそれを収集キーとし、無ければ `name` 属性を使います。
   * ラジオボタンのように DOM の `name` がグループ化の意味を持つ場合に、収集キーと
   * DOM の `name` を分けるために使います。
   *
   * @param fragment 対象フラグメント
   * @returns 収集キー。どちらも無い場合は null
   */
  public static resolveFieldName(fragment: ElementFragment): unknown {
    const declared = fragment.getAttribute(`${Env.prefix}form-name`);
    if (declared) {
      return declared;
    }
    return fragment.getAttribute('name');
  }

  /**
   * `data-form-name` の初期化を行います。
   *
   * 収集キーが空になる指定を開発モードで警告し、ラジオボタンにはグループ用の
   * DOM `name` を生成します。
   *
   * HTML のラジオグループは「同じフォームオーナー内の同名要素」で構成されるため、
   * `data-form-list` の行内で同じ `name` を使うと行をまたいで排他になり、1 行しか
   * 選択を保持できません。収集キーを `data-form-name` で宣言した場合は、DOM の
   * `name` を行ごとにユニークな値へ生成してグループを行単位に分けます。
   *
   * 作者が `name` を書いている場合は尊重して生成しません（行をまたぐグループを
   * 意図している場合があるため）。自動生成した `name` は内部マーカーで区別し、
   * 行の複製で引き継がれたものは作り直します。
   *
   * 処理が不要な場合は Promise を返しません。要素初期化の共通経路から呼ばれるため、
   * 対象外の要素で Promise を挟むと初期化の非同期段数が全要素で増えてしまいます。
   *
   * @param fragment 対象フラグメント
   * @returns 属性設定の Promise。処理が不要な場合は undefined
   */
  public static prepareFormName(
    fragment: ElementFragment,
  ): Promise<void> | void {
    // 大半の要素はここで抜ける（属性マップの参照のみ）。
    if (!fragment.hasAttribute(`${Env.prefix}form-name`)) {
      return;
    }
    const declared = fragment.getAttribute(`${Env.prefix}form-name`);
    if (!declared) {
      // 収集キーが空になる指定は、`name` が無ければその入力が値収集から静かに
      // 外れる。テンプレート式がまだ解決していない場合もここに来るため、開発
      // モードの警告に留める。
      Log.warn(
        'Haori',
        `${Env.prefix}form-name evaluated to an empty key;` +
          ' the field falls back to the name attribute or is not collected.',
        fragment.getTarget(),
      );
      return;
    }
    const element = fragment.getTarget();
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio') {
      return;
    }
    if (
      element.hasAttribute('name') &&
      !element.hasAttribute(GENERATED_GROUP_NAME_MARKER)
    ) {
      return;
    }
    const scope = Form.resolveGroupScope(fragment);
    const generated = `${String(declared)}--haori${Form.resolveGroupScopeId(
      scope,
    )}`;
    if (element.getAttribute('name') === generated) {
      return;
    }
    return fragment
      .setAttribute(GENERATED_GROUP_NAME_MARKER, '')
      .then(() => fragment.setAttribute('name', generated));
  }

  /**
   * ラジオグループのスコープとなるフラグメントを解決します。
   *
   * `data-form-list` のコンテナ直下の要素（= 行）が祖先にあればその行を、無ければ
   * 最近傍のフォーム（`<form>` または `data-form`）をスコープとします。行の外では
   * 通常の HTML と同じくフォーム単位のグループになります。
   *
   * @param fragment 対象フラグメント
   * @returns スコープとなるフラグメント
   */
  private static resolveGroupScope(fragment: ElementFragment): ElementFragment {
    let current = fragment;
    let parent = current.getParent();
    while (parent !== null) {
      if (parent.hasAttribute(`${Env.prefix}form-list`)) {
        return current;
      }
      if (
        parent.getTarget() instanceof HTMLFormElement ||
        parent.hasAttribute(`${Env.prefix}form`)
      ) {
        return parent;
      }
      current = parent;
      parent = parent.getParent();
    }
    return current;
  }

  /**
   * ラジオグループのスコープへ識別番号を割り当てます。
   *
   * @param scope スコープとなるフラグメント
   * @returns スコープの識別番号
   */
  private static resolveGroupScopeId(scope: ElementFragment): number {
    const existing = Form.GROUP_SCOPE_IDS.get(scope);
    if (existing !== undefined) {
      return existing;
    }
    Form.groupScopeSequence += 1;
    Form.GROUP_SCOPE_IDS.set(scope, Form.groupScopeSequence);
    return Form.groupScopeSequence;
  }

  /**
   * 宣言バインドで値・状態が決まり、その評価が解決している入力かどうかを判定します。
   *
   * `data-each` の行へ値を反映するとき、この判定が真の入力は行データで上書きしま
   * せん。上書きすると、直前の再評価で入れた値を収集値（多くは空文字）で潰し、その
   * 空値が次の収集で行データへ焼き付いて以後ずっと空になります（行の中で候補から
   * 選択中の 1 件を引いて hidden へ載せる構成が該当します）。
   *
   * 評価が未解決のときは偽を返し、従来どおり行データを反映します。保存済みレコード
   * からの復元では、候補が届くまで式が解決しないため、ここで宣言バインドを権威に
   * すると復元した値を失います。
   *
   * @param fragment 対象フラグメント
   * @returns 宣言バインドで値・状態が決まり、その評価が解決している場合 true
   */
  private static hasResolvedDeclarativeState(
    fragment: ElementFragment,
  ): boolean {
    if (!Form.isDeclarativeStateBound(fragment)) {
      return false;
    }
    const element = fragment.getTarget();
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      return Form.isDeclarationResolved(fragment, 'checked');
    }
    if (Form.hasDeclarativeBinding(fragment, 'value')) {
      return Form.isDeclarationResolved(fragment, 'value');
    }
    if (element instanceof HTMLSelectElement) {
      // 選択状態を宣言している `<option>` がすべて解決していれば、選択の権威は
      // option 側にある。1 つでも未解決なら行データへ委ねる。
      for (const option of Array.from(element.options)) {
        const optionFragment = Fragment.get(option);
        if (!(optionFragment instanceof ElementFragment)) {
          continue;
        }
        if (
          Form.hasDeclarativeBinding(optionFragment, 'selected') &&
          !Form.isDeclarationResolved(optionFragment, 'selected')
        ) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * 宣言バインドの評価が解決しているかどうかを判定します。
   *
   * `data-attr-{name}` と `{name}="{{式}}"` のどちらの書き方でも、実際に評価して
   * 未解決参照が無いことを確認します。
   *
   * @param fragment 対象フラグメント
   * @param name 判定する属性名（`value` / `checked` / `selected`）
   * @returns 未解決参照が無い場合 true
   */
  private static isDeclarationResolved(
    fragment: ElementFragment,
    name: string,
  ): boolean {
    for (const attributeName of [`${Env.prefix}attr-${name}`, name]) {
      const evaluation = fragment.getAttributeEvaluation(attributeName);
      if (evaluation === null) {
        continue;
      }
      return !evaluation.hasUnresolvedReference;
    }
    return false;
  }

  /**
   * 値または状態が宣言バインドで決まる入力かどうかを判定します。
   *
   * 属性にテンプレート式を書いた場合、または対応する `data-attr-*` を持つ場合は、
   * その値・状態の権威はバインドの評価結果にあります。値収集側から空で上書きして
   * はいけません。
   *
   * 判定する属性は要素の種類で変わります。checkbox / radio の `value` は送信値で
   * あってチェック状態ではないため、`value` ではなく `checked` を見ます（`value` で
   * 判定すると、送信値をテンプレート式で決めているだけのチェックボックスが解除
   * されなくなり、前の行のチェック状態が残る）。`<select>` は自身の `value` に加えて、
   * 配下の `<option>` が `selected` を宣言している場合も対象とします。
   *
   * @param fragment 対象フラグメント
   * @returns 宣言バインドで値または状態が決まる場合 true
   */
  private static isDeclarativeStateBound(fragment: ElementFragment): boolean {
    const element = fragment.getTarget();
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      return Form.hasDeclarativeBinding(fragment, 'checked');
    }
    if (!ElementFragment.isValuePropertyTarget(element)) {
      return false;
    }
    if (Form.hasDeclarativeBinding(fragment, 'value')) {
      return true;
    }
    if (element instanceof HTMLSelectElement) {
      return Form.hasDeclarativeSelectedOption(element);
    }
    return false;
  }

  /**
   * 宣言バインドで値・状態が決まる入力について、DOM 側の値を空へ揃えます。
   *
   * `Form.reset()` から `form.reset()` の直後に呼び出します。評価結果の入れ直しは
   * 呼び出し元の再評価（`Core.evaluateAll`）が行うため、ここでは空へ揃えるだけです。
   *
   * @param fragment 対象フラグメント（配下すべてが対象）
   * @return 戻り値はありません。
   */
  private static clearDeclarativeStateFromDom(fragment: ElementFragment): void {
    if (Form.isDeclarativeStateBound(fragment)) {
      const element = fragment.getTarget();
      if (
        element instanceof HTMLInputElement &&
        (element.type === 'checkbox' || element.type === 'radio')
      ) {
        element.checked = false;
      } else if (element instanceof HTMLSelectElement) {
        // 単一選択でも「どれも選ばれていない」状態にできるため、選択を全解除する。
        Array.from(element.options).forEach(option => {
          option.selected = false;
        });
        element.selectedIndex = -1;
      } else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        element.value = '';
      }
    }
    fragment.getChildren().forEach(child => {
      if (child instanceof ElementFragment) {
        Form.clearDeclarativeStateFromDom(child);
      }
    });
  }

  /**
   * 指定した属性が宣言バインド（テンプレート式または `data-attr-*`）かどうかを
   * 判定します。
   *
   * @param fragment 対象フラグメント
   * @param name 属性名
   * @returns 宣言バインドの場合 true
   */
  private static hasDeclarativeBinding(
    fragment: ElementFragment,
    name: string,
  ): boolean {
    if (fragment.hasAttribute(`${Env.prefix}attr-${name}`)) {
      return true;
    }
    const raw = fragment.getRawAttribute(name);
    return typeof raw === 'string' && raw.includes('{{');
  }

  /**
   * `<select>` 配下の `<option>` が選択状態を宣言バインドしているかどうかを
   * 判定します。
   *
   * `name` を持つ select の選択状態を `data-attr-selected` などで宣言している場合、
   * 選択の権威は option 側の式にあります。
   *
   * @param element 対象の select エレメント
   * @returns いずれかの option が selected を宣言している場合 true
   */
  private static hasDeclarativeSelectedOption(
    element: HTMLSelectElement,
  ): boolean {
    for (const option of Array.from(element.options)) {
      const fragment = Fragment.get(option);
      if (
        fragment instanceof ElementFragment &&
        Form.hasDeclarativeBinding(fragment, 'selected')
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * `input[type=file]` かどうかを判定します。
   *
   * @param fragment 対象フラグメント
   * @returns `input[type=file]` の場合 true
   */
  private static isFileInput(fragment: ElementFragment): boolean {
    const element = fragment.getTarget();
    return element instanceof HTMLInputElement && element.type === 'file';
  }

  /**
   * 指定した基準より後にユーザーが編集した入力欄の値だけを収集します。
   *
   * 収集結果は `getValues()` と同じ入れ子構造になりますが、編集されていない
   * 入力欄のキーは含みません。`data-form-list` の行は位置がずれないよう、編集の
   * 無い行も空オブジェクトで場所を確保します。
   *
   * 飛行中の通信の応答をバインドする直前に、その通信を開始した後の編集だけを
   * 上書きし直す用途で使います。`data-poll` の応答では、利用者が要求していない
   * 自動取得なので基準に 0 を渡し、これまでの編集すべてを対象にします。
   *
   * @param fragment 対象のElementFragment
   * @param baseline ユーザー編集の通し番号の基準（これより大きいものが対象）
   * @returns 編集された入力欄だけを含む値のオブジェクト
   */
  public static getValuesEditedAfter(
    fragment: ElementFragment,
    baseline: number,
  ): Record<string, unknown> {
    return Form.getPartValues(fragment, {}, baseline);
  }

  /**
   * フォーム内の各入力エレメントから値を取得し、オブジェクトとして返します。
   * 入力エレメントのname属性、data-form-object属性、data-form-list属性に基づいて値を整理します。
   *
   * @param fragment 対象のElementFragment
   * @param values オブジェクトに追加する値のオブジェクト
   * @param minUserEditSequence 指定した場合、この通し番号より後にユーザーが編集した
   *     入力欄だけを収集する（`data-form-list` の行位置は空オブジェクトで保持する）
   * @returns values と同じオブジェクト
   */
  private static getPartValues(
    fragment: ElementFragment,
    values: Record<string, unknown>,
    minUserEditSequence: number | null = null,
  ): Record<string, unknown> {
    // data-if が false の分岐（data-if-false 属性付き）配下の入力は値収集の
    // 対象外とする。非表示分岐の要素は DOM に残るため、同名入力を出し分けると
    // フォーム直列化で値が競合する。サブツリーごとスキップして除外を保証する。
    // data-if-false は hide() が DOM へ直接付与するため、属性マップを参照する
    // fragment.hasAttribute ではなく実 DOM 属性を確認する。
    if (fragment.getTarget().hasAttribute(`${Env.prefix}if-false`)) {
      return values;
    }
    const name = Form.resolveFieldName(fragment);
    const objectName = fragment.getAttribute(`${Env.prefix}form-object`);
    const listName = fragment.getAttribute(`${Env.prefix}form-list`);
    // 入力要素に付けた `data-form-list` は「この name を配列として集める」印で、
    // キーは name が決めるため属性値は省略できる（`<input name="tags"
    // data-form-list>`）。値の有無で判定すると省略形が配列にならず、同名の入力が
    // 互いを上書きして最後の 1 件だけが残る。
    const isValueList = fragment.hasAttribute(`${Env.prefix}form-list`);
    // 編集分だけを収集する場合、基準より後に編集されていない入力欄は値を出さない
    // （キー自体を出さないことで、上書き対象から外れる）。
    const skipAsUnedited =
      minUserEditSequence !== null &&
      fragment.getUserEditSequence() <= minUserEditSequence;
    if (name) {
      if (isValueList && skipAsUnedited) {
        // 同名リストでは、収集しない要素も位置を保つため null で場所を確保する。
        // 詰めて出すと、後段の位置合わせで別の要素の値として扱われてしまう。
        if (Array.isArray(values[String(name)])) {
          (values[String(name)] as unknown[]).push(null);
        } else {
          values[String(name)] = [null];
        }
      } else if (skipAsUnedited) {
        // 収集対象外。キーを出さないことで上書き対象から外す。
      } else if (isValueList) {
        const listValue = Form.resolveCollectedValue(fragment);
        // multiple の file input は File[] を返すため、そのまま push すると
        // 二重配列になり送信できない。ファイル単位に展開して 1 次元に保つ。
        const listItems =
          Form.isFileInput(fragment) && Array.isArray(listValue)
            ? listValue
            : [listValue];
        if (Array.isArray(values[String(name)])) {
          (values[String(name)] as unknown[]).push(...listItems);
        } else {
          values[String(name)] = listItems;
        }
      } else if (Form.isGroupedCheckable(fragment)) {
        // 同名のチェックボックス・ラジオボタングループ:
        // チェック済みの値だけを集め、未チェック（null）で既存値を上書きしない。
        // チェックボックスで複数チェックされている場合は配列にする。
        //
        // 内部値（this.value）は、ラジオの排他制御で未チェックになった同名要素では
        // change が発火せず古いまま残ることがある。その古い値をチェック済みとして
        // 収集すると同一キーに複数値が集まり配列累積を起こすため、DOM の checked を
        // 真として未チェック要素は null（未選択）扱いにする。
        const element = fragment.getTarget();
        const checked =
          element instanceof HTMLInputElement ? element.checked : true;
        const value = checked ? fragment.getValue() : null;
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
        values[String(name)] = Form.resolveCollectedValue(fragment);
      }
      if (objectName) {
        Log.warn(
          'Haori',
          `Element cannot have both ${Env.prefix}form-object` +
            ' and name attributes.',
        );
      }
      for (const child of fragment.getChildElementFragments()) {
        Form.getPartValues(child, values, minUserEditSequence);
      }
    } else if (objectName) {
      const childValues: Record<string, unknown> = {};
      for (const child of fragment.getChildElementFragments()) {
        Form.getPartValues(child, childValues, minUserEditSequence);
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
      let hasCollectedRow = false;
      for (const child of fragment.getChildElementFragments()) {
        const childValues: Record<string, unknown> = {};
        Form.getPartValues(child, childValues, minUserEditSequence);
        if (Object.keys(childValues).length > 0) {
          hasCollectedRow = true;
          childList.push(childValues);
        } else if (minUserEditSequence !== null) {
          // 編集分だけの収集では、行の位置がずれないよう空の行も場所を確保する。
          childList.push({});
        }
      }
      if (minUserEditSequence === null) {
        // 行が 0 件でもキー自体は空配列として出す。キーを落とすと、サーバ側で
        // 「0 件」と「そのフィールドが未送信」を区別できず、全件削除を表現できない。
        values[String(listName)] = childList;
      } else if (hasCollectedRow) {
        values[String(listName)] = childList;
      }
    } else {
      for (const child of fragment.getChildElementFragments()) {
        Form.getPartValues(child, values, minUserEditSequence);
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
    return Form.setPartValues(form, values, force, true);
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
    return Form.setPartValues(form, values, force, false);
  }

  /**
   * `data-form-list` の 1 行分の入力欄へ、その行の値をイベントなしで反映します。
   *
   * `data-each` が新しく生成した行に対して呼び出します。フォーム全体への逆方向同期
   * （`syncValues()`）は `Core.setBindingData()` の中で `data-each` の行生成より**前**に
   * 走るため、その更新で生成された行には値が入りません。行単位でここを補います。
   *
   * @param row 行のElementFragment
   * @param values 行に設定する値のオブジェクト
   * @returns 反映完了の Promise
   */
  public static syncRowValues(
    row: ElementFragment,
    values: Record<string, unknown>,
  ): Promise<void> {
    return Form.setPartValues(row, values, false, false, true);
  }

  /**
   * バインディングデータから、入力欄へ書き戻す対象の値を切り出します。
   *
   * `data-form-arg` が指定されている場合はそのキー配下だけを対象とし、キーが
   * オブジェクトでなければ空オブジェクトを返します（フォーム外のキーを入力欄へ
   * 書き戻さないため）。指定が無ければバインディングデータ全体が対象です。
   *
   * フォーム自身が当該キーを持たない場合は、祖先の `data-bind` が所有する同名の
   * キーへフォールバックします（`resolveAncestorArgOwner()` を参照）。祖先が
   * レコードを所有し、フォームがそのキーを編集する構成を成立させるためです。
   *
   * @param form フォームのElementFragment
   * @param data 対象のバインディングデータ
   * @returns 入力欄へ書き戻す値
   */
  public static resolveSyncValues(
    form: ElementFragment,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const arg = form.getAttribute(`${Env.prefix}form-arg`);
    if (!arg) {
      return data;
    }
    const key = String(arg);
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      // フォーム自身が所有するキーは祖先をシャドーする。
      return Form.asPlainRecord(data[key]) ?? {};
    }
    return Form.resolveAncestorArgOwner(form, key)?.value ?? {};
  }

  /**
   * `data-form-arg` のキーを所有する祖先を解決します。
   *
   * 対象はフォームより外側の要素の**生バインドデータ**（`data-bind` で宣言・更新
   * された値）だけです。`data-derive` の派生データと `data-each` の行データは対象外
   * とします。どちらも描画のたびに作り直される仮想スコープで、行単位の書き戻しは
   * `data-form-list` が担うため、ここで扱うと反映が行生成と競合します。
   *
   * 最も近い所有者だけを見ます。その値がオブジェクトでない場合、または所有者が
   * `data-each` の行である場合は、より外側は探しません（近い方が権威という
   * シャドーの規則に従うため）。
   *
   * @param form フォームのElementFragment
   * @param key `data-form-arg` で指定されたキー名
   * @returns 所有する祖先フラグメントとその値。見つからない場合は null
   */
  public static resolveAncestorArgOwner(
    form: ElementFragment,
    key: string,
  ): {owner: ElementFragment; value: Record<string, unknown>} | null {
    let cursor = form.getParent();
    while (cursor) {
      const raw = cursor.getRawBindingData();
      if (raw && Object.prototype.hasOwnProperty.call(raw, key)) {
        if (cursor.getListKey() !== null) {
          // `data-each` の行データは対象外。
          return null;
        }
        const value = Form.asPlainRecord(raw[key]);
        return value ? {owner: cursor, value} : null;
      }
      cursor = cursor.getParent();
    }
    return null;
  }

  /**
   * 条件式（`data-validity` / `data-{event}-if`）の評価スコープを作ります。
   *
   * バインディングデータ（継承込み）を土台に、フォーム内で**宣言されている**収集
   * キーを収集値で置き換えます。クリック時点で最新なのは収集値だけです（属性の
   * 再描画は `requestAnimationFrame`、バインドデータへのコミットは非同期）。
   * 収集値に無いキーは未定義にします。土台の値を残すと、`data-if` で非表示に
   * なった入力欄の古い値で条件が誤判定されます。
   *
   * @param fragment 条件を宣言した要素のフラグメント
   * @param sourceOverride 収集値の取得元（`data-{event}-form` の指定など）。
   *     省略時は `data-form-list` の行、またはフォームコンテナから解決する
   * @returns 条件式の評価スコープ
   */
  public static buildConditionScope(
    fragment: ElementFragment,
    sourceOverride: ElementFragment | null = null,
  ): Record<string, unknown> {
    const scope: Record<string, unknown> = {...fragment.getBindingData()};
    const valueSource = sourceOverride
      ? {
        source: sourceOverride,
        argKey: Form.resolveFormArgKey(sourceOverride),
      }
      : Form.resolveConditionValueSource(fragment);
    if (!valueSource) {
      // 収集値の取得元が無い（フォーム外の手続き）。バインドデータだけで評価する。
      return scope;
    }
    const collected = Form.getValues(valueSource.source);
    const keys = Form.collectDeclaredFieldKeys(valueSource.source);
    if (valueSource.argKey === null) {
      for (const key of keys) {
        scope[key] = collected[key];
      }
      return scope;
    }
    // `data-form-arg` / `data-each-arg` 指定時は、そのキー配下が入力欄と対応する
    // （双方向コミットの書き込み先と揃える）。
    const scoped: Record<string, unknown> = {
      ...(Form.asPlainRecord(scope[valueSource.argKey]) ?? {}),
    };
    for (const key of keys) {
      scoped[key] = collected[key];
    }
    scope[valueSource.argKey] = scoped;
    return scope;
  }

  /**
   * 条件式で使う収集値の取得元を解決します。
   *
   * `data-form-list` の行の中では、その行の収集値が要素データに対応します。それ以外
   * はフォームコンテナ（`<form>` または `data-form`）を使います。`data-form-list` を
   * 伴わない `data-each` の行では入力欄と要素データが対応しないため、行を取得元には
   * しません（フォームコンテナへ遡ります）。
   *
   * @param fragment 条件を宣言した要素のフラグメント
   * @returns 取得元とキー名。取得元が無い場合は null
   */
  private static resolveConditionValueSource(
    fragment: ElementFragment,
  ): {source: ElementFragment; argKey: string | null} | null {
    let cursor: ElementFragment | null = fragment;
    while (cursor) {
      const parent: ElementFragment | null = cursor.getParent();
      if (
        parent &&
        parent.hasAttribute(`${Env.prefix}each`) &&
        parent.hasAttribute(`${Env.prefix}form-list`)
      ) {
        const arg = parent.getRawAttribute(`${Env.prefix}each-arg`);
        return {
          source: cursor,
          argKey: typeof arg === 'string' && arg !== '' ? arg : null,
        };
      }
      cursor = parent;
    }
    const form = Form.getFormFragment(fragment);
    return form ? {source: form, argKey: Form.resolveFormArgKey(form)} : null;
  }

  /**
   * フォームコンテナの `data-form-arg` のキー名を返します。
   *
   * @param form フォームコンテナのフラグメント
   * @returns キー名。指定が無い場合は null
   */
  private static resolveFormArgKey(form: ElementFragment): string | null {
    const arg = form.getAttribute(`${Env.prefix}form-arg`);
    return arg ? String(arg) : null;
  }

  /**
   * 収集対象として**宣言されている**最上位のキー名を列挙します。
   *
   * `data-if` が偽の分岐配下も対象にします。値収集（`getValues()`）はそれらを除外
   * するため、宣言だけを見て「そのキーは収集値が権威」と判断できるようにするため
   * です。`data-form-object` / `data-form-list` に囲まれている場合はその名前だけを
   * 加えます（キー全体が収集値で置き換わります）。
   *
   * 走査は実 DOM に対して行います。`data-if` が偽の分岐はフラグメントの子を保持
   * しないことがあり、フラグメントだけを辿ると隠れた欄の宣言を取りこぼします。
   *
   * @param root 走査の起点フラグメント
   * @returns 宣言されている最上位のキー名
   */
  public static collectDeclaredFieldKeys(root: ElementFragment): Set<string> {
    const keys = new Set<string>();
    const rootElement = root.getTarget();
    const rootName = Form.resolveFieldName(root);
    if (rootName) {
      keys.add(String(rootName));
    }
    const objectAttribute = `${Env.prefix}form-object`;
    const listAttribute = `${Env.prefix}form-list`;
    // 収集対象になり得る要素だけを見る。`[name]` だけで拾うと `<button name>` の
    // ような収集されない要素までキーとして扱い、同名のバインドキーを未定義で
    // シャドーしてしまう。
    const selector =
      'input[name],select[name],textarea[name],' +
      `[${Env.prefix}form-name],[${objectAttribute}],[${listAttribute}]`;
    rootElement.querySelectorAll(selector).forEach(element => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      // 最も外側の入れ子コンテナがあれば、そのキー全体が収集値で置き換わる。
      let outermost: HTMLElement | null = null;
      let cursor: HTMLElement | null = element;
      while (cursor && cursor !== rootElement) {
        if (
          cursor.hasAttribute(objectAttribute) ||
          cursor.hasAttribute(listAttribute)
        ) {
          outermost = cursor;
        }
        cursor = cursor.parentElement;
      }
      const owner = outermost ?? element;
      const name =
        owner.getAttribute(objectAttribute) ||
        owner.getAttribute(listAttribute) ||
        owner.getAttribute(`${Env.prefix}form-name`) ||
        owner.getAttribute('name');
      if (name) {
        keys.add(name);
      }
    });
    return keys;
  }

  /**
   * `data-validity` の条件を評価し、`setCustomValidity()` へ反映します。
   *
   * 評価は呼び出し時点で**同期**に行います。属性の再描画を待つ実装にすると、
   * 「最後の欄を直してそのまま次へを押す」操作でクリック時点の状態が古くなり、
   * ブロックの判定を誤ります。
   *
   * @param root 走査の起点フラグメント
   * @returns 戻り値はありません。
   */
  public static applyCustomValidity(root: ElementFragment): void {
    const attribute = `${Env.prefix}validity`;
    const visit = (fragment: ElementFragment): void => {
      if (fragment.hasAttribute(attribute)) {
        Form.applyOneCustomValidity(fragment, attribute);
      }
      fragment.getChildElementFragments().forEach(visit);
    };
    visit(root);
  }

  /**
   * 1 つの入力欄へ `data-validity` の評価結果を反映します。
   *
   * @param fragment 対象フラグメント
   * @param attribute 属性名
   * @returns 戻り値はありません。
   */
  private static applyOneCustomValidity(
    fragment: ElementFragment,
    attribute: string,
  ): void {
    const element = fragment.getTarget();
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLSelectElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      Log.warn(
        'Haori',
        `${attribute} は入力要素にのみ指定できます: ${element.tagName}`,
      );
      return;
    }
    const raw = fragment.getRawAttribute(attribute);
    if (typeof raw !== 'string' || raw.trim() === '') {
      element.setCustomValidity('');
      return;
    }
    const scope = Form.buildConditionScope(fragment);
    const result = Expression.evaluateDetailed(
      Form.unwrapConditionExpression(raw),
      scope,
    );
    if (result.unresolvedReference) {
      // ブロック目的の宣言なので、解決できない条件は「満たしていない」と扱う。
      Log.warn(
        'Haori',
        `${attribute} の参照が解決できないため無効として扱います: ${raw}`,
      );
      element.setCustomValidity(Form.resolveValidityMessage(fragment));
      return;
    }
    element.setCustomValidity(
      result.value ? '' : Form.resolveValidityMessage(fragment),
    );
  }

  /**
   * `data-validity-message` の文言を解決します。
   *
   * @param fragment 対象フラグメント
   * @returns 表示する文言
   */
  private static resolveValidityMessage(fragment: ElementFragment): string {
    const message = fragment.getAttribute(`${Env.prefix}validity-message`);
    if (typeof message === 'string' && message.trim() !== '') {
      return message;
    }
    return DEFAULT_VALIDITY_MESSAGE;
  }

  /**
   * 条件属性の値から式を取り出します。
   *
   * `{{式}}` の形でも、波括弧なしの式でも受け付けます。
   *
   * @param raw 属性の生値
   * @returns 式文字列
   */
  public static unwrapConditionExpression(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{{{') && trimmed.endsWith('}}}')) {
      return trimmed.slice(3, -3);
    }
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
      return trimmed.slice(2, -2);
    }
    return trimmed;
  }

  /**
   * 検証が走らない構成で `data-validity` が宣言されている場合に警告します。
   *
   * `data-validity` はネイティブ検証（`data-{event}-validate`）に相乗りするため、
   * 検証を行わない手続きでは無言で効かなくなります。開発モードでのみ知らせます。
   *
   * @param root 走査の起点フラグメント
   * @param reason 検証が行われない理由
   * @returns 戻り値はありません。
   */
  public static warnUnvalidatedCustomValidity(
    root: ElementFragment | null,
    reason: string,
  ): void {
    if (!Dev.isEnabled() || !root) {
      return;
    }
    const attribute = `${Env.prefix}validity`;
    const has =
      root.hasAttribute(attribute) ||
      root.getTarget().querySelector(`[${attribute}]`) !== null;
    if (has) {
      Log.warn(
        'Haori',
        `${attribute} は指定されていますが検証は行われません（${reason}）。` +
          `${Env.prefix}{event}-validate を指定するか、` +
          `${Env.prefix}{event}-if を使用してください。`,
      );
    }
  }

  /**
   * 配列でないプレーンなオブジェクトであれば、その値を返します。
   *
   * @param value 判定する値
   * @returns オブジェクトの場合はその値。それ以外は null
   */
  private static asPlainRecord(
    value: unknown,
  ): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  /**
   * 祖先のバインドデータ更新を、配下の `data-form-arg` フォームの入力欄へ反映します。
   *
   * 対象は「当該キーを所有するのが更新された祖先自身」であるフォームだけです。
   * 間に同名キーを持つ要素があればそちらが権威なので対象外とします。
   *
   * @param fragment 更新された祖先のフラグメント
   * @returns 反映完了の Promise
   */
  public static syncAncestorArgForms(
    fragment: ElementFragment,
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const {form, key} of Form.collectArgForms(fragment)) {
      const owner = Form.resolveAncestorArgOwner(form, key);
      if (!owner || owner.owner !== fragment) {
        continue;
      }
      promises.push(Form.pushAncestorArgValue(form, key, owner.value));
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * 指定要素の配下にある `data-form-arg` 付きフォームを列挙します。
   *
   * @param root 走査の起点フラグメント
   * @returns フォームフラグメントと `data-form-arg` のキー名の組
   */
  public static collectArgForms(
    root: ElementFragment,
  ): Array<{form: ElementFragment; key: string}> {
    const attribute = `${Env.prefix}form-arg`;
    const elements = root.getTarget().querySelectorAll(`form[${attribute}]`);
    const result: Array<{form: ElementFragment; key: string}> = [];
    elements.forEach(element => {
      const form = Fragment.get(element as HTMLElement);
      if (!(form instanceof ElementFragment)) {
        return;
      }
      const arg = form.getAttribute(attribute);
      if (!arg) {
        return;
      }
      result.push({form, key: String(arg)});
    });
    return result;
  }

  /**
   * 祖先が所有するレコードを、フォームの入力欄へ流し込みます。
   *
   * 前回流し込んだ内容と同じであれば何もしません。同じ値でも書き戻すと、利用者が
   * 確定した編集を巻き戻してしまうためです。
   *
   * フォーム自身が同名のキーを持っている場合（双方向コミットが書き込んだコピー）は
   * それを取り除きます。残したままにすると以降の祖先の更新がシャドーされ、
   * フォーム内の式が参照する値と入力欄の内容が食い違います。
   *
   * @param form フォームのElementFragment
   * @param key `data-form-arg` で指定されたキー名
   * @param value 祖先が所有する値
   * @returns 反映完了の Promise
   */
  private static pushAncestorArgValue(
    form: ElementFragment,
    key: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const element = form.getTarget();
    const signature = Form.createArgValueSignature(value);
    if (signature !== null) {
      if (Form.LAST_ANCESTOR_ARG_VALUES.get(element) === signature) {
        return Promise.resolve();
      }
      Form.LAST_ANCESTOR_ARG_VALUES.set(element, signature);
    } else {
      Form.LAST_ANCESTOR_ARG_VALUES.delete(element);
    }
    const raw = form.getRawBindingData();
    if (raw && Object.prototype.hasOwnProperty.call(raw, key)) {
      const rest = {...raw};
      delete rest[key];
      // フォーム自身のバインドデータ更新に伴う逆方向同期で入力欄へ反映される
      // （`resolveSyncValues()` が祖先へフォールバックする）。
      return Core.setBindingData(element, rest);
    }
    return Form.syncValues(form, value);
  }

  /**
   * 流し込み済み判定に使う値の署名を作ります。
   *
   * @param value 対象の値
   * @returns JSON 文字列。直列化できない場合は null（毎回反映する扱いにする）
   */
  private static createArgValueSignature(
    value: Record<string, unknown>,
  ): string | null {
    try {
      return JSON.stringify(value) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 初期 `data-bind` の値を配下の入力欄へ反映します。
   *
   * `Core.setBindingData()` 経由の逆方向同期は `data-bind` 属性を**更新した**ときに
   * だけ走るため、初期スキャンで読み込んだ `data-bind` は入力欄へ反映されません。
   * その結果、`name` に対応する値を持つ `<select>` やチェックボックスが未選択のまま
   * 残り、最初の `change` で全項目を収集した際に空値として確定して他項目の値を失う
   * 問題がありました。本メソッドは初回スキャン時に一度だけ逆方向同期を適用します。
   *
   * 対象は `<form>` 要素のうち `data-bind` を持つもの、および `data-form-arg` の
   * キーを祖先の `data-bind` が所有するものです。`data-bind` に含まれないキーの
   * 入力欄は `setPartValues()` の規則により既存値が維持されるため、HTML の `value`
   * 属性で与えた初期値は保たれます。
   *
   * @param root 走査の起点要素
   * @returns 反映完了の Promise
   */
  public static restoreInitialValues(root: HTMLElement): Promise<void> {
    const forms: HTMLFormElement[] = [];
    if (root instanceof HTMLFormElement) {
      forms.push(root);
    }
    root.querySelectorAll('form').forEach(form => {
      forms.push(form);
    });
    const promises: Promise<void>[] = [];
    for (const form of forms) {
      if (Form.INITIAL_RESTORED_FORMS.has(form)) {
        continue;
      }
      const fragment = Fragment.get(form);
      if (!(fragment instanceof ElementFragment)) {
        continue;
      }
      const data = fragment.getRawBindingData();
      const arg = fragment.getAttribute(`${Env.prefix}form-arg`);
      const key = arg ? String(arg) : null;
      // フォーム自身が当該キーを持たない場合は祖先所有のレコードを探す。
      const ancestor =
        key !== null &&
        !(data && Object.prototype.hasOwnProperty.call(data, key))
          ? Form.resolveAncestorArgOwner(fragment, key)
          : null;
      if (!data && !ancestor) {
        // data-bind も祖先所有キーも無いフォームは反映対象が無い。
        continue;
      }
      Form.INITIAL_RESTORED_FORMS.add(form);
      if (ancestor) {
        promises.push(
          Form.pushAncestorArgValue(fragment, key as string, ancestor.value),
        );
        continue;
      }
      promises.push(
        Form.syncValues(
          fragment,
          Form.resolveSyncValues(fragment, data as Record<string, unknown>),
        ),
      );
    }
    return Promise.all(promises).then(() => undefined);
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
   * @param force data-form-detach属性があるエレメントにも値を反映するかどうか
   * @param emitEvents input/change イベントを発火するかどうか
   * @param clearMissing values に無いキーの入力欄を空にするかどうか
   * @param listCursors 同名リストの出現位置。同じ `values` を共有する範囲で
   *     収集キーごとに何件目かを数え、配列の対応する要素を配るために使う
   * @returns Promise（DOMの更新が完了したら解決される）
   */
  private static setPartValues(
    fragment: ElementFragment,
    values: Record<string, unknown>,
    force: boolean = false,
    emitEvents: boolean = true,
    clearMissing: boolean = false,
    listCursors: Map<string, number> = new Map(),
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    const name = Form.resolveFieldName(fragment);
    const objectName = fragment.getAttribute(`${Env.prefix}form-object`);
    const listName = fragment.getAttribute(`${Env.prefix}form-list`);
    // 入力要素に付けた `data-form-list` は属性値を省略できる（収集側と同じ規則）。
    const isValueList = fragment.hasAttribute(`${Env.prefix}form-list`);
    const detach = fragment.getAttribute(`${Env.prefix}form-detach`);
    if (name) {
      if (!detach || force) {
        const rawValue = values[String(name)];
        // clearMissing（data-each 行への反映）では、要素データに無いキーは「空」を
        // 意味する。要素データが行全体を規定するため、キーが無いことを「維持」と
        // 解釈すると、行の途中への挿入や並べ替えで担当要素が変わったときに前の行の
        // 入力値が残ってしまう。
        //
        // ただし宣言バインド（テンプレート式・`data-attr-*`）で値や状態が決まる入力は
        // 対象外とする。行データにキーが無くても、その値・状態はバインドの評価結果が
        // 権威であり、ここで空にすると宣言した値を消してしまう（URL パラメータ由来の
        // 値を hidden へ載せる構成など）。
        //
        // 宣言バインドの評価が解決している場合は、行データにキーが「ある」場合も
        // 上書きしない。行の反映は再評価（`Core.evaluateAll`）の直後に走るため、
        // 上書きすると評価したばかりの値を収集値（多くは空文字）で潰し、その空値が
        // 次の収集で行データへ焼き付いて以後ずっと空になる（行の中で候補から選択中の
        // 1 件を引いて hidden へ載せる構成）。評価が未解決のときは従来どおり行データを
        // 反映する（保存済みレコードからの復元で、候補が届くまでの間に値を失わない）。
        const declarativeAuthority =
          clearMissing && Form.hasResolvedDeclarativeState(fragment);
        const clearAsMissing =
          clearMissing &&
          typeof rawValue === 'undefined' &&
          !Form.isDeclarativeStateBound(fragment);
        // undefined は「既存の入力値を維持する」の意味（後続の分岐を参照）。
        let value: unknown = rawValue;
        if (declarativeAuthority) {
          value = undefined;
        } else if (clearAsMissing) {
          value = null;
        }
        // input[type=file] へはブラウザの制約により任意の値を設定できない。
        // クリア（null / 空文字）のみ反映し、それ以外は静かにスキップする。
        // 双方向バインディングでファイル名が書き戻される正常系で警告が出るのを防ぐ。
        if (Form.isFileInput(fragment)) {
          if (value === null || value === '') {
            promises.push(Form.applyFragmentValue(fragment, null, emitEvents));
          }
          return Promise.all(promises).then(() => undefined);
        }
        if (
          isValueList &&
          Array.isArray(value) &&
          // チェックボックスグループと複数選択 select は配列そのものを状態として
          // 解釈する（後続の分岐）。位置で配ると選択状態を決められないため、
          // `data-form-list` を併記していても従来どおりそちらへ渡す。
          !Form.isGroupedCheckable(fragment) &&
          !Form.isMultipleSelect(fragment)
        ) {
          // 同名リストは、同じ `values` を共有する範囲での出現順に配列の要素を
          // 配る。まとめて 1 つの入力へ渡すとカンマ連結された文字列になり、同名の
          // 入力すべてに同じ連結文字列が入ってしまう。出現順は収集側の並びと同じ
          // なので、収集 → 書き戻しで値の対応が保たれる。
          const key = String(name);
          const cursor = listCursors.get(key) ?? 0;
          listCursors.set(key, cursor + 1);
          promises.push(
            Form.applyFragmentValue(
              fragment,
              value[cursor] ?? null,
              emitEvents,
            ),
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
        // values が切り替わるので出現位置も数え直す。
        const childCursors = new Map<string, number>();
        for (const child of fragment.getChildElementFragments()) {
          promises.push(
            Form.setPartValues(
              child,
              childValues as Record<string, unknown>,
              force,
              emitEvents,
              clearMissing,
              childCursors,
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
          // 行ごとに values が切り替わるので出現位置も行単位で数える。
          if (childList.length > i) {
            promises.push(
              Form.setPartValues(
                child,
                childList[i] as Record<string, unknown>,
                force,
                emitEvents,
                clearMissing,
                new Map(),
              ),
            );
          } else {
            promises.push(
              Form.setPartValues(
                child,
                {},
                force,
                emitEvents,
                clearMissing,
                new Map(),
              ),
            );
          }
        }
      }
    } else {
      for (const child of fragment.getChildElementFragments()) {
        promises.push(
          Form.setPartValues(
            child,
            values,
            force,
            emitEvents,
            clearMissing,
            listCursors,
          ),
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
    // 初期化は明示的な値の供給なので、ユーザー編集の印を解除する。解除しないと
    // 宣言バインドの再適用が抑止されたままになり、編集した欄だけが初期化されない。
    Core.clearUserEditMarks(fragment);

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
      // `form.reset()` は `value` / `checked` / `selected` 属性を既定値として復元する。
      // 宣言バインドは評価結果をこれらの属性へ書くため、そのままでは「前回の評価
      // 結果」が既定値として復元され、初期化したはずの欄に古い値が残る（続く値収集
      // と双方向コミットでバインドデータへ固定されてしまう）。宣言バインドで値・
      // 状態が決まる入力は DOM 側も空へ揃え、この後の再評価で現在の評価結果を
      // 入れ直す。
      Form.clearDeclarativeStateFromDom(fragment);
    });

    // フォーム自身のバインドデータを初期宣言（宣言が無ければ空）へ戻し、宣言キーを
    // 入力欄へ反映する。戻さないと、リセット前の双方向コミットで書き込まれた値が
    // 残り、そのキーを参照する式（`{{キー}}` や平坦キー優先のフォールバック）が
    // 直後の再評価で古い入力値を復元してしまう。
    const targetForms = Form.collectBindingTargetForms(fragment);
    for (const formFragment of targetForms) {
      const initial = Form.getInitialBindingData(formFragment);
      if (initial === null && formFragment.getRawBindingData() === null) {
        // 自身のバインドデータを持たないフォームは祖先のデータを参照している。
        // 空のデータを作ると不要なシャドーイングを増やすため何もしない。
        continue;
      }
      await Core.setBindingData(formFragment.getTarget(), initial ?? {});
    }

    // リセット後の DOM 値（HTML 属性の既定値と初期バインド値）を内部値へ再同期する。
    // 同期しないと、リセット前に変更イベントで双方向バインディングへ書き込まれた
    // 値が再評価時に復元され、画面上は既定値なのに古い値が送信される。
    Form.syncValuesFromDom(fragment);

    // 宣言バインドの評価結果を入力欄へ入れ直す。バインドデータの更新より前に行う。
    // 後にすると、宣言バインドで値が決まる入力について「収集した空の値」を
    // バインドデータへ書いてから DOM だけが評価結果へ変わるため、画面とバインド
    // データ（および `{{キー}}` の参照結果）が食い違ったまま残る。
    await Core.evaluateAll(fragment);

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
        const key = String(arg);
        // 祖先が所有するキー（初期宣言に無いキー）は、リセット後もフォーム自身に
        // コピーを作らない。祖先を権威のままにするためで、作ると以降その祖先を
        // 更新してもフォーム自身の古いコピーにシャドーされて届かなくなる。
        // 入力欄の内容はこの前段の `Core.setBindingData()` で祖先の値へ戻っている。
        const ancestorOwned =
          !Object.prototype.hasOwnProperty.call(initial ?? {}, key) &&
          Form.resolveAncestorArgOwner(formFragment, key) !== null;
        if (!ancestorOwned) {
          bindingData[key] = values;
        }
      } else {
        Object.assign(bindingData, values);
      }
      await Core.setBindingData(formFragment.getTarget(), bindingData);
    }
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
        // 描画済み入力の記録（要素データの署名）を破棄する。破棄しないと、行を
        // 削除したのに「同じ要素データで描画済み」と判定され、続く再評価が差分
        // 更新を省略して行が復元されない（選択肢を data-each で描画している
        // 入力欄が空のまま残る）。
        f.setEachInputSignature(null);
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
      const name = Form.resolveFieldName(fragment);
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
