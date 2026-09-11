/* @vitest-environment jsdom */
/**
 * @fileoverview `data-external` の配下のフラグメント木が、要素の移動・付け直しと
 * 初期表示で外部ライブラリの生成 DOM を取り込まないことの検証（課題 #42・#43）。
 *
 * 初期表示の再現: `src/observer.ts` は読み込まれた時点で初期化を始めるため、jsdom で
 * `document.body` を差し替えてから初期化し直しても、`<body>` の断片は最初の走査の
 * ものが残り、ブラウザの初期表示とは別の木になります。そこで試験ごとにモジュールを
 * 読み込み直し、ブラウザと同じ順（解析中に `<head>` のスクリプトが登録する →
 * `<body>` が解析される → `DOMContentLoaded` で初期化する）を再現します。
 *
 * モジュールを読み込み直すため、待機は読み込み直した `Queue` で行います
 * （`tests/helpers/async.ts` の待機は別インスタンスの `Queue` を見るため使えません。
 * 同じ理由で、不変条件の自動検査はこのファイルでは走りません）。
 *
 * 初期化の最後の全要素の走査が生成コンテナの断片を作る経路（設計書の T3）を、この
 * 再現で jsdom でも起こせるかは、実装工程の規則 3 の確認（足した行を外して落ちるか）で
 * 確かめます。実ブラウザでの見張りは `playwright/external-subtree.spec.cjs` が担います。
 *
 * 修正前（0.48.0）に落ちるのは 26 件のうち 13 件です（移動と付け直しの 8 件、`<head>`
 * 内で登録した連携が初期スキャン中に起こした変更の 4 件、`data-each` が選択肢を描く
 * `select` の移動の 1 件）。残る 13 件は、同じ規則を破りうる入口を網にするための
 * 見張りで、修正前も通ります（回帰テストの件数には数えません）。このうち、要素を
 * 動かす連携と入力欄を包む連携の 2 件は、初期スキャン中の取り込みを絞る前の途中の
 * 実装で落ちることを確認しています。
 *
 * 期待値の根拠は仕様「`data-external`」、仕様「`data-enhance`」、仕様「`data-bind`」。
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {ElementFragment} from '../src/fragment';

/** 読み込み直した Haori のモジュール */
type HaoriModule = typeof import('../src/index');

/** 読み込み直した監視のクラス */
type ObserverClass = typeof import('../src/observer').Observer;

/** 初期化を済ませたページ */
interface LoadedPage {
  /** 読み込み直した Haori のモジュール */
  mod: HaoriModule;
  /** 読み込み直した監視のクラス（後始末に使う） */
  observer: ObserverClass;
}

/** 試験の後始末の対象 */
let loaded: LoadedPage | null = null;

/**
 * 読み込み直した `Queue` で、監視の通知とキューの処理が落ち着くまで待ちます。
 *
 * `MutationObserver` の通知はマイクロタスクで届くため、タスク境界を挟みます。
 *
 * @param mod 読み込み直した Haori のモジュール
 * @returns 待機完了の Promise
 */
async function settle(mod: HaoriModule): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await mod.Queue.waitForIdle();
  }
}

/**
 * ブラウザの読み込みと同じ順でページを用意し、初期化の完了まで待ちます。
 *
 * @param options 置き場所（`head` は `<body>` の解析より前に登録、`body` は解析後・
 *     初期化前に登録）、マークアップ、登録処理
 * @returns 初期化を済ませたページ
 */
async function load(options: {
  placement: 'head' | 'body';
  markup: string;
  register: (mod: HaoriModule) => void;
}): Promise<LoadedPage> {
  vi.resetModules();
  document.body.innerHTML = '';
  document.body.removeAttribute('data-haori-ready');
  // 解析中に読み込まれた状態にする（`src/observer.ts` は `DOMContentLoaded` を待つ）。
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => 'loading',
  });
  let mod: HaoriModule;
  let observer: ObserverClass;
  try {
    mod = await import('../src/index');
    observer = (await import('../src/observer')).Observer;
    if (options.placement === 'head') {
      options.register(mod);
      document.body.innerHTML = options.markup;
    } else {
      document.body.innerHTML = options.markup;
      options.register(mod);
    }
  } finally {
    Reflect.deleteProperty(document, 'readyState');
  }
  loaded = {mod, observer};
  const ready = new Promise<void>(resolve => {
    document.addEventListener('haori:ready', () => resolve(), {once: true});
  });
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await ready;
  await settle(mod);
  return loaded;
}

/**
 * フォームの収集値を返します。
 *
 * @param page 初期化を済ませたページ
 * @param selector フォームのセレクタ
 * @returns 収集値
 */
