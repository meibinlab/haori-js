/* @vitest-environment jsdom */
/**
 * @fileoverview カスタムイベントの発火元による絞り込み（`data-on-target`）。
 *
 * 背景: Bootstrap の `hidden.bs.modal` は閉じたモーダルから発火してバブリング
 * する。`data-on="hidden.bs.modal"` はどのモーダルが閉じても走るため、特定の
 * モーダルが閉じたときだけ状態を戻す宣言が書けなかった（要望 BW）。
 *
 * 期待値の根拠は仕様「カスタムイベント `data-on`」の「`data-on-target`」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled, waitForIdle} from './helpers/async';

describe('data-on-target', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let ran: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    ran = [];
    (window as unknown as Record<string, unknown>).__onTarget = (v: string) =>
      ran.push(v);
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
  });

  /**
   * HTML をマウントして走査し、購読を始めます。
   *
   * @param html マウントする HTML 文字列
   * @returns 待ち合わせの Promise
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    dispatcher.start();
    await waitForDomSettled();
  };

  /**
   * 指定した要素から、バブリングするカスタムイベントを発火し、落ち着くまで待ちます。
   *
   * @param selector 発火元のセレクタ
   * @returns 待ち合わせの Promise
   */
  const fireFrom = async (selector: string): Promise<void> => {
    container
      .querySelector(selector)!
      .dispatchEvent(new CustomEvent('hidden.bs.modal', {bubbles: true}));
    await waitForIdle();
  };

  /** 2 つのモーダルと、#sub が閉じたときだけ走る宣言 */
  const modals = `
    <div data-on="hidden.bs.modal" data-on-target="#sub"
      data-on-run="window.__onTarget('sub')"></div>
    <div class="modal" id="sub"><button id="sub-inner">×</button></div>
    <div class="modal" id="other"></div>`;

  it('指定した要素から発火したイベントでだけ手続きが走る', async () => {
    // 仕様「カスタムイベント `data-on`」の「指定した要素（とその子孫）から
    // 発火したイベントでだけ手続きを実行します」。
    await mount(modals);

    await fireFrom('#other');
    expect(ran).toEqual([]);

    await fireFrom('#sub');
    expect(ran).toEqual(['sub']);
  });

  it('指定した要素の子孫から発火したイベントでも走る', async () => {
    // 仕様「カスタムイベント `data-on`」の「指定した要素（とその子孫）」。
    await mount(modals);

    await fireFrom('#sub-inner');

    expect(ran).toEqual(['sub']);
  });

  it('window や document へ発火したイベントでは走らない', async () => {
    // 仕様「カスタムイベント `data-on`」の「`window` / `document` へ dispatch
    // されたイベントでは実行しません」。
    await mount(modals);

    window.dispatchEvent(new CustomEvent('hidden.bs.modal'));
    document.dispatchEvent(new CustomEvent('hidden.bs.modal'));
    await waitForIdle();

    expect(ran).toEqual([]);
  });

  it('セレクタにテンプレート式を書ける', async () => {
    // 仕様「セレクタを値に取る属性の解決」の対象に `data-on-target` を含む。
    await mount(`
      <div data-bind='{"which": "other"}'>
        <div data-on="hidden.bs.modal" data-on-target="#{{which}}"
          data-on-run="window.__onTarget('other')"></div>
      </div>
      <div class="modal" id="sub"></div>
      <div class="modal" id="other"></div>`);

    await fireFrom('#sub');
    expect(ran).toEqual([]);

    await fireFrom('#other');
    expect(ran).toEqual(['other']);
  });

  it('宣言しなければ、今までどおりどの発火元でも走る', async () => {
    // 仕様「カスタムイベント `data-on`」。発火元では絞り込まない。
    await mount(`
      <div data-on="hidden.bs.modal" data-on-run="window.__onTarget('any')"></div>
      <div class="modal" id="sub"></div>
      <div class="modal" id="other"></div>`);

    await fireFrom('#sub');
    await fireFrom('#other');

    expect(ran).toEqual(['any', 'any']);
  });
});
