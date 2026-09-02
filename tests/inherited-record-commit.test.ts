/* @vitest-environment jsdom */
/**
 * @fileoverview 祖先が値を所有するフォーム（`data-form-arg` なし）の双方向コミットの検証。
 *
 * 一覧やレコードを外側の要素の `data-bind` で持ち、フォーム自身には `data-bind` を
 * 書かない構成を対象にします。この構成では収集値を重ねる土台がフォーム自身の
 * バインドデータに無いため、土台を祖先から解決しないと収集値が置き換えになり、
 * 入力欄に対応しないフィールド（`id` など）が全行から落ちます。落ちると行の表示が
 * 空になり、`data-each-key` の鍵も失われます。さらに、コミットが作るコピーが祖先を
 * シャドーしたまま解除されないと、一覧を再取得しても画面が更新されなくなります。
 *
 * 期待値の根拠は仕様「双方向バインディングの自動更新」の「収集値は現在のバインド
 * データへ重ねます（置き換えません）」「土台はフォーム自身のバインドデータに限り
 * ません」と、仕様「祖先が所有する値の反映（`data-form-arg` なし）」。
 *
 * `data-form-arg` を宣言した場合の同じ規則は
 * [tests/form-arg-ancestor-scope.test.ts](./form-arg-ancestor-scope.test.ts) が
 * 固定しています。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForIdle} from './helpers/async';

describe('祖先が値を所有するフォームの双方向コミット', () => {
  let container: HTMLElement | null = null;
  let warnings: string[] = [];

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    warnings = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
    await import('../src/observer');
  });

  afterEach(() => {
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * HTML をデタッチ状態のコンテナへ流し込んでから接続し、走査します。
   *
   * @param html マウントする HTML 文字列
   * @returns 走査完了の Promise
   */
  const mount = async (html: string): Promise<void> => {
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
  };

  /**
   * 指定セレクタの生バインドデータを返します。
   *
   * @param selector 対象要素のセレクタ
   * @returns 生バインドデータ（未設定なら null）
   */
  const rawOf = (selector: string): Record<string, unknown> | null =>
    (
      Fragment.get(
        document.querySelector(selector) as HTMLElement,
      ) as ElementFragment
    ).getRawBindingData();

  /** 編集フォーム内の入力欄の値を並べて返します。 */
  const inputValues = (): string[] =>
    Array.from(document.querySelectorAll('#editor input')).map(
      element => (element as HTMLInputElement).value,
    );

  /** 編集フォーム内の `{{row.id}}` の描画結果を並べて返します。 */
  const renderedIds = (): (string | null)[] =>
    Array.from(document.querySelectorAll('#editor span')).map(
      element => element.textContent,
    );

  /**
   * 一覧を祖先が持つ編集フォームを組み立てます。
   *
   * @returns 走査完了の Promise
   */
  const mountList = (): Promise<void> =>
    mount(
      '<div id="state" data-bind=\'{"rows":[{"id":1,"label":"あ"},{"id":2,"label":"い"}]}\'>' +
        '<form id="editor">' +
        '<div data-form-list="rows" data-each="rows" data-each-arg="row" data-each-key="id">' +
        '<div><input name="label" /><span>{{row.id}}</span></div>' +
        '</div>' +
        '</form>' +
        '<button id="rst" type="button" data-click-reset="#editor"></button>' +
        '</div>',
    );

  /**
   * 1 行目の入力欄を編集して確定します。
   *
   * @param value 入力する値
   * @returns 反映完了の Promise
   */
  const editFirstRow = async (value: string): Promise<void> => {
    const first = document.querySelector('#editor input') as HTMLInputElement;
    first.value = value;
    first.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();
  };

  it('入力欄に対応しないフィールドが残る', async () => {
    // 仕様「双方向バインディングの自動更新」の「収集値は現在のバインドデータへ
    // 重ねます（置き換えません）」。土台は祖先の `rows` から解決する（同節の
    // 「土台はフォーム自身のバインドデータに限りません」）。
    await mountList();
    await waitForIdle();
    await editFirstRow('あ！');
    expect(rawOf('#editor')?.rows).toEqual([
      {id: 1, label: 'あ！'},
      {id: 2, label: 'い'},
    ]);
  });

  it('編集していない行の表示が壊れない', async () => {
    // 仕様「双方向バインディングの自動更新」の「失うと、行の表示が空になったり」。
    // 土台が無いと `id` が全行から落ち、`{{row.id}}` が空になる。
    await mountList();
    await waitForIdle();
    expect(renderedIds()).toEqual(['1', '2']);
    await editFirstRow('あ！');
    expect(renderedIds()).toEqual(['1', '2']);
  });

  it('data-form-object でも祖先の値を土台にする', async () => {
    // 仕様「祖先が所有する値の反映（`data-form-arg` なし）」の「コミット時は
    // **収集したキーごとに、最も近い所有者の値を土台に収集値を重ねます**」。
    // 対象は `data-form-list` に限らない。
    await mount(
      '<div id="state" data-bind=\'{"rec":{"id":9,"label":"あ"}}\'>' +
        '<form id="editor"><div data-form-object="rec">' +
        '<input name="label" />' +
        '</div></form></div>',
    );
    await waitForIdle();
    const input = document.querySelector('#editor input') as HTMLInputElement;
    input.value = 'あ！';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();
    expect(rawOf('#editor')?.rec).toEqual({id: 9, label: 'あ！'});
  });

  it('祖先が値を更新するとコピーが解除され、以降の更新が届く', async () => {
    // 仕様「祖先が所有する値の反映（`data-form-arg` なし）」の「このコピーは祖先を
    // シャドーしますが、祖先が当該キーを更新したときに解除するため、以降の更新が
    // 届かなくなることはありません」。
    await mountList();
    await waitForIdle();
    await editFirstRow('あ！');
    await Core.setBindingData(document.getElementById('state') as HTMLElement, {
      rows: [
        {id: 1, label: 'X'},
        {id: 2, label: 'Y'},
      ],
    });
    await waitForIdle();
    expect(inputValues()).toEqual(['X', 'Y']);
    expect(renderedIds()).toEqual(['1', '2']);
    expect(
      Object.prototype.hasOwnProperty.call(rawOf('#editor') ?? {}, 'rows'),
    ).toBe(false);
  });

  it('値が変わっていない更新では解除しない', async () => {
    // 仕様「祖先が所有する値の反映（`data-form-arg` なし）」の「解除は**その
    // キーの値が実際に変わったとき**だけ行います」。同じ値でも解除すると、
    // 利用者が確定した編集を巻き戻してしまう。
    await mountList();
    await waitForIdle();
    await editFirstRow('あ！');
    // 祖先の `rows` は編集で変わっていない（コミット先はフォーム自身）。
    // 同じ値を供給しても解除は起きない。
    await Core.setBindingData(document.getElementById('state') as HTMLElement, {
      rows: [
        {id: 1, label: 'あ'},
        {id: 2, label: 'い'},
      ],
    });
    await waitForIdle();
    expect(inputValues()).toEqual(['あ！', 'い']);
    expect(rawOf('#editor')?.rows).toEqual([
      {id: 1, label: 'あ！'},
      {id: 2, label: 'い'},
    ]);
  });

  it('リセットは祖先が所有する値へ戻す', async () => {
    // 仕様「祖先が所有する値の反映（`data-form-arg` なし）」の「リセット
    // （`data-{event}-reset`）は、祖先が所有する値へ戻します。祖先が所有する
    // キーはフォーム自身へ書き戻しません」。
    await mountList();
    await waitForIdle();
    await editFirstRow('あ！');
    (document.getElementById('rst') as HTMLElement).click();
    await waitForIdle();
    expect(inputValues()).toEqual(['あ', 'い']);
    expect(renderedIds()).toEqual(['1', '2']);
    expect(
      Object.prototype.hasOwnProperty.call(rawOf('#editor') ?? {}, 'rows'),
    ).toBe(false);
  });

  it('Core.changeValue で値を入れても土台を祖先から解決する', async () => {
    // 仕様「双方向バインディングの自動更新」の「土台はフォーム自身のバインドデータ
    // に限りません」。`Haori.Core.changeValue()` は公開 API で、`change` を伴わずに
    // 双方向コミットを起こす。イベント経由の手続きとは別の経路なので、こちらでも
    // 土台の解決が要る（同じ規則を破れる 2 つめの侵入口）。
    await mountList();
    await waitForIdle();
    const first = document.querySelector('#editor input') as HTMLInputElement;
    await Core.changeValue(first, 'あ！');
    await waitForIdle();
    expect(rawOf('#editor')?.rows).toEqual([
      {id: 1, label: 'あ！'},
      {id: 2, label: 'い'},
    ]);
    expect(renderedIds()).toEqual(['1', '2']);
  });

  it('リセットはフォーム自身の宣言を祖先の値で置き換えない', async () => {
    // 仕様「祖先が所有する値の反映（`data-form-arg` なし）」の「リセットは祖先が
    // 所有する値へ戻します」が落とすのは、双方向コミットが作ったコピーだけ。
    // フォーム自身の初期 `data-bind` 宣言は「初期状態」そのものなので、祖先が同名の
    // キーを持っていても落としてはならない（仕様「`data-{event}-reset`」）。
    await mount(
      '<div id="state" data-bind=\'{"rows":[{"id":1,"label":"あ"}]}\'>' +
        '<form id="editor" data-bind=\'{"rows":[{"id":9,"label":"独自"}]}\'>' +
        '<div data-form-list="rows" data-each="rows" data-each-arg="row" data-each-key="id">' +
        '<div><input name="label" /><span>{{row.id}}</span></div>' +
        '</div></form>' +
        '<button id="rst" type="button" data-click-reset="#editor"></button>' +
        '</div>',
    );
    await waitForIdle();
    await editFirstRow('編集');
    (document.getElementById('rst') as HTMLElement).click();
    await waitForIdle();
    expect(rawOf('#editor')?.rows).toEqual([{id: 9, label: '独自'}]);
    expect(renderedIds()).toEqual(['9']);
    expect(inputValues()).toEqual(['独自']);
  });

  it('data-form コンテナでもコピーが解除される', async () => {
    // 仕様「祖先が所有する値の反映（`data-form-arg` なし）」の「**土台の解決と
    // コピーの解除は、`<form>` と `data-form` コンテナの両方が対象です**」。
    // `data-form` を外すと、一度入力したコンテナが以降の再取得を受け付けなくなる。
    // 仕様が `data-form` を対象外とするのは**入力欄への流し込み**についてで、
    // シャドーの解除には当てはまらない。
    await mount(
      '<div id="state" data-bind=\'{"rows":[{"id":1,"label":"あ"},{"id":2,"label":"い"}]}\'>' +
        '<div id="editor" data-form>' +
        '<div data-form-list="rows" data-each="rows" data-each-arg="row" data-each-key="id">' +
        '<div><input name="label" /><span>{{row.id}}</span></div>' +
        '</div></div></div>',
    );
    await waitForIdle();
    await editFirstRow('あ！');
    // 土台の解決はコンテナでも働く（`Form.getFormFragment()` が対象にするため）。
    expect(rawOf('#editor')?.rows).toEqual([
      {id: 1, label: 'あ！'},
      {id: 2, label: 'い'},
    ]);
    await Core.setBindingData(document.getElementById('state') as HTMLElement, {
      rows: [
        {id: 1, label: 'X'},
        {id: 2, label: 'Y'},
      ],
    });
    await waitForIdle();
    expect(inputValues()).toEqual(['X', 'Y']);
    expect(
      Object.prototype.hasOwnProperty.call(rawOf('#editor') ?? {}, 'rows'),
    ).toBe(false);
  });

  it('祖先が値を持たない状態（null）では警告しない', async () => {
    // `data-form-arg` の対象が「まだ選ばれていない」ことを `null` で表すのは通常の
    // 書き方（一覧から選ぶと値が入る master-detail 構成）。`null` は収集値がその
    // キーへ入って初期化されるだけで、仕様「祖先が所有するレコードの反映
    // （`data-form-arg`）」が想定する構成から外れないため、警告してはならない。
    Dev.set(true);
    await mount(
      '<div id="state" data-bind=\'{"detail":null}\'>' +
        '<form id="editor" data-form-arg="detail"><input name="name" /></form>' +
        '</div>',
    );
    await waitForIdle();
    const input = document.querySelector('#editor input') as HTMLInputElement;
    input.value = 'あ';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();
    expect(warnings.filter(warning => warning.includes('form-arg'))).toEqual(
      [],
    );
    expect(rawOf('#editor')?.detail).toEqual({name: 'あ'});
  });

  it('data-form-arg のキーをレコード以外で所有していたら警告する', async () => {
    // 仕様「祖先が所有するレコードの反映（`data-form-arg`）」は祖先が**レコード**を
    // 所有する構成を定めている。配列を指した宣言は前提に反するため、黙って退くの
    // ではなく開発モードで知らせる（退くと収集値がそのキーへ直接入り、配列を宣言
    // していた値がオブジェクトへ変わる）。
    Dev.set(true);
    await mount(
      '<div id="state" data-bind=\'{"rows":[{"id":1,"label":"あ"}]}\'>' +
        '<form id="editor" data-form-arg="rows"><input name="label" /></form>' +
        '</div>',
    );
    await waitForIdle();
    const input = document.querySelector('#editor input') as HTMLInputElement;
    input.value = 'あ！';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();
    const argWarnings = warnings.filter(warning =>
      warning.includes('form-arg="rows"'),
    );
    expect(argWarnings.length).toBe(1);
    expect(argWarnings[0]).toContain('配列');
  });

  it('フォーム自身の宣言は祖先の更新で解除しない', async () => {
    // 仕様「祖先が所有する値の反映（`data-form-arg` なし）」の解除は、双方向
    // コミットが作ったコピーだけを対象にする。フォーム自身が `data-bind` で
    // 宣言したキーは宣言であって追随結果ではないため、祖先が同名のキーを
    // 更新しても落としてはならない（仕様「`data-bind`」）。
    await mount(
      '<div id="state" data-bind=\'{"rows":[{"id":1,"label":"あ"}]}\'>' +
        '<form id="editor" data-bind=\'{"rows":[{"id":9,"label":"独自"}]}\'>' +
        '<div data-form-list="rows" data-each="rows" data-each-arg="row" data-each-key="id">' +
        '<div><input name="label" /><span>{{row.id}}</span></div>' +
        '</div></form></div>',
    );
    await waitForIdle();
    expect(renderedIds()).toEqual(['9']);
    await Core.setBindingData(document.getElementById('state') as HTMLElement, {
      rows: [{id: 1, label: 'X'}],
    });
    await waitForIdle();
    expect(rawOf('#editor')?.rows).toEqual([{id: 9, label: '独自'}]);
    expect(renderedIds()).toEqual(['9']);
  });
});
