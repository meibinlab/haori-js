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
});
