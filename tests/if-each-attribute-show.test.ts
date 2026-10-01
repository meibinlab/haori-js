/* @vitest-environment jsdom */
/**
 * @fileoverview `data-if` と `data-each` を同じ要素へ宣言し、`data-if` 属性の書き換え
 * で表示へ戻したときに、行が描かれることを検証します。
 *
 * バインド更新で表示へ戻す経路では、`data-if` の評価に続けて `data-each` の描画が
 * 走ります。`data-if` 属性を書き換える経路では `data-if` の評価だけが走り、非表示の
 * あいだに変わった配列や値が行へ反映されませんでした。行の中の取得と、コンテナへの
 * 外部ライブラリ連携の適用も同じ理由で行われませんでした。
 *
 * 期待値の根拠は仕様「`data-if` と `data-each` の同一要素への宣言」の「続けて走る
 * `data-each` の描画に任せます」、仕様「`data-each`」の「表示へ戻って描き終えた時点で
 * 再付与します」、仕様「`data-fetch`」の「表示へ戻った時点で再評価し、非表示のあいだに
 * 条件が変わっていれば取得します」、仕様「`data-enhance`」と仕様「data-if の動作」の
 * 「未適用の要素へは、子の初期化（`data-each` を同じ要素へ宣言した場合は行の描画）と、
 * 揃った選択肢への値の載せ直しが済んでから `init` を呼ぶ」。描き直す範囲は仕様
 * 「`data-each`」の「初回の描画では 1 回だけ実行します」と、仕様「`data-if` と
 * `data-each` の同一要素への宣言」の「`data-each` を宣言していない要素では行を
 * 描きません」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';
import Log from '../src/log';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('data-if の書き換えで表示へ戻した data-each', () => {
  let container: HTMLElement;
  let requests: string[];

  beforeEach(() => {
    vi.restoreAllMocks();
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return new Response('{"ok":1}', {
          headers: {'Content-Type': 'application/json'},
        });
      },
    );
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  /**
   * 指定した HTML を走査して待ち合わせます。
   *
   * @param html 走査する HTML
   * @returns 待ち合わせの Promise
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForIdle();
  };

  /**
   * 行の文字を並べて返します。
   *
   * @returns 行ごとの文字
   */
  const rowTexts = (): (string | null)[] =>
    Array.from(container.querySelectorAll('.t')).map(e => e.textContent);

  it('非表示のあいだに変わった値と配列で、行を描き直す', async () => {
    await mount(`
      <div id="root" data-bind='{"rows":[{"id":1}],"q":"1"}'>
        <ul id="list" data-if="true" data-each="rows" data-each-arg="r">
          <li><span class="t">{{r.id}}-{{q}}</span></li>
        </ul>
      </div>`);
    const root = container.querySelector('#root') as HTMLElement;
    const list = container.querySelector('#list') as HTMLElement;
    expect(rowTexts()).toEqual(['1-1']);

    await Core.setAttribute(list, 'data-if', 'false');
    await Core.setBindingData(root, {rows: [{id: 1}, {id: 2}], q: '2'});
    await waitForIdle();
    // 非表示のあいだは描画を保留し、完了マーカーを外す。
    expect(list.hasAttribute('data-each-done')).toBe(false);

    await Core.setAttribute(list, 'data-if', 'true');
    await waitForIdle();

    expect(rowTexts()).toEqual(['1-2', '2-2']);
    expect(list.hasAttribute('data-each-done')).toBe(true);
  });

  it('行の中の取得は、非表示のあいだに変わった条件で走る', async () => {
    await mount(`
      <div id="root" data-bind='{"rows":[{"id":1}],"q":"1"}'>
        <ul id="list" data-if="true" data-each="rows" data-each-arg="r">
          <li><span data-fetch="/row.json?id={{r.id}}&q={{q}}"></span></li>
        </ul>
      </div>`);
    await waitForCondition(() => requests.includes('/row.json?id=1&q=1'), {
      description: '最初の取得',
    });
    const root = container.querySelector('#root') as HTMLElement;
    const list = container.querySelector('#list') as HTMLElement;
    await Core.setAttribute(list, 'data-if', 'false');
    await Core.setBindingData(root, {rows: [{id: 1}], q: '2'});
    await waitForIdle();
    // 非表示のあいだは取得しない（仕様「data-if の動作」の「配下は再評価しない」）。
    expect(requests).toEqual(['/row.json?id=1&q=1']);

    await Core.setAttribute(list, 'data-if', 'true');
    await waitForCondition(() => requests.includes('/row.json?id=1&q=2'), {
      description: '表示へ戻した後の取得',
    });
    await waitForIdle();

    expect(requests).toEqual(['/row.json?id=1&q=1', '/row.json?id=1&q=2']);
  });

  it('非表示のあいだに消えた行の取得は走らない', async () => {
    // 仕様「`data-fetch`」の「表示へ戻った時点で再評価し」。再評価するのは表示へ
    // 戻った時点の行で、非表示のあいだに配列から消えた行は対象にならない。
    await mount(`
      <div id="root" data-bind='{"rows":[{"id":1}],"q":"1"}'>
        <ul id="list" data-if="true" data-each="rows" data-each-arg="r" data-each-key="id">
          <li><span data-fetch="/row.json?id={{r.id}}&q={{q}}"></span></li>
        </ul>
      </div>`);
    await waitForCondition(() => requests.includes('/row.json?id=1&q=1'), {
      description: '最初の取得',
    });
    const root = container.querySelector('#root') as HTMLElement;
    const list = container.querySelector('#list') as HTMLElement;
    await Core.setAttribute(list, 'data-if', 'false');
    await Core.setBindingData(root, {rows: [{id: 2}], q: '2'});
    await waitForIdle();

    await Core.setAttribute(list, 'data-if', 'true');
    await waitForCondition(() => requests.includes('/row.json?id=2&q=2'), {
      description: '表示へ戻した後の取得',
    });
    await waitForIdle();

    expect(requests).toEqual(['/row.json?id=1&q=1', '/row.json?id=2&q=2']);
  });

  it('初期表示では、行を 1 回だけ描く', async () => {
    // 仕様「`data-each`」の「初回の描画では 1 回だけ実行します」。走査では
    // `data-if` の宣言の処理に `data-each` の宣言の処理が続くため、`data-if` の側で
    // 描くと二重になる。
    const counter = window as unknown as {__ifEachRuns: number};
    counter.__ifEachRuns = 0;
    await mount(`
      <div data-bind='{"rows":[1,2]}'>
        <ul data-if="true" data-each="rows" data-each-arg="r"
          data-each-rendered-run="window.__ifEachRuns++">
          <li>{{r}}</li>
        </ul>
      </div>`);

    expect(counter.__ifEachRuns).toBe(1);
  });

  it('data-each の無い要素を表示へ戻しても、行を描こうとしない', async () => {
    // 仕様「`data-if` と `data-each` の同一要素への宣言」の「`data-each` を宣言して
    // いない要素では行を描きません」。描こうとすると、最初の子要素を行テンプレート
    // として取り外して中身が消え、子要素が無ければテンプレートが無いとしてエラーを
    // 出す。
    const errors: string[] = [];
    vi.spyOn(Log, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    await mount(`
      <div data-bind='{"q":"1"}'>
        <section id="filled" data-if="true"><p>{{q}}</p></section>
        <section id="empty" data-if="true"></section>
      </div>`);
    const filled = container.querySelector('#filled') as HTMLElement;
    const empty = container.querySelector('#empty') as HTMLElement;
    for (const branch of [filled, empty]) {
      await Core.setAttribute(branch, 'data-if', 'false');
      await waitForIdle();
      await Core.setAttribute(branch, 'data-if', 'true');
      await waitForIdle();
    }

    expect(filled.querySelector('p')?.textContent).toBe('1');
    expect(filled.hasAttribute('data-each-done')).toBe(false);
    expect(errors).toEqual([]);
  });

  it('コンテナへの連携の init は、行を描いた後に呼ばれる', async () => {
    const log: string[] = [];
    Haori.enhancers.register('if-each-attribute-show', {
      init(element) {
        const select = element as HTMLSelectElement;
        log.push(
          `init:[${Array.from(select.options)
            .map(option => option.value)
            .join(',')}]`,
        );
        return {};
      },
    });
    await mount(`
      <div data-bind='{"plans":["a","b"]}'>
        <select id="plan" data-if="false" data-enhance="if-each-attribute-show"
          data-each="plans" data-each-arg="p">
          <option value="{{p}}">{{p}}</option>
        </select>
      </div>`);
    // 非表示のあいだは init を呼ばない（仕様「data-if の動作」）。
    expect(log).toEqual([]);

    const select = container.querySelector('#plan') as HTMLElement;
    await Core.setAttribute(select, 'data-if', 'true');
    await waitForIdle();

    expect(log).toEqual(['init:[a,b]']);
  });
});
