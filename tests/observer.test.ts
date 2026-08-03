/* @vitest-environment jsdom */
/**
 * @fileoverview Observer の data-haori-ready 属性付与のテスト
 */
import {describe, it, beforeEach, afterEach, expect, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment, IF_DISABLED_MARKER} from '../src/fragment';
import Log from '../src/log';
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

describe('Observer - 初期スキャンの失敗', () => {
  beforeEach(() => {
    resetObserver();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    resetObserver();
  });

  it('head と body のスキャンが失敗しても初期化は完了する', async () => {
    // 初期化のどこで失敗しても保留モードを解除して起動を終える（解除し損ねると
    // 以降すべてのイベントで手続きが実行されなくなる）。
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    vi.spyOn(Core, 'scan').mockRejectedValue(new Error('scan failed'));

    await Observer.init();

    expect(document.body.hasAttribute('data-haori-ready')).toBe(true);
    const messages = error.mock.calls.map(call => String(call[1]));
    expect(messages).toContain('Failed to build head fragment:');
    expect(messages).toContain('Failed to build body fragment:');
    expect(Observer.getDispatcher()).not.toBeNull();
  });
});

describe('Observer - 監視対象から除外する変更', () => {
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

  /**
   * 要素のフラグメントを取得します。
   *
   * @param selector 対象要素のセレクタ
   * @returns 対象要素のフラグメント
   */
  const fragmentOf = (selector: string): ElementFragment => {
    const element = document.querySelector(selector) as HTMLElement;
    const fragment = Fragment.get(element);
    if (!(fragment instanceof ElementFragment)) {
      throw new Error(`fragment not found: ${selector}`);
    }
    return fragment;
  };

  it('data-external 配下の変更は取り込まない', async () => {
    // 外部の select 拡張ライブラリ等が生成・更新する DOM は対象外とする。
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"name":"あかね"}');
    host.innerHTML = '<div data-external><span id="ext">-</span></div>';
    document.body.appendChild(host);
    await waitForDomSettled();

    const ext = document.getElementById('ext') as HTMLElement;
    ext.textContent = '{{name}}';
    await waitForDomSettled();

    expect(ext.textContent).toBe('{{name}}');
  });

  it('クリック抑止中の disabled は内部の属性へ焼き付かない', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"n":1}');
    host.innerHTML =
      '<button id="lock" data-haori-click-lock type="button">{{n}}</button>';
    document.body.appendChild(host);
    await waitForDomSettled();

    const button = document.getElementById('lock') as HTMLElement;
    button.setAttribute('disabled', '');
    await waitForDomSettled();
    expect(fragmentOf('#lock').hasAttribute('disabled')).toBe(false);

    // 印そのものの付け外しも同じく取り込まない。
    button.setAttribute('data-haori-click-lock', 'x');
    await waitForDomSettled();
    expect(fragmentOf('#lock').getAttribute('data-haori-click-lock')).toBe('');
  });

  it('非表示分岐で付けた disabled は内部の属性へ焼き付かない', async () => {
    // 焼き付くと、表示へ戻した後の再評価で disabled が付け直される。
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"n":1}');
    host.innerHTML = `<button id="marked" ${IF_DISABLED_MARKER} type="button">{{n}}</button>`;
    document.body.appendChild(host);
    await waitForDomSettled();

    const button = document.getElementById('marked') as HTMLElement;
    button.setAttribute('disabled', '');
    await waitForDomSettled();
    expect(fragmentOf('#marked').hasAttribute('disabled')).toBe(false);

    // 印そのものの付け外しも同じく取り込まない。
    button.setAttribute(IF_DISABLED_MARKER, 'x');
    await waitForDomSettled();
    expect(fragmentOf('#marked').getAttribute(IF_DISABLED_MARKER)).toBe('');
  });

  it('data-attr-* が書き込んだ実属性は内部の属性へ焼き付かない', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"label":"あかね"}');
    host.innerHTML = '<span id="aliased" data-attr-title="{{label}}">x</span>';
    document.body.appendChild(host);
    await waitForDomSettled();

    const span = document.getElementById('aliased') as HTMLElement;
    expect(span.getAttribute('title')).toBe('あかね');
    expect(fragmentOf('#aliased').hasAttribute('title')).toBe(false);

    // 外部から実属性を書き換えても、値の出どころは data-attr-* のまま。
    span.setAttribute('title', '外部');
    await waitForDomSettled();
    expect(fragmentOf('#aliased').hasAttribute('title')).toBe(false);

    await Core.setBindingData(host, {label: 'ひなた'});
    await waitForDomSettled();
    expect(span.getAttribute('title')).toBe('ひなた');
  });

  it('変更の取り込みで例外が起きても監視は継続する', async () => {
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    const original = Core.setAttribute.bind(Core);
    // 監視経路（fromObserver=true）だけを失敗させる。内部の属性処理まで
    // 落とすと、この検証と無関係な非同期チェーンが道連れになるため。
    const setAttribute = vi
      .spyOn(Core, 'setAttribute')
      .mockImplementation((element, name, value, fromObserver) => {
        if (fromObserver) {
          throw new Error('setAttribute failed');
        }
        return original(element, name, value, fromObserver);
      });

    const host = document.createElement('div');
    document.body.appendChild(host);
    host.setAttribute('data-bind', '{"n":1}');
    await waitForDomSettled();

    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0][1])).toBe('Error processing mutation:');

    // 例外を止めれば以降の変更は通常どおり取り込まれる。
    setAttribute.mockRestore();
    host.setAttribute('data-bind', '{"n":2}');
    host.innerHTML = '<span id="after">{{n}}</span>';
    await waitForDomSettled();
    expect(document.getElementById('after')!.textContent).toBe('2');
  });
});

