/* @vitest-environment jsdom */
/**
 * @fileoverview まだ描かれていない入れ子の `data-each` の行テンプレートで、行スコープの
 * 名前が「一度も供給されなかった」と警告されないことの検証。
 *
 * 背景: `data-each` ＋ `data-form-list` の行の中で、`data-if` が偽のために描かれていない
 * 入れ子の `data-each` ＋ `data-form-list` の行テンプレートの入力欄が
 * `data-attr-value="{{o.id}}"` を宣言していると、行への値の反映が宣言の解決を確かめる
 * ために外側の行のスコープで評価し、`o` を未解決として記録していた。
 *
 * 未解決参照の集約警告は、モジュールの中で共有する状態から描画が落ち着いた時点に
 * 出ます。ほかの宣言の警告と見分けるため、テストごとに別の名前を使います。
 *
 * 期待値の根拠は仕様「未解決参照の診断」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import {waitForIdle} from './helpers/async';

describe('まだ描かれていない入れ子の data-each の行テンプレートの診断', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setStrictBind(false);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    Dev.enable();
  });

  /**
   * 「一度も供給されなかった」と報告された名前を集めます。
   *
   * @returns 報告された名前
   */
  const neverProvidedNames = (): string[] =>
    (warn.mock.calls as unknown[][])
      .map(args => args.map(arg => String(arg)).join(' '))
      .flatMap(message => {
        const matched = message.match(
          /were never provided by any binding: ([^.]+)\./,
        );
        return matched ? matched[1].split(', ') : [];
      });

  /**
   * 外側の行の中に、入れ子の `data-each` ＋ `data-form-list` を置いた構成を描きます。
   *
   * @param bind フォームの `data-bind`
   * @param arg 内側の `data-each-arg`
   * @param reference 内側の行テンプレートの `data-attr-value` で参照する名前
   * @returns 描画が落ち着いたら解決する Promise
   */
  const render = async (
    bind: string,
    arg: string,
    reference: string,
  ): Promise<void> => {
    // 走査は呼び出しごとに新しい要素から始める（走査済みの `body` の中身を
    // 差し替えても、フラグメントは作り直されない）。
    const root = document.createElement('div');
    root.innerHTML = `
<form data-bind='${bind}'>
  <div data-form-list="rows" data-each="rows" data-each-arg="c">
    <div>
      <div data-if="c.agreed">
        <div data-form-list="options" data-each="cand ?? []" data-each-arg="${arg}">
          <div><input type="hidden" name="optionId" data-attr-value="{{${reference}.id}}"></div>
        </div>
      </div>
    </div>
  </div>
</form>`;
    document.body.appendChild(root);
    await Core.scan(root);
    await waitForIdle();
    await waitForIdle();
  };

  it('行データに内側のキーが無い行で、内側の行スコープの名前を報告しない', async () => {
    // 仕様「未解決参照の診断」の「**次の評価は、どちらの診断（一度も供給されなかった
    // キーと、別のスコープでは供給されているキー）にも記録しません。**」
    // 「**入力欄の値を決めるための確認の評価**」「まだ描かれていない入れ子の
    // `data-each` の行テンプレート（`data-if` が偽の中にあるものなど）にも届きます」
    await render('{"rows":[{}]}', 'o', 'o');
    expect(neverProvidedNames()).not.toContain('o');
  });

  it('行データに内側のキーが空の配列としてある行でも、内側の行スコープの名前を報告しない', async () => {
    // 仕様「未解決参照の診断」の「**次の評価は、どちらの診断（一度も供給されなかった
    // キーと、別のスコープでは供給されているキー）にも記録しません。**」
    // 「**入力欄の値を決めるための確認の評価**」
    await render('{"rows":[{"options":[]}]}', 'p', 'p');
    expect(neverProvidedNames()).not.toContain('p');
  });

  it('内側の行が描かれた後の、行テンプレートの名前の打ち間違いは報告する', async () => {
    // 仕様「未解決参照の診断」の「描かれた入力欄の宣言は描画のときに診断されるので、
    // 行の中の打ち間違い（`{{oo.id}}`）は従来どおり報告します」
    await render('{"rows":[{"agreed":true}],"cand":[{"id":1}]}', 'q', 'qq');
    expect(neverProvidedNames()).toContain('qq');
  });

  it('data-strict-bind でも、内側の行スコープの名前に error を出さない', async () => {
    // 仕様「未解決参照の診断」の「`data-strict-bind` の `error` も出しません」
    // 「**入力欄の値を決めるための確認の評価**」
    Env.setStrictBind(true);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await render('{"rows":[{}]}', 's', 's');
    } finally {
      Env.setStrictBind(false);
    }
    const messages = (error.mock.calls as unknown[][]).map(args =>
      args.map(arg => String(arg)).join(' '),
    );
    expect(
      messages.filter(message =>
        message.includes('not in the binding data: s.'),
      ),
    ).toEqual([]);
  });
});
