/* @vitest-environment jsdom */
/**
 * @fileoverview 外部ライブラリが対象要素を再配置したときの `data-enhance` の挙動。
 *
 * Choices.js のように元の要素を生成コンテナの内側へ移すライブラリでは、移動が
 * MutationObserver に「削除」として観測されると `destroy` が走ります。`data-external`
 * を併用すればその観測ごと除外されるため、インスタンスが保持されます。
 *
 * ライブ監視（`Observer.init()`）を使うため、明示 `Core.scan()` と競合しないよう
 * 独立したファイルに置いています。
 *
 * 期待値の根拠は仕様「`data-enhance`」と仕様「`data-external`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Haori from '../src/haori';
import {Observer} from '../src/observer';
import {waitForDomSettled} from './helpers/async';

type ObserverPrivate = {_initialized: boolean};

/** ライブ監視の初期化状態を戻します。 */
function resetObserver(): void {
  (Observer as unknown as ObserverPrivate)._initialized = false;
  document.body.removeAttribute('data-haori-ready');
}

describe('data-enhance と要素の再配置', () => {
  let container: HTMLElement;
  let events: string[];

  beforeEach(() => {
    vi.restoreAllMocks();
    resetObserver();
    events = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    Haori.enhancers.register('move-probe', {
      init(element) {
        events.push(`init:${element.className}`);
        return {name: element.className};
      },
      destroy(element) {
        events.push(`destroy:${element.className}`);
      },
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    resetObserver();
    vi.restoreAllMocks();
  });

  /** 外部ライブラリ相当の再配置（元の要素を生成コンテナへ移す）を行います。 */
  const reparent = async (selector: string): Promise<void> => {
    const target = container.querySelector<HTMLElement>(selector)!;
    const wrapper = document.createElement('div');
    wrapper.className = 'generated';
    target.parentElement!.insertBefore(wrapper, target);
    wrapper.appendChild(target);
    await waitForDomSettled(12);
  };

  it('data-external を併用すれば再配置でもインスタンスを保持する', async () => {
    await Observer.init();
    await waitForDomSettled(4);

    const host = document.createElement('div');
    host.innerHTML = `
      <div data-external>
        <select class="guarded" data-enhance="move-probe"></select>
      </div>`;
    container.appendChild(host);
    await waitForDomSettled(12);
    expect(events).toEqual(['init:guarded']);

    await reparent('.guarded');

    // 監視除外なので移動は観測されず、破棄も再適用も起きない。
    expect(events).toEqual(['init:guarded']);
  });

  it('data-external が無い再配置では破棄され、再適用される', async () => {
    await Observer.init();
    await waitForDomSettled(4);

    const host = document.createElement('div');
    host.innerHTML = `
      <div>
        <select class="plain" data-enhance="move-probe"></select>
      </div>`;
    container.appendChild(host);
    await waitForDomSettled(12);
    expect(events).toEqual(['init:plain']);

    await reparent('.plain');

    // 移動が削除として観測されるため destroy が走り、追加として再適用される。
    // 生成 DOM を持つライブラリでは `data-external` の併用が必要になる理由。
    expect(events).toEqual(['init:plain', 'destroy:plain', 'init:plain']);
  });
});
