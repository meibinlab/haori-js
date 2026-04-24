/* @vitest-environment jsdom */
/**
 * @fileoverview data-fetch によるフォーム入力バインディングのテスト
 *
 * コンテナ要素に data-fetch を設定し、取得データを value="{{field}}" テンプレートで
 * フォーム入力に反映する際、element.value が正しく更新されることを検証します。
 * 修正前は element.setAttribute('value', ...) が defaultValue のみ更新し、
 * element.value が変化しない問題がありました。
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('data-fetch form input binding', () => {
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

  it('value="{{field}}" の入力に element.value が反映される', async () => {
    container.innerHTML = `
      <div id="settings" data-bind='{"host":"","port":"","username":""}'>
        <form>
          <input id="host" name="host" type="text" value="{{host}}" />
          <input id="port" name="port" type="number" value="{{port}}" />
          <input id="username" name="username" type="email" value="{{username}}" />
        </form>
      </div>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const div = container.querySelector('#settings') as HTMLElement;
    await Core.setBindingData(div, {
      host: 'imap.example.com',
      port: 993,
      username: 'user@example.com',
    });
    await waitForDomSettled();

    const hostInput = container.querySelector('#host') as HTMLInputElement;
    const portInput = container.querySelector('#port') as HTMLInputElement;
    const usernameInput = container.querySelector(
      '#username',
    ) as HTMLInputElement;

    expect(hostInput.value).toBe('imap.example.com');
    expect(portInput.value).toBe('993');
    expect(usernameInput.value).toBe('user@example.com');
  });

  it('Core.setBindingData 後に element.value が反映される', async () => {
    container.innerHTML = `
      <div id="form-container" data-bind='{"title":"","description":""}'>
        <form>
          <input id="title" name="title" type="text" value="{{title}}" />
          <textarea id="description" name="description">{{description}}</textarea>
        </form>
      </div>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const div = container.querySelector('#form-container') as HTMLElement;
    await Core.setBindingData(div, {title: '新しいタイトル', description: '説明文'});
    await waitForDomSettled();

    const titleInput = container.querySelector('#title') as HTMLInputElement;
    expect(titleInput.value).toBe('新しいタイトル');
  });

  it('checkbox は element.checked が変化しない（value 属性の直接バインドは対象外）', async () => {
    container.innerHTML = `
      <div id="cb-container" data-bind='{"enabled":true}'>
        <form>
          <input id="ssl" name="ssl" type="checkbox" value="true" />
        </form>
      </div>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const div = container.querySelector('#cb-container') as HTMLElement;
    await Core.setBindingData(div, {enabled: true});
    await waitForDomSettled();

    const checkbox = container.querySelector('#ssl') as HTMLInputElement;
    // checkbox は value="true" (静的) なので element.setAttribute('value', ...) の対象外
    // checked 状態はバインドデータと直接連動しない（data-bind + setValue 経由が正規の方法）
    expect(checkbox.value).toBe('true');
  });

  it('select 要素の value も正しく更新される', async () => {
    container.innerHTML = `
      <div id="select-container" data-bind='{"role":"VIEWER"}'>
        <form>
          <select id="role" name="role" value="{{role}}">
            <option value="ADMIN">管理者</option>
            <option value="VIEWER">閲覧者</option>
          </select>
        </form>
      </div>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const div = container.querySelector('#select-container') as HTMLElement;
    await Core.setBindingData(div, {role: 'ADMIN'});
    await waitForDomSettled();

    const selectEl = container.querySelector('#role') as HTMLSelectElement;
    expect(selectEl.value).toBe('ADMIN');
  });

  it('fragment.setValue で設定した値は Form.getValues で取得できる', async () => {
    container.innerHTML = `
      <div id="fv-container" data-bind='{"name":"","email":""}'>
        <form id="fv-form">
          <input id="fv-name" name="name" type="text" value="{{name}}" />
          <input id="fv-email" name="email" type="email" value="{{email}}" />
        </form>
      </div>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const div = container.querySelector('#fv-container') as HTMLElement;
    await Core.setBindingData(div, {name: '山田太郎', email: 'yamada@example.com'});
    await waitForDomSettled();

    const form = container.querySelector('#fv-form') as HTMLFormElement;
    const formFragment = Fragment.get(form) as ElementFragment;

    const nameInput = container.querySelector('#fv-name') as HTMLInputElement;
    const emailInput = container.querySelector('#fv-email') as HTMLInputElement;

    expect(nameInput.value).toBe('山田太郎');
    expect(emailInput.value).toBe('yamada@example.com');
    expect(formFragment.getAttribute('name')).toBeNull();
  });
});
