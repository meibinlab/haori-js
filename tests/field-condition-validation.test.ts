/* @vitest-environment jsdom */
/**
 * @fileoverview フィールド間検証（data-validity / data-{event}-if）のテスト
 *
 * 属性値の再描画はキュー（requestAnimationFrame）で行われるため、「最後の欄を直して
 * そのまま次へを押す」操作では `data-attr-disabled` などの属性はクリック時点で古い。
 * ここでは、条件を**実行時に同期評価**することで
 *
 * - 直前に変更した入力を含めて判定される
 * - 条件が偽なら手続き（fetch・redirect・run など）が実行されない
 * - `data-if` で非表示になった欄の古い値で誤判定しない
 *
 * ことを固定する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import Procedure from '../src/procedure';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('フィールド間検証', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let fetched: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    fetched = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // data-click-form があると収集値がクエリに付くため、パスへ正規化する。
        fetched.push(new URL(String(url), 'http://localhost').pathname);
        return new Response('{}', {
          headers: {'Content-Type': 'application/json'},
        });
      }),
    );
  });

  afterEach(() => {
    dispatcher.stop();
    Dev.disable();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const mount = async (html: string): Promise<HTMLElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    return container;
  };

  /** 値を変更して change を発火し、続けて同じタスクでクリックする */
  const editThenClick = async (
    input: HTMLInputElement | HTMLSelectElement,
    value: string,
    button: HTMLElement,
  ): Promise<void> => {
    input.value = value;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    button.dispatchEvent(new Event('click', {bubbles: true}));
    await waitForDomSettled();
    await new Promise(resolve => setTimeout(resolve, 50));
  };

  describe('data-{event}-if（手続きの実行条件）', () => {
    const MATCH_FORM = (initial: string): string => `
      <form id="f" data-bind='${initial}'>
        <input name="email">
        <input name="email2">
        <button id="go" data-click-fetch="/api/next"
                data-click-if="{{email === email2}}">次へ</button>
      </form>`;

    it('一致から不一致へ変えて即クリックしても実行されない', async () => {
      const root = await mount(
        MATCH_FORM('{"email":"a@example.com","email2":"a@example.com"}'),
      );
      const email2 = root.querySelector<HTMLInputElement>(
        'input[name="email2"]',
      )!;
      const button = root.querySelector<HTMLElement>('#go')!;

      await editThenClick(email2, 'b@example.com', button);

      expect(fetched).toEqual([]);
    });

    it('不一致から一致へ直して即クリックすると実行される', async () => {
      const root = await mount(
        MATCH_FORM('{"email":"a@example.com","email2":""}'),
      );
      const email2 = root.querySelector<HTMLInputElement>(
        'input[name="email2"]',
      )!;
      const button = root.querySelector<HTMLElement>('#go')!;

      await editThenClick(email2, 'a@example.com', button);

      expect(fetched).toEqual(['/api/next']);
    });

    it('祖先が持つ古い値を、非表示分岐の宣言キーがシャドーする', async () => {
      // 祖先が（ストレージ復元などで）tel を持ち、フォーム内の tel 欄は data-if で
      // 非表示になっている構成。収集値には tel が現れないため、宣言キーは未入力
      // として扱わなければ「電話が入っている」と誤判定してしまう。
      const root = await mount(
        `<div id="outer" data-bind='{"tel":"09000000000","mail":"","use":false}'>
           <form id="f">
             <div data-if="{{use}}"><input name="tel"></div>
             <input name="mail">
           </form>
           <button id="go" data-click-fetch="/api/next" data-click-form="#f"
                   data-click-if="{{tel || mail}}">次へ</button>
         </div>`,
      );
      const button = root.querySelector<HTMLElement>('#go')!;

      // 祖先のバインドデータには tel が残っている。
      expect(
        getFrag(root.querySelector<HTMLElement>('#outer')!).getRawBindingData(),
      ).toMatchObject({tel: '09000000000'});
      // 非表示分岐なので収集値には現れない。
      expect(
        root
          .querySelector<HTMLElement>('[data-if-false]')!
          .querySelector('input[name="tel"]'),
      ).not.toBeNull();

      button.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(fetched).toEqual([]);
    });

    it('条件が偽なら run・confirm・redirect も実行されない', async () => {
      const calls: string[] = [];
      vi.stubGlobal('confirm', vi.fn(() => {
        calls.push('confirm');
        return true;
      }));
      (window as unknown as Record<string, unknown>).__mark = () => {
        calls.push('run');
      };
      const root = await mount(
        `<form id="f" data-bind='{"agreed":false}'>
           <button id="go" data-click-fetch="/api/next"
                   data-click-if="{{agreed}}"
                   data-click-run="window.__mark()"
                   data-click-confirm="よろしいですか"
                   data-click-redirect="/done">確定</button>
         </form>`,
      );

      root.querySelector<HTMLElement>('#go')!.dispatchEvent(
        new Event('click', {bubbles: true}),
      );
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(calls).toEqual([]);
      expect(fetched).toEqual([]);
    });

    it('偽で中断した後もボタンは再度押せる', async () => {
      const root = await mount(
        `<form id="f" data-bind='{"ok":false}'>
           <button id="go" data-click-fetch="/api/next"
                   data-click-if="{{ok}}">次へ</button>
         </form>`,
      );
      const button = root.querySelector<HTMLButtonElement>('#go')!;

      button.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(button.hasAttribute('disabled')).toBe(false);

      await Core.setBindingData(root.querySelector<HTMLElement>('#f')!, {
        ok: true,
      });
      await waitForDomSettled();
      button.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(fetched).toEqual(['/api/next']);
    });

    it('参照が解決できない条件は実行せず警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => {});
      const root = await mount(
        `<form id="f" data-bind='{}'>
           <button id="go" data-click-fetch="/api/next"
                   data-click-if="{{missingKey}}">次へ</button>
         </form>`,
      );

      root.querySelector<HTMLElement>('#go')!.dispatchEvent(
        new Event('click', {bubbles: true}),
      );
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(fetched).toEqual([]);
      expect(
        warn.mock.calls.some(call =>
          String(call[1]).includes('解決できないため実行しません'),
        ),
      ).toBe(true);
    });

    it('data-form-arg 構成ではそのキー配下で参照できる', async () => {
      const root = await mount(
        `<div data-bind='{"draft":{"a":"1","b":""}}'>
           <form id="f" data-form-arg="draft">
             <input name="a">
             <input name="b">
             <button id="go" data-click-fetch="/api/next"
                     data-click-if="{{draft.a === draft.b}}">次へ</button>
           </form>
         </div>`,
      );
      const b = root.querySelector<HTMLInputElement>('input[name="b"]')!;
      const button = root.querySelector<HTMLElement>('#go')!;

      await editThenClick(b, '2', button);
      expect(fetched).toEqual([]);

      await editThenClick(b, '1', button);
      expect(fetched).toEqual(['/api/next']);
    });

    it('合計 1 件以上のような集約条件を書ける', async () => {
      const root = await mount(
        `<form id="f" data-bind='{"power":[],"gas":[]}'>
           <button id="go" data-click-fetch="/api/next"
                   data-click-if="{{power.length + gas.length > 0}}">確定</button>
         </form>`,
      );
      const form = root.querySelector<HTMLElement>('#f')!;
      const button = root.querySelector<HTMLElement>('#go')!;

      button.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(fetched).toEqual([]);

      await Core.setBindingData(form, {power: [{id: 1}], gas: []});
      await waitForDomSettled();
      button.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(fetched).toEqual(['/api/next']);
    });

    it('非イベントの data-fetch-if でも条件が効く', async () => {
      await mount(
        `<form id="f" data-bind='{"ready":false}'>
           <span data-fetch="/api/auto" data-fetch-if="{{ready}}"></span>
         </form>`,
      );
      expect(fetched).toEqual([]);

      await Core.setBindingData(
        container.querySelector<HTMLElement>('#f')!,
        {ready: true},
      );
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(fetched).toEqual(['/api/auto']);
    });
  });

  describe('data-validity（入力欄の宣言的検証）', () => {
    const VALIDITY_FORM = (initial: string): string => `
      <form id="f" data-bind='${initial}'>
        <input name="email">
        <input name="email2"
               data-validity="{{email === email2}}"
               data-validity-message="メールアドレスが一致しません">
        <button id="go" data-click-fetch="/api/next" data-click-form data-click-validate>
          次へ
        </button>
      </form>`;

    it('条件が偽なら検証で止まり、メッセージが設定される', async () => {
      const root = await mount(
        VALIDITY_FORM('{"email":"a@example.com","email2":"a@example.com"}'),
      );
      const email2 = root.querySelector<HTMLInputElement>(
        'input[name="email2"]',
      )!;
      const button = root.querySelector<HTMLElement>('#go')!;

      await editThenClick(email2, 'b@example.com', button);

      expect(fetched).toEqual([]);
      expect(email2.validationMessage).toBe('メールアドレスが一致しません');
      expect(email2.checkValidity()).toBe(false);
    });

    it('条件が真なら検証を通り、メッセージは解除される', async () => {
      const root = await mount(
        VALIDITY_FORM('{"email":"a@example.com","email2":""}'),
      );
      const email2 = root.querySelector<HTMLInputElement>(
        'input[name="email2"]',
      )!;
      const button = root.querySelector<HTMLElement>('#go')!;

      await editThenClick(email2, 'a@example.com', button);

      expect(fetched).toEqual(['/api/next']);
      expect(email2.validationMessage).toBe('');
      expect(email2.checkValidity()).toBe(true);
    });

    it('メッセージを省略すると既定文言になる', async () => {
      const root = await mount(
        `<form id="f" data-bind='{"a":"1","b":"2"}'>
           <input name="a">
           <input name="b" data-validity="{{a === b}}">
           <button id="go" data-click-fetch="/api/next" data-click-form data-click-validate>
             次へ
           </button>
         </form>`,
      );

      root.querySelector<HTMLElement>('#go')!.dispatchEvent(
        new Event('click', {bubbles: true}),
      );
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      const b = root.querySelector<HTMLInputElement>('input[name="b"]')!;
      expect(b.validationMessage).toBe('入力内容を確認してください');
      expect(fetched).toEqual([]);
    });

    it('data-{event}-validate が無ければ検証しない（開発モードで警告）', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => {});
      const root = await mount(
        `<form id="f" data-bind='{"a":"1","b":"2"}'>
           <input name="a">
           <input name="b" data-validity="{{a === b}}">
           <button id="go" data-click-fetch="/api/next">次へ</button>
         </form>`,
      );

      root.querySelector<HTMLElement>('#go')!.dispatchEvent(
        new Event('click', {bubbles: true}),
      );
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(fetched).toEqual(['/api/next']);
      expect(
        warn.mock.calls.some(call =>
          String(call[1]).includes('検証は行われません'),
        ),
      ).toBe(true);
    });

    it('非表示分岐（data-if が偽）の欄は検証対象外', async () => {
      const root = await mount(
        `<form id="f" data-bind='{"use":false,"a":"1","b":"2"}'>
           <input name="a">
           <div data-if="{{use}}">
             <input name="b" data-validity="{{a === b}}">
           </div>
           <button id="go" data-click-fetch="/api/next" data-click-form data-click-validate>
             次へ
           </button>
         </form>`,
      );

      root.querySelector<HTMLElement>('#go')!.dispatchEvent(
        new Event('click', {bubbles: true}),
      );
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(fetched).toEqual(['/api/next']);
    });

    it('いずれか必須をグループの欄で表現できる', async () => {
      const root = await mount(
        `<form id="f" data-bind='{"tel":"","mail":""}'>
           <input name="tel"
                  data-validity="{{tel || mail}}"
                  data-validity-message="電話かメールを入力してください">
           <input name="mail">
           <button id="go" data-click-fetch="/api/next" data-click-form data-click-validate>
             次へ
           </button>
         </form>`,
      );
      const tel = root.querySelector<HTMLInputElement>('input[name="tel"]')!;
      const mail = root.querySelector<HTMLInputElement>('input[name="mail"]')!;
      const button = root.querySelector<HTMLElement>('#go')!;

      button.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(fetched).toEqual([]);
      expect(tel.validationMessage).toBe('電話かメールを入力してください');

      // メールだけ入れて即クリックしても通る（直前の変更が判定に入る）。
      await editThenClick(mail, 'a@example.com', button);
      expect(fetched).toEqual(['/api/next']);
    });

    it('data-form-list の行では行の要素データで判定される', async () => {
      const root = await mount(
        `<form id="f" data-bind='{"rows":[
             {"qty":"1","limit":"1"},{"qty":"5","limit":"3"}]}'>
           <div data-form-list="rows" data-each="rows" data-each-arg="r"
                data-each-index="i">
             <div>
               <input name="qty"
                      data-validity="{{Number(r.qty) <= Number(r.limit)}}"
                      data-validity-message="上限を超えています">
               <input name="limit">
             </div>
           </div>
           <button id="go" data-click-fetch="/api/next" data-click-form data-click-validate>
             次へ
           </button>
         </form>`,
      );

      root.querySelector<HTMLElement>('#go')!.dispatchEvent(
        new Event('click', {bubbles: true}),
      );
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      const qty = Array.from(
        root.querySelectorAll<HTMLInputElement>('input[name="qty"]'),
      );
      expect(fetched).toEqual([]);
      // 1 行目は条件を満たし、2 行目だけが無効になる。
      expect(qty[0].validationMessage).toBe('');
      expect(qty[1].validationMessage).toBe('上限を超えています');
    });

    it('参照が解決できない条件は無効として扱う', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => {});
      const root = await mount(
        `<form id="f" data-bind='{"a":"1"}'>
           <input name="a" data-validity="{{missingKey}}"
                  data-validity-message="確認してください">
           <button id="go" data-click-fetch="/api/next" data-click-form data-click-validate>
             次へ
           </button>
         </form>`,
      );

      root.querySelector<HTMLElement>('#go')!.dispatchEvent(
        new Event('click', {bubbles: true}),
      );
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(fetched).toEqual([]);
      expect(
        warn.mock.calls.some(call =>
          String(call[1]).includes('解決できないため無効として扱います'),
        ),
      ).toBe(true);
    });

    it('評価結果が data-validity 属性へ書き込まれない', async () => {
      const root = await mount(
        VALIDITY_FORM('{"email":"a@example.com","email2":"a@example.com"}'),
      );
      const email2 = root.querySelector<HTMLInputElement>(
        'input[name="email2"]',
      )!;

      expect(email2.getAttribute('data-validity')).toBe(
        '{{email === email2}}',
      );
    });
  });
});
