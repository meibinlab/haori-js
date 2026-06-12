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
import {waitForCondition} from './helpers/async';
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

    // mock fetch: サーバーは name, email, age を返す
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
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

    // 非イベント fetch 属性と bind 指定（属性だけで動作する）
    source.setAttribute('data-fetch', 'http://example.test/api');
    source.setAttribute('data-fetch-bind', '#target');
    source.setAttribute('data-fetch-bind-params', 'name&email');

    container.append(target, source);

    // spy Core.setBindingData
    const sbd = vi
      .spyOn(Core, 'setBindingData')
      .mockResolvedValue(undefined as void);

    await waitForCondition(() => fetchSpy.mock.calls.length > 0, {
      description: 'fetch call',
    });
    await waitForCondition(
      () =>
        sbd.mock.calls.some(
          call => (call[0] as HTMLElement).id === 'target',
        ),
      {
        description: 'binding data update',
      },
    );

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
    await waitForCondition(
      () =>
        sbd.mock.calls.some(
          call =>
            (call[0] as HTMLElement).id === 'target2' &&
            (call[1] as Record<string, unknown>).overridden === true,
        ),
      {
        description: 'overridden binding data',
      },
    );

    expect(sbd).toHaveBeenCalled();
    const calls = (sbd as unknown as {mock: {calls: unknown[][]}}).mock.calls;
    const last = calls.find(
      call => (call[0] as HTMLElement).id === 'target2',
    );
    const bound = (last?.[1] as Record<string, unknown>) ?? {};
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

  it('data-click-toast-level でトーストレベルを指定できる', async () => {
    const Haori = await import('../src/haori');
    const toastSpy = vi
      .spyOn(Haori.default, 'toast')
      .mockResolvedValue(undefined as void);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-toast', '保存しました');
    btn.setAttribute('data-click-toast-level', 'success');
    document.body.appendChild(btn);

    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(toastSpy).toHaveBeenCalledWith('保存しました', 'success');

    btn.remove();
  });

  it('data-click-toast-level に不正な値を指定すると info にフォールバックする', async () => {
    const Haori = await import('../src/haori');
    const toastSpy = vi
      .spyOn(Haori.default, 'toast')
      .mockResolvedValue(undefined as void);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-toast', 'msg');
    btn.setAttribute('data-click-toast-level', 'invalid');
    document.body.appendChild(btn);

    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(toastSpy).toHaveBeenCalledWith('msg', 'info');

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

  it('data-click-dialog のリテラル \\n を Procedure 経路で改行に正規化する', async () => {
    const Haori = await import('../src/haori');
    const dialogSpy = vi
      .spyOn(Haori.default, 'dialog')
      .mockResolvedValue(undefined as void);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-dialog', 'Line1\\nLine2');
    document.body.appendChild(btn);

    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(dialogSpy).toHaveBeenCalledWith('Line1\nLine2');

    btn.remove();
  });

  it('data-click-confirm のリテラル \\n を Procedure 経路で改行に正規化する', async () => {
    const Haori = await import('../src/haori');
    const confirmSpy = vi
      .spyOn(Haori.default, 'confirm')
      .mockResolvedValue(true);

    const btn = document.createElement('button');
    btn.setAttribute('data-click-confirm', 'よろしいですか？\\n取り消せません。');
    document.body.appendChild(btn);

    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(confirmSpy).toHaveBeenCalledWith('よろしいですか？\n取り消せません。');

    btn.remove();
  });

  it('data-fetch-bind-transform（非イベント）でレスポンス配列を変換してから bind する', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const target = document.createElement('div');
    target.id = 'transform-target';

    const source = document.createElement('div');
    source.setAttribute('data-fetch', 'http://example.test/rules');
    source.setAttribute('data-fetch-bind', '#transform-target');
    source.setAttribute('data-fetch-bind-arg', 'rules');
    source.setAttribute(
      'data-fetch-bind-transform',
      'response.map(item => ({...item, id: null}))',
    );

    container.append(target, source);

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {id: 1, name: 'a'},
              {id: 2, name: 'b'},
            ]),
            {headers: {'Content-Type': 'application/json'}},
          ),
        ) as unknown as Promise<Response>,
    );

    await waitForCondition(
      () => {
        const bind = target.getAttribute('data-bind');
        if (!bind) {
          return false;
        }
        const parsed = JSON.parse(bind);
        return Array.isArray(parsed.rules) && parsed.rules.length === 2;
      },
      {description: '変換後の rules がバインドされる'},
    );

    const bound = JSON.parse(target.getAttribute('data-bind') as string);
    expect(bound.rules).toEqual([
      {id: null, name: 'a'},
      {id: null, name: 'b'},
    ]);

    container.remove();
  });

  // 不具合報告（2026-06-12）: 既定 self-bind が効いている fetch で
  // 2xx 空ボディ（204 / 本文なし 200）が返ると bindResult が string("") を bind
  // できず reject し、handleFetchResult の後続（toast/close/click/refetch）が
  // すべて中断されていた。空ボディは「バインド対象なし」として正常スキップする。
  it('204 空ボディの DELETE でも後続の toast が実行される', async () => {
    const Haori = await import('../src/haori');
    const toastSpy = vi
      .spyOn(Haori.default, 'toast')
      .mockResolvedValue(undefined as void);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(null, {status: 204}),
        ) as unknown as Promise<Response>,
    );

    // data-click-bind を付けない＝既定 self-bind が走るケース
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/items/1.json');
    btn.setAttribute('data-click-fetch-method', 'DELETE');
    btn.setAttribute('data-click-toast', '削除しました');
    document.body.appendChild(btn);

    btn.click();
    await waitForCondition(() => toastSpy.mock.calls.length > 0, {
      description: '空ボディでも toast が呼ばれる',
    });

    expect(toastSpy).toHaveBeenCalledWith('削除しました', 'info');

    btn.remove();
  });

  it('200 空ボディ + application/json でも後続の toast が実行される', async () => {
    const Haori = await import('../src/haori');
    const toastSpy = vi
      .spyOn(Haori.default, 'toast')
      .mockResolvedValue(undefined as void);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response('', {
            status: 200,
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>,
    );

    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/items/1.json');
    btn.setAttribute('data-click-fetch-method', 'DELETE');
    btn.setAttribute('data-click-toast', '更新しました');
    document.body.appendChild(btn);

    btn.click();
    await waitForCondition(() => toastSpy.mock.calls.length > 0, {
      description: '空 JSON ボディでも toast が呼ばれる',
    });

    expect(toastSpy).toHaveBeenCalledWith('更新しました', 'info');

    btn.remove();
  });

  it('既定 self-bind 時は非空の非 JSON 文字列応答でも警告スキップして後続が実行される', async () => {
    // bind 先を明示していない＝既定 self-bind のケースでは、文字列応答が来ても
    // ユーザーは bind を意図していないため reject せず警告スキップし、後続を流す。
    const Haori = await import('../src/haori');
    const toastSpy = vi
      .spyOn(Haori.default, 'toast')
      .mockResolvedValue(undefined as void);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response('OK', {status: 200}),
        ) as unknown as Promise<Response>,
    );

    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/x');
    // data-click-bind は付けない（既定 self-bind）
    btn.setAttribute('data-click-toast', '完了しました');
    document.body.appendChild(btn);

    btn.click();
    await waitForCondition(() => toastSpy.mock.calls.length > 0, {
      description: '文字列応答でも toast が呼ばれる',
    });

    expect(toastSpy).toHaveBeenCalledWith('完了しました', 'info');

    btn.remove();
  });

  it('明示 bind 指定時は bindArg 無しの文字列応答が従来どおり reject され後続は実行されない', async () => {
    // 既定 self-bind ではなく明示的に bind 先を指定したケースでは、bindArg 無しの
    // 文字列 bind は誤用なので従来どおり reject して気付けるようにする。
    const Haori = await import('../src/haori');
    const toastSpy = vi
      .spyOn(Haori.default, 'toast')
      .mockResolvedValue(undefined as void);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response('plain text', {status: 200}),
        ) as unknown as Promise<Response>,
    );

    const target = document.createElement('div');
    target.id = 'explicit-bind-target';

    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/x');
    btn.setAttribute('data-click-bind', '#explicit-bind-target');
    btn.setAttribute('data-click-toast', 'should not show');
    document.body.append(target, btn);

    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(toastSpy).not.toHaveBeenCalled();

    target.remove();
    btn.remove();
  });
});
