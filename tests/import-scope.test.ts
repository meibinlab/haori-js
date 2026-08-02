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
 * 1. 祖先の `data-bind` を継承する
 * 2. 取り込み先要素自身の `data-bind` を参照できる
 * 3. 断片の中の `data-if` が評価される
 * 4. 再取り込みで古い子がフラグメント木へ残らない
 *
 * ready 後（監視稼働中）の取り込みは `tests/import-scope-ready.test.ts` で扱う。
 * `src/observer` は読み込みだけで初期化が走り、他のテストへ影響するためである。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
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

describe('data-import のスコープ継承', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const path = String(url);
      let body = FRAGMENT_HTML;
      if (path.includes('other')) {
        body = OTHER_FRAGMENT_HTML;
      } else if (path.includes('outer')) {
        body = OUTER_FRAGMENT_HTML;
      } else if (path.includes('row')) {
        body = ROW_FRAGMENT_HTML;
      }
      return new Response(body, {
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
