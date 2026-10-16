/* @vitest-environment jsdom */
/**
 * @fileoverview `data-{event}-scroll-error` のスクロール先の探索。
 *
 * 期待値は仕様「エラーハンドリング」の「スクロール先は、表示先（上のクリア対象と
 * 同じ要素）自身、その親要素、その子孫、その直後の兄弟の順に探した、
 * `data-message-level="error"` を持つ最初の要素です」「表示を差し替えるライブラリ
 * は、エラーを表示した要素にこの属性を付けることでスクロール先になります」から
 * 取っている。
 *
 * 修正前は直後の兄弟を探さなかったため、ボタンの直後に枠を置く表示の実装
 * （haori-bootstrap）では、スクロール先が見つからなかった。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('data-click-scroll-error のスクロール先', () => {
  let container: HTMLElement;
  let scrolled: Element[];

  beforeEach(async () => {
    vi.restoreAllMocks();
    await import('../src/observer');
    container = document.createElement('div');
    document.body.appendChild(container);
    scrolled = [];
    // jsdom は scrollIntoView を実装していないため、呼ばれた要素を記録する。
    Element.prototype.scrollIntoView = function record(this: Element) {
      scrolled.push(this);
    };
    // ボタンなど中へ入れられない要素では、表示を直後に置く実装（haori-bootstrap
    // と同じ置き方）。
    (window as Window & {Haori?: unknown}).Haori = {
      addErrorMessage: (target: HTMLElement, message: string) => {
        const box = document.createElement('div');
        box.className = 'alert';
        box.setAttribute('data-message-level', 'error');
        box.textContent = message;
        target.insertAdjacentElement('afterend', box);
        return Promise.resolve();
      },
      clearMessages: () => Promise.resolve(),
      closeDialog: Haori.closeDialog.bind(Haori),
      confirm: Haori.confirm.bind(Haori),
      dialog: Haori.dialog.bind(Haori),
      openDialog: Haori.openDialog.bind(Haori),
      toast: Haori.toast.bind(Haori),
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response('お申込みは受け付けられません', {
            status: 409,
            statusText: 'Conflict',
            headers: {'Content-Type': 'text/plain'},
          }),
        ) as unknown as Promise<Response>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & {Haori?: unknown}).Haori;
    delete (Element.prototype as unknown as Record<string, unknown>)
      .scrollIntoView;
    container.remove();
  });

  /**
   * フォームの外のボタンを走査して押し、表示を待ちます。
   *
   * @param attributes ボタンに付ける属性
   * @returns 表示された枠
   */
  async function pressOutsideForm(attributes: string): Promise<HTMLElement> {
    container.innerHTML =
      '<main><h1>見出し</h1>' +
      '<button id="apply" type="button" data-click-fetch="/api/x.json" ' +
      `data-click-fetch-method="POST" ${attributes}>申し込む</button></main>`;
    await Core.scan(container);
    await waitForIdle();
    const button = container.querySelector('#apply') as HTMLElement;
    button.click();
    await waitForCondition(
      () => button.nextElementSibling?.classList.contains('alert') === true,
    );
    await waitForIdle();
    return button.nextElementSibling as HTMLElement;
  }

  it('表示先の直後に置かれたエラーの枠へスクロールする（回帰）', async () => {
    const box = await pressOutsideForm('data-click-scroll-error');

    expect(scrolled).toEqual([box]);
  });

  it('宣言が無ければスクロールしない', async () => {
    await pressOutsideForm('');

    expect(scrolled).toEqual([]);
  });
});
