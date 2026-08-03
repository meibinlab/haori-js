/* @vitest-environment jsdom */
/**
 * @fileoverview 外部から `data-bind` 属性を書き換えたときの再評価の検証。
 *
 * `data-bind` は宣言と実行時データの両方を担う属性で、Haori 自身も更新のたびに
 * 最新の in-memory 値をミラーします。他のスクリプトやライブラリがこの属性を
 * 書き換えた場合も、Haori は監視（MutationObserver）経由で取り込みます。
 *
 * 取り込みが内部データの差し替えだけで終わると、`Haori.Core.getBindingData()` が
 * 返す値と画面の表示が食い違います。ここでは、外部からの書き換えでも配下の再評価
 * まで行われ、画面・収集値・バインドデータの三者が一致することを固定します。
 *
 * あわせて、Haori 自身の書き戻し（自己書き込みのエコー）で取り込みが往復しない
 * ことも確認します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import {
  waitForCondition,
  waitForDomSettled,
  waitForIdle,
} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('data-bind 属性の外部書き換え', () => {
  beforeEach(async () => {
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    await Observer.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
  });

  /**
   * 検証用のフォームを組み立てて初期描画を待ちます。
   *
   * **待機は `waitForIdle()` で行います。** 固定サイクルの `waitForDomSettled()` は
   * 呼び出し時点のタスクだけを待つため、「1 段の完了を待ってから次の段を積む」直列
   * チェーン（入れ子の `data-each` など）では途中で解決します。この関数が返す状態は
   * 各テストの**前提**なので、途中で解決すると本題と無関係な理由で落ちます
   * （`tests/helpers/async.ts` の `waitForIdle()` の説明を参照）。
   *
   * @param bind 初期の `data-bind` 属性値
   * @param extra 追加で差し込むマークアップ
   * @returns 組み立てたフォーム要素
   */
  const render = async (bind: string, extra = ''): Promise<HTMLFormElement> => {
    const host = document.createElement('form');
    host.setAttribute('data-bind', bind);
    host.innerHTML = [
      '<b id="text">{{label}}</b>',
      '<span id="aliased" data-attr-title="{{label}}">x</span>',
      '<i id="conditional" data-if="n === 2">two</i>',
      '<input id="input" name="label" type="text">',
      '<ul data-each="rows" data-each-arg="r"><li class="row">{{r.name}}</li></ul>',
      extra,
    ].join('');
    document.body.appendChild(host);
    await waitForIdle();
    return host;
  };

  /**
   * 入れ子の `data-each` が描画した内側のラベルを取り出します。
   *
   * @returns 内側のラベルの配列
   */
  const innerLabels = (): string[] =>
    Array.from(document.querySelectorAll('.inner')).map(
      item => item.textContent ?? '',
    );

  /**
   * 描画済みの行のラベルを取り出します。
   *
   * @returns 行のラベルの配列
   */
  const rowLabels = (): string[] =>
    Array.from(document.querySelectorAll('.row')).map(
      row => row.textContent ?? '',
    );

  it('入れ子の data-each を含む初期描画も、外部書き換えの前に完了している（回帰）', async () => {
    // 各テストは「初期描画が終わっている」ことを前提に外部書き換えを行う。前提の
    // 待ち合わせを固定サイクル（`waitForDomSettled()` の既定 3 サイクル）で行うと、
    // 段を重ねる描画では途中で解決する。入れ子の `data-each` は 12 サイクル進めても
    // 完了せず（`Queue.wait()` は呼び出し時点のタスクだけを待つため）、2 行目の内側が
    // `{{it.v}}` のまま観測される。この状態で外部書き換えへ進むと、本題と無関係な
    // 理由でテストが落ちる。
    await render(
      '{"label":"あかね","n":1,"rows":[],' +
        '"groups":[{"id":1,"items":[{"k":"x","v":"1"},{"k":"y","v":"2"}]},' +
        '{"id":2,"items":[{"k":"z","v":"3"}]}]}',
      '<ul data-each="groups" data-each-key="id" data-each-arg="g">' +
        '<li><ol data-each="g.items" data-each-key="k" data-each-arg="it">' +
        '<li class="inner">{{it.v}}</li></ol></li></ul>',
    );

    expect(innerLabels()).toEqual(['1', '2', '3']);
  });

  it('書き換えた内容で配下が再評価される', async () => {
    const host = await render(
      '{"label":"あかね","n":1,"rows":[{"name":"一行目"}]}',
    );
    expect(document.getElementById('text')!.textContent).toBe('あかね');
    expect(document.getElementById('conditional')!.style.display).toBe('none');
    expect(rowLabels()).toEqual(['一行目']);

    host.setAttribute(
      'data-bind',
      '{"label":"ひなた","n":2,"rows":[{"name":"新一行目"},{"name":"新二行目"}]}',
    );
    // 行の増減は監視のコールバック → バインド更新 → 行生成 → 行内評価と段を
    // 重ねるため、既定の待機サイクルでは足りない。
    //
    // **条件は最終状態そのもので書く。** 行数だけを見ると、行の要素が生えた時点で
    // 条件が成立し、行内の `{{r.name}}` がまだ評価されていない状態で先へ進む。
    // この取り違えは待機サイクルが 1 つ短くなるだけで表に出る
    // （`docs/ja/testing.md`「待ち合わせの条件は最終状態そのもので書く」）。
    await waitForCondition(
      () => rowLabels().join('|') === '新一行目|新二行目',
      {description: '外部書き換えによる行の再生成と行内の評価'},
    );

    expect(document.getElementById('text')!.textContent).toBe('ひなた');
    expect(document.getElementById('aliased')!.getAttribute('title')).toBe(
      'ひなた',
    );
    expect(document.getElementById('conditional')!.style.display).not.toBe(
      'none',
    );
    expect(rowLabels()).toEqual(['新一行目', '新二行目']);
  });

  it('画面・収集値・バインドデータが一致する', async () => {
    const host = await render('{"label":"あかね","n":1,"rows":[]}');

    host.setAttribute('data-bind', '{"label":"ひなた","n":1,"rows":[]}');
    await waitForDomSettled();

    const input = document.getElementById('input') as HTMLInputElement;
    const fragment = Fragment.get(host) as ElementFragment;
    expect(input.value).toBe('ひなた');
    expect(Form.getValues(fragment)).toMatchObject({label: 'ひなた'});
    expect(Core.getBindingData(host)).toMatchObject({label: 'ひなた'});
  });

  it('属性を取り除くとバインドデータが空になる', async () => {
    const host = await render('{"label":"あかね","n":1,"rows":[]}');

    host.removeAttribute('data-bind');
    await waitForDomSettled();

    expect(document.getElementById('text')!.textContent).toBe('');
    expect(Core.getBindingData(host)).toEqual({});
    // 取り除いた属性を空のミラーで復活させない。
    expect(host.hasAttribute('data-bind')).toBe(false);
  });

  it('Haori 自身の書き戻しでは取り込みが往復しない', async () => {
    const host = await render('{"label":"あかね","n":1,"rows":[]}');
    const setBindingData = vi.spyOn(Core, 'setBindingData');

    // 属性ミラーが発生する通常の更新。エコーを取り込むと、ここから
    // setBindingData が繰り返し呼ばれて収束しない。
    await Core.setBindingData(host, {label: 'ひなた', n: 1, rows: []});
    await waitForDomSettled();
    await waitForDomSettled();

    expect(setBindingData).toHaveBeenCalledTimes(1);
    expect(document.getElementById('text')!.textContent).toBe('ひなた');
    expect(host.getAttribute('data-bind')).toContain('ひなた');
  });

  it('書き換えた後の属性が in-memory と一致する', async () => {
    const host = await render('{"label":"あかね","n":1,"rows":[]}');

    // 外部が書いた表記（空白入り・キー順違い）。取り込みの後は、Haori が
    // ミラーした正規形に落ち着き、内部データと食い違わない。
    host.setAttribute(
      'data-bind',
      '{ "n" : 1 , "rows" : [] , "label" : "ひなた" }',
    );
    await waitForDomSettled();

    const bound = Core.getBindingData(host);
    expect(host.getAttribute('data-bind')).toBe(JSON.stringify(bound));
    expect(bound).toMatchObject({label: 'ひなた'});
  });

  it('利用者が編集した欄も書き換えた値で更新される', async () => {
    const host = await render('{"label":"あかね","n":1,"rows":[]}');
    const input = document.getElementById('input') as HTMLInputElement;

    input.value = '編集';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    expect(Core.getBindingData(host)).toMatchObject({label: '編集'});

    // 外部からの書き換えは「明示的な値の供給」として扱う。
    host.setAttribute('data-bind', '{"label":"ひなた","n":1,"rows":[]}');
    // `waitForDomSettled()` は供給のワークが入力欄へ書き戻す前に戻ることがある。
    // 落ち着くまで回す `waitForIdle()` で待つ。
    await waitForIdle();

    expect(input.value).toBe('ひなた');
    expect(document.getElementById('text')!.textContent).toBe('ひなた');
  });
});
