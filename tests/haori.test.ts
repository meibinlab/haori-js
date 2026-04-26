import { beforeEach, describe, expect, it, vi } from 'vitest';
import Haori from '../src/haori';

describe('Haori.toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['info', 'warning', 'error', 'success'] as const)(
    'level "%s" でトーストを表示する',
    async (level) => {
      const showPopoverSpy = vi.fn();
      const hidePopoverSpy = vi.fn();
      HTMLElement.prototype.showPopover = showPopoverSpy;
      HTMLElement.prototype.hidePopover = hidePopoverSpy;

      Haori.toast('test message', level);

      const toast = document.querySelector(`.haori-toast-${level}`);
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toBe('test message');
      expect(toast?.classList.contains('haori-toast')).toBe(true);
      expect(showPopoverSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('3秒後にトーストを非表示にして DOM から削除する', async () => {
    const showPopoverSpy = vi.fn();
    const hidePopoverSpy = vi.fn();
    HTMLElement.prototype.showPopover = showPopoverSpy;
    HTMLElement.prototype.hidePopover = hidePopoverSpy;

    Haori.toast('hello', 'info');

    expect(document.querySelector('.haori-toast')).not.toBeNull();

    vi.advanceTimersByTime(3000);

    expect(hidePopoverSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.haori-toast')).toBeNull();
  });
});
