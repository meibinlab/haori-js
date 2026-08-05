/* @vitest-environment jsdom */
/**
 * @fileoverview 送信中に同名チェックボックス群を操作したときの保護の検証。
 *
 * 期待値の根拠は仕様「反映待ちの間に起きた変化」の「**同名チェックボックス・ラジオの
 * 群は、欄ごとではなく群単位で保護します**」「群のいずれかの欄が要求より後に操作されて
 * いれば、その群の現在の選択集合をそのまま保護します」。集合の形は仕様「同名
 * チェックボックス・ラジオの収集値の形」による。
 *
 * 失敗の形は「フェッチ中にチェックを操作すると、応答の反映で選択が壊れる」。応答を
 * 保留したまま操作するため、fetch は解決関数を控えるモックにする（ネットワークの
 * 遅延を模したもので、内部メソッドを直接呼ぶ人工的な状態は作らない）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {nextTask, waitForIdle} from './helpers/async';

describe('送信中のチェックボックス群の保護', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let pending: ((response: Response) => void)[];

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    pending = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          pending.push(resolve);
        }) as unknown as Promise<Response>,
    );
  });

  afterEach(async () => {
    pending.forEach(resolve =>
      resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ),
    );
    await waitForIdle();
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  /**
   * 保存ボタンを備えたチェックボックス群のフォームを用意します。
   *
   * @param listAttribute `data-form-list` を併記するかどうか
   * @returns 用意した要素
   */
  const setup = async (
    listAttribute: boolean,
  ): Promise<{
    form: HTMLFormElement;
    boxes: HTMLInputElement[];
    save: HTMLButtonElement;
  }> => {
    const list = listAttribute ? ' data-form-list' : '';
    container.innerHTML = `
      <form id="f" data-bind='{"hobby":["a","c"]}'>
        <input type="checkbox" name="hobby" value="a"${list} checked>
        <input type="checkbox" name="hobby" value="b"${list}>
        <input type="checkbox" name="hobby" value="c"${list} checked>
        <button type="button" id="save" data-click-fetch="/save"
                data-click-method="post" data-click-bind="#f">保存</button>
      </form>`;
    await Core.scan(container);
    await waitForIdle();
    return {
      form: container.querySelector('#f') as HTMLFormElement,
      boxes: Array.from(
        container.querySelectorAll('input'),
      ) as HTMLInputElement[],
      save: container.querySelector('#save') as HTMLButtonElement,
    };
  };

  /**
   * 現在チェックされている値を返します。
   *
   * @param boxes 対象のチェックボックス
   * @returns チェック済みの value の配列
   */
  const checkedValues = (boxes: HTMLInputElement[]): string[] =>
    boxes.filter(box => box.checked).map(box => box.value);

  /**
   * 応答を返して反映を待ちます。
   *
   * @param body 応答の本体
   */
  const respond = async (body: string): Promise<void> => {
    const resolve = pending.shift();
    expect(resolve, 'フェッチが飛んでいない').toBeTruthy();
    resolve!(
      new Response(body, {headers: {'Content-Type': 'application/json'}}),
    );
    await waitForIdle();
  };

  it('送信中に追加したチェックが応答の反映で消えない（data-form-list）', async () => {
    const {form, boxes, save} = await setup(true);

    save.click();
    await nextTask();

    // 応答待ちの間に b を追加する。
    boxes[1].click();

    // サーバは送信時点の値（a と c）をそのまま返す。
    await respond('{"hobby":["a","c"]}');

    expect(checkedValues(boxes)).toEqual(['a', 'b', 'c']);
    expect(Core.getBindingData(form)).toEqual({hobby: ['a', 'b', 'c']});
  });

  it('送信中に外したチェックが応答の反映で復活しない（data-form-list）', async () => {
    const {form, boxes, save} = await setup(true);

    save.click();
    await nextTask();

    // 応答待ちの間に a を外す。
    boxes[0].click();

    await respond('{"hobby":["a","c"]}');

    expect(checkedValues(boxes)).toEqual(['c']);
    expect(Core.getBindingData(form)).toEqual({hobby: ['c']});
  });

  it('宣言なしの群でも送信中に追加したチェックが消えない', async () => {
    const {form, boxes, save} = await setup(false);

    save.click();
    await nextTask();

    boxes[1].click();

    await respond('{"hobby":["a","c"]}');

    expect(checkedValues(boxes)).toEqual(['a', 'b', 'c']);
    expect(Core.getBindingData(form)).toEqual({hobby: ['a', 'b', 'c']});
  });

  it('宣言なしの群で選択を 0 個にした操作も保護される', async () => {
    const {form, boxes, save} = await setup(false);

    save.click();
    await nextTask();

    // 応答待ちの間にすべて外す。
    boxes[0].click();
    boxes[2].click();

    await respond('{"hobby":["a","c"]}');

    expect(checkedValues(boxes)).toEqual([]);
    // 仕様「同名チェックボックス・ラジオの収集値の形」の `name` のみの行:
    // チェック 0 個は `null`。
    expect(Core.getBindingData(form)).toEqual({hobby: null});
  });

  describe('群の範囲', () => {
    /**
     * 任意のフォームを用意します。
     *
     * @param inner フォームの中身（保存ボタンは自動で足す）
     * @param bind フォームの `data-bind` の JSON
     * @returns 用意した要素
     */
    const mount = async (
      inner: string,
      bind: string,
    ): Promise<{
      form: HTMLFormElement;
      boxes: HTMLInputElement[];
      save: HTMLButtonElement;
    }> => {
      container.innerHTML = `
        <form id="f" data-bind='${bind}'>
          ${inner}
          <button type="button" id="save" data-click-fetch="/save"
                  data-click-method="post" data-click-bind="#f">保存</button>
        </form>`;
      await Core.scan(container);
      await waitForIdle();
      return {
        form: container.querySelector('#f') as HTMLFormElement,
        boxes: Array.from(
          container.querySelectorAll('input'),
        ) as HTMLInputElement[],
        save: container.querySelector('#save') as HTMLButtonElement,
      };
    };

    it('別の行の同名の群は巻き込まない', async () => {
      // 仕様「反映待ちの間に起きた変化」の「群の範囲は、収集値の同じ階層です」
      // 「別の行や別の `data-form-object` の同名の欄は、収集値では別のキーなので群に
      // 含めません」。
      const {form, boxes, save} = await mount(
        `<div data-form-list="rows">
           <div>
             <input type="checkbox" name="tag" value="a" data-form-list checked>
             <input type="checkbox" name="tag" value="x" data-form-list>
           </div>
           <div>
             <input type="checkbox" name="tag" value="b" data-form-list checked>
             <input type="checkbox" name="tag" value="y" data-form-list>
           </div>
         </div>`,
        '{"rows":[{"tag":["a"]},{"tag":["b"]}]}',
      );

      save.click();
      await nextTask();

      // 応答待ちの間に 1 行目の x だけを追加する。
      boxes[1].click();

      // サーバは送信時点の値をそのまま返す。
      await respond('{"rows":[{"tag":["a"]},{"tag":["b"]}]}');

      expect(checkedValues(boxes)).toEqual(['a', 'x', 'b']);
      expect(Core.getBindingData(form)).toEqual({
        rows: [{tag: ['a', 'x']}, {tag: ['b']}],
      });
    });

    it('入れ子の data-form-object の同名の群は巻き込まない', async () => {
      const {form, boxes, save} = await mount(
        `<input type="checkbox" name="hobby" value="a" data-form-list checked>
         <input type="checkbox" name="hobby" value="z" data-form-list>
         <div data-form-object="inner">
           <input type="checkbox" name="hobby" value="b" data-form-list checked>
         </div>`,
        '{"hobby":["a"],"inner":{"hobby":["b"]}}',
      );

      save.click();
      await nextTask();

      // 応答待ちの間に外側の z だけを追加する。
      boxes[1].click();

      await respond('{"hobby":["a"],"inner":{"hobby":["b"]}}');

      expect(checkedValues(boxes)).toEqual(['a', 'z', 'b']);
      expect(Core.getBindingData(form)).toEqual({
        hobby: ['a', 'z'],
        inner: {hobby: ['b']},
      });
    });

    it('入れ子の群の操作は外側のキーを保護しない', async () => {
      // 内側だけを操作したときに外側のキーまで「操作された」と数えると、応答が返した
      // 外側の値が捨てられる（過剰な保護）。
      const {form, boxes, save} = await mount(
        `<input type="checkbox" name="hobby" value="a" data-form-list checked>
         <input type="checkbox" name="hobby" value="srv" data-form-list>
         <div data-form-object="inner">
           <input type="checkbox" name="hobby" value="b" data-form-list checked>
         </div>`,
        '{"hobby":["a"],"inner":{"hobby":["b"]}}',
      );

      save.click();
      await nextTask();

      // 応答待ちの間に内側の b を外す。
      boxes[2].click();

      // サーバは外側へ値を足して返す。外側は操作されていないので応答が権威。
      await respond('{"hobby":["a","srv"],"inner":{"hobby":["b"]}}');

      expect(checkedValues(boxes)).toEqual(['a', 'srv']);
      expect(Core.getBindingData(form)).toEqual({
        hobby: ['a', 'srv'],
        inner: {hobby: []},
      });
    });

    it('data-form-detach 配下の同名の欄は群に含めない', async () => {
      // 仕様「反映待ちの間に起きた変化」の「収集の対象外である部分木の欄も群に
      // 含めません」。
      const {form, boxes, save} = await mount(
        `<input type="checkbox" name="hobby" value="a" data-form-list checked>
         <input type="checkbox" name="hobby" value="z" data-form-list>
         <div data-form-detach>
           <input type="checkbox" name="hobby" value="det" data-form-list checked>
         </div>`,
        '{"hobby":["a"]}',
      );

      save.click();
      await nextTask();

      boxes[1].click();

      await respond('{"hobby":["a"]}');

      expect(Core.getBindingData(form)).toEqual({hobby: ['a', 'z']});
    });

    it('非表示分岐の中の同名の欄は群に含めない', async () => {
      // 仕様「反映待ちの間に起きた変化」の「収集の対象外である部分木の欄も群に
      // 含めません」。非表示分岐の欄は DOM に残り、バインドデータに値があれば
      // チェックも付く（収集からは外れる）。
      const {form, boxes, save} = await mount(
        `<input type="checkbox" name="hobby" value="a" data-form-list checked>
         <input type="checkbox" name="hobby" value="z" data-form-list>
         <div data-if="show">
           <input type="checkbox" name="hobby" value="hidden" data-form-list>
         </div>`,
        '{"hobby":["a","hidden"],"show":false}',
      );

      // 非表示分岐の欄はバインドデータの値でチェックが付くが、収集はされない。
      expect(boxes[2].checked).toBe(true);

      save.click();
      await nextTask();

      boxes[1].click();

      // サーバは送信時点の値（収集された a のみ）と条件のキーをそのまま返す。
      await respond('{"hobby":["a"],"show":false}');

      expect(Core.getBindingData(form)).toEqual({
        hobby: ['a', 'z'],
        show: false,
      });
    });

    it('data-form-name で宣言した別のキーの群は巻き込まない', async () => {
      // 仕様「反映待ちの間に起きた変化」の「群の同一性は**収集キー**で判断します」。
      // `name` 属性を持たないため、DOM の `name` で数えると別のキーの群と混ざる。
      const {form, boxes, save} = await mount(
        `<input type="checkbox" data-form-name="k1" value="a" data-form-list checked>
         <input type="checkbox" data-form-name="k1" value="a2" data-form-list>
         <input type="checkbox" data-form-name="k2" value="b" data-form-list checked>`,
        '{"k1":["a"],"k2":["b"]}',
      );

      save.click();
      await nextTask();

      // 応答待ちの間に k1 の a2 だけを追加する。
      boxes[1].click();

      await respond('{"k1":["a"],"k2":["b"]}');

      expect(Core.getBindingData(form)).toEqual({
        k1: ['a', 'a2'],
        k2: ['b'],
      });
    });

    it('別のフォームの同名の群は巻き込まない', async () => {
      // 仕様「反映待ちの間に起きた変化」の「最近傍のフォーム（`<form>` または
      // `data-form`）のうち最も内側の範囲です」。同じ画面に同名の群を持つフォームが
      // 2 つある構成で、一方の操作が他方の選択を持ち込んではならない。
      container.innerHTML = `
        <form id="f" data-bind='{"hobby":["a"]}'>
          <input type="checkbox" name="hobby" value="a" data-form-list checked>
          <input type="checkbox" name="hobby" value="z" data-form-list>
          <button type="button" id="save" data-click-fetch="/save"
                  data-click-method="post" data-click-bind="#f">保存</button>
        </form>
        <form id="other" data-bind='{"hobby":["other"]}'>
          <input type="checkbox" name="hobby" value="other" data-form-list checked>
        </form>`;
      await Core.scan(container);
      await waitForIdle();
      const form = container.querySelector('#f') as HTMLFormElement;
      const save = container.querySelector('#save') as HTMLButtonElement;
      const boxes = Array.from(
        form.querySelectorAll('input'),
      ) as HTMLInputElement[];

      save.click();
      await nextTask();

      boxes[1].click();

      await respond('{"hobby":["a"]}');

      expect(Core.getBindingData(form)).toEqual({hobby: ['a', 'z']});
    });

    it('data-form-list に属性値を書いた群でも保護される', async () => {
      // `data-form-list` は入力要素では属性値を省略できる（省略しない書き方も同じ
      // 意味）。値の有無で「階層を作るコンテナ」と誤って扱うと、欄そのものが群から
      // 外れて保護が効かなくなる。
      const {form, boxes, save} = await mount(
        `<input type="checkbox" name="hobby" value="a" data-form-list="hobby" checked>
         <input type="checkbox" name="hobby" value="b" data-form-list="hobby">`,
        '{"hobby":["a"]}',
      );

      save.click();
      await nextTask();

      boxes[1].click();

      await respond('{"hobby":["a"]}');

      expect(checkedValues(boxes)).toEqual(['a', 'b']);
      expect(Core.getBindingData(form)).toEqual({hobby: ['a', 'b']});
    });

    it('ラジオボタンの選択も群単位で保護される', async () => {
      // 仕様「反映待ちの間に起きた変化」は「同名チェックボックス・ラジオの群」を
      // 対象とする。ラジオは排他制御で他の欄が未チェックへ変わるため、操作した欄
      // だけを見ても集合は壊れない（群単位の収集でも同じ結果になることの確認）。
      const {form, boxes, save} = await mount(
        `<input type="radio" name="plan" value="basic" checked>
         <input type="radio" name="plan" value="pro">`,
        '{"plan":"basic"}',
      );

      save.click();
      await nextTask();

      // 応答待ちの間に pro へ切り替える。
      boxes[1].click();

      await respond('{"plan":"basic"}');

      expect(checkedValues(boxes)).toEqual(['pro']);
      expect(Core.getBindingData(form)).toEqual({plan: 'pro'});
    });
  });
});
