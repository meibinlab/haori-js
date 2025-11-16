/* @vitest-environment jsdom */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import Queue from '../src/queue';
import Fragment, {ElementFragment} from '../src/fragment';

// usersデータ
const users = [
  {id: 1, name: '田中太郎', age: 25},
  {id: 2, name: '佐藤花子', age: 30},
];

describe('data-each内部処理デバッグ', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('テンプレートtrがchildrenから正しく切り離されるか', async () => {
    container.innerHTML = `
      <table>
        <tbody data-each="users">
          <tr><td>{{id}}</td><td>{{name}}</td><td>{{age}}</td></tr>
        </tbody>
      </table>
    `;
    const tbody = container.querySelector('tbody') as HTMLElement;
    const fragment = Fragment.get(tbody) as ElementFragment;
    fragment.setBindingData({users});
    fragment.setMounted(true);
    await Core.evaluateEach(fragment);
    await Queue.wait();
    // テンプレートtrがchildrenから除去されているか
    const children = fragment.getChildren();
    const trCount = children.filter(c => c instanceof ElementFragment).length;
    expect(trCount).toBe(2); // 2行生成されている
  });

  it('テンプレートtrがsetTemplateで保存されているか', async () => {
    container.innerHTML = `
      <table>
        <tbody data-each="users">
          <tr><td>{{id}}</td><td>{{name}}</td><td>{{age}}</td></tr>
        </tbody>
      </table>
    `;
    const tbody = container.querySelector('tbody') as HTMLElement;
    const fragment = Fragment.get(tbody) as ElementFragment;
    fragment.setBindingData({users});
    fragment.setMounted(true);
    await Core.evaluateEach(fragment);
    await Queue.wait();
    const template = fragment.getTemplate();
    expect(template).not.toBeNull();
    expect(template?.getTarget().nodeName).toBe('TR');
  });

  it('newKeysの数がusers配列と一致するか', async () => {
    container.innerHTML = `
      <table>
        <tbody data-each="users">
          <tr><td>{{id}}</td><td>{{name}}</td><td>{{age}}</td></tr>
        </tbody>
      </table>
    `;
    const tbody = container.querySelector('tbody') as HTMLElement;
    const fragment = Fragment.get(tbody) as ElementFragment;
    fragment.setBindingData({users});
    fragment.setMounted(true);
    // updateDiff内部のnewKeys数を確認
    let newKeysCount = 0;
    const origUpdateDiff = (Core as any).updateDiff;
    (Core as any).updateDiff = function(parent: ElementFragment, newList: any[]) {
      newKeysCount = newList.length;
      return origUpdateDiff.apply(this, arguments);
    };
    await Core.evaluateEach(fragment);
    await Queue.wait();
    expect(newKeysCount).toBe(users.length);
    (Core as any).updateDiff = origUpdateDiff;
  });

  it('rowFragmentにバインディングデータが正しくセットされるか', async () => {
    container.innerHTML = `
      <table>
        <tbody data-each="users">
          <tr><td>{{id}}</td><td>{{name}}</td><td>{{age}}</td></tr>
        </tbody>
      </table>
    `;
    const tbody = container.querySelector('tbody') as HTMLElement;
    const fragment = Fragment.get(tbody) as ElementFragment;
    fragment.setBindingData({users});
    fragment.setMounted(true);
    await Core.evaluateEach(fragment);
    await Queue.wait();
    const rows = tbody.querySelectorAll('tr');
    expect(rows.length).toBe(users.length);
    // 1行目のFragmentのバインディングデータを確認
    const rowFragment = Fragment.get(rows[0]) as ElementFragment;
    const binding = rowFragment.getBindingData();
    expect(binding.id).toBe(1);
    expect(binding.name).toBe('田中太郎');
    expect(binding.age).toBe(25);
  });
});