function collect(page: LoadedPage, selector: string): Record<string, unknown> {
  const form = document.querySelector<HTMLElement>(selector)!;
  return page.mod.Form.getValues(
    page.mod.Fragment.get(form) as ElementFragment,
  );
}

/**
 * Choices.js と同じ形で DOM を生成する連携を作ります。
 *
 * 元の要素を生成コンテナの内側へ移し、名前付きの絞り込み入力を足します。
 * `restores` のときは、Choices.js の `destroy` と同じく元の要素を戻して生成 DOM を
 * 取り除きます。
 *
 * @param events `init` / `destroy` の呼び出しを順に記録する配列
 * @param restores `destroy` で DOM を元に戻すかどうか
 * @returns 連携の定義
 */
function choicesLike(
  events: string[],
  restores: boolean,
): {
  init: (element: HTMLElement) => unknown;
  destroy?: (element: HTMLElement) => void;
} {
  const definition: {
    init: (element: HTMLElement) => unknown;
    destroy?: (element: HTMLElement) => void;
  } = {
    init(element) {
      events.push('init');
      const outer = document.createElement('div');
      outer.className = 'choices';
      const inner = document.createElement('div');
      inner.className = 'choices__inner';
      element.parentNode!.insertBefore(outer, element);
      outer.appendChild(inner);
      inner.appendChild(element);
      const search = document.createElement('input');
      search.type = 'search';
      search.name = 'search_terms';
      inner.appendChild(search);
      return {};
    },
  };
  if (restores) {
    definition.destroy = element => {
      events.push('destroy');
      const outer = element.closest('.choices');
      if (outer) {
        outer.parentNode!.insertBefore(element, outer);
        outer.remove();
      }
    };
  }
  return definition;
}

/**
 * 移動の試験に使うマークアップを返します。
 *
 * @param compact 空白のテキストノードを除くかどうか
 * @returns マークアップ
 */
function moveMarkup(compact: boolean): string {
  const markup = `
    <div id="park"></div>
    <form id="f1">
      <input name="keep" value="1">
      <div id="ext" data-external>
        <select name="plan" data-enhance="choices-like"><option value="p1" selected>p1</option></select>
      </div>
      <div id="slot"></div>
    </form>`;
  return compact ? markup.replace(/>\s+</g, '><').trim() : markup;
}

afterEach(() => {
  if (loaded !== null) {
    // 読み込み直したインスタンスの監視を止める（次の試験の DOM を処理させない）。
    const observers = (
      loaded.observer as unknown as {_mutationObservers: MutationObserver[]}
    )._mutationObservers;
    observers.forEach(observer => observer.disconnect());
    loaded.observer.getDispatcher()?.stop();
    loaded = null;
  }
  document.body.innerHTML = '';
  document.body.removeAttribute('data-haori-ready');
  vi.restoreAllMocks();
  vi.resetModules();
});

/** 移動の操作。いずれも利用側スクリプトが実際に行える DOM 操作で起こします。 */
const MOVES: Array<{label: string; run: (page: LoadedPage) => Promise<void>}> =
  [
    {
      label: 'data-external の要素を同じタスク内で移動する',
      run: async () => {
        document
          .getElementById('slot')!
          .appendChild(document.getElementById('ext')!);
      },
    },
    {
      label: 'フォーム全体を同じタスク内で移動する',
      run: async () => {
        document
          .getElementById('park')!
          .appendChild(document.getElementById('f1')!);
      },
    },
    {
      label: 'data-external の要素を外し、別のタスクで付け直す',
      run: async page => {
        const ext = document.getElementById('ext')!;
        const parent = ext.parentNode!;
        ext.remove();
        await settle(page.mod);
        parent.appendChild(ext);
      },
    },
  ];

describe('data-external の要素の移動と付け直し', () => {
  for (const restores of [true, false]) {
    for (const compact of [false, true]) {
      for (const move of MOVES) {
        const variant =
          `${restores ? 'destroy で DOM を戻す連携' : 'destroy の無い連携'}・` +
          `${compact ? '空白ノードなし' : '空白ノードあり'}`;
        it(`${variant}: ${move.label}と、書いた入力は収集され生成した入力は載らない`, async () => {
          const events: string[] = [];
          const page = await load({
            placement: 'head',
            markup: moveMarkup(compact),
            register: mod => {
              mod.enhancers.register(
                'choices-like',
                choicesLike(events, restores),
              );
            },
          });
          const eventsBefore = events.length;

          await move.run(page);
          await settle(page.mod);

          // 仕様「`data-enhance`」の契機の表（DOM から外れたときは destroy、後から
          // 追加されたノードは init）と、同節の「`data-external` の要素ごと移動した
          // 場合も、… `destroy` の後に `init` が呼ばれます」。destroy の無い連携では
          // init だけが呼ばれる。
          expect(events.slice(eventsBefore)).toEqual(
            restores ? ['destroy', 'init'] : ['init'],
          );
          // 仕様「`data-external`」の「`data-external` の要素ごと移動しても、配下の
          // 書いた要素は移動の後も収集する」「付け直した場合も、配下は走査した時点の
          // 構成のまま扱う」。生成した search_terms は載らない。
          expect(collect(page, '#f1')).toEqual({keep: '1', plan: 'p1'});
        });
      }
    }
  }
});

