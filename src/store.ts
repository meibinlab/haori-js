/**
 * @fileoverview ブラウザストレージ連携機能
 *
 * `data-store` を宣言した要素のバインドデータと、ブラウザストレージ上のレコード
 * （1 ストレージキー = 1 JSON オブジェクト）を双方向にミラーします。復元は優先属性
 * として `data-bind` の直後に処理されるため、`data-if` の条件・`data-each` の配列・
 * 入力欄の初期値として機能します（初期 `data-bind` と同じ扱い）。保存は
 * `Core.setBindingData()` の単一導線から呼ばれるため、フォームの双方向コミットと
 * フェッチ応答のバインドが同じ実装で拾われます。
 *
 * 対象は宣言した要素**自身**の生バインドデータです。フォームの双方向コミットは
 * フォーム要素自身へ書き込むため、入力状態を保存する場合は `<form>` へ宣言します。
 */

import Core from './core';
import Env from './env';
import Fragment, {ElementFragment} from './fragment';
import Log from './log';

/** ストレージ種別 */
export type StoreKind = 'session' | 'local';

/** `data-store` の宣言内容 */
interface StoreDeclaration {
  /** ストレージキー（レコードの名前） */
  key: string;

  /** ストレージ種別 */
  kind: StoreKind;

  /** 対象トップレベルキー。未指定は null（`arg` 配下の全キーが対象） */
  params: string[] | null;

  /** レコード内のネストキー。未指定は null（レコードの直下が対象） */
  arg: string | null;
}

/** ミラーの変更検出に使う署名 */
interface StoreSignature {
  /** 直近に書き出した選択内容の直列化結果 */
  json: string;

  /** 直近に書き出した選択内容のキーごとの参照（直列化を省く速い経路用） */
  refs: Map<string, unknown>;
}

/**
 * ブラウザストレージとバインドデータのミラーを管理するクラスです。
 */
export default class Store {
  /** 要素ごとの直近の書き出し内容（変更検出用） */
  private static readonly SIGNATURES = new WeakMap<
    HTMLElement,
    StoreSignature
  >();

  /**
   * 復元を実行済みの要素。
   *
   * 復元より前にミラーが走ると、`data-bind` で宣言した既定値が保存済みの値を
   * 上書きしてしまうため、復元が済むまで書き出しを行わないために使用します。
   */
  private static readonly RESTORED_ELEMENTS = new WeakSet<HTMLElement>();

  /**
   * 警告を出力済みの要素と警告種別。
   *
   * 同じ警告を繰り返さないために使いますが、種別ごとに保持します。要素単位で
   * 1 回に絞ると、別の原因（種別の誤りとキー未指定など）の警告が隠れるためです。
   */
  private static readonly WARNED_ELEMENTS = new WeakMap<
    HTMLElement,
    Set<string>
  >();

  /** 利用不可を警告済みのストレージ種別 */
  private static readonly WARNED_KINDS = new Set<StoreKind>();

  /**
   * ストレージ種別に対応する `Storage` を解決します。
   *
   * プライベートブラウジングや設定でストレージが無効な環境では参照時に例外に
   * なるため、取得を try で囲み、失敗時は種別ごとに一度だけ警告して `null` を
   * 返します（画面は壊さず、保存・復元だけを行いません）。
   *
   * @param kind ストレージ種別
   * @returns 利用可能な `Storage`。利用できない場合は null
   */
  private static resolveStorage(kind: StoreKind): Storage | null {
    try {
      const storage =
        kind === 'local' ? window.localStorage : window.sessionStorage;
      if (!storage) {
        throw new Error('storage is not available');
      }
      return storage;
    } catch (error) {
      if (!Store.WARNED_KINDS.has(kind)) {
        Store.WARNED_KINDS.add(kind);
        Log.warn(
          'Haori',
          `${kind}Storage が利用できないため ${Env.prefix}store を無効にします:`,
          error,
        );
      }
      return null;
    }
  }