describe('Observer - 想定外の MutationRecord', () => {
  /** 捕捉した MutationObserver のコールバック */
  let captured: MutationCallback | null = null;

  beforeEach(async () => {
    resetObserver();
    document.body.innerHTML = '';
    await Observer.init();

    // MutationObserver では作れない種別の記録を渡すため、コールバックを捕まえる。
    captured = null;
    const RealObserver = globalThis.MutationObserver;
    class CapturingObserver extends RealObserver {
      constructor(callback: MutationCallback) {
        super(callback);
        captured = callback;
      }
    }
    globalThis.MutationObserver =
      CapturingObserver as unknown as typeof MutationObserver;
    try {
      Observer.observe(document.body);
    } finally {
      globalThis.MutationObserver = RealObserver;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    resetObserver();
  });

  /**
   * 捕捉したコールバックへ記録を 1 件渡します。
   *
   * @param record 渡す MutationRecord 相当の値
   * @returns 処理完了の Promise
   */
  const dispatch = async (record: Record<string, unknown>): Promise<void> => {
    const callback = captured;
    if (!callback) {
      throw new Error('MutationObserver のコールバックを捕捉できていません。');
    }
    await (callback(
      [record as unknown as MutationRecord],
      null as unknown as MutationObserver,
    ) as unknown as Promise<void>);
  };

  it('characterData の対象がテキストでない場合は警告する', async () => {
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    const target = document.createElement('div');
    document.body.appendChild(target);

    await dispatch({type: 'characterData', target});

    expect(warn).toHaveBeenCalledWith(
      '[Haori]',
      'Unsupported character data type:',
      target,
    );
  });

  it('親を持たない追加ノードは読み飛ばす', async () => {
    // 追加と削除が同じ処理内で解決され、通知の時点では親から外れている場合。
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

    await dispatch({
      type: 'childList',
      target: document.body,
      addedNodes: [document.createElement('div')],
      removedNodes: [],
    });

    expect(error).not.toHaveBeenCalled();
  });

  it('未知の種別は警告して読み飛ばす', async () => {
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    const target = document.createElement('div');
    document.body.appendChild(target);

    await dispatch({type: 'unknown', target});

    expect(warn).toHaveBeenCalledWith(
      '[Haori]',
      'Unknown mutation type:',
      'unknown',
    );
  });
});

describe('Observer - 読み込み時の起動', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    resetObserver();
  });

  it('解析中に読み込まれた場合は DOMContentLoaded を待つ', async () => {
    // <head> 内の <script> で読み込まれた場合。この時点で走らせても <body> が
    // まだ無く、初期スキャンが空振りする。
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'readyState',
    );
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    });
    const addEventListener = vi.spyOn(document, 'addEventListener');
    vi.resetModules();

    const module = await import('../src/observer');

    try {
      const registered = addEventListener.mock.calls.filter(
        call => call[0] === 'DOMContentLoaded',
      );
      expect(registered.length).toBeGreaterThan(0);
      expect(registered.some(call => call[1] === module.Observer.init)).toBe(
        true,
      );
      // 待つだけで初期化は走らせない。
      expect(document.body.hasAttribute('data-haori-ready')).toBe(false);
    } finally {
      if (descriptor) {
        Object.defineProperty(Document.prototype, 'readyState', descriptor);
      }
      Reflect.deleteProperty(document, 'readyState');
    }
  });
});
