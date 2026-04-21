/* @vitest-environment jsdom */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-each with tbody element', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('tbodyにdata-each属性を設定した場合、trがテンプレートとして使われる', async () => {
    const root = document.createElement('div');
    const bindData = {
      users: [
        {id: 1, name: '田中太郎', age: 25},
        {id: 2, name: '佐藤花子', age: 30},
      ],
    };

    root.setAttribute('data-bind', JSON.stringify(bindData));
    root.innerHTML = `
      <table>
        <tbody data-each="users" data-each-key="id">
          <tr>
            <td>{{id}}</td>
            <td>{{name}}</td>
            <td>{{age}}歳</td>
          </tr>
        </tbody>
      </table>
    `;
    container.appendChild(root);

    // markMountedは呼ばず、Core.scanのみ
    await Core.scan(root);
    await waitForDomSettled();
    await waitForCondition(() => {
      const tbody = container.querySelector('tbody');
      return tbody?.querySelectorAll('tr').length === 2;
    }, {description: 'tbody rows'});

    const tbody = container.querySelector('tbody');
    expect(tbody).not.toBeNull();

    const rows = tbody?.querySelectorAll('tr');
    expect(rows?.length).toBe(2);
  });

  it('tbodyの再描画でもテンプレート行が残らず、tr件数が配列長と一致する', async () => {
    const root = document.createElement('div');
    root.setAttribute('data-bind', JSON.stringify({items: []}));
    root.innerHTML = `
      <table>
        <tbody data-each="items" data-each-key="id">
          <tr>
            <td>{{id}}</td>
            <td>{{name}}</td>
          </tr>
        </tbody>
      </table>
    `;
    container.appendChild(root);

    const firstItems = [
      {id: 1, name: 'A'},
      {id: 2, name: 'B'},
      {id: 3, name: 'C'},
      {id: 4, name: 'D'},
      {id: 5, name: 'E'},
    ];
    const secondItems = [
      {id: 1, name: 'A'},
      {id: 3, name: 'C'},
    ];

    await Core.scan(root);
    await waitForDomSettled();

    await Core.setBindingData(root, {items: firstItems});
    await waitForCondition(() => {
      const tbody = container.querySelector('tbody');
      return tbody?.querySelectorAll('tr').length === firstItems.length;
    }, {description: 'first tbody rows'});

    await Core.setBindingData(root, {items: secondItems});
    await waitForCondition(() => {
      const tbody = container.querySelector('tbody');
      return tbody?.querySelectorAll('tr').length === secondItems.length;
    }, {description: 'second tbody rows'});

    await Core.setBindingData(root, {items: firstItems});
    await waitForCondition(() => {
      const tbody = container.querySelector('tbody');
      return tbody?.querySelectorAll('tr').length === firstItems.length;
    }, {description: 'restored tbody rows'});

    const tbody = container.querySelector('tbody');
    const rows = tbody?.querySelectorAll('tr');
    expect(rows?.length).toBe(firstItems.length);
    expect(rows?.[0].textContent).toContain('A');
    expect(rows?.[4].textContent).toContain('E');
  });

  it('location を含む行データでも tbody の data-each が描画できる', async () => {
    const root = document.createElement('div');
    root.setAttribute(
      'data-bind',
      JSON.stringify({
        content: [
          {id: 1, projectName: '案件A', location: '東京都千代田区'},
          {id: 2, projectName: '案件B', location: '大阪府大阪市'},
        ],
      }),
    );
    root.innerHTML = `
      <table>
        <tbody data-each="content" data-each-key="id">
          <tr>
            <td>{{projectName}}</td>
            <td>{{location}}</td>
          </tr>
        </tbody>
      </table>
    `;
    container.appendChild(root);

    await Core.scan(root);
    await waitForCondition(() => {
      const tbody = container.querySelector('tbody');
      return tbody?.querySelectorAll('tr').length === 2;
    }, {description: 'tbody rows with location'});

    await waitForCondition(() => {
      const firstRow = container.querySelector('tbody tr');
      return firstRow?.textContent?.includes('案件A') ?? false;
    }, {description: 'tbody row text with location'});

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('案件A');
    expect(rows[0].textContent).toContain('東京都千代田区');
    expect(rows[1].textContent).toContain('案件B');
    expect(rows[1].textContent).toContain('大阪府大阪市');
  });
});
