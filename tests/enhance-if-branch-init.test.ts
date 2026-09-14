/* @vitest-environment jsdom */
/**
 * @fileoverview `data-if` の分岐の中にある要素へ、外部ライブラリ連携の `init` を呼ぶ
 * 時点を検証します。
 *
 * `data-if` が偽の分岐の中は、表示するまで描画も初期値の反映も行いません。それでも
 * 要素は DOM に残るため、連携の `init` が走査の最後に呼ばれ、`data-each` の雛形
 * （`{{p}}`）や初期値が入る前の選択を連携が取り込んでいました。表示の後も `init` は
 * やり直されませんでした（課題 55）。真の分岐の中でも、分岐の外の祖先のフォームが
 * 初期値を与える構成では、`init` が初期値の反映の前に呼ばれていました（同じ課題）。
 *
 * 期待値の根拠は仕様「`data-enhance`」と仕様「data-if の動作」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Haori from '../src/haori';
import {waitForIdle} from './helpers/async';

describe('data-if の分岐の中の連携の init', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let log: string[];
  let sequence = 0;

  beforeEach(() => {
    vi.restoreAllMocks();
    log = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    // リセットをボタンのクリックで起こすため起動する。
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
  });

  /**
   * 連携から見た `<select>` の状態を文字列にします。
   *
   * @param select 対象の `<select>`
   * @returns 選択肢と選択値
   */
  const describeSelect = (select: HTMLSelectElement): string =>
    `[${Array.from(select.options)
      .map(option => option.value)
      .join(',')}]=${select.value}`;

  /**
   * 呼び出しを記録する連携の名前を作ります（登録はしません）。
   *
   * @returns 連携の名前
   */
  const nextName = (): string => {
    sequence += 1;
    return `branch-recorder-${sequence}`;
  };

  /**
   * 呼び出しを記録する連携を登録します。
   *
   * @param name 連携の名前
   * @returns 戻り値はありません。
   */
  const register = (name: string): void => {
    Haori.enhancers.register(name, {
      init(element) {
        log.push(`init:${describeSelect(element as HTMLSelectElement)}`);
        return {};
      },
      refresh(element) {
        log.push(`refresh:${describeSelect(element as HTMLSelectElement)}`);
      },
    });
  };

  /**
   * 記録のうち `init` だけを返します。
   *
   * @returns `init` の記録
   */
  const inits = (): string[] => log.filter(entry => entry.startsWith('init:'));

  /**
   * 指定した HTML を走査して待ち合わせます。
   *
   * @param html 走査する HTML
   * @returns 走査の完了 Promise
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForIdle();
  };

  /**
   * バインドデータを与えて待ち合わせます。
   *
   * @param selector バインド先の要素のセレクタ
   * @param data 与えるバインドデータ
   * @returns 反映の完了 Promise
   */
  const bind = async (
    selector: string,
    data: Record<string, unknown>,
  ): Promise<void> => {
    await Core.setBindingData(
      container.querySelector(selector) as HTMLElement,
      data,
    );
    await waitForIdle();
  };

  it('偽の分岐の中で data-each が描く select は、表示して初期値が入った後に init が呼ばれる', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <div id="host" data-bind='{"show":false,"plans":["a","b"]}'>
        <div data-if="show">
          <form data-bind='{"plan":"b"}'>
            <select name="plan" data-enhance="${name}" data-each="plans" data-each-arg="p">
              <option value="{{p}}">{{p}}</option>
            </select>
          </form>
        </div>
      </div>`);

    // 仕様「`data-enhance`」の「`data-if` が偽の分岐の中の要素には、`init` を
    // 呼びません」。
    expect(log).toEqual([]);

    await bind('#host', {show: true, plans: ['a', 'b']});

    // 仕様「`data-enhance`」の「分岐が表示へ切り替わったら、分岐の中の描画
    // （`data-if` と `data-each` を同じ要素へ宣言した場合は行の描画）と初期値の反映が
    // 済んでから `init` を呼びます」。
    expect(log[0]).toBe('init:[a,b]=b');
    // 仕様「`data-enhance`」の「適用は**要素ごと・名前ごとに一度だけ**です」。表示の
    // 後に呼び直すのではなく、表示の後の 1 回だけになる。
    expect(inits()).toHaveLength(1);
  });

  it('偽の分岐の中の静的な選択肢でも、表示の後に初期値の入った状態で init が呼ばれる', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <div id="host" data-bind='{"show":false}'>
        <div data-if="show">
          <form data-bind='{"plan":"b"}'>
            <select name="plan" data-enhance="${name}">
              <option value="a">a</option>
              <option value="b">b</option>
            </select>
          </form>
        </div>
      </div>`);
    expect(log).toEqual([]);

    await bind('#host', {show: true});

    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('data-if を宣言した select 自身にも、表示するまで init を呼ばない', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <div id="host" data-bind='{"show":false}'>
        <form data-bind='{"plan":"b"}'>
          <select name="plan" data-if="show" data-enhance="${name}">
            <option value="a">a</option>
            <option value="b">b</option>
          </select>
        </form>
      </div>`);

    // 仕様「`data-enhance`」の「`data-if` を宣言した要素自身も含みます」。仕様
    // 「data-if の動作」の「自要素と配下の要素へ … `init` を呼ばない」。
    expect(log).toEqual([]);

    await bind('#host', {show: true});

    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('data-if と data-each を同じ select に宣言した場合も、行の描画と初期値の反映の後に init が呼ばれる', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <div id="host" data-bind='{"show":false,"plans":["a","b"]}'>
        <form data-bind='{"plan":"b"}'>
          <select name="plan" data-if="show" data-enhance="${name}"
            data-each="plans" data-each-arg="p">
            <option value="{{p}}">{{p}}</option>
          </select>
        </form>
      </div>`);
    expect(log).toEqual([]);

    await bind('#host', {show: true, plans: ['a', 'b']});

    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('表示と同じ更新で与えた値も、選択肢へ載ってから init が呼ばれる', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <form id="host" data-bind='{"show":false,"plan":"a","plans":["a","b"]}'>
        <div data-if="show">
          <select name="plan" data-enhance="${name}" data-each="plans" data-each-arg="p">
            <option value="{{p}}">{{p}}</option>
          </select>
        </div>
      </form>`);
    expect(log).toEqual([]);

    await bind('#host', {show: true, plan: 'b', plans: ['a', 'b']});

    // 仕様「`data-enhance`」の「表示と同じ更新で与えた値も、`data-each` が描いた
    // 選択肢へ載ってから呼びます」。
    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('入れ子の data-if では、内側が表示されるまで init を呼ばない', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <div id="host" data-bind='{"outer":false,"inner":false}'>
        <div data-if="outer">
          <div data-if="inner">
            <form data-bind='{"plan":"b"}'>
              <select name="plan" data-enhance="${name}">
                <option value="a">a</option>
                <option value="b">b</option>
              </select>
            </form>
          </div>
        </div>
      </div>`);
    expect(log).toEqual([]);

    await bind('#host', {outer: true, inner: false});
    expect(log).toEqual([]);

    await bind('#host', {outer: true, inner: true});

    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('走査の後に登録しても、非表示のあいだは遡って適用しない', async () => {
    const name = nextName();
    await mount(`
      <div id="host" data-bind='{"show":false}'>
        <div data-if="show">
          <form data-bind='{"plan":"b"}'>
            <select name="plan" data-enhance="${name}">
              <option value="a">a</option>
              <option value="b">b</option>
            </select>
          </form>
        </div>
      </div>`);

    register(name);
    await waitForIdle();

    // 仕様「`data-enhance`」の「初期スキャン、後から追加されたノード、`data-each` の
    // 新規行、`register()` の遡り、フォームのリセットのどの契機でも同じです」。
    expect(log).toEqual([]);

    await bind('#host', {show: true});

    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('表示の前にフォームをリセットしても、非表示のあいだは init を呼ばない', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <form id="host" data-bind='{"show":false,"plans":["a","b"],"plan":"b"}'>
        <div data-if="show">
          <select name="plan" data-enhance="${name}" data-each="plans" data-each-arg="p">
            <option value="{{p}}">{{p}}</option>
          </select>
        </div>
      </form>
      <button id="clear" data-click-reset="#host">クリア</button>`);
    expect(log).toEqual([]);

    (container.querySelector('#clear') as HTMLElement).click();
    await waitForIdle();
    expect(log).toEqual([]);

    await bind('#host', {show: true, plans: ['a', 'b'], plan: 'b'});

    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('data-if と data-each を同じ select に宣言し、表示の前にリセットしても、初期値の入った状態で init が呼ばれる', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <form id="host" data-bind='{"show":false,"plans":["a","b"],"plan":"b"}'>
        <select name="plan" data-if="show" data-enhance="${name}"
          data-each="plans" data-each-arg="p">
          <option value="{{p}}">{{p}}</option>
        </select>
      </form>
      <button id="clear" data-click-reset="#host">クリア</button>`);

    (container.querySelector('#clear') as HTMLElement).click();
    await waitForIdle();
    expect(log).toEqual([]);

    await bind('#host', {show: true, plans: ['a', 'b'], plan: 'b'});

    // リセットは初期 `data-bind` の `plan: "b"` へ戻し、表示の更新も `b` を与える。
    // 仕様「`data-enhance`」の「表示と同じ更新で与えた値も、`data-each` が描いた
    // 選択肢へ載ってから呼びます」。
    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('行の中の偽の分岐でも、表示の後に init が呼ばれる', async () => {
    const name = nextName();
    register(name);
    const row = `
      <div>
        <div data-if="r.show">
          <form data-bind='{"plan":"b"}'>
            <select name="plan" data-enhance="${name}">
              <option value="a">a</option>
              <option value="b">b</option>
            </select>
          </form>
        </div>
      </div>`;
    await mount(`
      <div id="host" data-bind='{"rows":[{"show":false}]}'>
        <div data-each="rows" data-each-arg="r">${row}</div>
      </div>`);
    expect(log).toEqual([]);

    await bind('#host', {rows: [{show: false}, {show: false}]});
    expect(log).toEqual([]);

    await bind('#host', {rows: [{show: true}, {show: true}]});

    expect(inits()).toEqual(['init:[a,b]=b', 'init:[a,b]=b']);
  });

  it('非表示の分岐へ後から足した要素にも、表示の後に init が呼ばれる（対照）', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <div id="host" data-bind='{"show":true}'>
        <div id="branch" data-if="show"><span>x</span></div>
      </div>`);
    await bind('#host', {show: false});

    container
      .querySelector('#branch')!
      .insertAdjacentHTML(
        'beforeend',
        `<select data-enhance="${name}"><option value="a">a</option>` +
          '<option value="b" selected>b</option></select>',
      );
    await waitForIdle();
    expect(log).toEqual([]);

    await bind('#host', {show: true});

    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });

  it('data-enhance-new も、偽の分岐の中では表示の後に new する', async () => {
    const constructed: string[] = [];
    const global = globalThis as Record<string, unknown>;
    global.__haoriIfBranchNew = class {
      /**
       * 呼ばれた時点の表示状態と値を控えます。
       *
       * @param element 対象要素
       */
      constructor(element: HTMLElement) {
        constructed.push(describeSelect(element as HTMLSelectElement));
      }
    };
    try {
      await mount(`
        <div id="host" data-bind='{"show":false}'>
          <div data-if="show">
            <form data-bind='{"plan":"b"}'>
              <select name="plan" data-enhance-new="__haoriIfBranchNew">
                <option value="a">a</option>
                <option value="b">b</option>
              </select>
            </form>
          </div>
        </div>`);

      // 仕様「`data-enhance-new`」の「`data-if` が偽の分岐の中の要素には、
      // `data-enhance` の `init` と同じく `new` を呼びません」。
      expect(constructed).toEqual([]);

      await bind('#host', {show: true});

      expect(constructed).toEqual(['[a,b]=b']);
    } finally {
      delete global.__haoriIfBranchNew;
    }
  });

  it('真の分岐の中でも、分岐の外のフォームが与える初期値の反映の後に init が呼ばれる', async () => {
    const name = nextName();
    register(name);
    await mount(`
      <form data-bind='{"show":true,"plan":"b","plans":["a","b"]}'>
        <div data-if="show">
          <select name="plan" data-enhance="${name}" data-each="plans" data-each-arg="p">
            <option value="{{p}}">{{p}}</option>
          </select>
        </div>
      </form>`);

    // 仕様「`data-enhance`」の「分岐の外の祖先のフォームが初期値を与える場合も、
    // その反映の後に呼びます」。
    expect(log[0]).toBe('init:[a,b]=b');
    expect(inits()).toHaveLength(1);
  });
});
