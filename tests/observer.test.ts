/* @vitest-environment jsdom */
/**
 * @fileoverview Observer の data-haori-ready 属性付与のテスト
 */
import {describe, it, beforeEach, afterEach, expect, vi} from 'vitest';
import {Observer} from '../src/observer';
import {waitForDomSettled} from './helpers/async';

type ObserverPrivate = {_initialized: boolean};

function resetObserver() {
  (Observer as unknown as ObserverPrivate)._initialized = false;
  document.body.removeAttribute('data-haori-ready');
}

describe('Observer - data-haori-ready', () => {
  beforeEach(() => {
    resetObserver();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetObserver();
  });

  it('初期化完了後に document.body に data-haori-ready 属性が付与される', async () => {
    expect(document.body.hasAttribute('data-haori-ready')).toBe(false);
    await Observer.init();
    expect(document.body.hasAttribute('data-haori-ready')).toBe(true);
  });

  it('data-haori-ready の属性値は空文字列である', async () => {
    await Observer.init();
    expect(document.body.getAttribute('data-haori-ready')).toBe('');
  });

  it('init() を二重に呼び出しても初回のみ属性が付与される', async () => {
    await Observer.init();
    expect(document.body.hasAttribute('data-haori-ready')).toBe(true);

    document.body.removeAttribute('data-haori-ready');
    await Observer.init(); // _initialized が true のため何もしない
    expect(document.body.hasAttribute('data-haori-ready')).toBe(false);
  });

  it('data-fetch を持つ要素のフェッチ完了後に data-haori-ready が付与される', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({name: 'テスト'}), {
        headers: {'Content-Type': 'application/json'},
      }),
    );

    const el = document.createElement('div');
    el.setAttribute('data-fetch', 'http://example.test/api');
    document.body.appendChild(el);

    await Observer.init();
    await waitForDomSettled();

    expect(document.body.hasAttribute('data-haori-ready')).toBe(true);

    el.remove();
  });

  it('Observer 起動後に data-import で取り込んだ HTML 内の Haori 属性が初期化される', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          '<div data-bind=\'{"greeting":"こんにちは"}\'>{{greeting}}</div>',
        ),
    } as Response);

    await Observer.init();

    const container = document.createElement('div');
    container.setAttribute('data-import', 'http://example.test/partial.html');
    document.body.appendChild(container);

    await waitForDomSettled();

    const imported = container.querySelector('[data-bind]') as HTMLElement;
    expect(imported).not.toBeNull();
    expect(imported.textContent?.trim()).toBe('こんにちは');

    container.remove();
  });
});

describe('Observer - DOM 変更の取り込み', () => {
  beforeEach(async () => {
    resetObserver();
    document.body.innerHTML = '';
    await Observer.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    resetObserver();
  });

  it('後から追加した要素の Haori 属性が評価される', async () => {
    // 外部のスクリプトやテンプレートエンジンが差し込んだ DOM も対象になる。
    const added = document.createElement('div');
    added.setAttribute('data-bind', '{"name":"あかね"}');
    added.innerHTML = '<span id="added">{{name}}</span>';
    document.body.appendChild(added);

    await waitForDomSettled();

    expect(document.getElementById('added')?.textContent).toBe('あかね');
  });

  it('後から付けた Haori 属性が評価に反映される', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"hide":true}');
    host.innerHTML = '<span id="shown">見える</span>';
    document.body.appendChild(host);
    await waitForDomSettled();
    const shown = document.getElementById('shown') as HTMLElement;
    expect(shown.style.display).not.toBe('none');

    // 外部のスクリプトが属性を足した場合（属性の MutationObserver 経路）。
    shown.setAttribute('data-if', 'hide === false');
    await waitForDomSettled();

    expect(shown.style.display).toBe('none');
  });

  it('取り除いた要素は内部状態からも解放される', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"name":"あかね"}');
    host.innerHTML = '<span id="removed">{{name}}</span>';
    document.body.appendChild(host);
    await waitForDomSettled();

    const removed = document.getElementById('removed') as HTMLElement;
    removed.remove();
    await waitForDomSettled();

    // 解放後に祖先を更新しても、外した要素は更新されない（参照が残っていない）。
    host.setAttribute('data-bind', '{"name":"きい"}');
    await waitForDomSettled();
    expect(removed.textContent).toBe('あかね');
  });

  it('テキストノードの書き換えがテンプレートとして取り込まれる', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"name":"あかね"}');
    host.innerHTML = '<span id="text">-</span>';
    document.body.appendChild(host);
    await waitForDomSettled();

    const span = document.getElementById('text') as HTMLElement;
    (span.firstChild as Text).data = '{{name}}';
    await waitForDomSettled();

    expect(span.textContent).toBe('あかね');
  });
});
