/**
 * @fileoverview フォームの状態が常に保つべき不変条件と、その検査。
 *
 * これまでの回帰は、ほぼすべてが同じ形をしていました ——「画面・収集値・バインド
 * データ・`data-bind` 属性のいずれかが、他とずれる」。個々の症状ごとに再現手順を
 * 転記したテストを書くと、直した経路だけが固定され、隣の経路は守られません。
 *
 * ここでは症状ではなく**不変条件**を宣言します。検査は 2 種類に分かれます。
 *
 * **不変条件はすべて仕様書（`docs/ja/specs.md`）から取っています。** 実装の挙動から
 * 導いてはいけません。現在のコードが違反する場合、条件を緩めるのではなく不具合
 * として報告します。各条件に根拠の行を添えてあります。
 *
 * 1. 内部整合（`collectFormInconsistencies()`）
 *    いつ検査しても成り立つもの。未確定の編集があっても影響を受けません。
 *
 *    - I1 属性ミラー一致: `data-bind` 属性 == in-memory のバインドデータ（全体）
 *
 *      仕様「`data-bind`」「`data-bind` は宣言と実行時データの両方を担う属性で、Haori
 *      自身も**更新のたびに**最新の in-memory 値をこの属性へミラーします」。
 *      仕様が明記した非ミラー対象だけを除きます（それ以外の除外は禁止）。
 *        - 先頭が `_` の予約キー。`_fetch` は仕様「`data-fetch-state` /
 *          `data-{event}-fetch-state`」、`_poll` は仕様「`data-poll-state`」が
 *          「内部バインディングデータにのみ設定し、`data-bind` 属性へは書き出しません」
 *          と明記しています（仕様「`data-store`」の「`_fetch` / `_poll` などの予約キーは
 *          常に対象外」はストレージのミラーの規定で、別の話です）
 *        - `data-each-visible` が公開する可視範囲の変数（仕様「`data-each-visible`（スクロール追従の可視行範囲）」「可視範囲
 *          変数は実行時の一時値のため `data-bind` 属性には反映されません」）
 *      属性を取り除いた場合はミラーし直さない（仕様「`data-bind`」）ため、`data-bind`
 *      属性を持つ要素だけを対象にします。
 *
 *    - I2 行数一致: `data-each` が描いた行数 == 参照している配列の要素数
 *    - I3 行の識別一致: 行 i のリストキー == 配列要素 i から作るリストキー
 *
 *      仕様「`data-each`」「`data-each-done`: 全行の描画が安定して完了したときに Haori が
 *      自動付与するマーカー。新しい描画サイクルの開始時に外され、完了時に再付与
 *      されます」。描画中は行数が配列と一致しないことが仕様上あり得るため、この
 *      マーカーが付いたコンテナだけを対象にします。
 *
 * 2. 確定後の一致（`collectUncommittedMismatches()`）
 *    すべての編集が確定した時点でだけ成り立つもの。入力欄へ値を入れて `change`
 *    を発火していない状態では**正しく**ずれるため、常時検査には使えません。
 *    - I4 収集値一致: 入力欄から集めた値 == バインドデータの同じ経路の値
 *
 * 「最後に明示的に書いた値が残る」といった**更新の取りこぼし**は、終状態が
 * それ自身では整合しているため、ここでは捕まりません。割り込みの組み合わせを
 * 網羅するテスト（`tests/interleaving-authority.test.ts`）が受け持ちます。
 */
import {expect} from 'vitest';
import Core from '../../src/core';
import Env from '../../src/env';
import Form from '../../src/form';
import Fragment, {ElementFragment} from '../../src/fragment';

/** 不変条件の検査で除外する対象の指定 */
export interface InvariantOptions {
  /** I1（属性ミラー一致）を検査するか。既定 true */
  attribute?: boolean;
  /** I2 / I3（`data-each` の行）を検査するか。既定 true */
  rows?: boolean;
  /**
   * 属性ミラーの比較から除くキー。
   *
   * `Core.setBindingData()` を `reflectToAttribute=false` で呼ぶ機能
   * （`data-poll` / 可視範囲 / 一部の手続き）は、意図的に属性へミラーしません。
   * そのキーを持つ要素を検査する場合に指定します。
   */
  ignoreKeys?: readonly string[];
}

