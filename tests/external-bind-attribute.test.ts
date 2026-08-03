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
import {waitForCondition, waitForDomSettled} from './helpers/async';

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
   * @param bind 初期の `data-bind` 属性値
   * @returns 組み立てたフォーム要素
   */
  const render = async (bind: string): Promise<HTMLFormElement> => {
    const host = document.createElement('form');
    host.setAttribute('data-bind', bind);
    host.innerHTML = [
      '<b id="text">{{label}}</b>',
      '<span id="aliased" data-attr-title="{{label}}">x</span>',
      '<i id="conditional" data-if="n === 2">two</i>',
      '<input id="input" name="label" type="text">',
      '<ul data-each="rows" data-each-arg="r"><li class="row">{{r.name}}</li></ul>',
    ].join('');
    document.body.appendChild(host);
    await waitForDomSettled();
    return host;
  };

  /**
   * 描画済みの行のラベルを取り出します。
   *
   * @returns 行のラベルの配列
   */
  const rowLabels = (): string[] =>
    Array.from(document.querySelectorAll('.row')).map(
      row => row.textContent ?? '',
    );

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
    await waitForCondition(() => rowLabels().length === 2, {
      description: '外部書き換えによる行の再生成',
    });

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
    host.setAttribute('data-bind', '{ "n" : 1 , "rows" : [] , "label" : "ひなた" }');
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
    await waitForDomSettled();

    expect(input.value).toBe('ひなた');
    expect(document.getElementById('text')!.textContent).toBe('ひなた');
  });
});
