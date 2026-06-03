/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 依頼1: haori:bindcomplete が data-if / data-each の DOM 反映完了後に発火することを検証する。
 * 依頼2: Core.dumpScope による識別子解決スコープのダンプ（由来情報）を検証する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

describe('依頼1: bindcomplete のDOM反映保証', () => {
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

  it('bindcomplete 発火時点で data-if 表示と data-each 全行が反映済み', async () => {
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
      <div id="state">
        <div id="wrap" data-if="correspondences?.content?.length">
          <table><tbody data-each="correspondences?.content || []" data-each-key="id">
            <tr><td class="subj">{{subject}}</td></tr>
          </tbody></table>
        </div>
      </div>
      <button
        id="b"
        data-click-fetch="/api/c.json"
        data-click-bind="#state"
        data-click-bind-arg="correspondences"
      >読み込む</button>`;
    await Core.scan(container);
    await waitForDomSettled();

    const state = container.querySelector('#state') as HTMLElement;
    let rowsAtComplete = -1;
    let ifFalseAtComplete: boolean | null = null;
    const bindComplete = new Promise<void>(resolve => {
      state.addEventListener(
        'haori:bindcomplete',
        () => {
          rowsAtComplete = container.querySelectorAll('tbody tr').length;
          ifFalseAtComplete = (
            container.querySelector('#wrap') as HTMLElement
          ).hasAttribute('data-if-false');
          resolve();
        },
        {once: true},
      );
    });

    (container.querySelector('#b') as HTMLElement).click();
    await bindComplete;

    // bindcomplete 時点で data-if は表示済み・data-each 全3行が DOM に存在する。
    expect(ifFalseAtComplete).toBe(false);
    expect(rowsAtComplete).toBe(3);
  });
});

describe('依頼2: Core.dumpScope', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it('内側スコープが外側を上書きし、由来情報を返す', async () => {
    container.innerHTML = `
      <div id="outer" data-bind='{"id":"OUTER","shared":"o"}'>
        <div id="inner" data-bind='{"shared":"i"}'>
          <span id="probe"></span>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const probe = container.querySelector('#probe') as HTMLElement;
    const {resolved, sources} = Core.dumpScope(probe);

    // 解決済みスコープ: shared は内側(i)が優先、id は外側(OUTER)から継承。
    expect(resolved.shared).toBe('i');
    expect(resolved.id).toBe('OUTER');
    // 由来: shared は #inner、id は #outer。
    expect(sources.shared.source).toBe('#inner');
    expect(sources.shared.kind).toBe('bind');
    expect(sources.id.source).toBe('#outer');
  });

  it('フォーム入力値は同期前はスコープに現れず、外側の同名キーが解決される', async () => {
    // #state がトップレベル id を持ち、フォーム内 input name="id" は未同期。
    container.innerHTML = `
      <div id="state" data-bind='{"id":"CUSTOMER-1"}'>
        <form id="f">
          <input name="id" type="text">
          <span id="probe2"></span>
        </form>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const probe = container.querySelector('#probe2') as HTMLElement;
    const {resolved, sources} = Core.dumpScope(probe);

    // 初期表示時点では form の入力値はスコープに入らないため、id は外側 #state の値。
    expect(resolved.id).toBe('CUSTOMER-1');
    expect(sources.id.source).toBe('#state');
  });
});
