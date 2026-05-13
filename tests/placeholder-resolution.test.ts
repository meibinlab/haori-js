import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import {waitForDomSettled} from './helpers/async';

describe('プレースホルダ解決規則', () => {
  let container: HTMLElement;
  let originalLocation: Location;

  const mockJsonFetch = () => vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ok: true}), {
      headers: {'Content-Type': 'application/json'},
    }),
  );

  const mockHtmlFetch = () => vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('<div>loaded</div>', {
      headers: {'Content-Type': 'text/html'},
    }),
  );

  const setWindowSearch = (search: string) => {
    Object.defineProperty(window, 'location', {
      value: {...originalLocation, search},
      writable: true,
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    originalLocation = window.location;
  });

  afterEach(() => {
    document.body.removeChild(container);
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  describe('副作用属性', () => {
    it('data-fetch の単体プレースホルダは未解決参照なら実行しない', async () => {
      const fetchSpy = mockJsonFetch();

      container.innerHTML = '<div data-fetch="{{missingUrl}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['false', '{{false}}'],
      ['null', '{{null}}'],
      ['undefined', '{{undefined}}'],
      ['空文字', '{{\'\'}}'],
    ])('data-fetch の単体プレースホルダは %s なら実行しない', async (_label, expression) => {
      const fetchSpy = mockJsonFetch();

      container.innerHTML = '<div data-fetch="' + expression + '"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('data-fetch の単体プレースホルダは空でない文字列なら実行する', async () => {
      const fetchSpy = mockJsonFetch();

      container.innerHTML = '<div data-fetch="{{\'/api/items\'}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('data-fetch の文字列埋め込みは未解決参照があれば実行しない', async () => {
      const fetchSpy = mockJsonFetch();

      container.innerHTML = '<div data-bind="base=users" data-fetch="/api/{{base}}/{{missingId}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('data-fetch の文字列埋め込みはすべて解決していれば実行する', async () => {
      const fetchSpy = mockJsonFetch();

      container.innerHTML = `
        <div data-bind='{"base":"users","id":"42"}' data-fetch='/api/{{base}}/{{id}}'></div>
      `;

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('data-import の単体プレースホルダは未解決参照なら実行しない', async () => {
      const fetchSpy = mockHtmlFetch();

      container.innerHTML = '<div data-import="{{missingImportUrl}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['false', '{{false}}'],
      ['null', '{{null}}'],
      ['undefined', '{{undefined}}'],
      ['空文字', '{{\'\'}}'],
    ])('data-import の単体プレースホルダは %s なら実行しない', async (_label, expression) => {
      const fetchSpy = mockHtmlFetch();

      container.innerHTML = '<div data-import="' + expression + '"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('data-import の単体プレースホルダは空でない文字列なら実行する', async () => {
      const fetchSpy = mockHtmlFetch();

      container.innerHTML = '<div data-import="{{\'/parts/header.html\'}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('data-import の文字列埋め込みは未解決参照があれば実行しない', async () => {
      const fetchSpy = mockHtmlFetch();

      container.innerHTML = '<div data-bind="section=docs" data-import="/{{section}}/{{missingPage}}.html"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('data-import の文字列埋め込みはすべて解決していれば実行する', async () => {
      const fetchSpy = mockHtmlFetch();

      container.innerHTML = `
        <div data-bind='{"section":"docs","page":"guide"}' data-import='/{{section}}/{{page}}.html'></div>
      `;

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('制御属性', () => {
    it('data-if は未解決参照を false 相当として非表示にする', async () => {
      container.innerHTML = '<p data-if="missingFlag">hidden</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('data-if-false')).toBe(true);
    });

    it('data-if の文字列埋め込みは未解決参照があれば false 相当で非表示にする', async () => {
      container.innerHTML = '<p data-if="{{missingFlag}}-suffix">hidden</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('data-if-false')).toBe(true);
    });

    it('data-if の単体プレースホルダは true なら表示する', async () => {
      container.innerHTML = '<p data-bind=\'{"flag":true}\' data-if="flag">visible</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('data-if-false')).toBe(false);
    });

    it('data-if の単体プレースホルダは null なら非表示にする', async () => {
      container.innerHTML = '<p data-bind=\'{"flag":null}\' data-if="flag">hidden</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('data-if-false')).toBe(true);
    });

    it('data-each は未解決参照を false 相当として空配列扱いにする', async () => {
      container.innerHTML = `
        <ul data-each="missingItems">
          <li>{{name}}</li>
        </ul>
      `;

      const element = container.querySelector('ul') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.querySelectorAll('li')).toHaveLength(0);
    });

    it('data-each の文字列埋め込みは未解決参照があれば空配列扱いにする', async () => {
      container.innerHTML = `
        <ul data-each="{{missingItems}}-suffix">
          <li>{{name}}</li>
        </ul>
      `;

      const element = container.querySelector('ul') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.querySelectorAll('li')).toHaveLength(0);
    });

    it('data-each の単体プレースホルダは配列なら繰り返し表示する', async () => {
      container.innerHTML = `
        <ul data-bind='{"items":[{"name":"A"},{"name":"B"}]}' data-each="items">
          <li>{{name}}</li>
        </ul>
      `;

      const element = container.querySelector('ul') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.querySelectorAll('li')).toHaveLength(2);
      expect(element.textContent).toContain('A');
      expect(element.textContent).toContain('B');
    });
  });

  describe('通常属性', () => {
    it('文字列属性の単体プレースホルダは文字列なら設定する', async () => {
      container.innerHTML = '<div title="{{\'顧客A\'}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.getAttribute('title')).toBe('顧客A');
    });

    it('文字列属性の単体プレースホルダは未解決参照なら属性削除とする', async () => {
      container.innerHTML = '<div title="{{missingTitle}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('title')).toBe(false);
    });

    it('文字列属性の単体プレースホルダは false なら属性削除とする', async () => {
      container.innerHTML = '<div title="{{false}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('title')).toBe(false);
    });

    it('文字列属性の単体プレースホルダは undefined なら属性削除とする', async () => {
      container.innerHTML = '<div title="{{undefined}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('title')).toBe(false);
    });

    it('文字列属性の文字列埋め込みは未解決参照部分だけ空文字にする', async () => {
      container.innerHTML = '<div title="顧客: {{missingTitle}} さん"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.getAttribute('title')).toBe('顧客:  さん');
    });

    it('文字列属性の文字列埋め込みはすべて解決していれば連結して設定する', async () => {
      container.innerHTML = '<div title="顧客: {{\'山田\'}} さん"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.getAttribute('title')).toBe('顧客: 山田 さん');
    });

    it('文字列属性の文字列埋め込みは最終結果が空文字なら属性削除とする', async () => {
      container.innerHTML = `
        <div data-bind='{"prefix":"","suffix":""}' title="{{prefix}}{{suffix}}"></div>
      `;

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('title')).toBe(false);
    });

    it('真偽属性の単体プレースホルダは未解決参照なら属性削除とする', async () => {
      container.innerHTML = '<button disabled="{{missingDisabled}}">save</button>';

      const element = container.querySelector('button') as HTMLButtonElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('disabled')).toBe(false);
    });

    it('真偽属性の単体プレースホルダは true なら属性付与とする', async () => {
      container.innerHTML = '<button disabled="{{true}}">save</button>';

      const element = container.querySelector('button') as HTMLButtonElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('disabled')).toBe(true);
    });

    it('真偽属性の単体プレースホルダは false なら属性削除とする', async () => {
      container.innerHTML = '<button disabled="{{false}}">save</button>';

      const element = container.querySelector('button') as HTMLButtonElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('disabled')).toBe(false);
    });

    it('真偽属性の単体プレースホルダは undefined なら属性削除とする', async () => {
      container.innerHTML = '<button disabled="{{undefined}}">save</button>';

      const element = container.querySelector('button') as HTMLButtonElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('disabled')).toBe(false);
    });

    it('真偽属性の単体プレースホルダは null なら属性削除とする', async () => {
      container.innerHTML = '<button disabled="{{null}}">save</button>';

      const element = container.querySelector('button') as HTMLButtonElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('disabled')).toBe(false);
    });

    it('真偽属性の文字列埋め込みは未解決参照があれば属性削除とする', async () => {
      container.innerHTML = '<button disabled="x-{{missingDisabled}}">save</button>';

      const element = container.querySelector('button') as HTMLButtonElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('disabled')).toBe(false);
    });

    it('data-attr-* の単体プレースホルダは文字列なら反映する', async () => {
      container.innerHTML = '<img data-attr-src="{{\'img/42.jpg\'}}" alt="sample">';

      const image = container.querySelector('img') as HTMLImageElement;
      await Core.scan(image);
      await waitForDomSettled();

      expect(image.getAttribute('src')).toBe('img/42.jpg');
    });

    it('data-attr-* の単体プレースホルダは未解決参照なら属性削除とする', async () => {
      container.innerHTML = '<img data-attr-src="{{missingId}}" alt="sample">';

      const image = container.querySelector('img') as HTMLImageElement;
      await Core.scan(image);
      await waitForDomSettled();

      expect(image.hasAttribute('src')).toBe(false);
    });

    it('data-attr-* の単体プレースホルダは false なら属性削除とする', async () => {
      container.innerHTML = '<img data-attr-src="{{false}}" alt="sample">';

      const image = container.querySelector('img') as HTMLImageElement;
      await Core.scan(image);
      await waitForDomSettled();

      expect(image.hasAttribute('src')).toBe(false);
    });

    it('data-attr-* の単体プレースホルダは undefined なら属性削除とする', async () => {
      container.innerHTML = '<img data-attr-src="{{undefined}}" alt="sample">';

      const image = container.querySelector('img') as HTMLImageElement;
      await Core.scan(image);
      await waitForDomSettled();

      expect(image.hasAttribute('src')).toBe(false);
    });

    it('data-attr-* の単体プレースホルダは null なら属性削除とする', async () => {
      container.innerHTML = '<img data-attr-src="{{null}}" alt="sample">';

      const image = container.querySelector('img') as HTMLImageElement;
      await Core.scan(image);
      await waitForDomSettled();

      expect(image.hasAttribute('src')).toBe(false);
    });

    it('data-attr-* の文字列埋め込みはすべて解決していれば反映する', async () => {
      container.innerHTML = `
        <img data-bind='{"id":"42"}' data-attr-src="img/{{id}}.jpg" alt="sample">
      `;

      const image = container.querySelector('img') as HTMLImageElement;
      await Core.scan(image);
      await waitForDomSettled();

      expect(image.getAttribute('src')).toBe('img/42.jpg');
    });

    it('data-attr-* の文字列埋め込みは未解決参照があれば属性全体を未反映にする', async () => {
      container.innerHTML = '<img data-attr-src="img/{{missingId}}.jpg" alt="sample">';

      const image = container.querySelector('img') as HTMLImageElement;
      await Core.scan(image);
      await waitForDomSettled();

      expect(image.hasAttribute('src')).toBe(false);
    });

    it('data-attr-* の文字列埋め込みは全体が未解決なら属性全体を未反映にする', async () => {
      container.innerHTML = '<img data-attr-src="{{missingPath}}" alt="sample">';

      const image = container.querySelector('img') as HTMLImageElement;
      await Core.scan(image);
      await waitForDomSettled();

      expect(image.hasAttribute('src')).toBe(false);
    });
  });

  describe('テキストノード', () => {
    it('単体プレースホルダは文字列なら表示する', async () => {
      container.innerHTML = '<p>{{\'山田\'}}</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.textContent).toBe('山田');
    });

    it('単体プレースホルダの未解決参照は空文字にする', async () => {
      container.innerHTML = '<p>{{missingCustomerName}}</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.textContent).toBe('');
    });

    it('単体プレースホルダは null なら空文字にする', async () => {
      container.innerHTML = '<p>{{null}}</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.textContent).toBe('');
    });

    it('単体プレースホルダは undefined なら空文字にする', async () => {
      container.innerHTML = '<p>{{undefined}}</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.textContent).toBe('');
    });

    it('文字列埋め込みは未解決参照部分だけ空文字にする', async () => {
      container.innerHTML = '<p>顧客: {{missingCustomerName}} さん</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.textContent).toBe('顧客:  さん');
    });

    it('文字列埋め込みはすべて解決していれば固定文字列を保持する', async () => {
      container.innerHTML = '<p>顧客: {{\'山田\'}} さん</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.textContent).toBe('顧客: 山田 さん');
    });
  });

  describe('評価順と補助ケース', () => {
    it('data-url-param は通常属性より先に反映される', async () => {
      setWindowSearch('?customerId=C001');
      container.innerHTML = `
        <div data-url-param data-url-arg="params" title="{{params.customerId}}"></div>
      `;

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.getAttribute('title')).toBe('C001');
    });

    it('data-url-param は制御属性より先に反映される', async () => {
      setWindowSearch('?customerId=C001');
      container.innerHTML = `
        <p data-url-param data-url-arg="params" data-if="params.customerId">visible</p>
      `;

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('data-if-false')).toBe(false);
    });

    it('data-url-param は副作用属性より先に反映される', async () => {
      const fetchSpy = mockJsonFetch();

      setWindowSearch('?customerId=C001');
      container.innerHTML = `
        <div data-url-param data-url-arg="params" data-fetch="/api/{{params.customerId}}"></div>
      `;

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('data-if の単体プレースホルダは false なら非表示にする', async () => {
      container.innerHTML = '<p data-bind=\'{"flag":false}\' data-if="flag">hidden</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('data-if-false')).toBe(true);
    });

    it('data-each の単体プレースホルダは false なら空配列扱いにする', async () => {
      container.innerHTML = `
        <ul data-bind='{"items":false}' data-each="items">
          <li>{{name}}</li>
        </ul>
      `;

      const element = container.querySelector('ul') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.querySelectorAll('li')).toHaveLength(0);
    });

    it('文字列属性の単体プレースホルダは null なら属性削除とする', async () => {
      container.innerHTML = '<div data-bind=\'{"label":null}\' title="{{label}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.hasAttribute('title')).toBe(false);
    });

    it('文字列属性の単体プレースホルダは data-bind の結果を参照できる', async () => {
      container.innerHTML = '<div data-bind=\'{"label":"受注一覧"}\' title="{{label}}"></div>';

      const element = container.querySelector('div') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.getAttribute('title')).toBe('受注一覧');
    });

    it('テキストノードの単体プレースホルダは false なら空文字にする', async () => {
      container.innerHTML = '<p data-bind=\'{"name":false}\'>{{name}}</p>';

      const element = container.querySelector('p') as HTMLElement;
      await Core.scan(element);
      await waitForDomSettled();

      expect(element.textContent).toBe('');
    });
  });
});
