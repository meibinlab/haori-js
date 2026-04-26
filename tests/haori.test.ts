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