describe('data-external の要素を別の親の配下へ移したとき', () => {
  it('配下の宣言は移動先の親のバインドデータで評価され、書いた入力は移動先のフォームで収集される', async () => {
    const page = await load({
      placement: 'head',
      markup: `
        <div data-bind='{"label":"A"}'>
          <form id="f1">
            <div id="ext" data-external>
              <span class="label">{{label}}</span>
              <select name="plan"><option value="p1" selected>p1</option></select>
            </div>
          </form>
        </div>
        <div data-bind='{"label":"B"}'>
          <form id="f2"><div id="slot"></div></form>
        </div>`,
      register: () => undefined,
    });
    expect(document.querySelector('.label')!.textContent).toBe('A');

    document
      .getElementById('slot')!
      .appendChild(document.getElementById('ext')!);
    await settle(page.mod);

    // 仕様「`data-bind`」の「親要素のバインディングデータと結合されます」。移動の後は、
    // 移動先の親のデータで評価される（内部の木を保ったまま付け直しても古いデータを
    // 引きずらない）。
    expect(document.querySelector('.label')!.textContent).toBe('B');
    // 仕様「`data-external`」の「`data-external` の要素ごと移動しても、配下の書いた
    // 要素は移動の後も収集する」。移動元のフォームからは外れる。
    expect(collect(page, '#f2')).toEqual({plan: 'p1'});
    expect(collect(page, '#f1')).toEqual({});
  });
});

