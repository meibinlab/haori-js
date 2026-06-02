/* @vitest-environment jsdom */
/**
 * @fileoverview
 * data-click-bind-arg でネストキーへバインドした後、そのキーを参照する
 * 子孫要素の data-if / data-each が再評価・描画されることを検証する統合テストです。
 * あわせて、同一 data-each への並行評価が描画を破壊しないこと（再入制御）を確認します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('data-click-bind-arg バインド後の再評価', () => {
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

  it('ネストキーへの bind 後に data-if 表示と data-each 全行が描画される', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              content: [
                {id: 1, subject: 'A'},
                {id: 2, subject: 'B'},
                {id: 3, subject: 'C'},
              ],
            }),
            {headers: {'Content-Type': 'application/json'}},
          ),
        ) as unknown as Promise<Response>,
    );

    container.innerHTML = `
      <div id="dialog-state">
        <div id="wrap" data-if="correspondences?.content?.length">
          <table>
            <tbody data-each="correspondences?.content || []" data-each-key="id">
              <tr><td class="subj">{{subject}}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <button
        id="load"
        type="button"
        data-click-fetch="/api/correspondences.json"
        data-click-bind="#dialog-state"
        data-click-bind-arg="correspondences"
      >読み込む</button>
    `;

    await Core.scan(container);
    await waitForDomSettled();

    const wrap = container.querySelector('#wrap') as HTMLElement;
    expect(wrap.hasAttribute('data-if-false')).toBe(true);

    (container.querySelector('#load') as HTMLElement).click();

    await waitForCondition(
      () =>
        !wrap.hasAttribute('data-if-false') &&
        container.querySelectorAll('#wrap tbody .subj').length === 3 &&
        Array.from(container.querySelectorAll('#wrap tbody .subj')).every(
          el => el.textContent !== '{{subject}}',
        ),
      {description: 'bind-arg 後に data-if 表示と全行の補間が完了する'},
    );

    const rows = Array.from(
      container.querySelectorAll('#wrap tbody .subj'),
    ).map(el => el.textContent);
    expect(rows).toEqual(['A', 'B', 'C']);
  });

  it('同一 data-each への並行評価でも行が重複・欠落しない（再入制御）', async () => {
    container.innerHTML = `
      <div id="ds">
        <ul data-each="items || []" data-each-key="id">
          <li class="row">{{name}}</li>
        </ul>
      </div>
    `;
    const ds = container.querySelector('#ds') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    // 同じデータで並行に2回バインド（await せず）→ 競合を誘発する。
    const data = {
      items: [
        {id: 1, name: 'X'},
        {id: 2, name: 'Y'},
      ],
    };
    const p1 = Core.setBindingData(ds, {...data});
    const p2 = Core.setBindingData(ds, {...data});
    await Promise.all([p1, p2]);
    await waitForDomSettled();

    const rows = Array.from(container.querySelectorAll('#ds .row')).map(
      el => el.textContent,
    );
    expect(rows).toEqual(['X', 'Y']);
  });

  it('バインド完了後に haori:bindcomplete が対象要素で発火する', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({content: [{id: 1, subject: 'A'}]}), {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>,
    );

    container.innerHTML = `
      <div id="dialog-state"></div>
      <button
        id="load"
        type="button"
        data-click-fetch="/api/correspondences.json"
        data-click-bind="#dialog-state"
        data-click-bind-arg="correspondences"
      >読み込む</button>
    `;
    const target = container.querySelector('#dialog-state') as HTMLElement;

    await Core.scan(container);
    await waitForDomSettled();

    const events: Array<{bindArg: unknown; reason: unknown}> = [];
    target.addEventListener('haori:bindcomplete', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      events.push({bindArg: detail.bindArg, reason: detail.reason});
    });

    (container.querySelector('#load') as HTMLElement).click();

    await waitForCondition(() => events.length > 0, {
      description: 'haori:bindcomplete が発火する',
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].bindArg).toBe('correspondences');
  });
});