  /**
   * 予約キー（エンジン管理変数）かどうかを判定します。
   *
   * `_fetch` / `_poll` などのエンジン管理変数を保存対象から常に除外します。
   *
   * @param key 判定対象のキー
   * @returns 予約キーなら true
   */
  private static isReservedKey(key: string): boolean {
    return key.startsWith('_');
  }

  /**
   * 素の JSON オブジェクト（配列でないオブジェクト）かどうかを判定します。
   *
   * @param value 判定対象の値
   * @returns 素の JSON オブジェクトなら true
   */
  private static isPlainRecord(
    value: unknown,
  ): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * 要素と警告種別ごとに一度だけ警告を出力します。
   *
   * @param element 対象要素
   * @param kind 警告種別（同じ種別の再出力を抑止するためのキー）
   * @param message 警告メッセージ
   */
  private static warnOnce(
    element: HTMLElement,
    kind: string,
    message: string,
  ): void {
    let kinds = Store.WARNED_ELEMENTS.get(element);
    if (!kinds) {
      kinds = new Set<string>();
      Store.WARNED_ELEMENTS.set(element, kinds);
    }
    if (kinds.has(kind)) {
      return;
    }
    kinds.add(kind);
    Log.warn('Haori', message);
  }

  /**
   * `data-each` の行の内側かどうかを判定します。
   *
   * 行は描画のたびに作り直される仮想スコープで、同一のストレージキーへ全行が
   * 書き込むことになるため対象外とします。行データの保存は親要素側で配列キーを
   * 指定して行います。
   *
   * @param fragment 判定対象のフラグメント
   * @returns 行の内側なら true
   */
  private static isInsideEachRow(fragment: ElementFragment): boolean {
    let cursor: ElementFragment | null = fragment;
    while (cursor) {
      if (cursor.getListKey() !== null) {
        return true;
      }
      cursor = cursor.getParent();
    }
    return false;
  }

  /**
   * 要素の `data-store` 宣言を読み取ります。
   *
   * 属性値は静的文字列として扱い、式（`{{}}`）は使用できません。対象キーの指定
   * （`data-store-params` または `data-store-arg`）は必須で、いずれも無い場合は
   * 警告して無効にします（意図しないキーの保存を防ぐため）。
   *
   * @param fragment 対象フラグメント
   * @returns 宣言内容。宣言が無い、または無効な場合は null
   */
  private static readDeclaration(
    fragment: ElementFragment,
  ): StoreDeclaration | null {
    const element = fragment.getTarget();
    const rawKey = fragment.getRawAttribute(`${Env.prefix}store`);
    if (rawKey === null) {
      return null;
    }
    const key = rawKey.trim();
    if (key === '') {
      Store.warnOnce(
        element,
        'key',
        `${Env.prefix}store にストレージキーが指定されていません。`,
      );
      return null;
    }
    if (key.includes('{{')) {
      Store.warnOnce(
        element,
        'expression',
        `${Env.prefix}store に式は使用できません（静的な文字列を指定して` +
          `ください）: ${key}`,
      );
      return null;
    }
    const rawKind = fragment.getRawAttribute(`${Env.prefix}store-type`);
    let kind: StoreKind = 'session';
    if (rawKind !== null) {
      const trimmed = rawKind.trim();
      if (trimmed === 'local' || trimmed === 'session') {
        kind = trimmed;
      } else {
        Store.warnOnce(
          element,
          'type',
          `${Env.prefix}store-type は session または local を指定して` +
            `ください（session として扱います）: ${trimmed}`,
        );
      }
    }
    const rawArg = fragment.getRawAttribute(`${Env.prefix}store-arg`);
    const arg = rawArg === null || rawArg.trim() === '' ? null : rawArg.trim();
    const rawParams = fragment.getRawAttribute(`${Env.prefix}store-params`);
    let params: string[] | null = null;
    if (rawParams !== null) {
      const names = rawParams
        .split('&')
        .map(name => name.trim())
        .filter(name => name !== '');
      const allowed = names.filter(name => !Store.isReservedKey(name));
      if (allowed.length !== names.length) {
        Store.warnOnce(
          element,
          'reserved',
          `${Env.prefix}store-params の予約キー（先頭が _ のキー）は対象外です。`,
        );
      }
      params = allowed.length > 0 ? allowed : null;
    }
    if (params === null && arg === null) {
      Store.warnOnce(
        element,
        'target',
        `${Env.prefix}store には ${Env.prefix}store-params または ` +
          `${Env.prefix}store-arg のいずれかが必要です。`,
      );
      return null;
    }
    return {key, kind, params, arg};
  }

