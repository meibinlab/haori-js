/* @vitest-environment jsdom */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-derive', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it('派生値は子孫要素から参照できるが、定義要素自身や外側には公開しない', async () => {
    container.innerHTML = `
      <div
        id="root"
        data-bind='{
          "selectedId":"basic",
          "groups":[
            {"id":"basic","options":[{"id":"mail"},{"id":"chat"}]},
            {"id":"plus","options":[{"id":"phone"}]}
          ]
        }'
      >
        <section
          id="host"
          data-derive="groups.filter(group => group.id === selectedId)[0]?.options ?? []"
          data-derive-name="optionList"
          title="{{optionList?.length}}"
        >
          <span id="child-count">{{optionList.length}}</span>
        </section>
        <span id="outside" title="{{optionList?.length}}">outside</span>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const host = container.querySelector('#host') as HTMLElement;
    const childCount = container.querySelector('#child-count') as HTMLElement;
    const outside = container.querySelector('#outside') as HTMLElement;

    expect(host.hasAttribute('title')).toBe(false);
    expect(childCount.textContent).toBe('2');
    expect(outside.hasAttribute('title')).toBe(false);
  });

  it('同名の派生値は内側の data-derive が優先される', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"outerLabel":"外側","innerLabel":"内側"}'>
        <section data-derive="outerLabel" data-derive-name="label">
          <span id="outer">{{label}}</span>
          <section data-derive="innerLabel" data-derive-name="label">
            <span id="inner">{{label}}</span>
          </section>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    expect(container.querySelector('#outer')?.textContent).toBe('外側');
    expect(container.querySelector('#inner')?.textContent).toBe('内側');
  });

  it('フォーム更新で派生値を再評価し、select の data-each を更新する', async () => {
    container.innerHTML = `
      <div
        id="root"
        data-bind='{
          "contracts":[
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
        <form id="plan-form" data-bind='{"contractId":"basic","optionId":""}'>
          <select id="contract" name="contractId">
            <option value="basic">基本</option>
            <option value="plus">拡張</option>
          </select>

          <div
            data-derive="contracts.filter(contract => contract.id === contractId)[0]?.options ?? []"
            data-derive-name="optionList"
          >
            <select id="option" name="optionId" data-each="optionList" data-each-arg="option" data-each-key="id">
              <option data-each-before value="">選択してください</option>
              <option value="{{option.id}}">{{option.label}}</option>
            </select>
          </div>
        </form>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const contractSelect = container.querySelector('#contract') as HTMLSelectElement;
    const optionSelect = container.querySelector('#option') as HTMLSelectElement;

    await waitForCondition(() => optionSelect.querySelectorAll('option').length === 3, {
      description: 'initial derived options',
    });
    expect(
      Array.from(optionSelect.querySelectorAll('option')).map(
        option => (option as HTMLOptionElement).value,
      ),
    ).toEqual([
      '',
      'mail',
      'chat',
    ]);

    await Core.changeValue(contractSelect, 'plus');

    await waitForCondition(() => optionSelect.querySelectorAll('option').length === 2, {
      description: 'updated derived options',
    });
    expect(
      Array.from(optionSelect.querySelectorAll('option')).map(
        option => (option as HTMLOptionElement).value,
      ),
    ).toEqual([
      '',
      'phone',
    ]);
    expect(Array.from(optionSelect.querySelectorAll('option')).map(option => option.textContent?.trim())).toEqual([
      '選択してください',
      '電話',
    ]);
  });

  it('名前衝突時は同一スコープでは派生値を優先し、より内側の form バインド値はさらに優先する', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"status":"outer"}'>
        <section
          id="derive-host"
          data-bind='{"status":"host"}'
          data-derive="'derived'"
          data-derive-name="status"
        >
          <p id="derived-scope">{{status}}</p>
          <form id="status-form" data-bind='{"status":"form"}'>
            <input id="status-input" name="status" value="{{status}}">
            <p id="form-scope">{{status}}</p>
          </form>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const derivedScope = container.querySelector('#derived-scope') as HTMLElement;
    const formScope = container.querySelector('#form-scope') as HTMLElement;
    const statusInput = container.querySelector('#status-input') as HTMLInputElement;

    expect(derivedScope.textContent).toBe('derived');
    expect(formScope.textContent).toBe('form');
    expect(statusInput.value).toBe('form');

    await Core.changeValue(statusInput, 'changed-by-form');
    await waitForDomSettled();

    expect(derivedScope.textContent).toBe('derived');
    expect(formScope.textContent).toBe('changed-by-form');
    expect(statusInput.value).toBe('changed-by-form');
  });

  it('未解決参照になったら直前の派生値を保持せず、data-each は空配列相当になる', async () => {
    container.innerHTML = `
      <div
        id="root"
        data-bind='{
          "selectedId":"basic",
          "groupsById":{
            "basic":{
              "options":[{"id":"mail","label":"メール"},{"id":"chat","label":"チャット"}]
            }
          }
        }'
      >
        <section
          data-derive="groupsById[selectedId]?.options"
          data-derive-name="optionList"
        >
          <ul id="option-list" data-each="optionList" data-each-arg="option" data-each-key="id">
            <li data-each-before>先頭固定</li>
            <li>{{option.label}}</li>
            <li data-each-after>末尾固定</li>
          </ul>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForCondition(() => container.querySelectorAll('#option-list li').length === 4, {
      description: 'resolved derived rows',
    });

    expect(Array.from(container.querySelectorAll('#option-list li')).map(item => item.textContent?.trim())).toEqual([
      '先頭固定',
      'メール',
      'チャット',
      '末尾固定',
    ]);

    await Core.setBindingData(root, {
      selectedId: 'basic',
    });
    await waitForCondition(() => container.querySelectorAll('#option-list li').length === 2, {
      description: 'cleared derived rows',
    });

    expect(Array.from(container.querySelectorAll('#option-list li')).map(item => item.textContent?.trim())).toEqual([
      '先頭固定',
      '末尾固定',
    ]);
  });

  it('data-derive-name が未指定や空白だけなら派生値を公開しない', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"status":"bind-value"}'>
        <section id="missing-name" data-derive="'derived-value'">
          <p id="missing-name-child">{{status}}</p>
          <p id="missing-export">{{derivedValue}}</p>
        </section>
        <section
          id="blank-name"
          data-derive="'another-derived'"
          data-derive-name="   "
        >
          <p id="blank-name-child">{{status}}</p>
          <p id="blank-export">{{derivedValue}}</p>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    expect(container.querySelector('#missing-name-child')?.textContent).toBe('bind-value');
    expect(container.querySelector('#blank-name-child')?.textContent).toBe('bind-value');
    expect(container.querySelector('#missing-export')?.textContent).toBe('');
    expect(container.querySelector('#blank-export')?.textContent).toBe('');
  });

  it('data-derive-name を動的に切り替えると旧名を消して新しい名前で公開する', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"status":"derived-value"}'>
        <section
          id="host"
          data-derive="status"
          data-derive-name="currentStatus"
        >
          <p id="current">{{currentStatus}}</p>
          <p id="renamed">{{renamedStatus}}</p>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const host = container.querySelector('#host') as HTMLElement;
    const rootFragment = Fragment.get(root) as ElementFragment;
    await Core.scan(root);
    await waitForDomSettled();

    expect(container.querySelector('#current')?.textContent).toBe('derived-value');
    expect(container.querySelector('#renamed')?.textContent).toBe('');

    await Core.setAttribute(host, 'data-derive-name', 'renamedStatus');
    await Core.evaluateAll(rootFragment);
    await waitForDomSettled();

    expect(container.querySelector('#current')?.textContent).toBe('');
    expect(container.querySelector('#renamed')?.textContent).toBe('derived-value');
  });

  it('data-derive または data-derive-name を削除すると公開を停止する', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"status":"derived-value"}'>
        <section
          id="host"
          data-derive="status"
          data-derive-name="currentStatus"
        >
          <p id="value">{{currentStatus}}</p>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const host = container.querySelector('#host') as HTMLElement;
    const rootFragment = Fragment.get(root) as ElementFragment;
    await Core.scan(root);
    await waitForDomSettled();

    expect(container.querySelector('#value')?.textContent).toBe('derived-value');

    await Core.setAttribute(host, 'data-derive', null);
    await Core.evaluateAll(rootFragment);
    await waitForDomSettled();

    expect(container.querySelector('#value')?.textContent).toBe('');

    await Core.setAttribute(host, 'data-derive', 'status');
    await Core.evaluateAll(rootFragment);
    await waitForDomSettled();

    expect(container.querySelector('#value')?.textContent).toBe('derived-value');

    await Core.setAttribute(host, 'data-derive-name', null);
    await Core.evaluateAll(rootFragment);
    await waitForDomSettled();

    expect(container.querySelector('#value')?.textContent).toBe('');
  });

  it('MutationObserver 経由で data-derive を後付けしても子孫へ公開できる', async () => {
    const {Observer} = await import('../src/observer');
    Observer.observe(container);

    const root = document.createElement('div');
    root.id = 'observer-root';
    root.setAttribute('data-bind', '{"status":"observer-value"}');
    root.innerHTML = `
      <section id="observer-host">
        <p id="observer-value">{{currentStatus}}</p>
      </section>
    `;
    container.appendChild(root);

    await waitForDomSettled();

    const host = root.querySelector('#observer-host') as HTMLElement;
    const value = root.querySelector('#observer-value') as HTMLElement;

    await waitForCondition(() => value.textContent === '', {
      description: 'observer initial scan',
    });

    expect(value.textContent).toBe('');

    host.setAttribute('data-derive', 'status');
    host.setAttribute('data-derive-name', 'currentStatus');

    await waitForCondition(() => value.textContent === 'observer-value', {
      description: 'observer attached derive',
    });
  });

  it('data-if が false の枝では data-derive 子孫を評価せず、表示後に初期化する', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    container.innerHTML = `
      <div id="root" data-bind='{"visible":false,"status":{"label":"受付中"}}'>
        <section id="conditional" data-if="visible">
          <div data-derive="status" data-derive-name="currentStatus">
            <p id="derived-label">{{currentStatus.label}}</p>
          </div>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const conditional = container.querySelector('#conditional') as HTMLElement;
    const derivedLabel = container.querySelector('#derived-label') as HTMLElement;

    await Core.scan(root);
    await waitForDomSettled();

    expect(conditional.hasAttribute('data-if-false')).toBe(true);
    expect(derivedLabel.textContent).toBe('{{currentStatus.label}}');
    expect(consoleSpy).not.toHaveBeenCalled();

    await Core.setBindingData(root, {
      visible: true,
      status: {label: '受付中'},
    });
    await waitForDomSettled();

    expect(conditional.hasAttribute('data-if-false')).toBe(false);
    expect(derivedLabel.textContent).toBe('受付中');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('data-fetch で bind 更新された結果に対して data-derive を再計算する', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        const query = url.searchParams.get('query');
        const payload = query === 'beta'
          ? {
            name: '検索結果B',
            options: [
              {id: 'phone', label: '電話'},
            ],
          }
          : {
            name: '検索結果A',
            options: [
              {id: 'mail', label: 'メール'},
              {id: 'chat', label: 'チャット'},
            ],
          };
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as Promise<Response>;
      });

    container.innerHTML = `
      <div id="root" data-bind='{"query":"alpha"}'>
        <div
          id="fetch-source"
          data-fetch="http://api.test/search?query={{query}}"
          data-fetch-bind="#fetch-result"
        ></div>
        <div id="fetch-result">
          <section data-derive="options ?? []" data-derive-name="optionList">
            <h2 id="fetch-name">{{name}}</h2>
            <ul id="fetch-options" data-each="optionList" data-each-arg="option" data-each-key="id">
              <li>{{option.label}}</li>
            </ul>
          </section>
        </div>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
      description: 'initial fetch for derive',
    });
    await waitForCondition(() => container.querySelectorAll('#fetch-options li').length === 2, {
      description: 'initial fetched derive rows',
    });

    expect(container.querySelector('#fetch-name')?.textContent).toBe('検索結果A');
    expect(
      Array.from(container.querySelectorAll('#fetch-options li')).map(item => item.textContent?.trim()),
    ).toEqual(['メール', 'チャット']);

    await Core.setBindingData(root, {query: 'beta'});
    await waitForCondition(() => fetchSpy.mock.calls.length === 2, {
      description: 'updated fetch for derive',
    });
    await waitForCondition(() => container.querySelectorAll('#fetch-options li').length === 1, {
      description: 'updated fetched derive rows',
    });

    expect(container.querySelector('#fetch-name')?.textContent).toBe('検索結果B');
    expect(
      Array.from(container.querySelectorAll('#fetch-options li')).map(item => item.textContent?.trim()),
    ).toEqual(['電話']);
  });

  it('data-import で読み込んだ断片でも親バインドを使って data-derive を初期化できる', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          '<html><body>' +
            '<section data-derive="status" data-derive-name="currentStatus">' +
            '<div><p id="imported-derived">{{currentStatus.label}}</p></div>' +
            '</section>' +
            '</body></html>',
          {headers: {'Content-Type': 'text/html'}},
        ),
      );

    container.innerHTML = `
      <div id="root" data-bind='{"status":{"label":"インポート済み"}}'>
        <div id="import-target" data-import="/partials/derive.html"></div>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
      description: 'import fetch for derive',
    });
    await waitForCondition(() => {
      return container.querySelector('#imported-derived')?.textContent === 'インポート済み';
    }, {
      description: 'imported derive initialized',
    });

    expect(fetchSpy.mock.calls[0][0]).toBe('/partials/derive.html');
    expect(container.querySelector('#imported-derived')?.textContent).toBe('インポート済み');
  });

  it('data-import の再読込で差し替わった断片でも data-derive を再初期化する', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const html = url.includes('footer')
          ? '<html><body>' +
            '<section data-derive="footerStatus" data-derive-name="currentStatus">' +
            '<p id="imported-derived">{{currentStatus.label}}</p>' +
            '<p id="imported-kind">footer</p>' +
            '</section>' +
            '</body></html>'
          : '<html><body>' +
            '<section data-derive="headerStatus" data-derive-name="currentStatus">' +
            '<p id="imported-derived">{{currentStatus.label}}</p>' +
            '<p id="imported-kind">header</p>' +
            '</section>' +
            '</body></html>';
        return Promise.resolve(
          new Response(html, {headers: {'Content-Type': 'text/html'}}),
        ) as Promise<Response>;
      });

    container.innerHTML = `
      <div
        id="root"
        data-bind='{"view":"header","headerStatus":{"label":"ヘッダー"},"footerStatus":{"label":"フッター"}}'
      >
        <div id="import-target" data-import="/partials/{{view}}.html"></div>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
      description: 'initial import for derive replacement',
    });
    await waitForCondition(() => container.querySelector('#imported-derived')?.textContent === 'ヘッダー', {
      description: 'header derive initialized',
    });

    expect(container.querySelector('#imported-kind')?.textContent).toBe('header');

    await Core.setBindingData(root, {
      view: 'footer',
      headerStatus: {label: 'ヘッダー'},
      footerStatus: {label: 'フッター'},
    });
    await waitForCondition(() => fetchSpy.mock.calls.length === 2, {
      description: 'reimport for derive replacement',
    });
    await waitForCondition(() => container.querySelector('#imported-derived')?.textContent === 'フッター', {
      description: 'footer derive initialized',
    });

    expect(fetchSpy.mock.calls[1][0]).toBe('/partials/footer.html');
    expect(container.querySelector('#imported-kind')?.textContent).toBe('footer');
  });

  it('未解決の data-import URL が解決されたら読み込み先の data-derive も初期化される', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          '<html><body>' +
            '<section data-derive="status" data-derive-name="currentStatus">' +
            '<p id="resolved-import-derived">{{currentStatus.label}}</p>' +
            '</section>' +
            '</body></html>',
          {headers: {'Content-Type': 'text/html'}},
        ),
      );

    container.innerHTML = `
      <div id="root" data-bind='{"status":{"label":"解決後インポート"}}'>
        <div id="import-target" data-import="/partials/{{view}}.html"></div>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector('#resolved-import-derived')).toBeNull();

    await Core.setBindingData(root, {
      view: 'header',
      status: {label: '解決後インポート'},
    });
    await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
      description: 'resolved import after unresolved url',
    });
    await waitForCondition(() => {
      return container.querySelector('#resolved-import-derived')?.textContent === '解決後インポート';
    }, {
      description: 'resolved import derive initialized',
    });

    expect(fetchSpy.mock.calls[0][0]).toBe('/partials/header.html');
    expect(container.querySelector('#resolved-import-derived')?.textContent).toBe('解決後インポート');
  });

  it('data-fetch の未解決参照が解決されたら data-derive も追従して初期化される', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const query = new URL(url, 'http://localhost').searchParams.get('query');
        const payload = {
          name: query === 'beta' ? '検索結果B' : '検索結果A',
          options: query === 'beta'
            ? [{id: 'phone', label: '電話'}]
            : [{id: 'mail', label: 'メール'}, {id: 'chat', label: 'チャット'}],
        };
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as Promise<Response>;
      });

    container.innerHTML = `
      <div id="root">
        <div
          id="fetch-source"
          data-fetch="http://api.test/search?query={{query}}"
          data-fetch-bind="#fetch-result"
        ></div>
        <div id="fetch-result">
          <section data-derive="options ?? []" data-derive-name="optionList">
            <h2 id="fetch-name">{{name}}</h2>
            <ul id="fetch-options" data-each="optionList" data-each-arg="option" data-each-key="id">
              <li>{{option.label}}</li>
            </ul>
          </section>
        </div>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector('#fetch-name')?.textContent).toBe('');
    expect(container.querySelectorAll('#fetch-options li')).toHaveLength(0);

    await Core.setBindingData(root, {query: 'alpha'});
    await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
      description: 'resolved fetch after unresolved state',
    });
    await waitForCondition(() => container.querySelectorAll('#fetch-options li').length === 2, {
      description: 'derive rows after unresolved resolved',
    });

    expect(container.querySelector('#fetch-name')?.textContent).toBe('検索結果A');
    expect(
      Array.from(container.querySelectorAll('#fetch-options li')).map(item => item.textContent?.trim()),
    ).toEqual(['メール', 'チャット']);
  });

  it('data-fetch-bind の宛先が切り替わっても新しい bind 先で data-derive を再計算する', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const query = new URL(String(input), 'http://localhost').searchParams.get('query');
        const payload = query === 'beta'
          ? {name: '宛先B', options: [{id: 'phone', label: '電話'}]}
          : {name: '宛先A', options: [{id: 'mail', label: 'メール'}]};
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as Promise<Response>;
      });

    container.innerHTML = `
      <div id="root" data-bind='{"query":"alpha"}'>
        <div
          id="fetch-source"
          data-fetch="http://api.test/search?query={{query}}"
          data-fetch-bind="#fetch-result-a"
        ></div>
        <section id="fetch-result-a">
          <div data-derive="options ?? []" data-derive-name="optionList">
            <h2 class="target-name">{{name}}</h2>
            <ul class="target-options" data-each="optionList" data-each-arg="option" data-each-key="id">
              <li>{{option.label}}</li>
            </ul>
          </div>
        </section>
        <section id="fetch-result-b">
          <div data-derive="options ?? []" data-derive-name="optionList">
            <h2 class="target-name">{{name}}</h2>
            <ul class="target-options" data-each="optionList" data-each-arg="option" data-each-key="id">
              <li>{{option.label}}</li>
            </ul>
          </div>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const fetchSource = container.querySelector('#fetch-source') as HTMLElement;
    await Core.scan(root);
    await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
      description: 'initial fetch to first bind target',
    });
    await waitForCondition(() => {
      return container.querySelector('#fetch-result-a .target-name')?.textContent === '宛先A';
    }, {
      description: 'first bind target derive initialized',
    });

    expect(container.querySelector('#fetch-result-b .target-name')?.textContent).toBe('');
    expect(container.querySelectorAll('#fetch-result-a .target-options li')).toHaveLength(1);
    expect(container.querySelectorAll('#fetch-result-b .target-options li')).toHaveLength(0);

    await Core.setAttribute(fetchSource, 'data-fetch-bind', '#fetch-result-b');
    await Core.setBindingData(root, {query: 'beta'});
    await waitForCondition(() => fetchSpy.mock.calls.length === 2, {
      description: 'fetch after bind target switched',
    });
    await waitForCondition(() => {
      return container.querySelector('#fetch-result-b .target-name')?.textContent === '宛先B';
    }, {
      description: 'second bind target derive initialized',
    });

    expect(container.querySelector('#fetch-result-a .target-name')?.textContent).toBe('宛先A');
    expect(container.querySelector('#fetch-result-b .target-name')?.textContent).toBe('宛先B');
    expect(
      Array.from(container.querySelectorAll('#fetch-result-b .target-options li'))
        .map(item => item.textContent?.trim()),
    ).toEqual(['電話']);
  });

  it('data-each 配下では各行の data-derive が独立し、兄弟行へ漏れない', async () => {
    container.innerHTML = `
      <div
        id="root"
        data-bind='{
          "items":[
            {"id":1,"name":"A","status":{"label":"公開中"}},
            {"id":2,"name":"B","status":{"label":"停止中"}},
            {"id":3,"name":"C","status":{"label":"準備中"}}
          ]
        }'
      >
        <ul data-each="items" data-each-arg="item" data-each-key="id">
          <li>
            <section
              data-derive="item.status"
              data-derive-name="currentStatus"
            >
              <span class="name">{{item.name}}</span>
              <span class="status">{{currentStatus.label}}</span>
            </section>
          </li>
        </ul>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows).toHaveLength(3);
    expect(
      rows.map(row => row.querySelector('.name')?.textContent?.trim()),
    ).toEqual(['A', 'B', 'C']);
    expect(
      rows.map(row => row.querySelector('.status')?.textContent?.trim()),
    ).toEqual(['公開中', '停止中', '準備中']);
  });

  it('data-each の再利用行でも data-derive とその子 data-each が行ごとに更新される', async () => {
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
            <section data-derive="plan.options" data-derive-name="optionList">
              <span class="plan-name">{{plan.name}}</span>
              <ul class="option-list" data-each="optionList" data-each-arg="option" data-each-key="id">
                <li>{{option.label}}</li>
              </ul>
            </section>
          </li>
        </ul>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const planRows = Array.from(container.querySelectorAll('#plans > li'));
    expect(planRows).toHaveLength(2);
    expect(
      planRows.map(row => row.querySelector('.plan-name')?.textContent?.trim()),
    ).toEqual(['基本', '拡張']);
    expect(
      planRows.map(row =>
        Array.from(row.querySelectorAll('.option-list > li')).map(item => item.textContent?.trim()),
      ),
    ).toEqual([
      ['メール', 'チャット'],
      ['電話'],
    ]);

    await Core.setBindingData(root, {
      plans: [
        {
          id: 'basic',
          name: '基本改',
          options: [
            {id: 'mail', label: 'メール改'},
          ],
        },
        {
          id: 'plus',
          name: '拡張改',
          options: [
            {id: 'visit', label: '訪問'},
            {id: 'phone', label: '電話'},
          ],
        },
      ],
    });
    await waitForDomSettled();

    const updatedRows = Array.from(container.querySelectorAll('#plans > li'));
    expect(
      updatedRows.map(row => row.querySelector('.plan-name')?.textContent?.trim()),
    ).toEqual(['基本改', '拡張改']);
    expect(
      updatedRows.map(row =>
        Array.from(row.querySelectorAll('.option-list > li')).map(item => item.textContent?.trim()),
      ),
    ).toEqual([
      ['メール改'],
      ['訪問', '電話'],
    ]);
  });

  it('select の data-each-before と data-each-after は更新後も前後の位置を維持する', async () => {
    container.innerHTML = `
      <div
        id="root"
        data-bind='{
          "selectedId":"basic",
          "groups":[
            {
              "id":"basic",
              "options":[{"id":"mail","label":"メール"},{"id":"chat","label":"チャット"}]
            },
            {
              "id":"plus",
              "options":[{"id":"phone","label":"電話"},{"id":"visit","label":"訪問"}]
            }
          ]
        }'
      >
        <section
          data-derive="groups.find(group => group.id === selectedId)?.options ?? []"
          data-derive-name="optionList"
        >
          <select id="option" data-each="optionList" data-each-arg="option" data-each-key="id">
            <option data-each-before value="">選択してください</option>
            <option value="{{option.id}}">{{option.label}}</option>
            <option data-each-after value="summary">この中にない</option>
          </select>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForCondition(() => container.querySelectorAll('#option option').length === 4, {
      description: 'initial select options with suffix',
    });

    expect(
      Array.from(container.querySelectorAll('#option option')).map(
        option => (option as HTMLOptionElement).value,
      ),
    ).toEqual([
      '',
      'mail',
      'chat',
      'summary',
    ]);

    await Core.setBindingData(root, {
      selectedId: 'plus',
      groups: [
        {
          id: 'basic',
          options: [
            {id: 'mail', label: 'メール'},
            {id: 'chat', label: 'チャット'},
          ],
        },
        {
          id: 'plus',
          options: [
            {id: 'phone', label: '電話'},
            {id: 'visit', label: '訪問'},
          ],
        },
      ],
    });
    await waitForCondition(() => {
      const values = Array.from(container.querySelectorAll('#option option')).map(
        option => (option as HTMLOptionElement).value,
      );
      return values.join(',') === ',phone,visit,summary';
    }, {
      description: 'updated select options with suffix',
    });

    expect(Array.from(container.querySelectorAll('#option option')).map(option => option.textContent?.trim())).toEqual([
      '選択してください',
      '電話',
      '訪問',
      'この中にない',
    ]);
  });

  it('setBindingData でも派生値を再評価し、子要素の data-if が追従する', async () => {
    container.innerHTML = `
      <div
        id="root"
        data-bind='{"currentStatus":"open","statuses":{"open":{"label":"受付中"},"closed":{"label":"停止中"}}}'
      >
        <section
          data-derive="statuses[currentStatus]"
          data-derive-name="currentStatusDetail"
        >
          <p id="status-label">{{currentStatusDetail.label}}</p>
          <p id="status-open" data-if="currentStatusDetail.label === '受付中'">open only</p>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const statusLabel = container.querySelector('#status-label') as HTMLElement;
    const statusOpen = container.querySelector('#status-open') as HTMLElement;

    expect(statusLabel.textContent).toBe('受付中');
    expect(statusOpen.style.display).not.toBe('none');

    await Core.setBindingData(root, {
      currentStatus: 'closed',
      statuses: {
        open: {label: '受付中'},
        closed: {label: '停止中'},
      },
    });
    await waitForDomSettled();

    expect(statusLabel.textContent).toBe('停止中');
    expect(statusOpen.style.display).toBe('none');
  });
});
