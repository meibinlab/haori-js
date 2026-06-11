/* @vitest-environment jsdom */
/**
 * @fileoverview 報告#5 の実失敗構成を忠実に再現した回帰テスト。
 *
 * 複数キーの #state > form > div[data-fetch] > select[name・required・data-each・
 * data-attr-selected] に加え、同一フォーム内の value="{{}}" テキストと
 * checked="{{}}" radio を含む構成で、フォーカス中の select 操作が
 * （change 起因の再評価や setBindingData 連打でも）巻き戻らず、data-change-run が
 * 発火することを検証する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('報告#5 実失敗構成の回帰', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let runCount: number;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    runCount = 0;
    (window as unknown as Record<string, unknown>).__c = () => {
      runCount += 1;
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({materials: [{id: 'a'}, {id: 'b'}, {id: 'c'}]}),
            {headers: {'Content-Type': 'application/json'}},
          ),
        ) as unknown as Promise<Response>,
    );
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    container.remove();
  });

  const build = async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"selectedId":"a","shopCode":"","note":"hi"}'>
        <form id="f">
          <div id="opts" data-fetch="/materials.json" data-fetch-bind="#opts">
            <select id="s" name="shopCode" required
              data-change-run="window.__c()">
              <option value="a" data-attr-selected="{{selectedId === 'a'}}">a</option>
              <option value="b" data-attr-selected="{{selectedId === 'b'}}">b</option>
              <option value="c" data-attr-selected="{{selectedId === 'c'}}">c</option>
            </select>
          </div>
          <input id="txt" name="note" value="{{note}}">
          <input id="r1" type="radio" name="g" value="x"
            checked="{{selectedId === 'a'}}">
        </form>
      </div>
    `;
    await Core.scan(container);
    await waitForCondition(
      () => (container.querySelector('#s') as HTMLSelectElement).value === 'a',
      {description: 'data-attr-selected で a が選択される'},
    );
    await waitForDomSettled();
  };

  it('フォーカス中の select 操作は change-run を発火し、選択は巻き戻らない', async () => {
    await build();
    const select = container.querySelector('#s') as HTMLSelectElement;
    expect(select.value).toBe('a');

    select.focus();
    select.value = 'b';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // 発火回数（バインド非依存カウンタ）で run の発火を確認
    expect(runCount, 'data-change-run が発火する').toBeGreaterThanOrEqual(1);
    // selectedId は #state のまま（'a'）だが、フォーカス中なので巻き戻らない
    expect(select.value, '選択が巻き戻らない').toBe('b');
  });

  it('setBindingData 連打中もフォーカス中の選択は保持される', async () => {
    await build();
    const state = container.querySelector('#state') as HTMLElement;
    const select = container.querySelector('#s') as HTMLSelectElement;

    select.focus();
    select.value = 'c';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    expect(select.value).toBe('c');

    // #state の別キーを高頻度で更新（評価キュー競合のストレス）
    const pushes: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      pushes.push(
        Core.setBindingData(state, {
          selectedId: 'a',
          shopCode: '',
          note: `n${i}`,
        }),
      );
    }
    await Promise.all(pushes);
    await waitForDomSettled();

    // フォーカス中なので連打後も選択は c のまま
    expect(select.value, '連打後もフォーカス中の選択は保持').toBe('c');
  });

  it('フォーカスを外すと宣言状態（selectedId=a → option a）が反映される', async () => {
    await build();
    const select = container.querySelector('#s') as HTMLSelectElement;

    select.focus();
    select.value = 'b';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    expect(select.value).toBe('b');

    // フォーカスを外して再評価 → selectedId='a' の宣言状態が反映される
    select.blur();
    const state = container.querySelector('#state') as HTMLElement;
    await Core.setBindingData(state, {
      selectedId: 'a',
      shopCode: 'b',
      note: 'hi',
    });
    await waitForDomSettled();
    expect(select.value, 'フォーカス解除後は宣言状態を反映').toBe('a');
  });
});
