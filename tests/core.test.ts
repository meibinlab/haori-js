/**
 * @fileoverview Coreクラスのテスト
 */

import {vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {
  waitForCondition,
  waitForDomSettled,
  waitForIdle,
} from './helpers/async';

describe('Core', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('evaluateAll', () => {
    test('data-bind 属性の値が in-memory のバインドデータと一致する', async () => {
      // 仕様「`data-bind`」の「`data-bind` 属性と in-memory のバインドデータは
      // 常に一致します」。走査で属性から取り込み、`setBindingData()` の後は属性へ
      // ミラーし返す。
      container.innerHTML = `
        <div data-bind='{"state":"before"}'>{{state}}</div>
      `;

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(container);
      await waitForIdle();

      expect(Core.getBindingData(element)).toEqual({state: 'before'});
      expect(element.textContent?.trim()).toBe('before');

      await Core.setBindingData(element, {state: 'after'});
      await waitForIdle();

      expect(JSON.parse(element.getAttribute('data-bind') as string)).toEqual({
        state: 'after',
      });
      expect(element.textContent?.trim()).toBe('after');
    });

    test('入れ子の data-form-object が階層どおりに収集される', async () => {
      // 仕様「`data-form-object`」の「フォーム値をネストしたオブジェクトとして
      // 収集します」。
      container.innerHTML = `
        <form>
          <div data-form-object="parent">
            <input name="parentName" value="Parent">
            <div data-form-object="child">
              <input name="childName" value="Child">
            </div>
          </div>
        </form>
      `;

      const form = container.querySelector('form') as HTMLFormElement;
      await Core.scan(container);
      await waitForIdle();

      expect(Form.getValues(Fragment.get(form) as ElementFragment)).toEqual({
        parent: {
          parentName: 'Parent',
          child: {childName: 'Child'},
        },
      });
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

    test('行スコープだけを参照する行は同じ行データなら再評価しない', async () => {
      // テンプレートが data-each-arg の名前しか参照しない場合、要素データが同値なら
      // 描画結果も変わらないため再評価を省略する。
      container.innerHTML = `
        <div id="root">
          <p id="status">{{status}}</p>
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>{{item.render(item)}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;
      const renderSpy = vi.fn((item: {label: string}) => item.label);
      const items = [
        {id: 'a', label: 'alpha', render: renderSpy},
        {id: 'b', label: 'beta', render: renderSpy},
      ];

      await Core.scan(root);
      await Core.setBindingData(root, {items, status: 'before'});
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 150));
      await waitForDomSettled();

      const baselineCalls = renderSpy.mock.calls.length;
      expect(baselineCalls).toBeGreaterThanOrEqual(2);

      await Core.setBindingData(root, {items, status: 'after'});
      await waitForDomSettled();

      expect(renderSpy).toHaveBeenCalledTimes(baselineCalls);
      expect(container.querySelector('#status')?.textContent).toBe('after');
      expect(
        Array.from(container.querySelectorAll('li')).map(
          item => item.textContent,
        ),
      ).toEqual(['alpha', 'beta']);
    });

    test('行の外を参照する行は行データが同値でも再評価する', async () => {
      // テンプレートが行スコープ外の名前を参照する場合、要素データが同値でも
      // 行外データの更新で描画が変わるため再評価が必要になる。
      container.innerHTML = `
        <div id="root">
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>{{item.label}}:{{suffix}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;
      const items = [
        {id: 'a', label: 'alpha'},
        {id: 'b', label: 'beta'},
      ];

      await Core.scan(root);
      await Core.setBindingData(root, {items, suffix: 'before'});
      await waitForDomSettled();

      expect(
        Array.from(container.querySelectorAll('li')).map(item =>
          item.textContent?.trim(),
        ),
      ).toEqual(['alpha:before', 'beta:before']);

      // 一覧そのものは同値のまま、行の外にある値だけを更新する。
      await Core.setBindingData(root, {items, suffix: 'after'});
      await waitForDomSettled();

      expect(
        Array.from(container.querySelectorAll('li')).map(item =>
          item.textContent?.trim(),
        ),
      ).toEqual(['alpha:after', 'beta:after']);
    });

    test('同値の新しい配列なら data-each 全体の差分更新をスキップする', async () => {
      container.innerHTML = `
        <div id="root">
          <p id="status">{{status}}</p>
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>{{item.label}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;

      await Core.scan(root);
      await Core.setBindingData(root, {
        items: [
          {id: 'a', label: 'alpha'},
          {id: 'b', label: 'beta'},
        ],
        status: 'before',
      });
      await waitForDomSettled();

      const updateDiffSpy = vi.spyOn(
        Core as unknown as {
          updateDiff: (
            parent: ElementFragment,
            newList: (Record<string, unknown> | string | number)[],
          ) => Promise<void>;
        },
        'updateDiff',
      );

      await Core.setBindingData(root, {
        items: [
          {id: 'a', label: 'alpha'},
          {id: 'b', label: 'beta'},
        ],
        status: 'after',
      });
      await waitForDomSettled();

      expect(updateDiffSpy).not.toHaveBeenCalled();
      expect(container.querySelector('#status')?.textContent).toBe('after');
      expect(
        Array.from(container.querySelectorAll('li')).map(
          item => item.textContent,
        ),
      ).toEqual(['alpha', 'beta']);

      updateDiffSpy.mockRestore();
    });

    test('data-each の並び順変更では eachupdate が新しいキー順を通知する', async () => {
      container.innerHTML = `
        <div id="root">
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>{{item.label}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;
      const handler = vi.fn();
      list.addEventListener('haori:eachupdate', handler);

      await Core.scan(root);
      await Core.setBindingData(root, {
        items: [
          {id: 'a', label: 'alpha'},
          {id: 'b', label: 'beta'},
          {id: 'c', label: 'gamma'},
        ],
      });
      await waitForDomSettled();
      handler.mockClear();

      await Core.setBindingData(root, {
        items: [
          {id: 'b', label: 'beta'},
          {id: 'c', label: 'gamma'},
          {id: 'a', label: 'alpha'},
        ],
      });
      await waitForDomSettled();

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.added).toEqual([]);
      expect(event.detail.removed).toEqual([]);
      expect(event.detail.order).toEqual(['b', 'c', 'a']);
      expect(event.detail.total).toBe(3);
    });

    test('data-each の追加削除同時更新でも eachupdate が差分を正しく通知する', async () => {
      container.innerHTML = `
        <div id="root">
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>{{item.label}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;
      const handler = vi.fn();
      list.addEventListener('haori:eachupdate', handler);

      await Core.scan(root);
      await Core.setBindingData(root, {
        items: [
          {id: 'a', label: 'alpha'},
          {id: 'b', label: 'beta'},
          {id: 'c', label: 'gamma'},
        ],
      });
      await waitForDomSettled();
      handler.mockClear();

      await Core.setBindingData(root, {
        items: [
          {id: 'b', label: 'beta'},
          {id: 'd', label: 'delta'},
        ],
      });
      await waitForDomSettled();

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.added).toEqual(['d']);
      expect(event.detail.removed).toEqual(['a', 'c']);
      expect(event.detail.order).toEqual(['b', 'd']);
      expect(event.detail.total).toBe(2);
      expect(
        Array.from(list.querySelectorAll('li')).map(item => item.textContent),
      ).toEqual(['beta', 'delta']);
    });

    test('変更された再利用行は即時再評価のみ行い、遅延再評価を重ねない', async () => {
      container.innerHTML = `
        <div id="root">
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>{{renderSpy(item)}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;
      const renderSpy = vi.fn((item: {label: string}) => item.label);

      await Core.scan(root);
      await Core.setBindingData(root, {
        items: [
          {id: 'a', label: 'alpha'},
          {id: 'b', label: 'beta'},
        ],
        renderSpy,
      });
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 150));
      await waitForDomSettled();

      const baselineCalls = renderSpy.mock.calls.length;

      await Core.setBindingData(root, {
        items: [
          {id: 'a', label: 'alpha2'},
          {id: 'b', label: 'beta2'},
        ],
        renderSpy,
      });
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 150));
      await waitForDomSettled();

      expect(renderSpy).toHaveBeenCalledTimes(baselineCalls + 2);
      expect(
        Array.from(container.querySelectorAll('li')).map(
          item => item.textContent,
        ),
      ).toEqual(['alpha2', 'beta2']);
    });

    test('単純な新規 data-each 行では遅延再評価を追加しない', async () => {
      container.innerHTML = `
        <div id="root">
          <ul data-each="items" data-each-key="id">
            <li>{{renderSpy(label)}}</li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;
      const renderSpy = vi.fn((label: string) => label);

      await Core.scan(root);
      await Core.setBindingData(root, {
        items: [
          {id: 'a', label: 'alpha'},
          {id: 'b', label: 'beta'},
        ],
        renderSpy,
      });
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 150));
      await waitForDomSettled();

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(
        Array.from(container.querySelectorAll('li')).map(
          item => item.textContent,
        ),
      ).toEqual(['alpha', 'beta']);
    });

    test('fresh clone 初期化では静的 subtree の属性初期化をスキップする', async () => {
      container.innerHTML = `
        <div id="root">
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>
              <section class="static-block">
                <div class="static-inner">
                  <span>固定ラベル</span>
                </div>
              </section>
              <strong>{{item.label}}</strong>
            </li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;

      await Core.scan(root);

      const initializeElementAttributesSpy = vi.spyOn(
        Core as unknown as {
          initializeElementAttributes: (
            fragment: ElementFragment,
          ) => Promise<void>;
        },
        'initializeElementAttributes',
      );

      await Core.setBindingData(root, {
        items: [
          {id: 'a', label: 'alpha'},
          {id: 'b', label: 'beta'},
        ],
      });
      await waitForDomSettled();

      expect(
        Array.from(list.querySelectorAll('strong')).map(
          item => item.textContent,
        ),
      ).toEqual(['alpha', 'beta']);
      expect(list.querySelectorAll('.static-block')).toHaveLength(2);
      expect(
        Array.from(list.querySelectorAll('.static-block')).map(item =>
          item.textContent?.trim(),
        ),
      ).toEqual(['固定ラベル', '固定ラベル']);
      expect(
        initializeElementAttributesSpy.mock.calls.filter(([fragment]) =>
          fragment.getTarget().classList.contains('static-block'),
        ),
      ).toHaveLength(0);

      initializeElementAttributesSpy.mockRestore();
    });

    test('data-each 配下の data-if が行ごとに評価され、ページネーション相当の表示が崩れない', async () => {
      container.innerHTML = `
        <div
          data-bind='{"currentPage":1,"pages":[
            {"p":0,"ellipsis":true},
            {"p":1,"ellipsis":false},
            {"p":2,"ellipsis":false}
          ]}'
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

      expect(visibleChildren.map(children => children.length)).toEqual([
        1, 1, 1,
      ]);
      expect(visibleChildren[0][0].textContent).toBe('…');
      expect(visibleChildren[1][0].textContent).toBe('2');
      expect(visibleChildren[2][0].textContent).toBe('3');

      expect(items[0].classList.contains('disabled')).toBe(true);
      expect(items[1].classList.contains('active')).toBe(true);
      expect(items[2].classList.contains('active')).toBe(false);
    });

    test('plain nested data-each の入力が同値なら子 data-each の再評価をスキップする', async () => {
      container.innerHTML = `
        <div
          id="root"
          data-bind='{
            "plans":[
              {
                "id":"basic",
                "name":"基本",
                "options":[{"id":"mail","label":"メール"},{"id":"chat","label":"チャット"}]
              },
              {
                "id":"plus",
                "name":"拡張",
                "options":[{"id":"phone","label":"電話"}]
              }
            ]
          }'
        >
          <ul id="plans" data-each="plans" data-each-arg="plan" data-each-key="id">
            <li>
              <span class="plan-name">{{plan.name}}</span>
              <ul class="option-list" data-each="plan.options" data-each-arg="option" data-each-key="id">
                <li>{{option.label}}</li>
              </ul>
            </li>
          </ul>
        </div>
      `;

      const root = container.querySelector('#root') as HTMLElement;
      await Core.scan(root);
      await waitForDomSettled();

      const evaluateEachSpy = vi.spyOn(Core, 'evaluateEach');

      await Core.setBindingData(root, {
        plans: [
          {
            id: 'basic',
            name: '基本改',
            options: [
              {id: 'mail', label: 'メール'},
              {id: 'chat', label: 'チャット'},
            ],
          },
          {
            id: 'plus',
            name: '拡張改',
            options: [{id: 'phone', label: '電話'}],
          },
        ],
      });
      await waitForDomSettled();

      expect(
        Array.from(container.querySelectorAll('.plan-name')).map(item =>
          item.textContent?.trim(),
        ),
      ).toEqual(['基本改', '拡張改']);
      expect(
        Array.from(container.querySelectorAll('.option-list > li')).map(item =>
          item.textContent?.trim(),
        ),
      ).toEqual(['メール', 'チャット', '電話']);
      expect(
        evaluateEachSpy.mock.calls.filter(([fragment]) =>
          fragment.getTarget().classList.contains('option-list'),
        ),
      ).toHaveLength(0);

      evaluateEachSpy.mockRestore();
    });

    test('data-if が false の行では子孫式を評価せず console.error を出さない', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      container.innerHTML = `
        <div
          data-bind='{"items":[{"id":1,"secondary":null},{"id":2,"secondary":{"name":"表示対象"}}]}'
        >
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>
              <div data-if="item.secondary">
                <span class="secondary-name">{{item.secondary.name}}</span>
              </div>
            </li>
          </ul>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;

      await Core.scan(root);
      await waitForDomSettled();

      const items = Array.from(list.querySelectorAll('li'));
      expect(items).toHaveLength(2);

      const firstConditional = items[0].querySelector('div') as HTMLElement;
      const secondConditional = items[1].querySelector('div') as HTMLElement;

      expect(firstConditional.hasAttribute('data-if-false')).toBe(true);
      expect(secondConditional.hasAttribute('data-if-false')).toBe(false);
      expect(items[1].querySelector('.secondary-name')?.textContent).toBe(
        '表示対象',
      );
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test('初回に false の data-if 配下でも bind 更新後に data-each が初期化される', async () => {
      container.innerHTML = `
        <div data-bind='{"record":{"totalCount":null,"items":[]}}'>
          <section data-if="record.totalCount != null">
            <ul data-each="record.items" data-each-key="id" data-each-arg="item">
              <li class="item">{{item.name}}</li>
            </ul>
          </section>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const section = root.querySelector('section') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;

      await Core.scan(root);
      await waitForDomSettled();

      expect(section.hasAttribute('data-if-false')).toBe(true);
      expect(list.querySelectorAll('li')).toHaveLength(1);
      expect(list.textContent).toContain('{{item.name}}');

      await Core.setBindingData(root, {
        record: {
          totalCount: 2,
          items: [
            {id: 1, name: 'A'},
            {id: 2, name: 'B'},
          ],
        },
      });
      await waitForDomSettled();

      const items = Array.from(list.querySelectorAll('li'));

      expect(section.hasAttribute('data-if-false')).toBe(false);
      expect(items).toHaveLength(2);
      expect(items.map(item => item.textContent?.trim())).toEqual(['A', 'B']);
      expect(list.textContent).not.toContain('{{item.name}}');
    });

    test('表示済みの data-if 配下は true から false を経て true に戻ると evaluateAll で再評価される', async () => {
      container.innerHTML = `
        <div data-bind='{"visible":true,"items":[{"id":1,"name":"A"}]}'>
          <section data-if="visible">
            <ul data-each="items" data-each-key="id" data-each-arg="item">
              <li class="item">{{item.name}}</li>
            </ul>
          </section>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const section = root.querySelector('section') as HTMLElement;
      const list = root.querySelector('ul') as HTMLUListElement;

      await Core.scan(root);
      await waitForDomSettled();

      const listFragment = Fragment.get(list) as ElementFragment;
      expect(listFragment.isMounted()).toBe(true);
      expect(
        Array.from(list.querySelectorAll('li')).map(item =>
          item.textContent?.trim(),
        ),
      ).toEqual(['A']);

      await Core.setBindingData(root, {
        visible: false,
        items: [{id: 1, name: 'A'}],
      });
      await waitForDomSettled();

      expect(section.hasAttribute('data-if-false')).toBe(true);

      const evaluateAllSpy = vi.spyOn(Core, 'evaluateAll');
      const scanSpy = vi.spyOn(Core, 'scan');

      await Core.setBindingData(root, {
        visible: true,
        items: [
          {id: 1, name: 'A2'},
          {id: 2, name: 'B'},
        ],
      });
      await waitForDomSettled();

      expect(section.hasAttribute('data-if-false')).toBe(false);
      expect(
        Array.from(list.querySelectorAll('li')).map(item =>
          item.textContent?.trim(),
        ),
      ).toEqual(['A2', 'B']);
      expect(
        evaluateAllSpy.mock.calls.some(call => call[0] === listFragment),
      ).toBe(true);
      expect(scanSpy.mock.calls.some(call => call[0] === list)).toBe(false);

      evaluateAllSpy.mockRestore();
      scanSpy.mockRestore();
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
                <a
                  data-if="category === '請求'"
                  href="billing-list.html?customerCode={{customerCode}}&amp;billingId={{billingId}}"
                  >請求対応</a>
                <a data-if="category === '入金'" href="payment-list.html?customerCode={{customerCode}}">入金対応</a>
              </td>
            </tr>
          </tbody>
        </table>
      `;

      const tbody = container.querySelector('tbody') as HTMLElement;
      await Core.scan(tbody);
      await waitForCondition(() => tbody.querySelectorAll('tr').length === 3, {
        description: 'tbody rows',
      });
      await waitForDomSettled();
      expect(tbody.querySelectorAll('[data-if-false]').length).toBeGreaterThan(
        0,
      );

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
      expect(row0Links[0].getAttribute('href')).toBe(
        'customer-list.html?customerCode=C001',
      );

      // row1: category=請求 → 顧客リンク非表示、請求リンク表示、入金リンク非表示
      expect(row1Links[0].hasAttribute('data-if-false')).toBe(true);
      expect(row1Links[1].hasAttribute('data-if-false')).toBe(false);
      expect(row1Links[2].hasAttribute('data-if-false')).toBe(true);
      expect(row1Links[1].getAttribute('href')).toBe(
        'billing-list.html?customerCode=C002&billingId=B001',
      );

      // row2: category=入金 → 顧客・請求リンク非表示、入金リンク表示
      expect(row2Links[0].hasAttribute('data-if-false')).toBe(true);
      expect(row2Links[1].hasAttribute('data-if-false')).toBe(true);
      expect(row2Links[2].hasAttribute('data-if-false')).toBe(false);
      expect(row2Links[2].getAttribute('href')).toBe(
        'payment-list.html?customerCode=C003',
      );
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

    test('MutationObserver経由の書き戻しでdata-attr-*のattributeMapが上書きされない', async () => {
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

      expect(image.getAttribute('src')).toBe('img/before.jpg');

      // Observer経由の書き戻しをシミュレート: 展開済みの値でsetAttributeを呼ぶ
      const fragment = Fragment.get(image) as ElementFragment;
      await fragment.setAliasedAttribute(
        'data-attr-src',
        'src',
        'img/before.jpg',
        true,
      );
      await waitForDomSettled();

      // attributeMapのテンプレート式が保持され、再バインドで正しく展開されること。
      await Core.setBindingData(image, {id: 'after'});
      await waitForDomSettled();

      expect(image.getAttribute('src')).toBe('img/after.jpg');
    });

    test('data-attr-value は value 属性と現在値を同期する', async () => {
      container.innerHTML = `
        <div data-bind='{"count":"1"}'>
          <input type="text" data-attr-value="{{count}}">
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const input = root.querySelector('input') as HTMLInputElement;

      await Core.scan(root);
      await waitForDomSettled();

      // 初回評価では value 属性と現在値の両方へ反映されること。
      expect(input.getAttribute('value')).toBe('1');
      expect(input.value).toBe('1');

      input.value = 'manual';

      await Core.setBindingData(root, {count: '2'});
      await waitForDomSettled();

      // フォーカスが外れている入力には再適用すること
      // （data-attr-* も value="{{式}}" と同じ規則。仕様書「data-attr-*」参照）。
      expect(input.getAttribute('value')).toBe('2');
      expect(input.value).toBe('2');
    });

    test('data-attr-value はフォーカス中の入力へ現在値を再適用しない', async () => {
      container.innerHTML = `
        <div data-bind='{"count":"1"}'>
          <input type="text" data-attr-value="{{count}}">
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const input = root.querySelector('input') as HTMLInputElement;

      await Core.scan(root);
      await waitForDomSettled();

      // 編集中（フォーカス中）の未コミット入力を再評価で巻き戻さないこと。
      input.focus();
      input.value = 'editing';

      await Core.setBindingData(root, {count: '2'});
      await waitForDomSettled();

      expect(input.getAttribute('value')).toBe('2');
      expect(input.value).toBe('editing');
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
        Array.from(list.querySelectorAll('li')).map(item =>
          item.getAttribute('title'),
        ),
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

    it('未解決参照は初回インポートを停止し、bind 更新で解決したら URL 変更時のみ再実行する', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input: RequestInfo | URL) => {
          const url = String(input);
          const body = url.includes('footer')
            ? '<html><body><footer>Footer</footer></body></html>'
            : '<html><body><nav>Header</nav></body></html>';
          return Promise.resolve({
            ok: true,
            text: async () => body,
          } as Response);
        });

      const root = document.createElement('div');
      const el = document.createElement('div');
      el.setAttribute('data-import', '/partials/{{view}}.html');
      root.appendChild(el);
      container.appendChild(root);

      await Core.scan(root);
      await waitForDomSettled();

      expect(fetchSpy).not.toHaveBeenCalled();

      await Core.setBindingData(root, {view: 'header'});
      await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
        description: 'header import after bind update',
      });
      expect(fetchSpy.mock.calls[0][0]).toBe('/partials/header.html');
      expect(el.innerHTML).toContain('Header');

      await Core.setBindingData(root, {view: 'header'});
      await waitForDomSettled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await Core.setBindingData(root, {view: 'footer'});
      await waitForCondition(() => fetchSpy.mock.calls.length === 2, {
        description: 'footer import after url change',
      });
      expect(fetchSpy.mock.calls[1][0]).toBe('/partials/footer.html');
      expect(el.innerHTML).toContain('Footer');
    });

    it('初回 false の data-if 配下にある data-import は表示後に初期化される', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input: RequestInfo | URL) => {
          const url = String(input);
          return Promise.resolve({
            ok: true,
            text: async () => `<html><body><nav>${url}</nav></body></html>`,
          } as Response);
        });

      container.innerHTML = `
        <div data-bind='{"visible":false,"view":"header"}'>
          <section data-if="visible">
            <div id="import-target" data-import="/partials/{{view}}.html"></div>
          </section>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const section = root.querySelector('section') as HTMLElement;
      const target = root.querySelector('#import-target') as HTMLElement;

      await Core.scan(root);
      await waitForDomSettled();

      expect(section.hasAttribute('data-if-false')).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();

      await Core.setBindingData(root, {visible: true, view: 'header'});
      await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
        description: 'import after false data-if becomes visible',
      });

      expect(section.hasAttribute('data-if-false')).toBe(false);
      expect(fetchSpy.mock.calls[0][0]).toBe('/partials/header.html');
      expect(target.innerHTML).toContain('/partials/header.html');
    });
  });

  describe('bind 更新時の data-fetch 再評価', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('未解決参照は初回フェッチを停止し、シグネチャが変わったときだけ再実行する', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
          const request = init?.body ? JSON.parse(String(init.body)) : {};
          return Promise.resolve(
            new Response(JSON.stringify({query: request.query}), {
              headers: {'Content-Type': 'application/json'},
            }),
          ) as Promise<Response>;
        });

      const root = document.createElement('div');
      const el = document.createElement('div');
      const bindTarget = document.createElement('div');
      bindTarget.id = 'fetch-result';
      el.setAttribute('data-fetch', 'http://api.test/search');
      el.setAttribute('data-fetch-method', 'POST');
      el.setAttribute('data-fetch-data', 'query={{query}}');
      el.setAttribute('data-fetch-bind', '#fetch-result');
      root.appendChild(el);
      root.appendChild(bindTarget);
      container.appendChild(root);

      await Core.scan(root);
      await waitForDomSettled();

      expect(fetchSpy).not.toHaveBeenCalled();

      await Core.setBindingData(root, {query: 'alpha'});
      await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
        description: 'first fetch after query resolved',
      });
      expect(fetchSpy.mock.calls[0][0]).toBe('http://api.test/search');
      expect((fetchSpy.mock.calls[0][1] as RequestInit | undefined)?.body).toBe(
        JSON.stringify({query: 'alpha'}),
      );

      await Core.setBindingData(root, {query: 'alpha'});
      await waitForDomSettled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await Core.setBindingData(root, {query: 'beta'});
      await waitForCondition(() => fetchSpy.mock.calls.length === 2, {
        description: 'second fetch after signature change',
      });
      expect((fetchSpy.mock.calls[1][1] as RequestInit | undefined)?.body).toBe(
        JSON.stringify({query: 'beta'}),
      );
    });

    it('フェッチ結果の bind 更新が同一シグネチャなら再フェッチを起こさない', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({query: 'alpha'}), {
          headers: {'Content-Type': 'application/json'},
        }),
      );

      const root = document.createElement('div');
      root.setAttribute('data-bind', '{"query":"alpha"}');
      const el = document.createElement('div');
      el.setAttribute('data-fetch', 'http://api.test/search?query={{query}}');
      root.appendChild(el);
      container.appendChild(root);

      await Core.scan(root);
      await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
        description: 'initial fetch',
      });
      await waitForDomSettled();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(
        'http://api.test/search?query=alpha',
      );
    });

    it('初回 false の data-if 配下にある data-fetch は表示後に初期化される', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({query: 'alpha'}), {
          headers: {'Content-Type': 'application/json'},
        }),
      );

      container.innerHTML = `
        <div data-bind='{"visible":false,"query":"alpha"}'>
          <section data-if="visible">
            <div
              data-fetch="http://api.test/search?query={{query}}"
              data-fetch-bind="#fetch-result"></div>
          </section>
          <div id="fetch-result"></div>
        </div>
      `;

      const root = container.querySelector('div') as HTMLElement;
      const section = root.querySelector('section') as HTMLElement;
      const bindTarget = root.querySelector('#fetch-result') as HTMLElement;

      await Core.scan(root);
      await waitForDomSettled();

      expect(section.hasAttribute('data-if-false')).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();

      await Core.setBindingData(root, {visible: true, query: 'alpha'});
      await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
        description: 'fetch after false data-if becomes visible',
      });

      expect(section.hasAttribute('data-if-false')).toBe(false);
      expect(fetchSpy.mock.calls[0][0]).toBe(
        'http://api.test/search?query=alpha',
      );
      expect(
        JSON.parse(bindTarget.getAttribute('data-bind') || '{}').query,
      ).toBe('alpha');
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
                <a
                  data-if="category === '請求'"
                  href="billing-list.html?customerCode={{customerCode}}&amp;billingId={{billingId}}"
                  >請求対応</a>
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
    await waitForCondition(() => tbody.querySelectorAll('tr').length === 3, {
      description: 'tbody rows via fetch',
    });
    await waitForDomSettled();
    expect(tbody.querySelectorAll('[data-if-false]').length).toBeGreaterThan(0);

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const row0Links = Array.from(rows[0].querySelectorAll('a'));
    const row1Links = Array.from(rows[1].querySelectorAll('a'));
    const row2Links = Array.from(rows[2].querySelectorAll('a'));

    // row0: category=顧客 → 顧客リンクのみ表示、href が展開されていること
    expect(row0Links[0].hasAttribute('data-if-false')).toBe(false);
    expect(row0Links[0].getAttribute('href')).toBe(
      'customer-list.html?customerCode=C001',
    );
    expect(row0Links[1].hasAttribute('data-if-false')).toBe(true);
    expect(row0Links[2].hasAttribute('data-if-false')).toBe(true);

    // row1: category=請求 → 請求リンクのみ表示、href が展開されていること
    expect(row1Links[0].hasAttribute('data-if-false')).toBe(true);
    expect(row1Links[1].hasAttribute('data-if-false')).toBe(false);
    expect(row1Links[1].getAttribute('href')).toBe(
      'billing-list.html?customerCode=C002&billingId=B001',
    );
    expect(row1Links[2].hasAttribute('data-if-false')).toBe(true);

    // row2: category=入金 → 入金リンクのみ表示、href が展開されていること
    expect(row2Links[0].hasAttribute('data-if-false')).toBe(true);
    expect(row2Links[1].hasAttribute('data-if-false')).toBe(true);
    expect(row2Links[2].hasAttribute('data-if-false')).toBe(false);
    expect(row2Links[2].getAttribute('href')).toBe(
      'payment-list.html?customerCode=C003',
    );
  });
});
