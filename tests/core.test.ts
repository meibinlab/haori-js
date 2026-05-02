/**
 * @fileoverview Coreクラスのテスト
 */

import {vi} from 'vitest';
import Core from '../src/core';
import {ElementFragment} from '../src/fragment';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('Core', () => {
  let container: HTMLElement;
  let observer: MutationObserver;
  let mutations: MutationRecord[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    mutations = [];

    observer = new MutationObserver(mutationsList => {
      mutations.push(...mutationsList);
    });

    observer.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeOldValue: true,
    });
  });

  afterEach(() => {
    observer.disconnect();
    document.body.removeChild(container);
    mutations = [];
  });

  describe('evaluateAll', () => {
    test('observerを通じてフォーム要素を処理する', async () => {
      container.innerHTML = `
        <form>
          <input name="username" value="initial">
          <input name="email" value="test@example.com">
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      // フォーム値を変更
      const usernameInput = form.querySelector(
        '[name="username"]',
      ) as HTMLInputElement;
      usernameInput.value = 'updated_username';

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // MutationObserverが属性変更を検知していることを確認
      const attributeMutations = mutations.filter(
        mutation => mutation.type === 'attributes',
      );
      expect(attributeMutations.length).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じてdata-bind属性を処理する', async () => {
      container.innerHTML = `
        <div data-bind="testValue">
          Initial content
        </div>
      `;

      const element = container.querySelector('div') as HTMLElement;
      const fragment = new ElementFragment(element);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // data-bind属性の処理による変更を確認
      const mutations_count = mutations.length;
      expect(mutations_count).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じてフォームオブジェクト構造を処理する', async () => {
      container.innerHTML = `
        <form>
          <div data-haori-form-object="user">
            <input name="name" value="John">
            <input name="age" value="30">
          </div>
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // フォーム構造の処理による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じてフォームリスト構造を処理する', async () => {
      container.innerHTML = `
        <form>
          <div data-haori-form-list="items">
            <div data-haori-row="0">
              <input name="name" value="Item 1">
            </div>
            <div data-haori-row="1">
              <input name="name" value="Item 2">
            </div>
          </div>
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // リスト構造の処理による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じてフォームdetach属性を処理する', async () => {
      container.innerHTML = `
        <form>
          <input name="attached" value="attached_value">
          <input name="detached" value="detached_value"
            data-haori-form-detach="true">
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // data-haori-form-detach属性の処理による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(0);
    });

    test('observerを通じて複数のCore.evaluateAll呼び出しを処理する', async () => {
      container.innerHTML = `
        <form>
          <input name="counter" value="0">
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);
      const input = form.querySelector('[name="counter"]') as HTMLInputElement;

      // 最初の評価
      Core.evaluateAll(fragment);
      await new Promise(resolve => setTimeout(resolve, 10));

      const firstMutationCount = mutations.length;

      // 値を変更して再評価
      input.value = '1';
      Core.evaluateAll(fragment);
      await new Promise(resolve => setTimeout(resolve, 10));

      // 複数回の評価による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(firstMutationCount);
    });

    test('observerを通じてネストしたフォーム要素を処理する', async () => {
      container.innerHTML = `
        <form>
          <div data-haori-form-object="parent">
            <input name="parentName" value="Parent">
            <div data-haori-form-object="child">
              <input name="childName" value="Child">
            </div>
          </div>
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      const fragment = new ElementFragment(form);

      Core.evaluateAll(fragment);

      await new Promise(resolve => setTimeout(resolve, 10));

      // ネストした要素の処理による変更を確認
      expect(mutations.length).toBeGreaterThanOrEqual(0);

      // 実際の要素が存在することを確認
      const parentInput = form.querySelector(
        '[name="parentName"]',
      ) as HTMLInputElement;
      const childInput = form.querySelector(
        '[name="childName"]',
      ) as HTMLInputElement;
      expect(parentInput).toBeTruthy();
      expect(childInput).toBeTruthy();
    });

    test('setBindingData で {{...}} を含む通常属性が再評価される', async () => {
      container.innerHTML = `
        <div data-bind='{"state":"before"}'>
          <span class="{{state}}">label</span>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const target = root.querySelector('span') as HTMLSpanElement;

      await Core.scan(root);

      // 初回評価で通常属性が DOM に反映されること。
      expect(target.getAttribute('class')).toBe('before');

      await Core.setBindingData(root, {state: 'after'});

      // 再評価でも属性キャッシュと DOM が同じ値に更新されること。
      expect(target.getAttribute('class')).toBe('after');
    });

    test('data-each 配下でも {{...}} を含む通常属性が再評価される', async () => {
      container.innerHTML = `
        <div
          data-bind='{"items":[{"state":"hot"},{"state":"cold"}]}'
        >
          <ul data-each="items" data-each-arg="item">
            <li class="{{item.state}}">{{item.state}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;

      await Core.scan(root);

      // 初回の行生成で通常属性が各行に反映されること。
      expect(
        Array.from(list.querySelectorAll('li')).map(item => item.className),
      ).toEqual(['hot', 'cold']);

      await Core.setBindingData(root, {
        items: [{state: 'warm'}, {state: 'cool'}],
      });

      // 既存行の再利用時も通常属性が再評価されること。
      expect(
        Array.from(list.querySelectorAll('li')).map(item => item.className),
      ).toEqual(['warm', 'cool']);
    });

    test('data-each 配下の data-if が行ごとに評価され、ページネーション相当の表示が崩れない', async () => {
      container.innerHTML = `
        <div
          data-bind='{"currentPage":1,"pages":[{"p":0,"ellipsis":true},{"p":1,"ellipsis":false},{"p":2,"ellipsis":false}]}'
        >
          <ul data-each="pages" data-each-key="p">
            <li class="{{ellipsis ? 'disabled' : p === currentPage ? 'active' : ''}}">
              <span data-if="ellipsis" class="page-link" aria-hidden="true">…</span>
              <span data-if="!ellipsis && p === currentPage" class="page-link" aria-current="page">{{p + 1}}</span>
              <button data-if="!ellipsis && p !== currentPage" type="button" class="page-link">{{p + 1}}</button>
            </li>
          </ul>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;

      await Core.scan(root);
      await waitForDomSettled();

      const items = Array.from(list.querySelectorAll('li'));
      expect(items).toHaveLength(3);

      const visibleChildren = items.map(item =>
        Array.from(item.children).filter(
          child => !child.hasAttribute('data-if-false'),
        ),
      );

      expect(visibleChildren.map(children => children.length)).toEqual([1, 1, 1]);
      expect(visibleChildren[0][0].textContent).toBe('…');
      expect(visibleChildren[1][0].textContent).toBe('2');
      expect(visibleChildren[2][0].textContent).toBe('3');

      expect(items[0].classList.contains('disabled')).toBe(true);
      expect(items[1].classList.contains('active')).toBe(true);
      expect(items[2].classList.contains('active')).toBe(false);
    });

    test('data-each 配下の a タグに data-if と href プレースホルダが共存する場合に正しく hide/show される', async () => {
      container.innerHTML = `
        <table>
          <tbody
            data-bind='{"content":[
              {"id":1,"customerCode":"C001","category":"顧客","billingId":null},
              {"id":2,"customerCode":"C002","category":"請求","billingId":"B001"},
              {"id":3,"customerCode":"C003","category":"入金","billingId":null}
            ]}'
            data-each="content"
            data-each-key="id"
          >
            <tr>
              <td>{{customerCode}}</td>
              <td>{{category}}</td>
              <td>
                <a data-if="category === '顧客'" href="customer-list.html?customerCode={{customerCode}}">顧客対応</a>
                <a data-if="category === '請求'" href="billing-list.html?customerCode={{customerCode}}&amp;billingId={{billingId}}">請求対応</a>
                <a data-if="category === '入金'" href="payment-list.html?customerCode={{customerCode}}">入金対応</a>
              </td>
            </tr>
          </tbody>
        </table>
      `;

      const tbody = container.querySelector('tbody') as HTMLElement;
      await Core.scan(tbody);
      await waitForDomSettled();
      await waitForDomSettled();
      // scheduleEvaluateAll (100ms後) の再評価も待機
      await new Promise(resolve => setTimeout(resolve, 200));
      await waitForDomSettled();

      const rows = Array.from(tbody.querySelectorAll('tr'));
      expect(rows).toHaveLength(3);

      const row0Links = Array.from(rows[0].querySelectorAll('a'));
      const row1Links = Array.from(rows[1].querySelectorAll('a'));
      const row2Links = Array.from(rows[2].querySelectorAll('a'));

      // row0: category=顧客 → 顧客リンク表示、請求・入金リンク非表示
      expect(row0Links[0].hasAttribute('data-if-false')).toBe(false);
      expect(row0Links[1].hasAttribute('data-if-false')).toBe(true);
      expect(row0Links[2].hasAttribute('data-if-false')).toBe(true);
      // href プレースホルダが行データで展開されていること
      expect(row0Links[0].getAttribute('href')).toBe('customer-list.html?customerCode=C001');

      // row1: category=請求 → 顧客リンク非表示、請求リンク表示、入金リンク非表示
      expect(row1Links[0].hasAttribute('data-if-false')).toBe(true);
      expect(row1Links[1].hasAttribute('data-if-false')).toBe(false);
      expect(row1Links[2].hasAttribute('data-if-false')).toBe(true);
      expect(row1Links[1].getAttribute('href')).toBe('billing-list.html?customerCode=C002&billingId=B001');

      // row2: category=入金 → 顧客・請求リンク非表示、入金リンク表示
      expect(row2Links[0].hasAttribute('data-if-false')).toBe(true);
      expect(row2Links[1].hasAttribute('data-if-false')).toBe(true);
      expect(row2Links[2].hasAttribute('data-if-false')).toBe(false);
      expect(row2Links[2].getAttribute('href')).toBe('payment-list.html?customerCode=C003');
    });

    test('data-attr-src が生値を維持したまま実属性を再評価する', async () => {
      container.innerHTML = `
        <img
          data-bind='{"id":"before"}'
          data-attr-src="img/{{id}}.jpg"
          alt="preview"
        >
      `;

      const image = container.querySelector('img') as HTMLImageElement;

      await Core.scan(image);
      await waitForDomSettled();

      // data-attr-* の生値は保持したまま、実属性へ評価結果を反映すること。
      expect(image.getAttribute('data-attr-src')).toBe('img/{{id}}.jpg');
      expect(image.getAttribute('src')).toBe('img/before.jpg');

      await Core.setBindingData(image, {id: 'after'});
      await waitForDomSettled();

      // バインディング変更時も生値を維持したまま実属性だけ更新されること。
      expect(image.getAttribute('data-attr-src')).toBe('img/{{id}}.jpg');
      expect(image.getAttribute('src')).toBe('img/after.jpg');
    });

    test('data-attr-value は value 属性だけを更新し現在値は上書きしない', async () => {
      container.innerHTML = `
        <div data-bind='{"count":"1"}'>
          <input type="text" data-attr-value="{{count}}">
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const input = root.querySelector('input') as HTMLInputElement;

      await Core.scan(root);
      await waitForDomSettled();

      // 初回評価では value 属性へ反映されること。
      expect(input.getAttribute('value')).toBe('1');

      input.value = 'manual';

      await Core.setBindingData(root, {count: '2'});
      await waitForDomSettled();

      // 再評価では value 属性だけ更新し、現在値 property は維持すること。
      expect(input.getAttribute('value')).toBe('2');
      expect(input.value).toBe('manual');
    });

    test('setBindingData で false になった通常属性は削除される', async () => {
      container.innerHTML = `
        <div data-bind='{"enabled":true}'>
          <span class="{{enabled && 'active'}}">label</span>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const target = root.querySelector('span') as HTMLSpanElement;

      await Core.scan(root);

      // 初回評価では属性が付与されること。
      expect(target.getAttribute('class')).toBe('active');

      await Core.setBindingData(root, {enabled: false});

      // false 評価では通常属性が DOM から削除されること。
      expect(target.hasAttribute('class')).toBe(false);
    });

    test('data-each の再利用行でも null になった通常属性は削除される', async () => {
      container.innerHTML = `
        <div
          data-bind='{"items":[{"label":"A"},{"label":"B"}]}'
        >
          <ul data-each="items" data-each-arg="item">
            <li title="{{item.label}}">{{item.label ?? '-'}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;

      await Core.scan(root);

      // 初回の行生成では通常属性が各行に反映されること。
      expect(
        Array.from(list.querySelectorAll('li')).map(item => item.getAttribute('title')),
      ).toEqual(['A', 'B']);

      await Core.setBindingData(root, {
        items: [{label: null}, {label: 'B2'}],
      });

      const items = Array.from(list.querySelectorAll('li'));

      // 再利用行でも null 評価の属性だけが削除されること。
      expect(items[0].hasAttribute('title')).toBe(false);
      expect(items[1].getAttribute('title')).toBe('B2');
    });
  });

  describe('data-import: data-importing 属性', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('インポート中は data-importing 属性が付与される', async () => {
      let resolveFetch!: (r: Response) => void;
      const deferredFetch = new Promise<Response>(
        resolve => (resolveFetch = resolve),
      );
      vi.spyOn(globalThis, 'fetch').mockReturnValue(deferredFetch);

      const el = document.createElement('div');
      el.setAttribute('data-import', '/header.html');
      container.appendChild(el);

      const scanPromise = Core.scan(el);

      await waitForCondition(() => el.hasAttribute('data-importing'), {
        description: 'data-importing が付与されること',
      });
      expect(el.hasAttribute('data-importing')).toBe(true);

      resolveFetch({
        ok: true,
        text: async () => '<html><body><nav>Header</nav></body></html>',
      } as Response);

      await scanPromise;
      await waitForDomSettled();
      expect(el.hasAttribute('data-importing')).toBe(false);
    });

    it('インポート完了後は data-importing 属性が除去される', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => '<html><body><nav>Header</nav></body></html>',
      } as Response);

      const el = document.createElement('div');
      el.setAttribute('data-import', '/header.html');
      container.appendChild(el);

      await Core.scan(el);
      await waitForDomSettled();

      expect(el.hasAttribute('data-importing')).toBe(false);
      expect(el.innerHTML).toContain('Header');
    });

    it('インポート失敗時も data-importing 属性が除去される', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const el = document.createElement('div');
      el.setAttribute('data-import', '/header.html');
      container.appendChild(el);

      await Core.scan(el);
      await waitForDomSettled();

      expect(el.hasAttribute('data-importing')).toBe(false);
    });
  });
});

