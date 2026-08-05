/* @vitest-environment jsdom */
/**
 * @fileoverview `data-import` で取り込んだ断片のスコープ継承の検証。
 *
 * `data-import` は `innerHTML` で子を差し替えるため、フラグメント木は自動では
 * 追従しない。繋がないまま評価すると、断片の要素は親を持たないフラグメントに
 * なり、祖先をたどれず評価スコープが空になっていた（`{{...}}` が空表示になり、
 * `data-if` が常に偽になる）。DOM 上は取り込み先の子なので、通常の子要素と同じ
 * スコープ解決になることを確認する。
 *
 * 1. 祖先・取り込み先自身の `data-bind` を継承する（`data-if` と補間の両方）
 * 2. 入れ子の取り込みと `data-each` の行スコープでも継承する
 * 3. 取り込み後のバインド更新が断片へ届く（継続的に同じスコープである）
 * 4. 断片の中の宣言（`data-bind` / `data-each` / `data-fetch` / 入力欄）が働く
 * 5. 再取り込み・空の断片・失敗でフラグメント木が壊れない
 *
 * ready 後（監視稼働中）の取り込みは `tests/import-scope-ready.test.ts` で扱う。
 * `src/observer` は読み込みだけで初期化が走り、他のテストへ影響するためである。
 *
 * 期待値の根拠は仕様「`data-import`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Queue from '../src/queue';
import {waitForDomSettled} from './helpers/async';

/** 取り込む断片（`<body>` の中身だけが使われる）。 */
const FRAGMENT_HTML = `<!DOCTYPE html><html><body>
<p id="frag-text">現在のステップ: {{currentStep}} / 名前: {{user.name}}</p>
<p id="frag-if" data-if="currentStep === 2">ステップ2のときだけ表示</p>
</body></html>`;

/** 差し替え確認用の別断片。 */
const OTHER_FRAGMENT_HTML =
  '<!DOCTYPE html><html><body><p id="other">別の断片: {{currentStep}}</p>' +
  '</body></html>';

/** 入れ子の取り込みを持つ断片。 */
const OUTER_FRAGMENT_HTML =
  '<!DOCTYPE html><html><body><p id="outer">外側: {{currentStep}}</p>' +
  '<div id="inner-host" data-import="/fragment.html"></div></body></html>';

/** `data-each` の行の中で取り込む断片（行スコープを参照する）。 */
const ROW_FRAGMENT_HTML =
  '<!DOCTYPE html><html><body><p class="row-text">{{i}}: {{r.label}}</p>' +
  '</body></html>';

/** 断片の中で `data-bind` を宣言する断片（そこから下だけのスコープになる）。 */
const SHADOW_FRAGMENT_HTML =
  '<!DOCTYPE html><html><body>' +
  '<p id="outside">外: {{label}}</p>' +
  '<div data-bind=\'{"label":"断片の宣言"}\'>' +
  '<p id="inside">内: {{label}}</p></div>' +
  '</body></html>';

/** 断片の中で `data-each` を使う断片（取り込み側の配列を描画する）。 */
const LIST_FRAGMENT_HTML =
  '<!DOCTYPE html><html><body><ul data-each="items" data-each-arg="it">' +
  '<li class="item">{{it.name}}</li></ul></body></html>';

/** 断片の中で `data-fetch` を使う断片（取り込み側の値で URL を組み立てる）。 */
const FETCH_FRAGMENT_HTML =
  '<!DOCTYPE html><html><body>' +
  '<div id="fetch-host" data-fetch="/api/detail.json?id={{userId}}"' +
  ' data-fetch-arg="detail"><p id="detail">{{detail.title}}</p></div>' +
  '</body></html>';

/** 断片の中に入力欄を持つ断片（外側のフォームの収集対象になる）。 */
const FORM_FRAGMENT_HTML =
  '<!DOCTYPE html><html><body>' +
  '<input name="nickname" data-attr-value="{{user.name}}">' +
  '</body></html>';

