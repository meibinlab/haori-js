/* @vitest-environment jsdom */
/**
 * @fileoverview 祖先へのフェッチの応答の反映と、`data-form-arg` フォームの通信中の編集。
 *
 * 背景: 祖先へ `-bind-merge`（または別のキーへ `-bind-arg`）で応答を反映すると、
 * 応答が `data-form-arg` のキーを含まなくても、通信中の編集がそのキーへ重ねられて
 * 値が変わり、フォームへの流し込みが起きていた。そのため、通信より前に確定した
 * 未保存の入力（フォームのコピーにだけある値）が祖先の値で入れ直されていた。
 *
 * 期待値の根拠は仕様「祖先が所有するレコードの反映（`data-form-arg`）」と
 * 「ユーザー編集と宣言バインドの権威」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import PollObserver from '../src/poll';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/** 祖先が持つ、開いたときのレコード */
const SAVED = {id: 7, title: '保存済みのタイトル', summary: '保存済みの要約'};

describe('祖先へのフェッチの応答と data-form-arg フォームの通信中の編集', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    PollObserver.disconnectAll();
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * 応答を止めておけるフェッチの差し替えを用意します。
   *
   * @param body 返す応答本文
   * @returns 止めた応答を返す関数
   */
  const holdFetch = (body: unknown): (() => void) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await gate;
      return new Response(JSON.stringify(body), {
        headers: {'Content-Type': 'application/json'},
      });
    });
    return () => release();
  };

  /**
   * 編集フォームと、押すボタンを含む HTML をマウントします。
   *
   * @param button ボタン（または祖先に付ける属性を持つ要素）の HTML
   * @param stateAttributes 祖先に足す属性
   * @returns 祖先・タイトル・要約の要素
   */
  const mount = async (button: string, stateAttributes = '') => {
    container.innerHTML = `
      <div id="state" ${stateAttributes} data-bind='${JSON.stringify({
        detail: SAVED,
        files: [],
        filesResponse: null,
      })}'>
        <form id="edit-form" data-form-arg="detail">
          <input id="title" name="title">
          <input id="summary" name="summary">
        </form>
        ${button}
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    return {
      state: container.querySelector('#state') as HTMLElement,
      title: container.querySelector('#title') as HTMLInputElement,
      summary: container.querySelector('#summary') as HTMLInputElement,
    };
  };

  /**
   * 入力欄の編集を確定します（打鍵してからフォーカスを外す）。
   *
   * @param input 対象の入力欄
   * @param value 入力する値
   * @returns 反映の完了を待つ Promise
   */
  const commit = async (input: HTMLInputElement, value: string) => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    input.blur();
    await waitForDomSettled();
  };

  /**
   * 入力欄へ打鍵だけを行います（`change` は起きない）。
   *
   * @param input 対象の入力欄
   * @param value 入力する値
   * @returns 反映の完了を待つ Promise
   */
  const type = async (input: HTMLInputElement, value: string) => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await waitForDomSettled();
  };

  /**
   * ボタンを押し、通信中に `type` で要約へ入力してから応答を返します。
   *
   * @param release 止めた応答を返す関数
   * @param summary 要約の入力欄
   * @param applied 応答の反映を判定する関数
   * @returns 反映の完了を待つ Promise
   */
  const clickAndTypeDuringFetch = async (
    release: () => void,
    summary: HTMLInputElement,
    applied: () => boolean,
  ) => {
    const button = container.querySelector('#reload') as HTMLElement;
    button.dispatchEvent(new Event('click', {bubbles: true}));
    await waitForDomSettled();
    await type(summary, '通信中の要約');
    release();
    await waitForCondition(applied, {description: '応答の反映'});
    await waitForDomSettled();
  };

  const files = {files: [{id: 1, name: 'a.pdf'}]};

  it('bind-merge の応答がキーを含まなければ、通信より前の未保存の入力が残る', async () => {
    // 仕様「祖先が所有するレコードの反映（`data-form-arg`）」の「`-bind-merge` や
    // `-bind-arg` で別のキーだけを反映する応答では、そのキーへ編集を重ねず、入力欄への
    // 流し込みも起きません。」
    const release = holdFetch(files);
    const {state, title, summary} = await mount(
      `<button id="reload" type="button" data-click-fetch="/api/files.json"
        data-click-bind="#state" data-click-bind-merge
        data-click-bind-transform="({files: response.files})"
        data-click-bind-params="files"></button>`,
    );
    await commit(title, '未保存のタイトル');

    await clickAndTypeDuringFetch(
      release,
      summary,
      () => (Core.getBindingData(state)?.files as unknown[]).length === 1,
    );

    expect(title.value).toBe('未保存のタイトル');
    expect(summary.value).toBe('通信中の要約');
    expect(Core.getBindingData(state)?.detail).toEqual(SAVED);
  });

  it('bind-arg で別のキーへ反映するとき、通信より前の未保存の入力が残る', async () => {
    // 仕様「祖先が所有するレコードの反映（`data-form-arg`）」の「`-bind-arg` を指定した
    // 場合は指定したキーだけです。」と「`-bind-merge` や `-bind-arg` で別のキーだけを
    // 反映する応答では、そのキーへ編集を重ねず、入力欄への流し込みも起きません。」
    const release = holdFetch(files);
    const {state, title, summary} = await mount(
      `<button id="reload" type="button" data-click-fetch="/api/files.json"
        data-click-bind="#state" data-click-bind-arg="filesResponse"></button>`,
    );
    await commit(title, '未保存のタイトル');

    await clickAndTypeDuringFetch(
      release,
      summary,
      () => Core.getBindingData(state)?.filesResponse !== null,
    );

    expect(title.value).toBe('未保存のタイトル');
    expect(summary.value).toBe('通信中の要約');
    expect(Core.getBindingData(state)?.detail).toEqual(SAVED);
  });

  it('続けて取り直しても、通信より前の未保存の入力が残る', async () => {
    // 仕様「祖先が所有するレコードの反映（`data-form-arg`）」の「`-bind-merge` や
    // `-bind-arg` で別のキーだけを反映する応答では、そのキーへ編集を重ねず、入力欄への
    // 流し込みも起きません。」
    const release = holdFetch(files);
    const {state, title, summary} = await mount(
      `<button id="reload" type="button" data-click-fetch="/api/files.json"
        data-click-bind="#state" data-click-bind-merge
        data-click-bind-transform="({files: response.files})"
        data-click-bind-params="files"></button>`,
    );
    await commit(title, '未保存のタイトル');
    await clickAndTypeDuringFetch(
      release,
      summary,
      () => (Core.getBindingData(state)?.files as unknown[]).length === 1,
    );
    summary.blur();

    vi.restoreAllMocks();
    holdFetch({files: []})();
    (container.querySelector('#reload') as HTMLElement).dispatchEvent(
      new Event('click', {bubbles: true}),
    );
    await waitForCondition(
      () => (Core.getBindingData(state)?.files as unknown[]).length === 0,
      {description: '2 回目の応答の反映'},
    );
    await waitForDomSettled();

    expect(title.value).toBe('未保存のタイトル');
    expect(summary.value).toBe('通信中の要約');
  });

  it('bind-arg でそのキーを取り直すと、送信前の編集は応答へ譲り、通信中の編集は残る', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「リクエストを組み立てた時点までの編集。
    // それより後の編集は保持されます（応答は編集より古い情報のため）」。
    const release = holdFetch({
      id: 7,
      title: 'サーバのタイトル',
      summary: 'サーバの要約',
    });
    const {state, title, summary} = await mount(
      `<button id="reload" type="button" data-click-fetch="/api/detail.json"
        data-click-bind="#state" data-click-bind-arg="detail"></button>`,
    );
    await commit(title, '未保存のタイトル');

    await clickAndTypeDuringFetch(
      release,
      summary,
      () =>
        (Core.getBindingData(state)?.detail as {title?: string}).title ===
        'サーバのタイトル',
    );

    expect(title.value).toBe('サーバのタイトル');
    expect(summary.value).toBe('通信中の要約');
    expect(Core.getBindingData(state)?.detail).toEqual({
      id: 7,
      title: 'サーバのタイトル',
      summary: '通信中の要約',
    });
  });

  it('ポーリングの応答がキーを含まなければ、祖先のレコードに触らない', async () => {
    // 仕様「祖先が所有するレコードの反映（`data-form-arg`）」の「`-bind-merge` や
    // `-bind-arg` で別のキーだけを反映する応答では、そのキーへ編集を重ねず、入力欄への
    // 流し込みも起きません。」
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify(files), {
          headers: {'Content-Type': 'application/json'},
        }),
      );
    });
    const {state, title} = await mount(
      '',
      `data-poll-fetch="/api/files.json" data-poll-bind="#state"
        data-poll-bind-merge data-poll-bind-transform="({files: response.files})"
        data-poll-bind-params="files" data-poll-interval="100"`,
    );
    PollObserver.syncTree(container);
    await commit(title, '未保存のタイトル');
    const before = calls;

    await waitForCondition(() => calls >= before + 2, {
      description: '編集の後のポーリング',
      maxAttempts: 20,
      delayMs: 40,
    });
    await waitForDomSettled();

    expect(title.value).toBe('未保存のタイトル');
    expect(Core.getBindingData(state)?.detail).toEqual(SAVED);
  });

  it('ポーリングの応答がキーを含めば、これまでの編集を応答の上へ重ね直す', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「`data-poll` の応答反映。利用者が要求して
    // いない自動取得なので、これまでの編集をすべて応答の上へ載せ直します」。
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      calls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            detail: {id: 7, title: 'サーバのタイトル', summary: 'サーバの要約'},
          }),
          {headers: {'Content-Type': 'application/json'}},
        ),
      );
    });
    const {title, summary} = await mount(
      '',
      `data-poll-fetch="/api/detail.json" data-poll-bind="#state"
        data-poll-bind-merge data-poll-interval="100"`,
    );
    PollObserver.syncTree(container);
    await waitForCondition(() => summary.value === 'サーバの要約', {
      description: '初回ポーリングの反映',
      maxAttempts: 20,
      delayMs: 40,
    });
    await commit(title, '未保存のタイトル');
    const before = calls;

    await waitForCondition(() => calls >= before + 2, {
      description: '編集の後のポーリング',
      maxAttempts: 20,
      delayMs: 40,
    });
    await waitForDomSettled();

    expect(title.value).toBe('未保存のタイトル');
    expect(summary.value).toBe('サーバの要約');
  });
});