  /**
   * ストレージからレコードを読み取ります。
   *
   * 保存済みの値が JSON として壊れている場合や素のオブジェクトでない場合は、
   * 警告して「保存済みデータが無い」ものとして扱います（別実装が同じキーを
   * 使っていた場合でも画面は壊しません）。
   *
   * @param declaration 宣言内容
   * @returns レコード。読み取れない場合は null
   */
  private static readRecord(
    declaration: StoreDeclaration,
  ): Record<string, unknown> | null {
    const storage = Store.resolveStorage(declaration.kind);
    if (!storage) {
      return null;
    }
    let text: string | null;
    try {
      text = storage.getItem(declaration.key);
    } catch (error) {
      Log.warn(
        'Haori',
        `ストレージの読み取りに失敗しました: ${declaration.key}`,
        error,
      );
      return null;
    }
    if (text === null) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      Log.warn(
        'Haori',
        `保存済みデータが JSON として解釈できません: ${declaration.key}`,
        error,
      );
      return null;
    }
    if (!Store.isPlainRecord(parsed)) {
      Log.warn(
        'Haori',
        `保存済みデータがオブジェクトではありません: ${declaration.key}`,
      );
      return null;
    }
    return parsed;
  }

  /**
   * レコードから復元対象の値を取り出します。
   *
   * @param declaration 宣言内容
   * @param record レコード
   * @returns 復元するキーと値の組
   */
  private static extractFromRecord(
    declaration: StoreDeclaration,
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    let source: Record<string, unknown> = record;
    if (declaration.arg !== null) {
      const slot = record[declaration.arg];
      if (slot === undefined) {
        return {};
      }
      if (!Store.isPlainRecord(slot)) {
        Log.warn(
          'Haori',
          `保存済みデータの ${declaration.arg} がオブジェクトではありません: ` +
            declaration.key,
        );
        return {};
      }
      source = slot;
    }
    const keys = declaration.params ?? Object.keys(source);
    const extracted: Record<string, unknown> = {};
    for (const key of keys) {
      if (Store.isReservedKey(key)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      extracted[key] = source[key];
    }
    return extracted;
  }

  /**
   * バインドデータから保存対象の値を選び出します。
   *
   * 宣言したキーが生バインドデータに**存在しない**場合は選択に含めません。
   * 呼び出し側はレコードの当該キーを変更しないため、保存済みの値が消えません
   * （未編集のフォームや、祖先所有キーのコピーが解除された直後でも壊しません）。
   *
   * @param declaration 宣言内容
   * @param data 対象の生バインドデータ
   * @returns 保存するキーと値の組
   */
  private static selectFromData(
    declaration: StoreDeclaration,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const keys = declaration.params ?? Object.keys(data);
    const selected: Record<string, unknown> = {};
    for (const key of keys) {
      if (Store.isReservedKey(key)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        continue;
      }
      const value = data[key];
      if (value === undefined) {
        continue;
      }
      selected[key] = value;
    }
    return selected;
  }

  /**
   * 選択内容を直列化します。
   *
   * @param selected 保存するキーと値の組
   * @returns 直列化結果。直列化できない場合は null
   */
  private static stringify(selected: Record<string, unknown>): string | null {
    try {
      const json = JSON.stringify(selected);
      return json ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 選択内容からキーごとの参照表を作ります。
   *
   * @param selected 保存するキーと値の組
   * @returns キーと値の参照の対応
   */
  private static createRefs(
    selected: Record<string, unknown>,
  ): Map<string, unknown> {
    const refs = new Map<string, unknown>();
    for (const [key, value] of Object.entries(selected)) {
      refs.set(key, value);
    }
    return refs;
  }

  /**
   * 直近の書き出し内容と参照が一致するかを判定します。
   *
   * バインドデータの値はキー単位で差し替えられるため、参照が一致していれば内容も
   * 同じです。直列化を省く速い経路として使います（`_poll` などの高頻度更新が
   * 毎回の直列化を招かないようにするため）。
   *
   * @param signature 直近の書き出し内容
   * @param selected 今回の選択内容
   * @returns すべてのキーの参照が一致するなら true
   */
  private static hasSameRefs(
    signature: StoreSignature,
    selected: Record<string, unknown>,
  ): boolean {
    const entries = Object.entries(selected);
    if (signature.refs.size !== entries.length) {
      return false;
    }
    for (const [key, value] of entries) {
      if (!signature.refs.has(key) || signature.refs.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * 次回の書き出し判定の基準を、指定した選択内容で更新します。
   *
   * @param element 対象要素
   * @param selected 基準にする選択内容
   */
  private static seedSignature(
    element: HTMLElement,
    selected: Record<string, unknown>,
  ): void {
    const json = Store.stringify(selected);
    if (json === null) {
      Store.SIGNATURES.delete(element);
      return;
    }
    Store.SIGNATURES.set(element, {json, refs: Store.createRefs(selected)});
  }

  /**
   * レコードへ選択内容を書き込みます。
   *
   * レコード全体を置き換えず、選択したキーだけを置換して他のキーは保持します
   * （画面ごと・要素ごとに担当キーだけを書くため）。容量超過などで書き込みに
   * 失敗した場合は警告して継続します。
   *
   * @param declaration 宣言内容
   * @param selected 保存するキーと値の組
   * @returns 書き込めたら true
   */
  private static writeRecord(
    declaration: StoreDeclaration,
    selected: Record<string, unknown>,
  ): boolean {
    const storage = Store.resolveStorage(declaration.kind);
    if (!storage) {
      return false;
    }
    const record = Store.readRecord(declaration) ?? {};
    if (declaration.arg !== null) {
      const current = record[declaration.arg];
      const slot = Store.isPlainRecord(current) ? {...current} : {};
      record[declaration.arg] = {...slot, ...selected};
    } else {
      Object.assign(record, selected);
    }
    try {
      storage.setItem(declaration.key, JSON.stringify(record));
      return true;
    } catch (error) {
      Log.warn(
        'Haori',
        `ストレージへの保存に失敗しました: ${declaration.key}`,
        error,
      );
      return false;
    }
  }

  /**
   * `data-store` の宣言に従って、保存済みの値をバインドデータへ復元します。
   *
   * 優先属性として `data-bind` の直後に呼ばれます。レコードに無いキーは
   * `data-bind` で宣言した既定値をそのまま保ちます（キー単位の差し替えで、
   * 深いマージは行いません）。
   *
   * @param fragment 対象フラグメント
   * @returns 復元完了の Promise
   */
  public static restore(fragment: ElementFragment): Promise<void> {
    const declaration = Store.readDeclaration(fragment);
    if (!declaration) {
      return Promise.resolve();
    }
    const element = fragment.getTarget();
    if (Store.isInsideEachRow(fragment)) {
      Store.warnOnce(
        element,
        'each-row',
        `${Env.prefix}each の行の内側では ${Env.prefix}store を使用できません` +
          '（行データは親要素側で配列キーを指定してください）。',
      );
      return Promise.resolve();
    }
    Store.RESTORED_ELEMENTS.add(element);
    const record = Store.readRecord(declaration);
    const restored = record ? Store.extractFromRecord(declaration, record) : {};
    const merged = {...(fragment.getRawBindingData() ?? {}), ...restored};
    // 復元直後のミラーで同じ内容を書き戻さないよう、基準を先に更新する。
    Store.seedSignature(element, Store.selectFromData(declaration, merged));
    if (Object.keys(restored).length === 0) {
      // 復元対象が無い場合はバインドデータを触らない（不要なシャドーを作らない）。
      return Promise.resolve();
    }
    // 復元は初回スキャン時のみ走る経路で、巻き戻すべきユーザー編集は存在しない。
    // 印の解除も不要なため、値の供給ではない更新として扱う。reentrant=true は、
    // 優先属性の直列処理から呼ばれるこの経路を即時実行するため（同一要素への
    // 並行更新は無く、待ち合わせを挟むと後続の属性処理と順序が入れ替わる）。
    return Core.setBindingData(element, merged, {
      reentrant: true,
      kind: 'nonSupply',
      sequence: ElementFragment.nextSequence(),
    });
  }

  /**
   * `data-store` の宣言に従って、バインドデータをレコードへ書き出します。
   *
   * `Core.setBindingData()` から**同期**で呼ばれます。`Queue`（requestAnimationFrame）
   * へ遅延させると、`data-{event}-redirect` による遷移や背面タブで次フレームが
   * 来ず、遷移直前の保存を取りこぼすためです。書き込みの間引きは「内容が変わって
   * いなければ書かない」だけで行います。
   *
   * @param fragment 対象フラグメント
   */
  public static mirror(fragment: ElementFragment): void {
    const declaration = Store.readDeclaration(fragment);
    if (!declaration) {
      return;
    }
    if (Store.isInsideEachRow(fragment)) {
      // 警告は restore() 側で一度だけ出す。
      return;
    }
    const element = fragment.getTarget();
    if (!Store.RESTORED_ELEMENTS.has(element)) {
      // 復元前の書き出しは、`data-bind` の既定値で保存済みの値を潰すため行わない。
      return;
    }
    const data = fragment.getRawBindingData();
    if (!data) {
      return;
    }
    const selected = Store.selectFromData(declaration, data);
    if (Object.keys(selected).length === 0) {
      // 宣言したキーが1つも無い場合はレコードを変更しない。
      return;
    }
    const signature = Store.SIGNATURES.get(element);
    if (signature && Store.hasSameRefs(signature, selected)) {
      return;
    }
    const json = Store.stringify(selected);
    if (json === null) {
      Log.warn(
        'Haori',
        `保存対象を直列化できないためミラーを行いません: ${declaration.key}`,
      );
      return;
    }
    if (signature && signature.json === json) {
      // 内容は同じで参照だけが変わったケース。書き込みは行わず基準を更新する。
      signature.refs = Store.createRefs(selected);
      return;
    }
    if (Store.writeRecord(declaration, selected)) {
      Store.SIGNATURES.set(element, {json, refs: Store.createRefs(selected)});
    }
  }

  /**
   * レコードを破棄します。
   *
   * 破棄後もミラーは停止しません。同じ内容をすぐ書き戻さないよう、当該レコードを
   * 宣言している要素の基準を現在値で更新し、以後は値が変わったときだけ再保存され
   * るようにします（ミラーの定義どおりの挙動）。
   *
   * @param key ストレージキー
   * @param kind ストレージ種別
   */
  public static clear(key: string, kind: StoreKind): void {
    const storage = Store.resolveStorage(kind);
    if (!storage) {
      return;
    }
    try {
      storage.removeItem(key);
    } catch (error) {
      Log.warn('Haori', `ストレージの破棄に失敗しました: ${key}`, error);
      return;
    }
    Store.reseedDeclaringElements(key, kind);
  }

  /**
   * 指定したレコードを宣言している要素の基準を、現在値で更新します。
   *
   * @param key ストレージキー
   * @param kind ストレージ種別
   */
  private static reseedDeclaringElements(key: string, kind: StoreKind): void {
    const elements = document.querySelectorAll<HTMLElement>(
      `[${Env.prefix}store]`,
    );
    elements.forEach(element => {
      if (!Store.RESTORED_ELEMENTS.has(element)) {
        // 復元前の要素には基準が無く、復元時に現在値で作られる。
        return;
      }
      const fragment = Fragment.get(element);
      if (!(fragment instanceof ElementFragment)) {
        return;
      }
      const declaration = Store.readDeclaration(fragment);
      if (!declaration) {
        return;
      }
      if (declaration.key !== key || declaration.kind !== kind) {
        return;
      }
      const data = fragment.getRawBindingData();
      Store.seedSignature(
        element,
        data ? Store.selectFromData(declaration, data) : {},
      );
    });
  }
}
