/* @vitest-environment jsdom */
/**
 * @fileoverview バインド更新に伴う `data-fetch` / `data-import` の再評価が、
 * まだ走査していない要素と、`data-if` の非表示分岐の配下へ及ばないことを検証します。
 *
 * 祖先の `data-fetch` の応答は、子孫を走査する前に届きます。再評価が未走査の子孫まで
 * 降りていたため、子孫の `data-url-param` や `data-bind` が反映される前の空の条件で、
 * 子孫の取得が 1 回余分に走っていました。同じ経路で、`data-if` の非表示分岐の配下の
 * 取得も走っていました。
 *
 * 期待値の根拠は仕様「`data-fetch`」と仕様「`data-import`」の「再評価の対象は、
 * 走査（初期化）を済ませた要素だけです」、仕様「data-if の動作」の「配下は再評価
 * しない」「表示へ戻った時点でまとめて再評価する」、仕様「`data-url-param`」の
 * 「要素を走査（初期化）したとき」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('未走査の要素と非表示分岐の再評価', () => {
  let container: HTMLElement;
  let requests: string[];
  /** パスごとの応答の遅れ（ミリ秒） */
  let delays: Record<string, number>;
  /** パスごとの応答本文 */
  let bodies: Record<string, string>;

  beforeEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, '', '/page?name=foo');
    requests = [];
    delays = {};
    bodies = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        const path = url.split('?')[0];
        const delay = delays[path] ?? 0;
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        if (path.endsWith('.html')) {
          return new Response(bodies[path] ?? '<p>取り込み</p>', {
            headers: {'Content-Type': 'text/html'},
          });
        }
        return new Response(bodies[path] ?? '{"ok":1}', {
          headers: {'Content-Type': 'application/json'},
        });
      },
    );
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  /**
   * 指定した要求が届き、その後の処理が落ち着くまで待ちます。
   *
   * @param url 待つ要求
   * @returns 待ち合わせの Promise
   */
  const waitForRequest = async (url: string): Promise<void> => {
    await waitForCondition(() => requests.includes(url), {
      description: `${url} の要求`,
    });
    await waitForIdle();
  };

  /**
   * 遅らせた応答も含めて、処理が落ち着くまで待ちます。
   *
   * @returns 待ち合わせの Promise
   */
  const settle = async (): Promise<void> => {
    await waitForIdle();
    await new Promise(resolve => setTimeout(resolve, 150));
    await waitForIdle();
  };

  describe('未走査の要素', () => {
    it('祖先の応答で、子孫の data-url-param より先に子孫の取得を走らせない', async () => {
      // 仕様「`data-url-param`」の「要素を走査（初期化）したとき」に読み込む。
      // 祖先の応答は子孫の走査より先に届くが、仕様「`data-fetch`」の「再評価の
      // 対象は、走査（初期化）を済ませた要素だけです」により、子孫の取得は子孫の
      // 走査で 1 回だけ走る。
      delays['/auth.json'] = 20;
      container.innerHTML = `
        <div data-fetch="/auth.json" data-fetch-arg="auth">
          <main data-url-param data-url-arg="params">
            <span data-fetch="/list.json?name={{encodeURIComponent(params.name ?? '')}}" data-fetch-bind="#list"></span>
            <div id="list"></div>
          </main>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/list.json?name=foo');
      await settle();

      expect(requests).toEqual(['/auth.json', '/list.json?name=foo']);
    });

    it('祖先の応答で、子孫の data-bind より先に子孫の取得を走らせない', async () => {
      // 仕様「`data-fetch`」の「再評価の対象は、走査（初期化）を済ませた要素
      // だけです」。`data-url-param` に限らず、子孫の既定値（`data-bind`）も
      // 走査で反映される。
      delays['/auth.json'] = 20;
      container.innerHTML = `
        <div data-fetch="/auth.json" data-fetch-arg="auth">
          <main data-bind='{"params":{"name":"bar"}}'>
            <span data-fetch="/list.json?name={{params.name ?? ''}}"></span>
          </main>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/list.json?name=bar');
      await settle();

      expect(requests).toEqual(['/auth.json', '/list.json?name=bar']);
    });

    it('祖先の応答で、子孫の data-bind より先に子孫の取り込みを走らせない', async () => {
      // 仕様「`data-import`」の「再評価の対象は、走査（初期化）を済ませた要素
      // だけです」。
      delays['/auth.json'] = 20;
      container.innerHTML = `
        <div data-fetch="/auth.json" data-fetch-arg="auth">
          <main data-bind='{"params":{"name":"bar"}}'>
            <span data-import="/tpl.html?name={{params.name ?? ''}}"></span>
          </main>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/tpl.html?name=bar');
      await settle();

      expect(requests).toEqual(['/auth.json', '/tpl.html?name=bar']);
    });

    it('取得の応答を待つあいだに祖先の値が変わると、変わった条件で取り直す', async () => {
      // 仕様「`data-fetch`」の「bind 更新後は `data-fetch` を専用ルートで再評価
      // します」と「実行シグネチャが前回と同じ場合は再実行しません」。走査の途中
      // （自分の取得の応答を待つあいだ）の要素は、走査を済ませた要素として扱う。
      // 待ち終えるまで対象から外すと、変わった条件での取得が失われる。
      delays['/a.json'] = 20;
      delays['/list.json'] = 60;
      bodies['/a.json'] = '{"x":"1"}';
      container.innerHTML = `
        <div id="root">
          <span data-fetch="/a.json" data-fetch-bind="#root" data-fetch-arg="a"></span>
          <section data-fetch="/list.json?x={{a.x ?? ''}}"></section>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/list.json?x=1');
      await settle();

      expect(requests).toEqual(['/a.json', '/list.json?x=', '/list.json?x=1']);
    });

    it('取り込みの応答を待つあいだに祖先の値が変わると、変わった条件で取り込み直す', async () => {
      // 仕様「`data-import`」の「bind 更新後は `data-import` を専用ルートで再評価
      // します」と「評価後 URL が前回と同じ場合は再読み込みしません」。
      delays['/a.json'] = 20;
      delays['/tpl.html'] = 60;
      bodies['/a.json'] = '{"x":"1"}';
      container.innerHTML = `
        <div id="root">
          <span data-fetch="/a.json" data-fetch-bind="#root" data-fetch-arg="a"></span>
          <section data-import="/tpl.html?x={{a.x ?? ''}}"></section>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/tpl.html?x=1');
      await settle();

      expect(requests).toEqual(['/a.json', '/tpl.html?x=', '/tpl.html?x=1']);
    });
  });

  describe('data-if の非表示分岐', () => {
    it('初期から非表示の分岐の配下は、祖先の応答でも取得しない', async () => {
      // 仕様「data-if の動作」の「配下は再評価しない」。
      container.innerHTML = `
        <div data-fetch="/auth.json" data-fetch-arg="auth">
          <main data-if="false">
            <span data-fetch="/hidden.json"></span>
          </main>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/auth.json');
      await settle();

      expect(requests).toEqual(['/auth.json']);
    });

    it('表示の後で非表示にした分岐の配下は、条件が変わっても取得しない', async () => {
      // 仕様「data-if の動作」の「配下は再評価しない」。
      container.innerHTML = `
        <div id="root" data-bind='{"show":true,"q":"1"}'>
          <main data-if="show">
            <span data-fetch="/h.json?q={{q}}"></span>
          </main>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/h.json?q=1');
      const root = container.querySelector('#root') as HTMLElement;

      await Core.setBindingData(root, {show: false, q: '2'});
      await settle();

      expect(requests).toEqual(['/h.json?q=1']);
    });

    it('非表示のあいだに条件が変わった取得は、表示へ戻った時点で走る', async () => {
      // 仕様「data-if の動作」の「表示へ戻った時点でまとめて再評価する」。
      container.innerHTML = `
        <div id="root" data-bind='{"show":true,"q":"1"}'>
          <main data-if="show">
            <span data-fetch="/h.json?q={{q}}"></span>
          </main>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/h.json?q=1');
      const root = container.querySelector('#root') as HTMLElement;
      await Core.setBindingData(root, {show: false, q: '2'});
      await settle();

      await Core.setBindingData(root, {show: true, q: '2'});
      await waitForRequest('/h.json?q=2');
      await settle();

      expect(requests).toEqual(['/h.json?q=1', '/h.json?q=2']);
    });

    it('data-if の書き換えで表示へ戻した場合も、変わった条件で取得する', async () => {
      // 仕様「data-if の動作」の「表示へ戻った時点でまとめて再評価する」。
      // バインド更新を経ずに表示へ戻す経路（属性の書き換え）でも同じ。
      container.innerHTML = `
        <div id="root" data-bind='{"q":"1"}'>
          <main id="branch" data-if="true">
            <span data-fetch="/h.json?q={{q}}"></span>
          </main>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/h.json?q=1');
      const root = container.querySelector('#root') as HTMLElement;
      const branch = container.querySelector('#branch') as HTMLElement;
      await Core.setAttribute(branch, 'data-if', 'false');
      await Core.setBindingData(root, {q: '2'});
      await settle();

      await Core.setAttribute(branch, 'data-if', 'true');
      await waitForRequest('/h.json?q=2');
      await settle();

      expect(requests).toEqual(['/h.json?q=1', '/h.json?q=2']);
    });

    it('非表示の要素自身の取得は、条件の変化に追随する', async () => {
      // 仕様「data-if の動作」の「`data-if` を宣言した要素自身の属性は評価
      // される」。配下へ降りないのは子だけで、要素自身は対象に残る。
      container.innerHTML = `
        <div id="root" data-bind='{"show":true,"q":"1"}'>
          <main data-if="show" data-fetch="/self.json?q={{q}}" data-fetch-bind="#sink"></main>
          <div id="sink"></div>
        </div>`;
      await Core.scan(container);
      await waitForRequest('/self.json?q=1');
      const root = container.querySelector('#root') as HTMLElement;

      await Core.setBindingData(root, {show: false, q: '2'});
      await waitForRequest('/self.json?q=2');
      await settle();

      expect(requests).toEqual(['/self.json?q=1', '/self.json?q=2']);
    });
  });
});
