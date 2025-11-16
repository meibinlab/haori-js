/* @vitest-environment jsdom */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import Queue from '../src/queue';

describe('data-each 実ブラウザ挙動テスト', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('data-bind + data-eachで複数行が生成される', async () => {
    container.innerHTML = `
      <div data-bind='{"users":[{"id":1,"name":"田中太郎","age":25},{"id":2,"name":"佐藤花子","age":30}]}'>
        <table>
          <tbody data-each="users">
            <tr>
              <td>{{id}}</td>
              <td>{{name}}</td>
              <td>{{age}}歳</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const root = container.querySelector('div') as HTMLElement;
    // ブラウザ同様、Core.scanのみ呼ぶ
    await Core.scan(root);
    await Queue.wait();

    // tbodyのtrが2行生成されているか
    const tbody = container.querySelector('tbody');
    const rows = tbody?.querySelectorAll('tr');
    expect(rows?.length).toBe(2);
    if (rows && rows.length === 2) {
      expect(rows[0].textContent).toContain('田中太郎');
      expect(rows[1].textContent).toContain('佐藤花子');
    }
  });
});