/** 中身が空の断片。 */
const EMPTY_FRAGMENT_HTML = '<!DOCTYPE html><html><body></body></html>';

describe('data-import のスコープ継承', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const path = String(url);
      if (path.includes('missing')) {
        // 取り込み失敗の再現（既存の子が壊れないことの確認に使う）。
        return new Response('not found', {status: 404});
      }
      if (path.includes('/api/detail.json')) {
        return new Response(JSON.stringify({title: `詳細:${path.slice(-3)}`}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      const bodies: Record<string, string> = {
        other: OTHER_FRAGMENT_HTML,
        outer: OUTER_FRAGMENT_HTML,
        row: ROW_FRAGMENT_HTML,
        shadow: SHADOW_FRAGMENT_HTML,
        list: LIST_FRAGMENT_HTML,
        fetch: FETCH_FRAGMENT_HTML,
        form: FORM_FRAGMENT_HTML,
        empty: EMPTY_FRAGMENT_HTML,
      };
      const key = Object.keys(bodies).find(name => path.includes(name));
      return new Response(key ? bodies[key] : FRAGMENT_HTML, {
        status: 200,
        headers: {'Content-Type': 'text/html'},
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * 走査してキューが落ち着くまで待ちます。
   *
   * @returns 完了の Promise
   */
  async function scanAndSettle(): Promise<void> {
    await Core.scan(container);
    for (let i = 0; i < 4; i += 1) {
      await waitForDomSettled();
      await Queue.waitForIdle();
    }
  }

  it('祖先の data-bind を継承する', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":2,"user":{"name":"テスト太郎"}}'>
        <p id="direct">直書き: {{currentStep}} / {{user.name}}</p>
        <div id="imported" data-import="/fragment.html"></div>
      </div>`;
    await scanAndSettle();

    // 直書きとの一致（取り込みでも同じスコープ解決になること）を見る。
    expect(container.querySelector('#direct')?.textContent).toBe(
      '直書き: 2 / テスト太郎',
    );
    expect(container.querySelector('#frag-text')?.textContent).toBe(
      '現在のステップ: 2 / 名前: テスト太郎',
    );
  });

  it('断片の中の data-if が評価される', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":2,"user":{"name":"テスト太郎"}}'>
        <div id="imported" data-import="/fragment.html"></div>
      </div>`;
    await scanAndSettle();

    const conditional = container.querySelector('#frag-if');
    expect(conditional, '断片が取り込まれている').not.toBeNull();
    expect(
      conditional?.hasAttribute('data-if-false'),
      '条件が真なので表示される',
    ).toBe(false);
  });

  it('条件が偽なら断片の data-if は非表示になる', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":1,"user":{"name":"テスト太郎"}}'>
        <div id="imported" data-import="/fragment.html"></div>
      </div>`;
    await scanAndSettle();

    expect(container.querySelector('#frag-text')?.textContent).toBe(
      '現在のステップ: 1 / 名前: テスト太郎',
    );
    expect(
      container.querySelector('#frag-if')?.hasAttribute('data-if-false'),
    ).toBe(true);
  });

  it('取り込み先要素自身の data-bind を参照できる', async () => {
    container.innerHTML = `
      <div id="imported2"
           data-bind='{"currentStep":3,"user":{"name":"取り込み先で宣言"}}'
           data-import="/fragment.html"></div>`;
    await scanAndSettle();

    expect(container.querySelector('#frag-text')?.textContent).toBe(
      '現在のステップ: 3 / 名前: 取り込み先で宣言',
    );
  });

  it('入れ子の取り込みもスコープを継承する', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":2,"user":{"name":"入れ子"}}'>
        <div id="imported" data-import="/outer.html"></div>
      </div>`;
    await scanAndSettle();

    expect(container.querySelector('#outer')?.textContent).toBe('外側: 2');
    // 断片の中の data-import も走査され、さらに内側もスコープを継承する。
    expect(container.querySelector('#inner-host #frag-text')?.textContent).toBe(
      '現在のステップ: 2 / 名前: 入れ子',
    );
  });

  it('data-each の行の中では行スコープも参照できる', async () => {
    // 仕様書の「評価スコープ」で行スコープも参照できると明記しているため、
    // 行の中に置いた取り込みで確かめる。
    container.innerHTML = `
      <div data-bind='{"rows":[{"label":"1 行目"},{"label":"2 行目"}]}'>
        <div data-each="rows" data-each-arg="r" data-each-index="i">
          <div class="row-host" data-import="/row.html"></div>
        </div>
      </div>`;
    await scanAndSettle();

    const texts = Array.from(container.querySelectorAll('.row-text')).map(
      el => el.textContent,
    );
    expect(texts).toEqual(['0: 1 行目', '1: 2 行目']);
  });

  it('取り込み後のバインド更新が断片へ届く', async () => {
    // 取り込みは一度きりだが、スコープは繋がったままである必要がある。
    // ウィザードのステップ表示のように、後から値が変わる構成が該当する。
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":1,"user":{"name":"テスト太郎"}}'>
        <div id="imported" data-import="/fragment.html"></div>
      </div>`;
    await scanAndSettle();
    expect(container.querySelector('#frag-text')?.textContent).toBe(
      '現在のステップ: 1 / 名前: テスト太郎',
    );
    expect(
      container.querySelector('#frag-if')?.hasAttribute('data-if-false'),
    ).toBe(true);

    await Core.setBindingData(container.querySelector('#host') as HTMLElement, {
      currentStep: 2,
      user: {name: '更新後'},
    });
    for (let i = 0; i < 4; i += 1) {
      await waitForDomSettled();
      await Queue.waitForIdle();
    }

    expect(container.querySelector('#frag-text')?.textContent).toBe(
      '現在のステップ: 2 / 名前: 更新後',
    );
    expect(
      container.querySelector('#frag-if')?.hasAttribute('data-if-false'),
      '条件が真になったので表示へ切り替わる',
    ).toBe(false);
  });

  it('断片の中の data-bind はそこから下だけのスコープになる', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"label":"取り込み側"}'>
        <div id="imported" data-import="/shadow.html"></div>
      </div>`;
    await scanAndSettle();

    expect(container.querySelector('#outside')?.textContent).toBe(
      '外: 取り込み側',
    );
    expect(container.querySelector('#inside')?.textContent).toBe(
      '内: 断片の宣言',
    );
  });

  it('断片の中の data-each が取り込み側の配列を描画する', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"items":[{"name":"A"},{"name":"B"}]}'>
        <div id="imported" data-import="/list.html"></div>
      </div>`;
    await scanAndSettle();

    const names = Array.from(container.querySelectorAll('.item')).map(
      el => el.textContent,
    );
    expect(names).toEqual(['A', 'B']);
  });

  it('断片の中の data-fetch が取り込み側の値で URL を組み立てる', async () => {
    // `data-fetch` は遅延属性なので、取り込み側の走査で確実に処理される必要がある。
    container.innerHTML = `
      <div id="host" data-bind='{"userId":"123"}'>
        <div id="imported" data-import="/fetch.html"></div>
      </div>`;
    await scanAndSettle();

    const calls = (
      globalThis.fetch as unknown as {mock: {calls: unknown[][]}}
    ).mock.calls.map(args => String(args[0]));
    expect(calls).toContain('/api/detail.json?id=123');
    expect(container.querySelector('#detail')?.textContent).toBe('詳細:123');
  });

  it('断片の中の入力欄が外側のフォームの収集対象になる', async () => {
    container.innerHTML = `
      <form id="owner" data-form data-bind='{"user":{"name":"収集太郎"}}'>
        <input name="kind" value="a">
        <div id="imported" data-import="/form.html"></div>
      </form>`;
    await scanAndSettle();

    const nickname = container.querySelector<HTMLInputElement>(
      'input[name="nickname"]',
    );
    expect(nickname, '断片の入力欄が取り込まれている').not.toBeNull();
    // 取り込み側のスコープで宣言バインドが評価され、値が入る。
    expect(nickname?.value).toBe('収集太郎');

    const owner = Fragment.get(
      container.querySelector('#owner') as HTMLElement,
    ) as ElementFragment;
    expect(Form.getValues(owner)).toEqual({kind: 'a', nickname: '収集太郎'});
  });

  it('中身が空の断片でも壊れない', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":2}'>
        <div id="imported" data-import="/empty.html">差し替え前</div>
        <p id="sibling">兄弟: {{currentStep}}</p>
      </div>`;
    await scanAndSettle();

    const imported = container.querySelector('#imported') as HTMLElement;
    expect(imported.innerHTML).toBe('');
    // 差し替え前の子はフラグメント木からも消える。
    const fragment = Fragment.get(imported) as ElementFragment;
    expect(fragment.getChildren().length).toBe(0);
    // 兄弟の評価は影響を受けない。
    expect(container.querySelector('#sibling')?.textContent).toBe('兄弟: 2');
  });

  it('取り込みに失敗しても既存の子と兄弟が壊れない', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":2}'>
        <div id="imported" data-import="/missing.html">
          <span id="placeholder">読み込み中: {{currentStep}}</span>
        </div>
        <p id="sibling">兄弟: {{currentStep}}</p>
      </div>`;
    await scanAndSettle();

    // 失敗したので差し替えは起きず、元の子がそのまま評価されている。
    expect(container.querySelector('#placeholder')?.textContent).toBe(
      '読み込み中: 2',
    );
    expect(container.querySelector('#sibling')?.textContent).toBe('兄弟: 2');
    expect(
      container.querySelector('#imported')?.hasAttribute('data-importing'),
      '読み込み中の印が残らない',
    ).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it('再取り込みでも新しい断片がスコープを継承する', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":2,"url":"/fragment.html"}'>
        <div id="imported" data-import="{{url}}"></div>
      </div>`;
    await scanAndSettle();
    expect(container.querySelector('#frag-text')?.textContent).toBe(
      '現在のステップ: 2 / 名前: ',
    );

    await Core.setBindingData(container.querySelector('#host') as HTMLElement, {
      currentStep: 5,
      url: '/other.html',
    });
    for (let i = 0; i < 4; i += 1) {
      await waitForDomSettled();
      await Queue.waitForIdle();
    }

    // 2 回目の断片も取り込み側のスコープで評価される。
    expect(container.querySelector('#other')?.textContent).toBe('別の断片: 5');
  });

  it('再取り込みで古い子がフラグメント木へ残らない', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"currentStep":2,"url":"/fragment.html"}'>
        <div id="imported" data-import="{{url}}"></div>
      </div>`;
    await scanAndSettle();
    expect(container.querySelector('#frag-text')).not.toBeNull();

    await Core.setBindingData(container.querySelector('#host') as HTMLElement, {
      currentStep: 2,
      url: '/other.html',
    });
    for (let i = 0; i < 4; i += 1) {
      await waitForDomSettled();
      await Queue.waitForIdle();
    }

    expect(container.querySelector('#frag-text'), '前の断片は消えている').toBe(
      null,
    );
    expect(container.querySelector('#other')?.textContent).toBe('別の断片: 2');

    // DOM から外れた子をフラグメント木へ残すと、以降の再評価が存在しない
    // ノードをたどり、再取り込みのたびに積み上がる。
    const imported = Fragment.get(
      container.querySelector('#imported') as HTMLElement,
    ) as ElementFragment;
    const stale = imported
      .getChildren()
      .filter(child => child.getTarget().parentNode !== imported.getTarget());
    expect(stale.length, '木に残った古い子がある').toBe(0);
  });
});