/** 検査から外す要素の印（テスト側が意図的に不整合を作る場合に使う） */
const EXEMPT = new WeakSet<HTMLElement>();

/**
 * 指定した要素を不変条件の検査から外します。
 *
 * 意図的に不整合な状態を作って挙動を確かめるテストで使います。外す理由を
 * コメントに残してください。
 *
 * @param element 検査から外す要素
 */
export function exemptFromInvariants(element: HTMLElement): void {
  EXEMPT.add(element);
}

/**
 * 値を JSON 相当へ落とします。
 *
 * `undefined` を含むキーや `File` などは `JSON.stringify` で落ちるため、属性の
 * 内容（必ず JSON を経由している）と比べるには両方を同じ土俵へ乗せます。
 *
 * @param value 対象の値
 * @returns JSON 相当へ落とした値
 */
function toJsonLike(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}

/**
 * 2 つの値が JSON として等しいかどうかを返します。
 *
 * @param a 比較する値
 * @param b 比較する値
 * @returns 等しければ true
 */
function jsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 属性ミラーの比較から、仕様が明記した非ミラー対象のキーを除きます。
 *
 * 除くのは次の 2 種類だけです。ここを増やすと、ミラーの取りこぼしを不変条件で
 * 検出できなくなります。
 *
 * - 先頭が `_` の予約キー（仕様「`data-fetch-state` / `data-{event}-fetch-state`」
 *   「`data-poll-state`」）
 * - `data-each-visible` が公開する可視範囲の変数（仕様「`data-each-visible`（スクロール追従の可視行範囲）」）
 *
 * @param value 対象の値
 * @param names 可視範囲の変数名など、追加で除くキー
 * @returns 非ミラー対象を除いた値（オブジェクトでなければそのまま）
 */
function omitNonMirrored(value: unknown, names: readonly string[]): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const copied: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('_') || names.includes(key)) {
      continue;
    }
    copied[key] = item;
  }
  return copied;
}

/**
 * 文書内で `data-each-visible` が公開する変数名を集めます。
 *
 * 可視範囲の変数は「最近接の上位 `data-bind` スコープ」へ公開されるため、公開先が
 * どの要素になるかは実行時に決まります。テスト側で公開先を突き止めるより、宣言
 * された変数名を集めて比較から外す方が安全です（仕様「`data-each-visible`（スクロール追従の可視行範囲）」）。
 *
 * @param root 検査の起点
 * @returns 公開される変数名の配列
 */
function visibleRangeNames(root: ParentNode): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(`[${Env.prefix}each-visible]`),
  )
    .map(element => element.getAttribute(`${Env.prefix}each-visible`) ?? '')
    .filter(name => name.length > 0);
}

/**
 * `data-each` が参照している配列を取り出します。
 *
 * `Core` の内部処理（`resolveEachItems()`）と同じ規則で正規化します。判定がずれると
 * 行数の比較が意味を失うため、属性評価の結果をそのまま使います。
 *
 * @param fragment `data-each` コンテナのフラグメント
 * @returns 配列。無効な指定なら null
 */
function resolveEachItems(fragment: ElementFragment): unknown[] | null {
  const evaluation = fragment.getAttributeEvaluation(`${Env.prefix}each`);
  const data = evaluation?.value;
  if (
    evaluation?.hasUnresolvedReference ||
    data === false ||
    data === null ||
    data === undefined
  ) {
    return [];
  }
  return Array.isArray(data) ? data : null;
}

/**
 * `data-each` が描いた行のフラグメントを取り出します。
 *
 * 生成された行だけがリストキーを持ちます。`data-each-before` /
 * `data-each-after` の固定要素や静的な子要素はリストキーを持たないため、
 * これを判別に使います。
 *
 * @param fragment `data-each` コンテナのフラグメント
 * @returns 行のフラグメントの配列
 */
function eachRows(fragment: ElementFragment): ElementFragment[] {
  return fragment
    .getChildElementFragments()
    .filter(child => child.getListKey() !== null);
}

/**
 * 要素を説明する短い文字列を作ります。
 *
 * @param element 対象要素
 * @returns タグ名と識別しやすい属性からなる説明
 */
