/* @vitest-environment jsdom */
/**
 * @fileoverview
 * クリック系属性に関する統合テストです。
 * ドキュメントに記載されている `data-click-confirm` と
 * `data-click-validate` の動作を検証します。
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';

describe('Click attributes integration', () => {
  let container: HTMLElement;

  beforeEach(async () => {
    // テスト用のコンテナを用意し、Observer を初期化して自動処理を有効にする
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.restoreAllMocks();
    await import('../src/observer');
  });

  afterEach(() => {
    // 後片付け
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('data-click-confirm でキャンセルされたら実行されない', async () => {
    // 準備: data-click-confirm と data-click-fetch を持つボタン（DOM API で作成して行を短くする）
    const wrapper = document.createElement('div');
    const buttonEl = document.createElement('button');
    buttonEl.id = 'btn';
    buttonEl.textContent = '実行';
    const confirmMsg = '本当に実行しますか？';
    buttonEl.setAttribute('data-click-confirm', confirmMsg);
    buttonEl.setAttribute('data-click-fetch', '/api/do');
    wrapper.appendChild(buttonEl);
    container.appendChild(wrapper);

    // Haori.confirm をモックして false を返す
    const confirmSpy = vi.spyOn(Haori, 'confirm').mockResolvedValue(false);

    // global.fetch をスパイ（呼ばれないことを検証するため） — new Response を都度返す
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => {
        return Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ) as unknown as Promise<Response>;
      });

    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 50));

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();

    await new Promise(resolve => setTimeout(resolve, 100));

    // confirm が呼ばれ、fetch は呼ばれない
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('data-click-validate でバリデーション失敗時にフォーカスされる', async () => {
    // 準備: 必須フィールドを持つフォームと送信ボタン（DOM API で作成）
    const form = document.createElement('form');
    form.id = 'f';
    const input = document.createElement('input');
    input.id = 'inp';
    input.name = 'email';
    input.type = 'email';
    input.required = true;
    input.value = '';
    const submitBtn = document.createElement('button');
    submitBtn.id = 'submit';
    submitBtn.textContent = '送信';
    submitBtn.setAttribute('data-click-validate', '');
    const formSel = '#f';
    submitBtn.setAttribute('data-click-form', formSel);
    submitBtn.setAttribute('data-click-fetch', '/api/send');
    form.append(input, submitBtn);
    container.appendChild(form);

    // reportValidity を偽で返すようにして、focus の呼び出しを確認する
    const reportSpy = vi
      .spyOn(input as unknown as {reportValidity: () => boolean}, 'reportValidity')
      .mockReturnValue(false);
    const focusSpy = vi
      .spyOn(input as unknown as {focus: () => void}, 'focus')
      .mockImplementation(() => {});

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => {
        return Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ) as unknown as Promise<Response>;
      });

    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 50));

    const submit = container.querySelector('#submit') as HTMLButtonElement;
    submit.click();

    await new Promise(resolve => setTimeout(resolve, 100));

    // バリデーションが実行され、フォーカスが呼ばれ、fetch は呼ばれない
    expect(reportSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
