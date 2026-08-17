/* @vitest-environment jsdom */
/**
 * @fileoverview `<form>` でない要素の初期化が DOM の構造を変えないことの検証。
 *
 * 報告された症状の回帰ガードです。`data-{event}-reset-before` と `data-{event}-bind` を
 * 同じバインドホストへ向けると、そのホストへ `data-fetch-bind` で寄せた取得結果が
 * 失われました。初期化が対象の要素を一時的な `<form>` へ移していたため、要素が DOM から
 * 外れた時点でフラグメントと実行時のバインドデータが破棄され、同じ操作の後段の書き込みが
 * 空のバインドデータを土台にしていたことが原因です（URL が同じ `data-fetch` は再取得
 * されないため復帰しません）。
 *
 * 期待値の根拠は仕様「`data-{event}-reset`」です。
 * - 「`form.reset()` で DOM の値を既定値へ戻す」（`<form>` でない要素では配下の入力欄を
 *   同じ既定値へ戻す）
 * - 「**対象の要素を DOM から外しません。**…外すとフラグメントと実行時のバインドデータが
 *   破棄され、同じ操作の後段の書き込み…が空のバインドデータを土台にしてしまいます」
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('form でない要素の初期化', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('対象の要素を DOM から出し入れしない', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"dialog":{}}'>
        <input name="keyword" value="初期">
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const host = container.querySelector<HTMLElement>('#host')!;
    const mutations: string[] = [];
    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.removedNodes.forEach(node => {
          if (node === host) {
            mutations.push('removed');
          }
        });
        record.addedNodes.forEach(node => {
          if (node === host) {
            mutations.push('added');
          }
        });
      }
    });
    observer.observe(container, {childList: true, subtree: true});

    await Form.reset(getFrag(host));
    await waitForDomSettled();
    observer.takeRecords().forEach(record => {
      record.removedNodes.forEach(node => {
        if (node === host) {
          mutations.push('removed');
        }
      });
    });
    observer.disconnect();

    expect(mutations).toEqual([]);
    // 初期化そのものは従来どおり働く（要素は元の位置にある）。
    expect(container.querySelector('#host')).toBe(host);
    expect(getFrag(host).getRawBindingData()).toEqual({dialog: {}});
  });

  it('配下の入力欄がネイティブのリセットと同じ既定値へ戻る', async () => {
    container.innerHTML = `
      <div id="host">
        <input name="keyword" value="初期">
        <input name="empty">
        <input type="checkbox" name="agree" value="yes" checked>
        <input type="checkbox" name="extra" value="yes">
        <input type="radio" name="pick" value="a">
        <input type="radio" name="pick" value="b" checked>
        <textarea name="note">既定のメモ</textarea>
        <select name="planId">
          <option value="1">A</option>
          <option value="2" selected>B</option>
        </select>
        <select name="areaId">
          <option value="10">X</option>
          <option value="20">Y</option>
        </select>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const host = container.querySelector<HTMLElement>('#host')!;
    const query = <T extends HTMLElement>(selector: string): T =>
      host.querySelector<T>(selector)!;

    // 利用者の編集を模して、すべて既定から動かす。
    query<HTMLInputElement>('[name=keyword]').value = '編集後';
    query<HTMLInputElement>('[name=empty]').value = '入力';
    query<HTMLInputElement>('[name=agree]').checked = false;
    query<HTMLInputElement>('[name=extra]').checked = true;
    query<HTMLInputElement>('[name=pick][value=a]').checked = true;
    query<HTMLTextAreaElement>('[name=note]').value = '書き換え';
    query<HTMLSelectElement>('[name=planId]').value = '1';
    query<HTMLSelectElement>('[name=areaId]').value = '20';

    await Form.reset(getFrag(host));
    await waitForDomSettled();

    expect(query<HTMLInputElement>('[name=keyword]').value).toBe('初期');
    expect(query<HTMLInputElement>('[name=empty]').value).toBe('');
    expect(query<HTMLInputElement>('[name=agree]').checked).toBe(true);
    expect(query<HTMLInputElement>('[name=extra]').checked).toBe(false);
    expect(query<HTMLInputElement>('[name=pick][value=a]').checked).toBe(false);
    expect(query<HTMLInputElement>('[name=pick][value=b]').checked).toBe(true);
    expect(query<HTMLTextAreaElement>('[name=note]').value).toBe('既定のメモ');
    // 既定の選択がある select はその選択へ戻る。
    expect(query<HTMLSelectElement>('[name=planId]').value).toBe('2');
    // 既定の選択が無い単一選択は、ブラウザのリセットと同じく先頭を選ぶ。
    expect(query<HTMLSelectElement>('[name=areaId]').value).toBe('10');
  });

  it('配下の form も従来どおりリセットされる', async () => {
    container.innerHTML = `
      <div id="host">
        <form id="inner">
          <input name="keyword" value="初期">
        </form>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const host = container.querySelector<HTMLElement>('#host')!;
    const input = host.querySelector<HTMLInputElement>('[name=keyword]')!;
    input.value = '編集後';
    let resetEvents = 0;
    host
      .querySelector('#inner')!
      .addEventListener('reset', () => (resetEvents += 1));

    await Form.reset(getFrag(host));
    await waitForDomSettled();

    expect(input.value).toBe('初期');
    expect(resetEvents).toBe(1);
  });
});