describe('初期スキャン中に連携が起こした DOM の変更', () => {
  for (const placement of ['head', 'body'] as const) {
    it(`<${placement}> 内で登録した連携が init で生成した data-each の行は、初期化の完了時点で描画済み`, async () => {
      let atReady: string[] | null = null;
      document.addEventListener(
        'haori:ready',
        () => {
          atReady = Array.from(document.querySelectorAll('.gen-list li')).map(
            item => item.textContent ?? '',
          );
        },
        {once: true},
      );

      await load({
        placement,
        markup: '<div id="list-host" data-enhance="list-generator"></div>',
        register: mod => {
          mod.enhancers.register('list-generator', {
            init(element) {
              const wrapper = document.createElement('div');
              wrapper.setAttribute('data-bind', '{"items":["a","b","c"]}');
              const list = document.createElement('ul');
              list.className = 'gen-list';
              list.setAttribute('data-each', 'items');
              list.setAttribute('data-each-arg', 'it');
              const item = document.createElement('li');
              item.textContent = '{{it}}';
              list.appendChild(item);
              wrapper.appendChild(list);
              element.appendChild(wrapper);
              return {};
            },
          });
        },
      });

      // 仕様「`data-enhance`」の「連携の呼び出し … が `data-external` の外で起こした
      // DOM の変更 … は、初期スキャンの途中でも、後から追加されたノードと同じく
      // 取り込みます。取り込んだ宣言の処理は、初期化の完了 … より前に終わります」。
      // 生成した一覧の data-each は、段を重ねて行を描くため、完了を待たないと途中で
      // 初期化の完了を迎える。
      expect(atReady).toEqual(['a', 'b', 'c']);
    });

    it(`<${placement}> 内で登録した連携が init で data-external の外へ生成した宣言は、初期化の完了時点で処理済み`, async () => {
      let atReady: string | null = null;
      document.addEventListener(
        'haori:ready',
        () => {
          atReady = document.querySelector('.gen-decl')?.textContent ?? null;
        },
        {once: true},
      );

      await load({
        placement,
        markup: '<div id="decl-host" data-enhance="decl-generator"></div>',
        register: mod => {
          mod.enhancers.register('decl-generator', {
            init(element) {
              const span = document.createElement('span');
              span.className = 'gen-decl';
              span.textContent = '{{ 1 + 1 }}';
              element.appendChild(span);
              return {};
            },
          });
        },
      });

      // 仕様「`data-enhance`」の「連携の呼び出し … が `data-external` の外で起こした
      // DOM の変更 … は、初期スキャンの途中でも、後から追加されたノードと同じく
      // 取り込みます。取り込んだ宣言の処理は、初期化の完了 … より前に終わります」。
      // 完了の時点は仕様「`haori:ready`」の発火で捉える。
      expect(atReady).toBe('2');
    });

    it(`<${placement}> 内で登録した連携が init で data-external の外の要素へ足した data-* の宣言は、初期化の完了時点で処理済み`, async () => {
      let atReady: string | null = null;
      document.addEventListener(
        'haori:ready',
        () => {
          atReady = document.querySelector('.bound')?.textContent ?? null;
        },
        {once: true},
      );

      await load({
        placement,
        markup:
          '<div id="bind-host" data-enhance="bind-setter"><span class="bound">{{x}}</span></div>',
        register: mod => {
          mod.enhancers.register('bind-setter', {
            init(element) {
              element.setAttribute('data-bind', '{"x":2}');
              return {};
            },
          });
        },
      });

      // 仕様「`data-enhance`」の「連携の呼び出し … が `data-external` の外で起こした
      // DOM の変更（… `data-*` を含む宣言の追加など）は、初期スキャンの途中でも、後から
      // 追加されたノードと同じく取り込みます。取り込んだ宣言の処理は、初期化の完了 …
      // より前に終わります」。
      expect(atReady).toBe('2');
    });

    it(`<${placement}> 内で登録した連携が init で書き換えたテキストの {{式}} は、初期化の完了時点で評価済み`, async () => {
      let atReady: string | null = null;
      document.addEventListener(
        'haori:ready',
        () => {
          atReady = document.querySelector('.text')?.textContent ?? null;
        },
        {once: true},
      );

      await load({
        placement,
        markup:
          '<div id="text-host" data-enhance="text-writer"><span class="text">placeholder</span></div>',
        register: mod => {
          mod.enhancers.register('text-writer', {
            init(element) {
              element.querySelector('.text')!.firstChild!.nodeValue =
                '{{ 1 + 1 }}';
              return {};
            },
          });
        },
      });

      // 仕様「`data-enhance`」の「連携の呼び出し … が `data-external` の外で起こした
      // DOM の変更 … は、初期スキャンの途中でも、後から追加されたノードと同じく取り込み
      // ます。取り込んだ宣言の処理は、初期化の完了 … より前に終わります」。
      expect(atReady).toBe('2');
    });
  }
});