function describeElement(element: HTMLElement): string {
  const parts = [element.tagName.toLowerCase()];
  if (element.id) {
    parts.push(`#${element.id}`);
  }
  const each = element.getAttribute(`${Env.prefix}each`);
  if (each) {
    parts.push(`[${Env.prefix}each="${each}"]`);
  }
  const list = element.getAttribute(`${Env.prefix}form-list`);
  if (list) {
    parts.push(`[${Env.prefix}form-list="${list}"]`);
  }
  return parts.join('');
}

/**
 * 要素とその配下について、内部整合の不変条件（I1〜I3）の違反を集めます。
 *
 * 未確定の編集があっても影響を受けないため、`await` のたびに呼べます。
 *
 * @param root 検査の起点となる要素または文書
 * @param options 検査から外す対象の指定
 * @returns 違反の説明（無ければ空配列）
 */
export function collectFormInconsistencies(
  root: ParentNode,
  options: InvariantOptions = {},
): string[] {
  const {attribute = true, rows = true, ignoreKeys = []} = options;
  const violations: string[] = [];

  if (attribute) {
    for (const element of Array.from(
      root.querySelectorAll<HTMLElement>(`[${Env.prefix}bind]`),
    )) {
      if (EXEMPT.has(element)) {
        continue;
      }
      const fragment = Fragment.get(element);
      if (!(fragment instanceof ElementFragment)) {
        continue;
      }
      const raw = fragment.getRawBindingData();
      if (raw === null) {
        continue;
      }
      const text = element.getAttribute(`${Env.prefix}bind`) ?? '';
      // `data-bind` は JSON のほかに `key=value` の略記も受け付けるため、製品側と
      // 同じ解釈器を使う。テスト側で解釈を作り直すと、略記を不整合と誤判定する。
      const exempt = [...ignoreKeys, ...visibleRangeNames(root)];
      const expected = omitNonMirrored(toJsonLike(raw), exempt);
      const actual = omitNonMirrored(
        toJsonLike(Core.parseDataBind(text)),
        exempt,
      );
      if (!jsonEquals(expected, actual)) {
        violations.push(
          `I1 ${describeElement(element)}: ${Env.prefix}bind 属性が in-memory と` +
            `一致しません（仕様「\`data-bind\`」）\n` +
            `  属性      = ${JSON.stringify(actual)}\n` +
            `  in-memory = ${JSON.stringify(expected)}`,
        );
      }
    }
  }

  if (rows) {
    for (const element of Array.from(
      root.querySelectorAll<HTMLElement>(`[${Env.prefix}each]`),
    )) {
      if (EXEMPT.has(element)) {
        continue;
      }
      // 描画中のコンテナは対象外。`data-each` の描画はフレームをまたいで進むため、
      // 完了マーカーが付くまで行数は配列と一致しない（製品側の宣言に合わせる）。
      if (!element.hasAttribute(`${Env.prefix}each-done`)) {
        continue;
      }
      const fragment = Fragment.get(element);
      if (!(fragment instanceof ElementFragment)) {
        continue;
      }
      const items = resolveEachItems(fragment);
      if (items === null) {
        continue;
      }
      const rowFragments = eachRows(fragment);
      if (rowFragments.length !== items.length) {
        violations.push(
          `I2 ${describeElement(element)}: 行数が配列の要素数と一致しません` +
            `（行 ${rowFragments.length} 件 / 配列 ${items.length} 件）`,
        );
        continue;
      }
      const keyArg = fragment.getAttribute(`${Env.prefix}each-key`);
      const keyName =
        keyArg === null || keyArg === undefined ? null : String(keyArg);
      const expected = items.map((item, index) =>
        Core.createListKey(
          item as Record<string, unknown> | string | number,
          keyName,
          index,
        ),
      );
      const actual = rowFragments.map(row => row.getListKey());
      if (!jsonEquals(expected, actual)) {
        violations.push(
          `I3 ${describeElement(element)}: 行のリストキーが配列の並びと一致` +
            `しません\n  行     = ${JSON.stringify(actual)}\n` +
            `  配列   = ${JSON.stringify(expected)}`,
        );
      }
    }
  }

  return violations;
}

