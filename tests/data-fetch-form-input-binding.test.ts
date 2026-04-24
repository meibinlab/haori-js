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
import Form from '../src/form';
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

  it('Core.setBindingData で input と textarea の value が反映される', async () => {
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
    const descriptionInput = container.querySelector(
      '#description',
    ) as HTMLTextAreaElement;
    expect(titleInput.value).toBe('新しいタイトル');
    expect(descriptionInput.value).toBe('説明文');
  });

  it('checkbox は value 属性を更新しても checked は変化しない', async () => {
    container.innerHTML = `
      <div id="cb-container" data-bind='{"enabled":true}'>
        <form>
          <input id="ssl" name="ssl" type="checkbox" value="{{enabled}}" />
        </form>
      </div>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const div = container.querySelector('#cb-container') as HTMLElement;
    await Core.setBindingData(div, {enabled: true});
    await waitForDomSettled();

    const checkbox = container.querySelector('#ssl') as HTMLInputElement;
    expect(checkbox.value).toBe('true');
    expect(checkbox.checked).toBe(false);
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

  it('form 自身の bindingData 更新で checkbox が無イベント同期される', async () => {
    container.innerHTML = `
      <form id="ssl-form" data-bind='{"mailImapSsl":false}'>
        <input
          id="mail-imap-ssl"
          type="checkbox"
          name="mailImapSsl"
          value="true"
        />
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#ssl-form') as HTMLFormElement;
    const formFragment = Fragment.get(form) as ElementFragment;
    const checkbox = container.querySelector(
      '#mail-imap-ssl',
    ) as HTMLInputElement;
    const changeSpy = vi.fn();
    checkbox.addEventListener('change', changeSpy);

    await Core.setBindingData(form, {mailImapSsl: true});
    await waitForDomSettled();

    expect(checkbox.checked).toBe(true);
    expect(changeSpy).not.toHaveBeenCalled();
    expect(Form.getValues(formFragment)).toEqual({mailImapSsl: true});

    await Core.setBindingData(form, {mailImapSsl: false});
    await waitForDomSettled();

    expect(checkbox.checked).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();
    expect(Form.getValues(formFragment)).toEqual({mailImapSsl: false});
  });

  it('data-form-arg を持つ form でも該当データだけを無イベント同期する', async () => {
    container.innerHTML = `
      <form id="arg-form" data-bind='{"settings":{"enabled":false}}' data-form-arg="settings">
        <input id="enabled" type="checkbox" name="enabled" value="true" />
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#arg-form') as HTMLFormElement;
    const checkbox = container.querySelector('#enabled') as HTMLInputElement;

    await Core.setBindingData(form, {
      settings: {
        enabled: true,
      },
    });
    await waitForDomSettled();

    expect(checkbox.checked).toBe(true);
  });

  it('form 自身の bindingData 更新で bindchange が再帰発火しない', async () => {
    container.innerHTML = `
      <form id="loop-form" data-bind='{"mailImapSsl":false}'>
        <input type="checkbox" name="mailImapSsl" value="true" />
      </form>
    `;
    await Core.scan(container);
    await waitForDomSettled();

    const form = container.querySelector('#loop-form') as HTMLFormElement;
    const bindChangeSpy = vi.fn();
    form.addEventListener('haori:bindchange', bindChangeSpy);

    await Core.setBindingData(form, {mailImapSsl: true});
    await waitForDomSettled();

    expect(bindChangeSpy).toHaveBeenCalledTimes(1);
    expect(bindChangeSpy.mock.calls[0]?.[0]).toMatchObject({
      detail: {
        reason: 'manual',
        changedKeys: ['mailImapSsl'],
      },
    });

    await Core.setBindingData(form, {mailImapSsl: false});
    await waitForDomSettled();

    expect(bindChangeSpy).toHaveBeenCalledTimes(2);
  });

  it('Form.getValues で設定した値を取得できる', async () => {
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
    const formValues = Form.getValues(formFragment);

    const nameInput = container.querySelector('#fv-name') as HTMLInputElement;
    const emailInput = container.querySelector('#fv-email') as HTMLInputElement;

    expect(nameInput.value).toBe('山田太郎');
    expect(emailInput.value).toBe('yamada@example.com');
    expect(formValues).toEqual({name: '山田太郎', email: 'yamada@example.com'});
  });
});
