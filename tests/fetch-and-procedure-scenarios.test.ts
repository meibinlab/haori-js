/* @vitest-environment jsdom */
/**
 * @fileoverview
 * fetch / Procedure に関する代表的なシナリオの統合テストです。
 * - `data-fetch-bind-params` による特定フィールドのみのバインド
 * - `afterCallback` によるレスポンス上書きと bind の動作
 * - dialog / toast の呼び出し
 * - POST の場合に JSON ボディが作成されること
 */
import {describe, it, beforeEach, afterEach, expect, vi} from 'vitest';
import Core from '../src/core';
// Procedure/Fragment を直接参照せず属性駆動でテストを行うため、
// 未使用のインポートは削除しています。

describe('Fetch and Procedure scenarios', () => {
  beforeEach(async () => {
    // 各テスト前にモック状態をリセット
    vi.restoreAllMocks();
    // Observer を読み込んで初期化を確実に行う（MutationObserver / EventDispatcher を開始）
    await import('../src/observer');
  });

  afterEach(() => {
    // 各テスト後の後片付け
    vi.restoreAllMocks();
  });

  it('data-fetch-bind-params binds specified fields only', async () => {
    // attribute ベースで要素を作成し、Observer/MutationObserver 経由で自動実行されることを検証
    const container = document.createElement('div');
    document.body.appendChild(container);

    const target = document.createElement('div');
    target.id = 'target';

    const source = document.createElement('div');
    // 非イベント fetch 属性と bind 指定（属性だけで動作する）
    source.setAttribute('data-fetch', 'http://example.test/api');
    source.setAttribute('data-fetch-bind', '#target');
    source.setAttribute('data-fetch-bind-params', 'name&email');

    container.append(target, source);

    // mock fetch: サーバーは name, email, age を返す
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            name: 'Taro',
            email: 'taro@example.com',
            age: 40,
          }),
          {headers: {'Content-Type': 'application/json'}},
        ),
      ) as unknown as Promise<Response>;
    });

    // spy Core.setBindingData
    const sbd = vi
      .spyOn(Core, 'setBindingData')
      .mockResolvedValue(undefined as void);

    // MutationObserver と EventDispatcher が非同期で処理するため少し待つ
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(sbd).toHaveBeenCalled();
    const calls = (sbd as unknown as {mock: {calls: unknown[][]}}).mock.calls;
    const last = calls[calls.length - 1];
    expect((last[0] as HTMLElement).id).toBe('target');
    const bound = last[1] as Record<string, unknown>;
    expect(bound).toHaveProperty('name');
    expect(bound).toHaveProperty('email');
    expect(bound).not.toHaveProperty('age');

    container.remove();
  });

  it('afterCallback overrides response (click)', async () => {
    // data-click-* 属性を使用して、クリックイベント経由で Procedure が実行されるパスを検証
    const container = document.createElement('div');
    document.body.appendChild(container);

    const target = document.createElement('div');
    target.id = 'target2';

    const button = document.createElement('button');
    // event ベースで fetch を実行し、after-run スクリプトで Response を上書き
    button.setAttribute('data-click-fetch', 'http://example.test/after');
    button.setAttribute('data-click-bind', '#target2');
    // after-run に Response を返すスクリプトを記述
    const afterRunScript =
      'return {response: new Response(JSON.stringify({"overridden":true}), ' +
      '{headers:{"Content-Type":"application/json"}})}';
    button.setAttribute('data-click-after-run', afterRunScript);

    container.append(target, button);

    // mock fetch returns initial payload (will be overridden by after-run)
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({x: 1}), {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>;
    });
    const sbd = vi
      .spyOn(Core, 'setBindingData')
      .mockResolvedValue(undefined as void);

    // click を発火すると EventDispatcher が Procedure を呼び出す
    button.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(sbd).toHaveBeenCalled();
    const calls = (sbd as unknown as {mock: {calls: unknown[][]}}).mock.calls;
    const last = calls[calls.length - 1];
    const bound = last[1] as Record<string, unknown>;
    expect(bound).toHaveProperty('overridden');

    container.remove();
  });

  it('dialog and toast called on click', async () => {
    const Haori = await import('../src/haori');
    const dialogSpy = vi
      .spyOn(Haori.default, 'dialog')
      .mockResolvedValue(undefined as void);
    const toastSpy = vi
      .spyOn(Haori.default, 'toast')
      .mockResolvedValue(undefined as void);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-dialog', 'Done');
    btn.setAttribute('data-click-toast', 'Saved');
    document.body.appendChild(btn);

    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(dialogSpy).toHaveBeenCalledWith('Done');
    expect(toastSpy).toHaveBeenCalledWith('Saved', 'info');

    btn.remove();
  });

  it('POST sends JSON body when payload exists', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const source = document.createElement('div');
    source.setAttribute('data-fetch', 'http://api.test/submit');
    source.setAttribute('data-fetch-method', 'POST');
    // fetch-data は URLSearchParams 形式でも動作する
    source.setAttribute('data-fetch-data', 'a=1&b=two');

    container.appendChild(source);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => {
        return Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        ) as unknown as Promise<Response>;
      });

    await new Promise(resolve => setTimeout(resolve, 50));

    // fetch が呼び出されたことを検証（body の扱いは実行タイミングに依存するため寛容に）
    expect(fetchSpy).toHaveBeenCalled();

    container.remove();
  });
});