describe('data-external の配下から外へ移した書いた入力', () => {
  it('外側に新しく作ったコンテナへ入れて別のフォームへ移すと、移動先のフォームで収集される', async () => {
    const page = await load({
      placement: 'head',
      markup: `
        <form id="f1">
          <div id="ext" data-external>
            <input name="note" value="n1">
          </div>
        </form>
        <form id="f2"><div id="outside"></div></form>`,
      register: () => undefined,
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'moved';
    wrapper.appendChild(document.querySelector('input[name="note"]')!);
    document.getElementById('outside')!.appendChild(wrapper);
    await settle(page.mod);

    // 仕様「`data-external`」の「`data-external` を持つ要素の配下で起きた属性変更・
    // ノード追加削除・テキスト変更を、Haori は無視する」。無視するのは配下で起きた
    // 変更だけで、配下の外へ加えた要素は通常どおり取り込まれる。
    expect(collect(page, '#f2')).toEqual({note: 'n1'});
  });
});

describe('行の要素そのものに data-external を付けた data-each', () => {
  it('配列から要素を除くと、その行は DOM から外れる', async () => {
    const page = await load({
      placement: 'head',
      markup: `
        <form id="f2" data-bind='{"rows":[{"id":1},{"id":2}]}'>
          <div id="rows" data-each="rows" data-each-key="id" data-each-arg="r">
            <div class="row" data-external><span>{{r.id}}</span></div>
          </div>
        </form>`,
      register: () => undefined,
    });
    expect(document.querySelectorAll('#rows > .row')).toHaveLength(2);

    document
      .getElementById('f2')!
      .setAttribute('data-bind', JSON.stringify({rows: [{id: 1}]}));
    await settle(page.mod);

    // 仕様「`data-each`」の「最初の子要素がテンプレートとして配列の要素数ぶん複製
    // されます」。内部の木を保つ `data-external` の行でも、DOM から外れる。
    expect(document.querySelectorAll('#rows > .row')).toHaveLength(1);
  });
});

describe('data-external なしで要素を動かすライブラリ', () => {
  it('初期スキャン中に対象要素を生成コンテナへ移しても、書いた要素は DOM に残り、destroy は呼ばれない', async () => {
    const events: string[] = [];
    await load({
      placement: 'head',
      markup: `
        <form id="f1">
          <div id="box">
            <select name="plan" data-enhance="mover"><option value="p1" selected>p1</option></select>
          </div>
        </form>`,
      register: mod => {
        mod.enhancers.register('mover', {
          init(element) {
            events.push('init');
            const outer = document.createElement('div');
            outer.className = 'choices';
            element.parentNode!.insertBefore(outer, element);
            outer.appendChild(element);
            return {};
          },
          destroy(element) {
            events.push('destroy');
            const outer = element.closest('.choices');
            if (outer) {
              outer.parentNode!.insertBefore(element, outer);
              outer.remove();
            }
          },
        });
      },
    });

    // 仕様「`data-enhance`」の「ただし、既にある要素の取り外しと、既にある要素を
    // 生成した要素で包むことは、初期スキャンの途中では取り込みません（DOM を動かす
    // ライブラリを `data-external` なしで使った場合でも、初期表示で要素を失ったり値を二重に
    // 収集したりしないため）」。
    expect(document.querySelector('select[name="plan"]')).not.toBeNull();
    expect(events).toEqual(['init']);
  });
});

describe('data-external なしで既存の入力欄を包む連携', () => {
  it('初期スキャン中に data-form-list の入力欄を生成コンテナで包んでも、値は一度だけ収集される', async () => {
    const page = await load({
      placement: 'head',
      markup: `
        <form id="f1">
          <div id="box">
            <input name="tags" data-form-list value="x" data-enhance="wrapper">
            <input name="tags" data-form-list value="y">
          </div>
        </form>`,
      register: mod => {
        mod.enhancers.register('wrapper', {
          init(element) {
            const outer = document.createElement('div');
            outer.className = 'wrapper';
            element.parentNode!.insertBefore(outer, element);
            outer.appendChild(element);
            return {};
          },
        });
      },
    });

    // 仕様「`data-enhance`」の「ただし、既にある要素の取り外しと、既にある要素を
    // 生成した要素で包むことは、初期スキャンの途中では取り込みません」と、
    // 仕様「`data-form-list`」の「入力要素に付与した場合は値の配列になります」。
    // 包んだことで、同じ入力欄が二重に収集されない。
    expect(collect(page, '#f1')).toEqual({tags: ['x', 'y']});
  });
});

describe('data-external の中で data-each が選択肢を描く select', () => {
  it('data-external の要素を移動しても選択した値は収集され、移動後も選択肢は配列に追随する', async () => {
    const events: string[] = [];
    const page = await load({
      placement: 'head',
      markup: `
        <form id="f1" data-bind='{"plans":[{"id":"a","name":"A"},{"id":"b","name":"B"}]}'>
          <div id="ext" data-external>
            <select
              name="plan"
              multiple
              data-enhance="choices-like"
              data-each="plans"
              data-each-key="id"
              data-each-arg="p"
            >
              <option value="{{p.id}}">{{p.name}}</option>
            </select>
          </div>
          <div id="slot"></div>
        </form>`,
      register: mod => {
        mod.enhancers.register('choices-like', choicesLike(events, true));
      },
    });
    const select = document.querySelector<HTMLSelectElement>(
      'select[name="plan"]',
    )!;
    select.options[1].selected = true;
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await settle(page.mod);

    document
      .getElementById('slot')!
      .appendChild(document.getElementById('ext')!);
    await settle(page.mod);

    // 仕様「`data-external`」の「選択結果は `<select multiple>` の配列値としてフォーム
    // 送信値（`data-click-form` 等）に反映されます」と、同じ節の「`data-external` の
    // 要素ごと移動しても、配下の書いた要素は移動の後も収集する」。
    expect(collect(page, '#f1')).toEqual({plan: ['b']});

    document.getElementById('f1')!.setAttribute(
      'data-bind',
      JSON.stringify({
        plans: [
          {id: 'a', name: 'A'},
          {id: 'b', name: 'B'},
          {id: 'c', name: 'C'},
        ],
      }),
    );
    await settle(page.mod);

    // 仕様「`data-each`」の「最初の子要素がテンプレートとして配列の要素数ぶん複製
    // されます」。移動の後も、選択肢は配列に追随する。
    const current = document.querySelector<HTMLSelectElement>(
      'select[name="plan"]',
    );
    expect(current).not.toBeNull();
    expect(Array.from(current!.options).map(option => option.value)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
