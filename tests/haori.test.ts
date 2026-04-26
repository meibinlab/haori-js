import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Haori from '../src/haori';

describe('Haori.toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('level を省略すると info として扱う', async () => {
    Haori.toast('msg');
    const toast = document.querySelector('.haori-toast-info');
    expect(toast).not.toBeNull();
    expect(toast?.getAttribute('aria-live')).toBe('polite');
  });

  it.each(['info', 'warning', 'success'] as const)(
    'level "%s" は aria-live="polite" を設定する',
    (level) => {
      Haori.toast('msg', level);
      const toast = document.querySelector(`.haori-toast-${level}`);
      expect(toast?.getAttribute('aria-live')).toBe('polite');
    },
  );

  it('level "error" は aria-live="assertive" を設定する', () => {
    Haori.toast('msg', 'error');
    const toast = document.querySelector('.haori-toast-error');
    expect(toast?.getAttribute('aria-live')).toBe('assertive');
  });

  it('3秒後にトーストを非表示にして DOM から削除する', () => {
    const hidePopoverSpy = HTMLElement.prototype.hidePopover as ReturnType<typeof vi.fn>;
    Haori.toast('hello', 'info');
    expect(document.querySelector('.haori-toast')).not.toBeNull();
    vi.advanceTimersByTime(3000);
    expect(hidePopoverSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.haori-toast')).toBeNull();
  });
});

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

  it('フォーム要素の場合はフォーム自身に付与する', async () => {
    const form = document.createElement('form');
    document.body.appendChild(form);

    await Haori.addMessage(form, 'フォームエラー', 'error');

    expect(form.getAttribute('data-message')).toBe('フォームエラー');
    expect(form.getAttribute('data-message-level')).toBe('error');
  });
});

describe('Haori.addErrorMessage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('addMessage("error") に委譲する', async () => {
    const parent = document.createElement('div');
    const input = document.createElement('input');
    parent.appendChild(input);
    document.body.appendChild(parent);

    await Haori.addErrorMessage(input, 'エラー');

    expect(parent.getAttribute('data-message')).toBe('エラー');
    expect(parent.getAttribute('data-message-level')).toBe('error');
  });
});
