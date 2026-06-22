import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Haori from '../src/haori';

describe('Haori.dialog', () => {
  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('メッセージをそのまま alert に渡す', async () => {
    await Haori.dialog('こんにちは');
    expect(window.alert).toHaveBeenCalledWith('こんにちは');
  });

  it('実改行を含む文字列をそのまま渡す（変質させない）', async () => {
    await Haori.dialog('Hello\nWorld');
    expect(window.alert).toHaveBeenCalledWith('Hello\nWorld');
  });

  it('リテラル \\n を正規化しない（Procedure 経路でのみ正規化）', async () => {
    await Haori.dialog('Hello\\nWorld');
    expect(window.alert).toHaveBeenCalledWith('Hello\\nWorld');
  });
});

describe('Haori.confirm', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('メッセージをそのまま confirm に渡す', async () => {
    await Haori.confirm('続けますか？');
    expect(window.confirm).toHaveBeenCalledWith('続けますか？');
  });

  it('実改行を含む文字列をそのまま渡す（変質させない）', async () => {
    await Haori.confirm('続けますか？\nこの操作は取り消せません。');
    expect(window.confirm).toHaveBeenCalledWith(
      '続けますか？\nこの操作は取り消せません。',
    );
  });

  it('リテラル \\n を正規化しない（Procedure 経路でのみ正規化）', async () => {
    await Haori.confirm('続けますか？\\nこの操作は取り消せません。');
    expect(window.confirm).toHaveBeenCalledWith(
      '続けますか？\\nこの操作は取り消せません。',
    );
  });
});

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
    const hidePopoverSpy =
      HTMLElement.prototype.hidePopover as ReturnType<typeof vi.fn>;
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

describe('Haori.clearMessages', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('data-message と data-message-level を両方除去する', async () => {
    const parent = document.createElement('div');
    const input = document.createElement('input');
    parent.appendChild(input);
    document.body.appendChild(parent);

    await Haori.addMessage(input, 'エラー', 'error');
    expect(parent.hasAttribute('data-message-level')).toBe(true);

    await Haori.clearMessages(parent);

    expect(parent.hasAttribute('data-message')).toBe(false);
    expect(parent.hasAttribute('data-message-level')).toBe(false);
  });

  it('子要素の data-message-level も除去する', async () => {
    const form = document.createElement('form');
    document.body.appendChild(form);

    await Haori.addMessage(form, 'エラー', 'warning');
    expect(form.getAttribute('data-message-level')).toBe('warning');

    await Haori.clearMessages(form);

    expect(form.hasAttribute('data-message')).toBe(false);
    expect(form.hasAttribute('data-message-level')).toBe(false);
  });
});

describe('Haori.openDialog / closeDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom は showModal/close を実装しないためモックする。
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  it('openDialog はダイアログ自身と子孫のメッセージ属性をクリアしてから開く', async () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('data-message', '前回エラー');
    dialog.setAttribute('data-message-level', 'error');
    const field = document.createElement('div');
    field.setAttribute('data-message', '項目エラー');
    field.setAttribute('data-message-level', 'warning');
    dialog.appendChild(field);
    document.body.appendChild(dialog);

    await Haori.openDialog(dialog);

    expect(dialog.hasAttribute('data-message')).toBe(false);
    expect(dialog.hasAttribute('data-message-level')).toBe(false);
    expect(field.hasAttribute('data-message')).toBe(false);
    expect(field.hasAttribute('data-message-level')).toBe(false);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
  });

  it('closeDialog はメッセージ属性をクリアしない', async () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('data-message', '残すべきメッセージ');
    dialog.setAttribute('data-message-level', 'info');
    document.body.appendChild(dialog);

    await Haori.closeDialog(dialog);

    expect(dialog.getAttribute('data-message')).toBe('残すべきメッセージ');
    expect(dialog.getAttribute('data-message-level')).toBe('info');
    expect(dialog.close).toHaveBeenCalledTimes(1);
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