/**
 * 収集値とバインドデータの食い違い（I4）を集めます。
 *
 * **すべての編集が確定した時点でだけ**成り立ちます。入力欄へ値を入れただけで
 * `change` を発火していない状態では正しくずれるため、常時検査には使えません。
 *
 * 比較の土台は解決済みスコープ（祖先を含む、フォーム内の式が実際に見る値）です。
 * `data-form-arg` があればそのキーの配下と比べます。収集値に現れた経路だけを
 * たどるため、入力欄に無いフィールド（`id` や表示専用ラベル）は無視します。
 *
 * @param form 検査するフォーム要素
 * @returns 食い違いの説明（無ければ空配列）
 */
export function collectUncommittedMismatches(form: HTMLElement): string[] {
  const fragment = Fragment.get(form);
  if (!(fragment instanceof ElementFragment)) {
    return [];
  }
  const collected = Form.getValues(fragment);
  const arg = fragment.getAttribute(`${Env.prefix}form-arg`);
  const scope = Core.getBindingData(form, {resolved: true}) ?? {};
  const base =
    arg === null || arg === undefined
      ? scope
      : (scope as Record<string, unknown>)[String(arg)];

  const violations: string[] = [];
  compareCollected(collected, base, describeElement(form), violations);
  return violations;
}

/**
 * 収集値をたどって、バインドデータ側の同じ経路と比べます。
 *
 * 入力欄の値は必ず文字列を経由するため、葉は文字列化して比べます（数値 `1` と
 * 文字列 `'1'` を食い違いとしない）。空文字と `null` / `undefined` も同一視します。
 *
 * @param collected 収集値
 * @param bound バインドデータ側の値
 * @param path 説明に使う経路
 * @param violations 違反の蓄積先
 */
function compareCollected(
  collected: unknown,
  bound: unknown,
  path: string,
  violations: string[],
): void {
  if (Array.isArray(collected)) {
    if (!Array.isArray(bound)) {
      violations.push(
        `I4 ${path}: 収集値は配列ですが、バインドデータは配列ではありません` +
          `（${JSON.stringify(bound)}）`,
      );
      return;
    }
    if (collected.length !== bound.length) {
      violations.push(
        `I4 ${path}: 要素数が一致しません` +
          `（収集 ${collected.length} 件 / バインド ${bound.length} 件）`,
      );
      return;
    }
    collected.forEach((item, index) => {
      compareCollected(item, bound[index], `${path}[${index}]`, violations);
    });
    return;
  }
  if (collected !== null && typeof collected === 'object') {
    if (bound === null || typeof bound !== 'object' || Array.isArray(bound)) {
      violations.push(
        `I4 ${path}: 収集値はオブジェクトですが、バインドデータが対応しません` +
          `（${JSON.stringify(bound)}）`,
      );
      return;
    }
    for (const [key, value] of Object.entries(
      collected as Record<string, unknown>,
    )) {
      compareCollected(
        value,
        (bound as Record<string, unknown>)[key],
        `${path}.${key}`,
        violations,
      );
    }
    return;
  }
  const left =
    collected === null || collected === undefined ? '' : String(collected);
  const right = bound === null || bound === undefined ? '' : String(bound);
  if (left !== right) {
    violations.push(
      `I4 ${path}: 値が一致しません（収集 ${JSON.stringify(left)} / ` +
        `バインド ${JSON.stringify(right)}）`,
    );
  }
}

/**
 * 内部整合の不変条件（I1〜I3）が成り立つことを検査します。
 *
 * @param root 検査の起点となる要素または文書
 * @param options 検査から外す対象の指定
 */
export function expectConsistent(
  root: ParentNode,
  options: InvariantOptions = {},
): void {
  const violations = collectFormInconsistencies(root, options);
  expect(violations, `不変条件の違反:\n${violations.join('\n')}`).toEqual([]);
}

/**
 * 収集値とバインドデータが一致することを検査します（確定後の状態でのみ有効）。
 *
 * @param form 検査するフォーム要素
 */
export function expectCommitted(form: HTMLElement): void {
  const violations = collectUncommittedMismatches(form);
  expect(violations, `収集値の食い違い:\n${violations.join('\n')}`).toEqual([]);
}
