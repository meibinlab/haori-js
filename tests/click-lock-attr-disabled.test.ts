/* @vitest-environment jsdom */
/**
 * @fileoverview クリック手続きのロック解除と `data-attr-disabled` の関係を検証します。
 *
 * 二重実行を防ぐロックは起点要素へ `disabled` を付けますが、解除でそれを無条件に
 * 外すと、押下の手続きが書いた `data-attr-disabled` の評価結果まで消えます。押した
 * ボタンだけが「条件は真なのに活性」という誤った合図を出し、その間に押すと手続きが
 * もう一度走ります（課題 48）。
 *
 * 期待値の根拠は仕様「`data-{event}-fetch`」の「手続きが終わると、エンジンが付けた
 * `disabled` はその時点の宣言の評価結果へ揃えます」。非表示分岐との対称性は仕様
 * 「`data-if-false` 分岐とフォーム送信」の「利用者が指定した `disabled`（`data-attr-disabled`
 * の評価結果を含む）は表示後も維持されます」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

describe('クリックのロック解除と data-attr-disabled', () => {
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
    container.remove();
  });

  /**
   * クリックの手続きと、その反映が落ち着くまで待ちます。
   *
   * @param element クリックする要素
   * @returns 待ち合わせの Promise
   */
  const clickAndSettle = async (element: HTMLElement): Promise<void> => {
    element.click();
    await waitForDomSettled();
    await new Promise(resolve => setTimeout(resolve, 30));
    await waitForDomSettled();
  };

  /**
   * 指定した HTML を走査して待ち合わせます。
   *
   * @param html 走査する HTML
   * @returns 走査の完了 Promise
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  it('data-attr-disabled が真になる起点要素は、手続きの後も非活性のまま', async () => {
    await mount(`
      <div id="state" data-bind='{"editing": false}'>
        <button id="btnA" type="button"
          data-attr-disabled="{{editing && 'disabled'}}"
          data-click-data='{"editing": true}'
          data-click-bind="#state" data-click-bind-merge>A</button>
      </div>`);
    const button = container.querySelector('#btnA') as HTMLButtonElement;

    await clickAndSettle(button);

    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('押したボタンと、同じ式を書いた押していないボタンの状態が一致する', async () => {
    await mount(`
      <div id="state" data-bind='{"editing": false}'>
        <button id="btnA" type="button"
          data-attr-disabled="{{editing && 'disabled'}}"
          data-click-data='{"editing": true}'
          data-click-bind="#state" data-click-bind-merge>A</button>
        <button id="btnB" type="button"
          data-attr-disabled="{{editing && 'disabled'}}"
          data-click-data='{"editing": true}'
          data-click-bind="#state" data-click-bind-merge>B</button>
      </div>`);
    const pressed = container.querySelector('#btnA') as HTMLButtonElement;
    const other = container.querySelector('#btnB') as HTMLButtonElement;

    await clickAndSettle(pressed);

    expect(pressed.hasAttribute('disabled')).toBe(
      other.hasAttribute('disabled'),
    );
    expect(other.hasAttribute('disabled')).toBe(true);
  });

  it('data-attr-disabled が偽のままの起点要素は、手続きの後に活性へ戻る', async () => {
    await mount(`
      <div id="state" data-bind='{"editing": false, "count": 0}'>
        <button id="btnA" type="button"
          data-attr-disabled="{{editing && 'disabled'}}"
          data-click-data='{"count": 1}'
          data-click-bind="#state" data-click-bind-merge>A</button>
      </div>`);
    const button = container.querySelector('#btnA') as HTMLButtonElement;

    await clickAndSettle(button);

    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('宣言を持たない起点要素は、手続きの後に活性へ戻る', async () => {
    await mount(`
      <div id="state" data-bind='{"count": 0}'>
        <button id="btnA" type="button"
          data-click-data='{"count": 1}'
          data-click-bind="#state" data-click-bind-merge>A</button>
      </div>`);
    const button = container.querySelector('#btnA') as HTMLButtonElement;

    await clickAndSettle(button);

    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('disabled="{{式}}" の書き方でも評価結果へ揃い、宣言は失われない', async () => {
    await mount(`
      <div id="state" data-bind='{"editing": false}'>
        <button id="btnA" type="button"
          disabled="{{editing && 'disabled'}}"
          data-click-data='{"editing": true}'
          data-click-bind="#state" data-click-bind-merge>A</button>
      </div>`);
    const button = container.querySelector('#btnA') as HTMLButtonElement;
    const state = container.querySelector('#state') as HTMLElement;

    await clickAndSettle(button);
    expect(button.hasAttribute('disabled')).toBe(true);

    // 宣言（生値）が残っていれば、条件が偽へ戻ったときに活性へ戻る。
    await Core.setBindingData(state, {editing: false});
    await waitForDomSettled();
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('HTTP エラー応答で終わった手続きでも評価結果へ揃う', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response('{"message":"失敗"}', {
            status: 500,
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>,
    );
    await mount(`
      <div id="state" data-bind='{"editing": true}'>
        <button id="btnA" type="button"
          data-attr-disabled="{{editing && 'disabled'}}"
          data-click-fetch="/api/save"
          data-click-fetch-method="POST">A</button>
      </div>`);
    const button = container.querySelector('#btnA') as HTMLButtonElement;
    // 宣言が真なので走査の時点で非活性。ロックを取るために一度だけ外す。
    button.removeAttribute('disabled');
    await waitForDomSettled();

    await clickAndSettle(button);

    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('手続き中に起点要素が DOM から外れても解除が完了する', async () => {
    // 応答を保留したまま、起点要素を DOM から外すための差し替え。
    let settleResponse = (): void => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          settleResponse = () =>
            resolve(
              new Response('{}', {
                headers: {'Content-Type': 'application/json'},
              }),
            );
        }) as unknown as Promise<Response>,
    );
    await mount(`
      <div id="state" data-bind='{"editing": false}'>
        <button id="btnA" type="button"
          data-attr-disabled="{{editing && 'disabled'}}"
          data-click-fetch="/api/save"
          data-click-fetch-method="POST">A</button>
      </div>`);
    const button = container.querySelector('#btnA') as HTMLButtonElement;

    button.click();
    await waitForDomSettled();
    button.remove();
    await waitForDomSettled();
    settleResponse();
    await waitForDomSettled();
    await new Promise(resolve => setTimeout(resolve, 30));

    // 解除が例外で止まらなければ、ロックの印は残らない。
    expect(button.hasAttribute('data-haori-click-lock')).toBe(false);
  });

  it('宣言の再適用に失敗しても、解除を止めずに記録だけ残す', async () => {
    await mount(`
      <div id="state" data-bind='{"editing": false}'>
        <button id="btnA" type="button"
          data-attr-disabled="{{editing && 'disabled'}}"
          data-click-data='{"editing": true}'
          data-click-bind="#state" data-click-bind-merge>A</button>
      </div>`);
    const button = container.querySelector('#btnA') as HTMLButtonElement;
    const errors: string[] = [];
    vi.spyOn(Log, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    // バインドの反映が終わった時点（＝解除の直前）に、属性の適用を失敗させる。
    document.addEventListener(
      'haori:bindcomplete',
      () => {
        vi.spyOn(Core, 'setAttribute').mockRejectedValue(
          new Error('テスト用の失敗'),
        );
      },
      {once: true},
    );

    await clickAndSettle(button);

    expect(
      errors.some(message => message.includes('適用し直せませんでした')),
    ).toBe(true);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(false);
  });

  it('data-click-no-disabled を付けた要素では、宣言の評価結果だけが残る', async () => {
    await mount(`
      <div id="state" data-bind='{"editing": false}'>
        <button id="btnA" type="button"
          data-attr-disabled="{{editing && 'disabled'}}"
          data-click-no-disabled
          data-click-data='{"editing": true}'
          data-click-bind="#state" data-click-bind-merge>A</button>
      </div>`);
    const button = container.querySelector('#btnA') as HTMLButtonElement;

    await clickAndSettle(button);

    expect(button.hasAttribute('disabled')).toBe(true);
  });
});