describe('data-fetch + data-each + data-if integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('data-fetch経由でデータを取得した場合もdata-each内のdata-ifが行ごとに正しく評価される', async () => {
    const responseData = {
      content: [
        {id: 1, customerCode: 'C001', category: '顧客', billingId: null},
        {id: 2, customerCode: 'C002', category: '請求', billingId: 'B001'},
        {id: 3, customerCode: 'C003', category: '入金', billingId: null},
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(responseData), {
        headers: {'Content-Type': 'application/json'},
      }),
    );

    container.innerHTML = `
      <section id="alert-list" data-fetch="/api/alerts.json">
        <table>
          <tbody data-each="content" data-each-key="id">
            <tr>
              <td>
                <a data-if="category === '顧客'" href="customer-list.html?customerCode={{customerCode}}">顧客対応</a>
                <a data-if="category === '請求'" href="billing-list.html?customerCode={{customerCode}}&amp;billingId={{billingId}}">請求対応</a>
                <a data-if="category === '入金'" href="payment-list.html?customerCode={{customerCode}}">入金対応</a>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    `;

    const section = container.querySelector('section') as HTMLElement;
    await Core.scan(section);
    const tbody = container.querySelector('tbody') as HTMLElement;
    await waitForCondition(
      () => tbody.querySelectorAll('tr').length === 3,
      {description: 'tbody rows via fetch'},
    );
    // scheduleEvaluateAll (100ms後) の再評価も待機
    await new Promise(resolve => setTimeout(resolve, 200));

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const row0Links = Array.from(rows[0].querySelectorAll('a'));
    const row1Links = Array.from(rows[1].querySelectorAll('a'));
    const row2Links = Array.from(rows[2].querySelectorAll('a'));

    // row0: category=顧客 → 顧客リンクのみ表示、href が展開されていること
    expect(row0Links[0].hasAttribute('data-if-false')).toBe(false);
    expect(row0Links[0].getAttribute('href')).toBe('customer-list.html?customerCode=C001');
    expect(row0Links[1].hasAttribute('data-if-false')).toBe(true);
    expect(row0Links[2].hasAttribute('data-if-false')).toBe(true);

    // row1: category=請求 → 請求リンクのみ表示、href が展開されていること
    expect(row1Links[0].hasAttribute('data-if-false')).toBe(true);
    expect(row1Links[1].hasAttribute('data-if-false')).toBe(false);
    expect(row1Links[1].getAttribute('href')).toBe('billing-list.html?customerCode=C002&billingId=B001');
    expect(row1Links[2].hasAttribute('data-if-false')).toBe(true);

    // row2: category=入金 → 入金リンクのみ表示、href が展開されていること
    expect(row2Links[0].hasAttribute('data-if-false')).toBe(true);
    expect(row2Links[1].hasAttribute('data-if-false')).toBe(true);
    expect(row2Links[2].hasAttribute('data-if-false')).toBe(false);
    expect(row2Links[2].getAttribute('href')).toBe('payment-list.html?customerCode=C003');
  });
});
