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
    await waitForCondition(() => resetSpy.mock.calls.length > 0, {
      description: 'reset action',
    });

    expect(resetSpy).toHaveBeenCalled();
    container.remove();
  });

  it('data-click-form を伴う click 実行後に disabled 属性が残らない', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);

    const form = document.createElement('form');
    form.id = 'search-form';
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-click-fetch', 'http://api.test/search');
    button.setAttribute('data-click-form', '#search-form');
    button.setAttribute('data-click-data', '{"page":0}');
    button.setAttribute('data-click-history-form', '#search-form');
    form.appendChild(button);
    container.appendChild(form);

    await waitForDomSettled();
    button.click();

    await waitForCondition(() => fetchSpy.mock.calls.length > 0, {
      description: 'search fetch',
    });
    await waitForCondition(() => !button.hasAttribute('disabled'), {
      description: 'search button re-enabled',
    });

    expect(button.hasAttribute('disabled')).toBe(false);
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
    await waitForCondition(() => clickSpy.mock.calls.length > 0, {
      description: 'click action',
    });

    expect(clickSpy).toHaveBeenCalled();
    button.remove();
    container.remove();
  });

  it('data-click-copy copies form values to another form without fetch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const sourceForm = document.createElement('form');
    sourceForm.id = 'search-form';
    const keywordInput = document.createElement('input');
    keywordInput.name = 'keyword';
    keywordInput.value = 'haori';
    const pageInput = document.createElement('input');
    pageInput.name = 'page';
    pageInput.value = '3';
    sourceForm.append(keywordInput, pageInput);

    const targetForm = document.createElement('form');
    targetForm.id = 'search-committed';
    const committedKeywordInput = document.createElement('input');
    committedKeywordInput.name = 'keyword';
    const committedPageInput = document.createElement('input');
    committedPageInput.name = 'page';
    targetForm.append(committedKeywordInput, committedPageInput);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-form', '#search-form');
    btn.setAttribute('data-click-copy', '#search-committed');

    container.append(sourceForm, targetForm, btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(
      () =>
        committedKeywordInput.value === 'haori' &&
        committedPageInput.value === '3',
      {description: 'copy to target form'},
    );

    expect(committedKeywordInput.value).toBe('haori');
    expect(committedPageInput.value).toBe('3');
    container.remove();
  });

  it('data-click-copy copies source bindingData when data-click-form is omitted', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const source = document.createElement('button');
    source.textContent = 'copy';
    source.setAttribute('data-bind', '{"keyword":"binding","page":"7"}');
    source.setAttribute('data-click-copy', '#binding-target');

    const target = document.createElement('div');
    target.id = 'binding-target';
    target.setAttribute('data-bind', '{"keyword":"old","keep":"yes"}');

    container.append(source, target);

    await waitForDomSettled();
    source.click();
    await waitForCondition(
      () => {
        const bind = target.getAttribute('data-bind');
        return bind !== null && bind.includes('"keyword":"binding"');
      },
      {description: 'copy from source bindingData'},
    );

    const copied = JSON.parse(target.getAttribute('data-bind') || '{}') as Record<
      string,
      unknown
    >;
    expect(copied).toMatchObject({
      keyword: 'binding',
      page: '7',
      keep: 'yes',
    });
    container.remove();
  });

  it('data-click-copy logs an error and skips copy when the selector does not match', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const source = document.createElement('button');
    source.textContent = 'copy';
    source.setAttribute('data-bind', '{"keyword":"binding"}');
    source.setAttribute('data-click-copy', '#missing-target');

    const target = document.createElement('div');
    target.id = 'existing-target';
    target.setAttribute('data-bind', '{"keyword":"old","keep":"yes"}');

    container.append(source, target);

    await waitForDomSettled();
    source.click();

    await waitForCondition(
      () =>
        errorSpy.mock.calls.some(call =>
          call.some(
            arg =>
              typeof arg === 'string' &&
              arg.includes('Element not found: #missing-target'),
          ),
        ),
      {description: 'missing copy target error'},
    );

    const copied = JSON.parse(target.getAttribute('data-bind') || '{}') as Record<
      string,
      unknown
    >;
    expect(copied).toMatchObject({
      keyword: 'old',
      keep: 'yes',
    });
    errorSpy.mockRestore();
    container.remove();
  });

  it('data-click-copy-params copies only selected keys and preserves target data', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const sourceForm = document.createElement('form');
    sourceForm.id = 'copy-source-form';
    const keywordInput = document.createElement('input');
    keywordInput.name = 'keyword';
    keywordInput.value = 'next';
    const pageInput = document.createElement('input');
    pageInput.name = 'page';
    pageInput.value = '2';
    sourceForm.append(keywordInput, pageInput);

    const target = document.createElement('div');
    target.id = 'copy-target';
    target.setAttribute('data-bind', '{"keyword":"old","keep":"yes"}');

    const btn = document.createElement('button');
    btn.setAttribute('data-click-form', '#copy-source-form');
    btn.setAttribute('data-click-copy', '#copy-target');
    btn.setAttribute('data-click-copy-params', 'page');

    container.append(sourceForm, target, btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => {
      const bind = target.getAttribute('data-bind');
      return bind !== null && bind.includes('"page":"2"');
    }, {description: 'copy selected params'});

    const copied = JSON.parse(target.getAttribute('data-bind') || '{}') as Record<
      string,
      unknown
    >;
    expect(copied).toMatchObject({
      keyword: 'old',
      keep: 'yes',
      page: '2',
    });
    container.remove();
  });

  it('data-click-reset executes before data-click-copy', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const sourceForm = document.createElement('form');
    sourceForm.id = 'reset-source-form';
    const keywordInput = document.createElement('input');
    keywordInput.name = 'keyword';
    sourceForm.appendChild(keywordInput);
    keywordInput.value = 'dirty';

    const targetForm = document.createElement('form');
    targetForm.id = 'reset-copy-target';
    const committedKeywordInput = document.createElement('input');
    committedKeywordInput.name = 'keyword';
    committedKeywordInput.value = 'stale';
    targetForm.appendChild(committedKeywordInput);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-form', '#reset-source-form');
    btn.setAttribute('data-click-reset', '#reset-source-form');
    btn.setAttribute('data-click-copy', '#reset-copy-target');

    container.append(sourceForm, targetForm, btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(
      () =>
        keywordInput.value === '' && committedKeywordInput.value === '',
      {description: 'reset before copy'},
    );

    expect(keywordInput.value).toBe('');
    expect(committedKeywordInput.value).toBe('');
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
    await waitForCondition(
      () => openSpy.mock.calls.length > 0 && closeSpy.mock.calls.length > 0,
      {description: 'open and close actions'},
    );

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
    btn.type = 'button';
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
  // data-click-scroll-error
  // -----------------------------------------------------------------------

  describe('data-click-scroll-error', () => {
    let scrollIntoViewSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // jsdom は scrollIntoView を実装していないため先に定義してからスパイする
      Element.prototype.scrollIntoView = () => {};
      scrollIntoViewSpy = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      // vi.restoreAllMocks() は直接代入した () => {} へ戻すだけなので、
      // afterEach でプロパティ自体を削除して jsdom の元の状態（未定義）に戻す
      delete (Element.prototype as unknown as Record<string, unknown>)
        .scrollIntoView;
    });

    it('JSON フィールドエラー: エラー要素の scrollIntoView が呼ばれる', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({errors: {email: 'メールアドレスが不正です'}}),
            {status: 422, headers: {'Content-Type': 'application/json'}},
          ),
        ) as unknown as Promise<Response>,
      );

      const form = document.createElement('form');
      const emailWrapper = document.createElement('div');
      const emailInput = document.createElement('input');
      emailInput.name = 'email';
      emailWrapper.appendChild(emailInput);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/json-field-error');
      btn.setAttribute('data-click-scroll-error', '');
      form.append(emailWrapper, btn);
      document.body.appendChild(form);

      await waitForDomSettled();
      btn.click();
      await waitForCondition(
        () => emailWrapper.getAttribute('data-message-level') === 'error',
        {description: 'field error message set'},
      );

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
      });
      form.remove();
    });

    it('JSON entries が空（汎用メッセージ）: scrollIntoView が呼ばれる', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('{}', {
            status: 500,
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>,
      );

      const form = document.createElement('form');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/json-empty-error');
      btn.setAttribute('data-click-scroll-error', '');
      form.appendChild(btn);
      document.body.appendChild(form);

      await waitForDomSettled();
      btn.click();
      await waitForCondition(
        () => form.getAttribute('data-message-level') === 'error',
        {description: 'general error message set (json empty)'},
      );

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
      });
      form.remove();
    });

    it('text/plain フォールバック: scrollIntoView が呼ばれる', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('Internal Server Error', {
            status: 500,
            headers: {'Content-Type': 'text/plain'},
          }),
        ) as unknown as Promise<Response>,
      );

      const form = document.createElement('form');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/text-error');
      btn.setAttribute('data-click-scroll-error', '');
      form.appendChild(btn);
      document.body.appendChild(form);

      await waitForDomSettled();
      btn.click();
      await waitForCondition(
        () => form.getAttribute('data-message-level') === 'error',
        {description: 'text fallback error message set'},
      );

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
      });
      form.remove();
    });

    it('non-form target: addErrorMessage が parentElement に付与したエラー要素へ scrollIntoView が呼ばれる', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('Server Error', {
            status: 500,
            headers: {'Content-Type': 'text/plain'},
          }),
        ) as unknown as Promise<Response>,
      );

      // フォームではなく div の中にボタンを置く
      const container = document.createElement('div');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/non-form-error');
      btn.setAttribute('data-click-scroll-error', '');
      container.appendChild(btn);
      document.body.appendChild(container);

      await waitForDomSettled();
      btn.click();
      // addErrorMessage は非フォーム target の parentElement にエラーを付与する
      await waitForCondition(
        () => container.getAttribute('data-message-level') === 'error',
        {description: 'error set on parentElement (container)'},
      );

      // container（btn.parentElement）に対して scrollIntoView が 1 回呼ばれる
      expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
      expect(scrollIntoViewSpy.mock.instances[0]).toBe(container);
      container.remove();
    });

    it('data-click-scroll-error がない場合は scrollIntoView が呼ばれない', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('Error', {
            status: 500,
            headers: {'Content-Type': 'text/plain'},
          }),
        ) as unknown as Promise<Response>,
      );

      const form = document.createElement('form');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/no-scroll');
      form.appendChild(btn);
      document.body.appendChild(form);

      await waitForDomSettled();
      btn.click();
      await waitForCondition(
        () => form.getAttribute('data-message-level') === 'error',
        {description: 'error message set without scroll-error attr'},
      );

      expect(scrollIntoViewSpy).not.toHaveBeenCalled();
      form.remove();
    });

    it('バリデーション失敗: scrollIntoView が呼ばれる', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const form = document.createElement('form');
      const input = document.createElement('input');
      input.name = 'name';
      input.required = true;
      input.value = '';
      form.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/validate');
      btn.setAttribute('data-click-form', '');
      btn.setAttribute('data-click-validate', '');
      btn.setAttribute('data-click-scroll-error', '');
      form.appendChild(btn);
      document.body.appendChild(form);

      await waitForDomSettled();
      btn.click();
      await waitForCondition(
        () => scrollIntoViewSpy.mock.calls.length > 0,
        {description: 'scrollIntoView called on validation error'},
      );

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      form.remove();
    });

    it('バリデーション失敗（複数 invalid）: scrollIntoView は先頭の invalid 要素に 1 回だけ呼ばれ、reportValidity も先頭要素に 1 回だけ呼ばれる', async () => {
      // 検出フェーズは checkValidity で行われるため、checkValidity をスタブして両 input を invalid にする
      vi.spyOn(HTMLInputElement.prototype, 'checkValidity').mockReturnValue(
        false,
      );
      // reportValidity は先頭 1 要素にだけ呼ばれることを確認するためスパイを立てる
      const reportValiditySpy = vi
        .spyOn(HTMLInputElement.prototype, 'reportValidity')
        .mockReturnValue(false);

      const form = document.createElement('form');
      const inputA = document.createElement('input'); // DOM 上で先頭
      inputA.name = 'name';
      form.appendChild(inputA);
      const inputB = document.createElement('input'); // DOM 上で 2 番目
      inputB.name = 'email';
      form.appendChild(inputB);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/multi-validate');
      btn.setAttribute('data-click-form', '');
      btn.setAttribute('data-click-validate', '');
      btn.setAttribute('data-click-scroll-error', '');
      form.appendChild(btn);
      document.body.appendChild(form);

      await waitForDomSettled();
      btn.click();
      await waitForCondition(
        () => scrollIntoViewSpy.mock.calls.length > 0,
        {description: 'scrollIntoView called once on first invalid'},
      );

      // scrollIntoView は 1 回だけ、先頭の invalid 要素（inputA）に対して呼ばれる
      expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
      expect(scrollIntoViewSpy.mock.instances[0]).toBe(inputA);
      // reportValidity も先頭要素にだけ呼ばれる（複数の native UI が出ない）
      expect(reportValiditySpy).toHaveBeenCalledTimes(1);
      expect(reportValiditySpy.mock.instances[0]).toBe(inputA);
      form.remove();
    });
  });

  // -----------------------------------------------------------------------
  // data-click-scroll
  // -----------------------------------------------------------------------

  describe('data-click-scroll', () => {
    let scrollIntoViewSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      Element.prototype.scrollIntoView = () => {};
      scrollIntoViewSpy = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      delete (Element.prototype as unknown as Record<string, unknown>)
        .scrollIntoView;
    });

    it('成功時にセレクターで指定した要素へ scrollIntoView が呼ばれる', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ) as unknown as Promise<Response>,
      );

      const target = document.createElement('div');
      target.id = 'scroll-target';
      document.body.appendChild(target);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/success');
      btn.setAttribute('data-click-scroll', '#scroll-target');
      document.body.appendChild(btn);

      await waitForDomSettled();
      btn.click();
      await waitForCondition(
        () => scrollIntoViewSpy.mock.calls.length > 0,
        {description: 'scrollIntoView called on success'},
      );

      expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
      expect(scrollIntoViewSpy.mock.instances[0]).toBe(target);
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
      });
      target.remove();
      btn.remove();
    });

    it('フェッチエラー時は scrollIntoView が呼ばれない', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('Error', {
            status: 500,
            headers: {'Content-Type': 'text/plain'},
          }),
        ) as unknown as Promise<Response>,
      );

      const target = document.createElement('div');
      target.id = 'scroll-target-error';
      document.body.appendChild(target);

      const form = document.createElement('form');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/fail');
      btn.setAttribute('data-click-scroll', '#scroll-target-error');
      form.appendChild(btn);
      document.body.appendChild(form);

      await waitForDomSettled();
      btn.click();
      await waitForCondition(
        () => form.getAttribute('data-message-level') === 'error',
        {description: 'error message set'},
      );

      expect(scrollIntoViewSpy).not.toHaveBeenCalled();
      target.remove();
      form.remove();
    });

    it('セレクターにマッチする要素がない場合は scrollIntoView が呼ばれない', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ) as unknown as Promise<Response>,
      );

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-click-fetch', 'http://api.test/success-no-target');
      btn.setAttribute('data-click-scroll', '#nonexistent');
      document.body.appendChild(btn);

      await waitForDomSettled();
      btn.click();
      // fetch 完了を待つ（scrollIntoView は呼ばれないのでタイムアウト前に別の条件で判断）
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(scrollIntoViewSpy).not.toHaveBeenCalled();
      btn.remove();
    });
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

    expect(pushStateSpy).toHaveBeenCalledWith(
      {__haoriHistoryState__: true},
      '',
      expect.stringContaining('/new-path'),
    );
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
      {__haoriHistoryState__: true},
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
      {__haoriHistoryState__: true},
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
      {__haoriHistoryState__: true},
      '',
      expect.stringMatching(/\/search\?.*q=vitest/),
    );
    container.remove();
  });

  it('data-click-reset with data-click-history-form does not use pre-reset values', async () => {
    const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);

    const form = document.createElement('form');
    form.id = 'reset-history-form';
    const input = document.createElement('input');
    input.name = 'q';
    input.setAttribute('value', 'default');
    input.value = 'dirty';
    form.appendChild(input);
    container.appendChild(form);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-reset', '#reset-history-form');
    btn.setAttribute('data-click-history', '/search');
    btn.setAttribute('data-click-history-form', '#reset-history-form');
    container.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => pushStateSpy.mock.calls.length > 0, {
      description: 'pushState called after reset processing',
    });

    expect(pushStateSpy).toHaveBeenCalledWith(
      {__haoriHistoryState__: true},
      '',
      expect.stringContaining('/search'),
    );
    expect(String(pushStateSpy.mock.calls[0]?.[2] ?? '')).not.toContain('dirty');
    expect(input.value).toBe('default');
    container.remove();
  });

  it('data-click-copy updates history-data before pushState', async () => {
    const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);

    const form = document.createElement('form');
    form.id = 'copy-history-form';
    form.setAttribute('data-bind', '{"keyword":"stale"}');
    const input = document.createElement('input');
    input.name = 'keyword';
    input.value = 'copied';
    form.appendChild(input);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-form', '#copy-history-form');
    btn.setAttribute('data-click-copy', '#copy-history-form');
    btn.setAttribute('data-click-history', '/search');
    btn.setAttribute('data-click-history-data', 'keyword={{keyword}}');
    form.appendChild(btn);

    container.appendChild(form);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => pushStateSpy.mock.calls.length > 0, {
      description: 'pushState called after copy processing',
    });

    expect(pushStateSpy).toHaveBeenCalledWith(
      {__haoriHistoryState__: true},
      '',
      expect.stringContaining('/search?keyword=copied'),
    );
    expect(String(pushStateSpy.mock.calls[0]?.[2] ?? '')).not.toContain('stale');
    container.remove();
  });

  it('data-click-reset-before で history-data と history-form は後続の bind/copy に上書きされない', async () => {
    const pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({keyword: 'copied'}), {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);

    const form = document.createElement('form');
    form.id = 'reset-before-history-form';
    form.setAttribute('data-bind', '{"keyword":"reset"}');
    const input = document.createElement('input');
    input.name = 'keyword';
    input.value = 'dirty';
    form.appendChild(input);
    container.appendChild(form);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/history-reset-before');
    btn.setAttribute('data-click-fetch-method', 'POST');
    btn.setAttribute('data-click-reset-before', '#reset-before-history-form');
    btn.setAttribute('data-click-bind', '#reset-before-history-form');
    btn.setAttribute('data-click-history', '/search');
    btn.setAttribute('data-click-history-data', 'keyword={{keyword}}');
    btn.setAttribute('data-click-history-form', '#reset-before-history-form');
    btn.setAttribute('data-click-copy', '#reset-before-history-form');
    form.appendChild(btn);

    await waitForDomSettled();
    btn.click();
    await waitForCondition(() => pushStateSpy.mock.calls.length > 0, {
      description: 'pushState called after reset-before processing',
    });

    const call = pushStateSpy.mock.calls[0];
    expect(String(call[2] ?? '')).toContain('/search?');
    expect(String(call[2] ?? '')).toContain('keyword=reset');
    expect(String(call[2] ?? '')).not.toContain('copied');
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

describe('popstate auto-reload', () => {
  it('popstate イベント発火時に location.reload() を呼び出す', async () => {
    const mockReload = vi.fn();
    vi.stubGlobal('location', {reload: mockReload});
    window.dispatchEvent(new PopStateEvent('popstate', {state: {}}));
    expect(mockReload).not.toHaveBeenCalled();
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: {__haoriHistoryState__: true},
      }),
    );
    expect(mockReload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
