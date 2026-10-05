/* @vitest-environment jsdom */
/**
 * @fileoverview `data-{event}-click` と `-error-click` の対象を押す順序。
 *
 * 背景: 対象を `querySelectorAll()` 1 回で解決していたため、カンマ区切りで
 * `#b, #a` と書いても文書順（`#a` → `#b`）に押していた（要望 BP）。
 * `-await` の「前段が失敗したら後段を止める」も文書順で効くため、先に置きたく
 * ない手続きの失敗で後続が止まっていた。
 *
 * 期待値の根拠は仕様「`data-{event}-click`」の「カンマ区切りの各セレクタを
 * 書いた順に押します」と、仕様「失敗時のアクション」の「`-error-click`:
 * 対象を宣言した順にクリックします」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import {waitForIdle} from './helpers/async';

describe('data-{event}-click の対象を押す順序', () => {
  let container: HTMLElement | null = null;
  /** 押された要素の id（押された順） */
  let clicked: string[] = [];
  /** 押された要素を記録するリスナー */
  const record = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('t')) {
      clicked.push(target.id);
    }
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    clicked = [];
    await import('../src/observer');
    document.addEventListener('click', record, true);
  });

  afterEach(() => {
    document.removeEventListener('click', record, true);
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * HTML をマウントして走査し、起点のボタンを押して落ち着くまで待ちます。
   *
   * @param html マウントする HTML 文字列（起点のボタンは `#go`）
   * @returns 完了の Promise
   */
  const mountAndClick = async (html: string): Promise<void> => {
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
    await waitForIdle();
    (container.querySelector('#go') as HTMLElement).click();
    await waitForIdle();
  };

  /** 文書順が a → b → c の対象 */
  const targets = `
    <span class="t all" id="a"></span>
    <span class="t all" id="b"></span>
    <span class="t all" id="c"></span>`;

  it('カンマ区切りの各セレクタを、書いた順に押す', async () => {
    await mountAndClick(
      `${targets}<button id="go" data-click-click="#c, #a, #b"></button>`,
    );
    expect(clicked).toEqual(['c', 'a', 'b']);
  });

  it('1 つのセレクタに一致した複数の要素は、その中で文書順に押す', async () => {
    await mountAndClick(
      `${targets}<button id="go" data-click-click="#c, .all:not(#c)"></button>`,
    );
    expect(clicked).toEqual(['c', 'a', 'b']);
  });

  it('複数のセレクタに一致した要素は、最初に一致した位置で 1 回だけ押す', async () => {
    await mountAndClick(
      `${targets}<button id="go" data-click-click="#b, .all"></button>`,
    );
    expect(clicked).toEqual(['b', 'a', 'c']);
  });

  it('括弧の中のカンマでは区切らない', async () => {
    await mountAndClick(
      `${targets}<button id="go" data-click-click=":is(#c, #b), #a"></button>`,
    );
    // `:is(#c, #b)` は 1 つのセレクタなので、その中は文書順（b → c）。
    expect(clicked).toEqual(['b', 'c', 'a']);
  });

  it('属性値の引用符の中のカンマでは区切らない', async () => {
    await mountAndClick(
      `<span class="t" id="a"></span>
       <span class="t" id="b" title="x], y"></span>
       <button id="go" data-click-click="[title='x], y'], #a"></button>`,
    );
    expect(clicked).toEqual(['b', 'a']);
  });

  it('エスケープしたカンマでは区切らない', async () => {
    await mountAndClick(
      `<span class="t" id="a"></span>
       <span class="t" id="x,y"></span>
       <button id="go" data-click-click="#x\\,y, #a"></button>`,
    );
    expect(clicked).toEqual(['x,y', 'a']);
  });

  it('不正なセレクタを含む場合は、どの対象も押さない', async () => {
    await mountAndClick(
      `${targets}<button id="go" data-click-click="#b, #a]"></button>`,
    );
    expect(clicked).toEqual([]);
  });

  it('-await と併用すると、書いた順の結果が残る（要望 BP の再現）', async () => {
    container = document.createElement('div');
    container.innerHTML = `
      <button class="t" id="a" data-click-data='{"x": 1}' data-click-bind="#s"></button>
      <button class="t" id="b" data-click-data='{"x": 2}' data-click-bind="#s"></button>
      <div id="s" data-bind='{"x": 0}'>{{x}}</div>
      <button id="go" data-click-click="#b, #a" data-click-click-await></button>`;
    document.body.appendChild(container);
    await Core.scan(container);
    await waitForIdle();
    (container.querySelector('#go') as HTMLElement).click();
    await waitForIdle();

    expect(clicked).toEqual(['b', 'a']);
    expect(container.querySelector('#s')!.textContent).toBe('1');
  });

  it('順序を定めていない属性（data-{event}-refetch）は、文書順のまま', async () => {
    const requested: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown) => {
      requested.push(new URL(String(input), 'http://localhost').pathname);
      return new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      });
    });
    await mountAndClick(
      `<div id="r1" data-fetch="/api/r1.json"></div>
       <div id="r2" data-fetch="/api/r2.json"></div>
       <button id="go" data-click-refetch="#r2, #r1"></button>`,
    );
    expect(requested).toEqual([
      '/api/r1.json',
      '/api/r2.json',
      '/api/r1.json',
      '/api/r2.json',
    ]);
  });

  it('-error-click も、書いた順に押す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 500,
        headers: {'Content-Type': 'application/json'},
      }),
    );
    await mountAndClick(
      `${targets}<button id="go" data-click-fetch="/api/x.json"
         data-click-error-click="#c, #a"></button>`,
    );
    expect(clicked).toEqual(['c', 'a']);
  });

  it('ステータスごとの組の -error-{ステータス}-click も、書いた順に押す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 404,
        headers: {'Content-Type': 'application/json'},
      }),
    );
    await mountAndClick(
      `${targets}<button id="go" data-click-fetch="/api/x.json"
         data-click-error-404-click="#b, #a"></button>`,
    );
    expect(clicked).toEqual(['b', 'a']);
  });
});
