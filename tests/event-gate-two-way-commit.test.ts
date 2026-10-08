/* @vitest-environment jsdom */
/**
 * @fileoverview 入力欄の手続きが途中で止まった場合の双方向コミットのテスト。
 *
 * 期待値は仕様「双方向バインディングの自動更新」の「**手続きが途中で止まっても、
 * 入力欄の値のコミットは行います。** 入力欄に置いた `data-change-*` /
 * `data-input-*` の手続きが、検証の失敗（`data-{event}-validate`）、実行条件が偽
 * （`data-{event}-if`）、確認のキャンセル（`data-{event}-confirm`）で止まった場合、
 * 止まるのは手続きのアクション（`-run` / `-click` など）だけで、フォームへのコミットは
 * 止まらずに進んだ場合と同じく行います」から取っている。
 *
 * 修正前は、コミットが手続きの最後にあり、止まった時点で戻っていたため、画面には
 * 選んだ値が出ているのにバインドデータは古いまま残っていた。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('入力欄の手続きが止まった場合の双方向コミット', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let clicks: number;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    clicks = 0;
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  /**
   * 選択欄を持つフォームと、押された回数を数えるボタンを走査します。
   *
   * @param selectAttributes 選択欄へ付ける属性
   * @param formAttributes フォームへ付ける属性
   * @param shownExpression 表示する式
   * @returns フォーム
   */
  async function mountSelect(
    selectAttributes: string,
    formAttributes = 'data-bind=\'{"type":"a"}\'',
    shownExpression = 'type',
  ): Promise<HTMLElement> {
    container.innerHTML =
      `<form id="f" ${formAttributes}>` +
      `<select id="sel" name="type" ${selectAttributes}>` +
      '<option value="a">a</option><option value="b">b</option>' +
      '<option value="c">c</option></select>' +
      `<span id="shown">{{${shownExpression}}}</span></form>` +
      '<button id="noop" type="button">noop</button>';
    container.querySelector('#noop')!.addEventListener('click', () => {
      clicks++;
    });
    await Core.scan(container);
    await waitForDomSettled(6);
    return container.querySelector('#f') as HTMLElement;
  }

  /**
   * 選択欄で選び直して確定します。
   *
   * @param value 選ぶ値
   */
  async function choose(value: string): Promise<void> {
    const select = container.querySelector('#sel') as HTMLSelectElement;
    select.focus();
    select.value = value;
    select.dispatchEvent(new Event('input', {bubbles: true}));
    select.dispatchEvent(new Event('change', {bubbles: true}));
    select.blur();
    await waitForDomSettled(8);
  }

  /**
   * 要素自身のバインドデータを返します。
   *
   * @param element 対象の要素
   * @returns バインドデータ
   */
  function bindingOf(element: HTMLElement): Record<string, unknown> | null {
    return (Fragment.get(element) as ElementFragment).getRawBindingData();
  }

  /**
   * 画面の表示を返します。
   *
   * @returns `#shown` の文字列
   */
  function shown(): string {
    return container.querySelector('#shown')!.textContent ?? '';
  }

  it('data-change-if が偽でも選んだ値をコミットし、アクションは実行しない（回帰）', async () => {
    const form = await mountSelect(
      'data-change-if="{{type === \'b\'}}" data-change-click="#noop"',
    );

    await choose('c');
    expect(shown()).toBe('c');
    expect(bindingOf(form)).toEqual({type: 'c'});
    // 仕様「`data-{event}-if`」の「条件が偽のときは、その手続きの以降のアクション
    // （中略）をすべて実行しません」。
    expect(clicks).toBe(0);
  });

  it('data-change-if は選んだ値で判定し、真になった選択でだけアクションを実行する', async () => {
    // 仕様「双方向バインディングの自動更新」の「実行条件は従来どおりコミットの前に
    // 収集値で評価するため（中略）、入力した値で判定されます」。
    const form = await mountSelect(
      'data-change-if="{{type === \'b\'}}" data-change-click="#noop"',
    );

    await choose('b');
    expect(bindingOf(form)).toEqual({type: 'b'});
    expect(clicks).toBe(1);

    await choose('a');
    expect(shown()).toBe('a');
    expect(bindingOf(form)).toEqual({type: 'a'});
    expect(clicks).toBe(1);
  });

  it('data-form-arg を持つフォームでも、条件が偽のとき選んだ値をそのキーへコミットする（回帰）', async () => {
    const form = await mountSelect(
      'data-change-if="{{c.type === \'b\'}}" data-change-click="#noop"',
      'data-form-arg="c" data-bind=\'{"c":{"type":"a"}}\'',
      'c.type',
    );

    await choose('c');
    expect(shown()).toBe('c');
    expect(bindingOf(form)).toEqual({c: {type: 'c'}});
    expect(clicks).toBe(0);
  });

  it('data-input-if が偽でも入力した値をコミットする（回帰）', async () => {
    container.innerHTML =
      '<form id="f" data-bind=\'{"q":""}\'>' +
      '<input id="q" name="q" data-input-if="{{q.length > 2}}"' +
      ' data-input-click="#noop"></form>' +
      '<button id="noop" type="button">noop</button>';
    container.querySelector('#noop')!.addEventListener('click', () => {
      clicks++;
    });
    await Core.scan(container);
    await waitForDomSettled(6);
    const form = container.querySelector('#f') as HTMLElement;
    const input = container.querySelector('#q') as HTMLInputElement;

    input.focus();
    input.value = 'ab';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await waitForDomSettled(8);

    expect(bindingOf(form)).toEqual({q: 'ab'});
    expect(clicks).toBe(0);
  });

  it('data-change-confirm をキャンセルしても選んだ値をコミットし、アクションは実行しない（回帰）', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const form = await mountSelect(
      'data-change-confirm="切り替えますか" data-change-click="#noop"',
    );

    await choose('c');
    expect(shown()).toBe('c');
    expect(bindingOf(form)).toEqual({type: 'c'});
    // 仕様「`data-{event}-confirm`」の「キャンセル時は処理を中断します」。
    expect(clicks).toBe(0);
  });

  it('data-change-validate が失敗しても選んだ値をコミットし、アクションは実行しない（回帰）', async () => {
    const form = await mountSelect(
      'data-change-validate data-validity="{{type !== \'c\'}}"' +
        ' data-change-click="#noop"',
    );

    await choose('c');
    expect(shown()).toBe('c');
    expect(bindingOf(form)).toEqual({type: 'c'});
    // 仕様「`data-{event}-validate`」の「バリデーション失敗時は処理を中断します」。
    expect(clicks).toBe(0);
  });

  it('data-fetch を伴わない data-change-bind の手続きが止まった場合は、バインド先へもフォームへも写さない', async () => {
    // 仕様「双方向バインディングの自動更新」の「例外は `data-{event}-fetch` を伴わずに
    // `data-{event}-bind` を宣言した手続きです。この手続きは収集値をフォームではなく
    // バインド先へ写し、その書き込みは手続きのアクションなので、止まった場合は
    // バインド先へもフォームへも写しません」。
    const form = await mountSelect(
      'data-change-if="{{type === \'b\'}}" data-change-bind="#target"',
    );
    container.insertAdjacentHTML(
      'beforeend',
      '<div id="target" data-bind=\'{"type":"z"}\'></div>',
    );
    await Core.scan(container.querySelector('#target') as HTMLElement);
    await waitForDomSettled(6);

    await choose('c');
    expect(bindingOf(form)).toEqual({type: 'a'});
    expect(
      bindingOf(container.querySelector('#target') as HTMLElement),
    ).toEqual({type: 'z'});
  });

  it('data-change-fetch を宣言した手続きが止まった場合も、選んだ値をコミットし、取得はしない（回帰）', async () => {
    const fetchSpy = stubFetch('{}');
    const form = await mountSelect(
      'data-change-if="{{type === \'b\'}}" data-change-fetch="/api/x"',
    );

    await choose('c');
    expect(shown()).toBe('c');
    expect(bindingOf(form)).toEqual({type: 'c'});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('data-change-fetch-download を宣言した手続きが止まった場合も、選んだ値をコミットする（回帰）', async () => {
    // ダウンロードはバインド先を補わない（仕様「`data-fetch-download` /
    // `data-{event}-fetch-download`」の「応答をバインドしません」）ため、`-bind` を
    // 伴わない構成になる。それでも取得を伴う手続きなので例外に当たらない。
    const fetchSpy = stubFetch('x');
    const form = await mountSelect(
      'data-change-if="{{type === \'b\'}}" data-change-fetch="/api/x"' +
        ' data-change-fetch-download',
    );

    await choose('c');
    expect(bindingOf(form)).toEqual({type: 'c'});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('クリックの手続きが止まった場合は、フォームの値をコミットしない（対照）', async () => {
    // 止まってもコミットするのは入力欄の `change` / `input` だけである（仕様
    // 「双方向バインディングの自動更新」の「入力欄に置いた `data-change-*` /
    // `data-input-*` の手続きが（中略）止まった場合」）。ボタンの `data-click-form`
    // の収集はアクションなので、仕様「`data-{event}-if`」の「条件が偽のときは、
    // その手続きの以降のアクション（中略）をすべて実行しません」に従う。
    container.innerHTML =
      '<form id="f" data-bind=\'{"q":"old"}\'><input id="q" name="q"></form>' +
      '<button id="go" type="button" data-click-form="#f"' +
      ' data-click-if="{{false}}">go</button>';
    await Core.scan(container);
    await waitForDomSettled(6);
    const form = container.querySelector('#f') as HTMLElement;
    // `change` を伴わない代入（外部ライブラリなど）はバインドデータへ載っていない。
    (container.querySelector('#q') as HTMLInputElement).value = 'new';

    (container.querySelector('#go') as HTMLButtonElement).click();
    await waitForDomSettled(8);

    expect(bindingOf(form)).toEqual({q: 'old'});
  });
});

describe('取得を伴う入力欄の手続きと双方向コミット', () => {
  // 期待値は仕様「双方向バインディングの自動更新」の「**取得を伴う手続きでも、
  // フォームへのコミットは行います。** 入力欄に `data-change-fetch` /
  // `data-input-fetch` を置いた場合、応答のバインド（既定は自要素、
  // `data-{event}-bind` があればその先）とは別に、入力した値をフォームへ写します」
  // から取っている。修正前は、取得を伴う手続きではフォームへ写していなかった。
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  /**
   * HTML を走査し、描画の完了を待ちます。
   *
   * @param html コンテナの中の HTML
   */
  async function mount(html: string): Promise<void> {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled(6);
  }

  /**
   * 要素自身のバインドデータを返します。
   *
   * @param selector 対象のセレクタ
   * @returns バインドデータ
   */
  function bindingOf(selector: string): Record<string, unknown> | null {
    return (
      Fragment.get(container.querySelector(selector)!) as ElementFragment
    ).getRawBindingData();
  }

  /**
   * 選択欄で選び直して確定します。
   *
   * @param value 選ぶ値
   */
  async function choose(value: string): Promise<void> {
    const select = container.querySelector('#sel') as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(8);
  }

  it('data-change-fetch の入力欄で選んだ値をフォームへコミットし、取得も行う（回帰）', async () => {
    const fetchSpy = stubFetch('{"price":100}');
    await mount(
      '<form id="f" data-bind=\'{"type":"a"}\'>' +
        '<select id="sel" name="type" data-change-fetch="/api/x">' +
        '<option value="a">a</option><option value="c">c</option></select>' +
        '<span id="shown">{{type}}</span></form>',
    );

    await choose('c');

    expect(bindingOf('#f')).toEqual({type: 'c'});
    expect(container.querySelector('#shown')!.textContent).toBe('c');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('type=c');
    // 応答は既定どおり自要素へバインドする。
    expect(bindingOf('#sel')).toEqual({price: 100});
  });

  it('data-change-fetch と data-change-bind の入力欄では、応答をバインド先へ、選んだ値をフォームへ写す（回帰）', async () => {
    stubFetch('{"price":100}');
    await mount(
      '<form id="f" data-bind=\'{"type":"a"}\'>' +
        '<select id="sel" name="type" data-change-fetch="/api/x"' +
        ' data-change-bind="#target">' +
        '<option value="a">a</option><option value="c">c</option></select>' +
        '</form><div id="target" data-bind="{}"></div>',
    );

    await choose('c');

    expect(bindingOf('#f')).toEqual({type: 'c'});
    expect(bindingOf('#target')).toEqual({price: 100});
  });

  it('data-input-fetch の入力欄で打った値をフォームへコミットする（回帰）', async () => {
    stubFetch('{}');
    await mount(
      '<form id="f" data-bind=\'{"q":""}\'>' +
        '<input id="q" name="q" data-input-fetch="/api/x"></form>',
    );
    const input = container.querySelector('#q') as HTMLInputElement;

    input.focus();
    input.value = 'ab';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await waitForDomSettled(8);

    expect(bindingOf('#f')).toEqual({q: 'ab'});
  });

  it('data-change-before-run が取得を止めた場合は、フォームへ写さない', async () => {
    // 仕様「双方向バインディングの自動更新」の「`data-{event}-before-run` が止めた
    // 場合は、取得を伴わない手続きと同じく写しません」。
    const fetchSpy = stubFetch('{}');
    await mount(
      '<form id="f" data-bind=\'{"type":"a"}\'>' +
        '<select id="sel" name="type" data-change-fetch="/api/x"' +
        ' data-change-before-run="return false">' +
        '<option value="a">a</option><option value="c">c</option></select>' +
        '</form>',
    );

    await choose('c');

    expect(bindingOf('#f')).toEqual({type: 'a'});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ボタンの data-click-form と data-click-fetch は、収集値を送るだけでフォームへ写さない（対照）', async () => {
    // 仕様「双方向バインディングの自動更新」の「ボタンなど入力欄以外の手続き
    // （`data-click-form` と `data-click-fetch` など）は、収集値を送るだけでフォームへは
    // 写しません」。
    const fetchSpy = stubFetch('{}');
    await mount(
      '<form id="f" data-bind=\'{"q":"old"}\'><input id="q" name="q"></form>' +
        '<button id="go" type="button" data-click-form="#f"' +
        ' data-click-fetch="/api/x" data-click-bind="#out">go</button>' +
        '<div id="out" data-bind="{}"></div>',
    );
    // `change` を伴わない代入（外部ライブラリなど）はバインドデータへ載っていない。
    (container.querySelector('#q') as HTMLInputElement).value = 'new';

    (container.querySelector('#go') as HTMLButtonElement).click();
    await waitForDomSettled(8);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(bindingOf('#f')).toEqual({q: 'old'});
  });
});

/**
 * `fetch` を、決まった本文を JSON で返すスタブへ置き換えます。
 *
 * @param body 応答の本文
 * @returns スタブ
 */
function stubFetch(body: string) {
  const spy = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body, {headers: {'Content-Type': 'application/json'}}),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}
