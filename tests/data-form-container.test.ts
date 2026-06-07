/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-form 属性により非 form 要素（<tr> など）をフォームコンテナ化し、
 * data-click-form で値収集できることを検証する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-form コンテナ', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it('getFormFragment は data-form 要素を form コンテナとして認識する', async () => {
    container.innerHTML = `
      <div data-form id="grp">
        <input name="a" value="x">
        <button id="b">go</button>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    const btnFrag = Fragment.get(
      container.querySelector('#b') as HTMLElement,
    ) as ElementFragment;
    const formFrag = Form.getFormFragment(btnFrag);
    expect(formFrag).not.toBeNull();
    expect((formFrag!.getTarget() as HTMLElement).id).toBe('grp');
    expect(Form.getValues(formFrag!).a).toBe('x');
  });

  it('テーブル行 <tr data-form> の値を data-click-form で収集し PUT 送信する', async () => {
    const calls: Array<{url: string; body: unknown; method?: string}> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: any, opts: any) => {
      calls.push({
        url: String(url),
        method: opts?.method,
        body: opts?.body ? JSON.parse(opts.body) : undefined,
      });
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    container.innerHTML = `
      <div id="root" data-bind='{"prices":[{"id":10},{"id":20}]}'>
        <table><tbody data-each="prices" data-each-key="id">
          <tr data-form>
            <td><input name="startMonth" type="text"></td>
            <td><input name="price" type="number"></td>
            <td><button class="confirm"
                  data-click-fetch="{{'/api/prices/' + id}}"
                  data-click-fetch-method="PUT"
                  data-click-form>確定</button></td>
          </tr>
        </tbody></table>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    // 2行目に値を入力して確定する（change で内部値へ同期）。
    const row2 = rows[1] as HTMLElement;
    const setInput = (sel: string, value: string) => {
      const input = row2.querySelector(sel) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('change', {bubbles: true}));
    };
    setInput('[name="startMonth"]', '2026-04');
    setInput('[name="price"]', '1200');
    await waitForDomSettled();
    (row2.querySelector('.confirm') as HTMLElement).click();

    await waitForCondition(() => calls.length > 0, {description: 'PUT 送信'});

    // 行の id を含む URL と、行内の入力値が送信される。
    expect(calls[0].url).toBe('/api/prices/20');
    expect(calls[0].method).toBe('PUT');
    // price は type="number" のため数値型で送信される
    expect(calls[0].body).toMatchObject({startMonth: '2026-04', price: 1200});
  });
});
