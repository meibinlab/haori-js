/* @vitest-environment jsdom */
/**
 * Procedure のリセット、refetch、click、open/close、redirect、data-message に関するテスト
 */
import {describe, it, expect, beforeEach, vi} from 'vitest';
import Form from '../src/form';
import Haori from '../src/haori';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('Procedure action operations', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    (window as Window & typeof globalThis & {Haori?: unknown}).Haori = Haori;
    await import('../src/observer');
  });

  it('resetFragments calls Form.reset', async () => {
    const resetSpy = vi.spyOn(Form, 'reset').mockResolvedValue(undefined as void);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const target = document.createElement('div');
    target.id = 'to-reset';
    container.appendChild(target);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/reset');
    btn.setAttribute('data-click-reset', '#to-reset');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForDomSettled();

    expect(resetSpy).toHaveBeenCalled();
    container.remove();
  });

  it('refetchFragments invokes Procedure.run', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });
    const ProcedureModule = await import('../src/procedure');
    const runSpy = vi.spyOn(ProcedureModule.default.prototype, 'run');

    const container = document.createElement('div');
    document.body.appendChild(container);
    // リフェッチ対象は data-fetch を持つ要素
    const refetchTarget = document.createElement('div');
    refetchTarget.id = 'refetch-target';
    refetchTarget.setAttribute('data-fetch', 'http://api.test/refetch-target');
    container.appendChild(refetchTarget);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/refetch');
    btn.setAttribute('data-click-refetch', '#refetch-target');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForDomSettled();

    expect(runSpy).toHaveBeenCalled();
    container.remove();
  });

  it('clickFragments will click returned targets (attribute-driven)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });
    const button = document.createElement('button');
    const clickSpy = vi.spyOn(button, 'click');
    clickSpy.mockImplementation(() => {});
    document.body.appendChild(button);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/click');
    // Instead of selector by id, push button to DOM and reference via selector
    button.id = 'click-target';
    btn.setAttribute('data-click-click', '#click-target');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForDomSettled();

    expect(clickSpy).toHaveBeenCalled();
    button.remove();
    container.remove();
  });

  it('open/close call Haori.openDialog/closeDialog', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });
    const dialog = document.createElement('dialog');
    dialog.id = 'dlg';
    document.body.appendChild(dialog);
    const openSpy = vi.spyOn(Haori, 'openDialog');
    openSpy.mockResolvedValue(undefined as void);
    const closeSpy = vi.spyOn(Haori, 'closeDialog');
    closeSpy.mockResolvedValue(undefined as void);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/dialog');
    btn.setAttribute('data-click-open', '#dlg');
    btn.setAttribute('data-click-close', '#dlg');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForDomSettled();

    expect(openSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
    dialog.remove();
    container.remove();
  });

  it('data-click-open delegates to window.Haori for Bootstrap modal targets', async () => {
    const typedWindow = window as Window & typeof globalThis & {
      Haori?: unknown;
    };
    const originalHaori = typedWindow.Haori;
    const openSpy = vi.fn().mockResolvedValue(undefined as void);
    const closeSpy = vi.fn().mockResolvedValue(undefined as void);
    typedWindow.Haori = {
      dialog: vi.fn().mockResolvedValue(undefined as void),
      confirm: vi.fn().mockResolvedValue(true),
      toast: vi.fn().mockResolvedValue(undefined as void),
      openDialog: openSpy,
      closeDialog: closeSpy,
      addErrorMessage: vi.fn().mockResolvedValue(undefined as void),
    };

    const modal = document.createElement('div');
    modal.id = 'user-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-open', '#user-modal');
    btn.setAttribute('data-click-close', '#user-modal');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForDomSettled();

    expect(openSpy).toHaveBeenCalledWith(modal);
    expect(closeSpy).toHaveBeenCalledWith(modal);

    if (originalHaori === undefined) {
      Reflect.deleteProperty(window, 'Haori');
    } else {
      typedWindow.Haori = originalHaori;
    }
    modal.remove();
    container.remove();
  });

  it('redirectUrl sets window.location.href (attribute-driven)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });
    // jsdom does not implement full navigation; use hash redirect to avoid navigation error
    const url = '#/redirected';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/redirect');
    btn.setAttribute('data-click-redirect', url);
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => window.location.href.endsWith(url), {
      description: 'redirect url',
    });

    const redirected = window.location.href.endsWith(url);
    expect(redirected).toBeTruthy();
    container.remove();
  });

  it('handleFetchError sets data-message on parent via Haori.addErrorMessage (attribute-driven)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('Server failed', {
          status: 400,
          statusText: 'Bad',
          headers: {'Content-Type': 'text/plain'},
        }),
      ) as unknown as Promise<Response>;
    });

    const parent = document.createElement('div');
    const input = document.createElement('input');
    parent.appendChild(input);
    document.body.appendChild(parent);

    const btn = document.createElement('button');
    // ボタンは parent 内に入れることで、Haori.addErrorMessage が親要素に data-message を付加する
    parent.appendChild(btn);
    btn.setAttribute('data-click-fetch', 'http://api.test/error');

    await waitForDomSettled();
    btn.click();
    await waitForCondition(
      () => parent.getAttribute('data-message') === 'Server failed',
      {description: 'error message'},
    );

    // Haori.addErrorMessage sets data-message on parent element
    expect(parent.getAttribute('data-message')).toBe('Server failed');
    parent.remove();
  });

  it('JSON field errors delegate to window.Haori.addErrorMessage', async () => {
    const typedWindow = window as Window & typeof globalThis & {
      Haori?: unknown;
    };
    const originalHaori = typedWindow.Haori;
    const addErrorMessageSpy = vi
      .fn()
      .mockImplementation(async (target: HTMLElement, message: string) => {
        target.setAttribute('data-test-message', message);
      });
    typedWindow.Haori = {
      dialog: vi.fn().mockResolvedValue(undefined as void),
      confirm: vi.fn().mockResolvedValue(true),
      toast: vi.fn().mockResolvedValue(undefined as void),
      openDialog: vi.fn().mockResolvedValue(undefined as void),
      closeDialog: vi.fn().mockResolvedValue(undefined as void),
      addErrorMessage: addErrorMessageSpy,
      clearMessages: vi.fn().mockResolvedValue(undefined as void),
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({errors: {email: 'メールアドレスが不正です'}}), {
          status: 400,
          statusText: 'Bad Request',
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>;
    });

    const form = document.createElement('form');
    const emailInput = document.createElement('input');
    emailInput.name = 'email';
    form.appendChild(emailInput);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-form', '');
    btn.setAttribute('data-click-fetch', 'http://api.test/json-error');
    form.appendChild(btn);
    document.body.appendChild(form);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => addErrorMessageSpy.mock.calls.length > 0, {
      description: 'json field error delegation',
    });

    expect(addErrorMessageSpy).toHaveBeenCalledWith(
      emailInput,
      'メールアドレスが不正です',
    );

    if (originalHaori === undefined) {
      Reflect.deleteProperty(window, 'Haori');
    } else {
      typedWindow.Haori = originalHaori;
    }
    form.remove();
  });

  // -----------------------------------------------------------------------
  // history.pushState
  // -----------------------------------------------------------------------

  it('data-click-history calls history.pushState with the specified URL', async () => {
    const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/history');
    btn.setAttribute('data-click-history', '/new-path');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => pushStateSpy.mock.calls.length > 0, {
      description: 'pushState called',
    });

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', expect.stringContaining('/new-path'));
    container.remove();
  });

  it('data-click-history-data appends query params to the URL', async () => {
    const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/history-data');
    btn.setAttribute('data-click-history', '/search');
    btn.setAttribute('data-click-history-data', 'keyword=hello&page=1');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => pushStateSpy.mock.calls.length > 0, {
      description: 'pushState called with query params',
    });

    expect(pushStateSpy).toHaveBeenCalledWith(
      {},
      '',
      expect.stringMatching(/\/search\?.*keyword=hello/),
    );
    container.remove();
  });

  it('data-click-history omitted with data only updates query on current path', async () => {
    const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/history-data-only');
    btn.setAttribute('data-click-history-data', 'tab=list');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => pushStateSpy.mock.calls.length > 0, {
      description: 'pushState called with current-path query update',
    });

    expect(pushStateSpy).toHaveBeenCalledWith(
      {},
      '',
      expect.stringMatching(/tab=list/),
    );
    container.remove();
  });

  it('data-click-history-form appends form values as query params', async () => {
    const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const form = document.createElement('form');
    form.id = 'history-form';
    const input = document.createElement('input');
    input.name = 'q';
    input.value = 'vitest';
    form.appendChild(input);
    container.appendChild(form);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/history-form');
    btn.setAttribute('data-click-history', '/search');
    btn.setAttribute('data-click-history-form', '#history-form');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => pushStateSpy.mock.calls.length > 0, {
      description: 'pushState called with form values',
    });

    expect(pushStateSpy).toHaveBeenCalledWith(
      {},
      '',
      expect.stringMatching(/\/search\?.*q=vitest/),
    );
    container.remove();
  });

  it('data-click-history with cross-origin URL logs error and skips pushState', async () => {
    const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/history-cross-origin');
    btn.setAttribute('data-click-history', 'https://evil.example.com/path');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    // redirect がないので pushState が呼ばれないことを確認するため、十分なサイクル待機する
    await waitForCondition(() => errorSpy.mock.calls.length > 0, {
      description: 'error logged for cross-origin',
    });

    expect(pushStateSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    container.remove();
  });

  it('data-click-history executes before data-click-redirect', async () => {
    const callOrder: string[] = [];
    vi.spyOn(history, 'pushState').mockImplementation(() => {
      callOrder.push('pushState');
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/checkout');
    btn.setAttribute('data-click-history', '/checkout/confirm');
    btn.setAttribute('data-click-redirect', '#done');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => window.location.href.includes('#done'), {
      description: 'redirect after pushState',
    });

    expect(callOrder).toContain('pushState');
    container.remove();
  });
});
