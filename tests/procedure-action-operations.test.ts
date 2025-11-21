/* @vitest-environment jsdom */
/**
 * Procedure のリセット、refetch、click、open/close、redirect、data-message に関するテスト
 */
import {describe, it, expect, beforeEach, vi} from 'vitest';
import Form from '../src/form';
import Haori from '../src/haori';

describe('Procedure action operations', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
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

    await new Promise(resolve => setTimeout(resolve, 50));
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

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

    await new Promise(resolve => setTimeout(resolve, 50));
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

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

    await new Promise(resolve => setTimeout(resolve, 50));
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

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

    await new Promise(resolve => setTimeout(resolve, 50));
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(openSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
    dialog.remove();
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

    await new Promise(resolve => setTimeout(resolve, 50));
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

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

    await new Promise(resolve => setTimeout(resolve, 50));
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    // Haori.addErrorMessage sets data-message on parent element
    expect(parent.getAttribute('data-message')).toBe('Server failed');
    parent.remove();
  });
});
