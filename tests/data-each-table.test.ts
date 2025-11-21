/* @vitest-environment jsdom */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import Queue from '../src/queue';
// Fragment はこのテストで直接使用しないためインポートを削除

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
    await Queue.wait();

    // ポーリングで最終状態を確認
    for (let i = 0; i < 10; i++) {
      const tbody = container.querySelector('tbody');
      const rows = tbody?.querySelectorAll('tr');
      if (rows && rows.length === 2) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const tbody = container.querySelector('tbody');
    expect(tbody).not.toBeNull();

    // tbodyの子要素としてtrが生成されているか確認
    const rows = tbody?.querySelectorAll('tr');
    console.log('Generated rows:', rows?.length);
    console.log('tbody innerHTML:', tbody?.innerHTML);

    if (rows && rows.length > 0) {
      console.log('First row content:', rows[0].innerHTML);
      if (rows.length > 1) {
        console.log('Second row content:', rows[1].innerHTML);
      }
    }

    expect(rows?.length).toBe(2);
  });
});
