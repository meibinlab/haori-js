import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Haori from '../src/haori';

describe('Haori.addMessage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('入力要素の場合は親要素に data-message を付与する', async () => {
    const parent = document.createElement('div');
    const input = document.createElement('input');
    parent.appendChild(input);
    document.body.appendChild(parent);

    await Haori.addMessage(input, 'エラー');

    expect(parent.getAttribute('data-message')).toBe('エラー');
    expect(parent.hasAttribute('data-message-level')).toBe(false);
  });

  it('level を指定すると data-message-level が付与される', async () => {
    const parent = document.createElement('div');
    const input = document.createElement('input');
    parent.appendChild(input);
    document.body.appendChild(parent);

    await Haori.addMessage(input, '確認', 'info');

    expect(parent.getAttribute('data-message')).toBe('確認');
    expect(parent.getAttribute('data-message-level')).toBe('info');
  });

  it.each(['info', 'warning', 'error', 'success'] as const)(
    'level "%s" を data-message-level に設定できる',
    async (level) => {
      const parent = document.createElement('div');
      const input = document.createElement('input');
      parent.appendChild(input);
      document.body.appendChild(parent);

      await Haori.addMessage(input, 'msg', level);

      expect(parent.getAttribute('data-message-level')).toBe(level);
    },
  );

  it('フォーム要素の場合はフォーム自身に data-message を付与する', async () => {
    const form = document.createElement('form');
    document.body.appendChild(form);

    await Haori.addMessage(form, 'フォームエラー', 'error');

    expect(form.getAttribute('data-message')).toBe('フォームエラー');
    expect(form.getAttribute('data-message-level')).toBe('error');
  });

  it('親要素がない場合は当該要素自身に付与する', async () => {
    const input = document.createElement('input');

    await Haori.addMessage(input, '孤立エラー', 'warning');

    expect(input.getAttribute('data-message')).toBe('孤立エラー');
    expect(input.getAttribute('data-message-level')).toBe('warning');
  });
});

describe('Haori.addErrorMessage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('親要素に data-message を付与し、data-message-level は error になる', async () => {
    const parent = document.createElement('div');
    const input = document.createElement('input');
    parent.appendChild(input);
    document.body.appendChild(parent);

    await Haori.addErrorMessage(input, 'エラー');

    expect(parent.getAttribute('data-message')).toBe('エラー');
    expect(parent.getAttribute('data-message-level')).toBe('error');
  });
});

describe('Haori.clearMessages', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('親要素の data-message と data-message-level を削除する', async () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-message', 'msg');
    parent.setAttribute('data-message-level', 'info');
    document.body.appendChild(parent);

    await Haori.clearMessages(parent);

    expect(parent.hasAttribute('data-message')).toBe(false);
    expect(parent.hasAttribute('data-message-level')).toBe(false);
  });

  it('子要素の data-message と data-message-level も削除する', async () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    child.setAttribute('data-message', 'child msg');
    child.setAttribute('data-message-level', 'error');
    parent.appendChild(child);
    document.body.appendChild(parent);

    await Haori.clearMessages(parent);

    expect(child.hasAttribute('data-message')).toBe(false);
    expect(child.hasAttribute('data-message-level')).toBe(false);
  });
});
