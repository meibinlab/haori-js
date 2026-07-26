/* @vitest-environment jsdom */
/**
 * @fileoverview 初期化中に発火したイベントの保留・再生と、
 * `data-each-rendered-change` による宣言的な change 発火の検証。
 *
 * 改修要望「data-each-rendered-run 内から発火した change イベントで手続きが
 * 実行されない」に対応する以下を検証します。
 * - `EventDispatcher.startDeferred()` 中のイベントは手続きが保留され、
 *   `release()` で発火順に実行されること
 * - `Observer.init()` が初期スキャン前に保留購読を開始し、
 *   `data-haori-ready` 付与後に解除すること
 * - `data-each-rendered-change` が描画確定後に change を発火すること
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {Observer} from '../src/observer';
import {waitForCondition, waitForDomSettled} from './helpers/async';

type ObserverPrivate = {_initialized: boolean};

describe('初期化中イベントの保留と data-each-rendered-change', () => {
  let container: HTMLElement;

  beforeAll(() => {
    // observer モジュールは import 時に自動初期化され、document へ
    // EventDispatcher のリスナーを登録する。本ファイルでは購読タイミング自体を
    // 検証するため、自動初期化分の購読を停止して条件を揃える。
    Observer.getDispatcher()?.stop();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  /**
   * HTML を組み立ててから container を body へ追加します。
   * 空の container を先に追加すると、フラグメントが子なしで登録され
   * 以降の `Core.scan` が新しい子を走査できないため、構築後に追加します。
   *
   * @param html container に設定する HTML
   */
  function mount(html: string): void {
    container.innerHTML = html;
    document.body.appendChild(container);
  }

  describe('EventDispatcher の保留モード', () => {
    let dispatcher: EventDispatcher;

    afterEach(() => {
      dispatcher?.stop();
    });

    it('保留中に発火した change の手続きは release で実行される', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__hit: (v: string) => void};
      win.__hit = (v: string) => {
        hits.push(v);
      };

      dispatcher = new EventDispatcher(document);
      dispatcher.startDeferred();

      mount(`
        <select id="sel" name="month" data-change-run="window.__hit(this.value)">
          <option value="A">A</option>
          <option value="B">B</option>
        </select>`);
      await Core.scan(container);
      await waitForDomSettled();

      const select = container.querySelector('#sel') as HTMLSelectElement;
      select.value = 'B';
      select.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();

      // 保留中は手続きが実行されない。
      expect(hits).toEqual([]);

      dispatcher.release();
      await waitForDomSettled();

      // release 後に、保留していた分が実行される。
      expect(hits).toEqual(['B']);
    });

    it('release 後のイベントは即座に処理される', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__hit2: (v: string) => void};
      win.__hit2 = (v: string) => {
        hits.push(v);
      };

      dispatcher = new EventDispatcher(document);
      dispatcher.startDeferred();
      dispatcher.release();

      mount(`
        <select id="sel2" name="m" data-change-run="window.__hit2(this.value)">
          <option value="A">A</option>
          <option value="B">B</option>
        </select>`);
      await Core.scan(container);
      await waitForDomSettled();

      const select = container.querySelector('#sel2') as HTMLSelectElement;
      select.value = 'B';
      select.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();

      expect(hits).toEqual(['B']);
    });

    it('保留中に DOM から外れた要素のイベントは再生しない', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__hit3: (v: string) => void};
      win.__hit3 = (v: string) => {
        hits.push(v);
      };

      dispatcher = new EventDispatcher(document);
      dispatcher.startDeferred();

      mount(`
        <select id="sel3" name="m" data-change-run="window.__hit3(this.value)">
          <option value="A">A</option>
        </select>`);
      await Core.scan(container);
      await waitForDomSettled();

      const select = container.querySelector('#sel3') as HTMLSelectElement;
      select.dispatchEvent(new Event('change', {bubbles: true}));
      select.remove();

      dispatcher.release();
      await waitForDomSettled();

      expect(hits).toEqual([]);
    });

    it('同期経路では対象要素が DOM から外れても手続きを実行する（回帰）', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__hitSync: (v: string) => void};
      win.__hitSync = (v: string) => {
        hits.push(v);
      };

      dispatcher = new EventDispatcher(document);
      dispatcher.start();

      mount(`
        <div>
          <button id="b" data-click-run="window.__hitSync('b')">実行</button>
        </div>`);
      await Core.scan(container);
      await waitForDomSettled();

      // 他ライブラリのハンドラが同一クリック中に対象要素を DOM から外す構成を模す。
      const button = container.querySelector('#b') as HTMLElement;
      document.addEventListener('click', () => button.remove(), true);
      button.click();
      await waitForDomSettled();

      // 保留再生時のみ isConnected を判定するため、同期経路では実行される。
      expect(hits).toEqual(['b']);
    });

    it('保留中でも data-{event}-prevent は同期で効く', async () => {
      dispatcher = new EventDispatcher(document);
      dispatcher.startDeferred();

      mount(`
        <form id="f">
          <button id="submit" type="submit" data-click-prevent>送信</button>
        </form>`);
      await Core.scan(container);
      await waitForDomSettled();

      const button = container.querySelector('#submit') as HTMLElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      button.dispatchEvent(event);

      // preventDefault は保留せずイベント発生時に同期で行う。
      expect(event.defaultPrevented).toBe(true);
    });

    it('保留中に発火したカスタムイベントも release で実行される', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__hitOn: (v: string) => void};
      win.__hitOn = (v: string) => {
        hits.push(v);
      };

      mount(`
        <div id="target" data-on="app:refresh"
          data-on-run="window.__hitOn('refresh')"></div>`);
      await Core.scan(container);
      await waitForDomSettled();

      dispatcher = new EventDispatcher(document);
      dispatcher.startDeferred();

      window.dispatchEvent(new CustomEvent('app:refresh'));
      await waitForDomSettled();
      expect(hits).toEqual([]);

      dispatcher.release();
      await waitForDomSettled();

      expect(hits).toEqual(['refresh']);
    });

    it('保留中の複数イベントは発火順に処理される', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__hit4: (v: string) => void};
      win.__hit4 = (v: string) => {
        hits.push(v);
      };

      dispatcher = new EventDispatcher(document);
      dispatcher.startDeferred();

      mount(`
        <div>
          <button id="b1" data-click-run="window.__hit4('b1')">1</button>
          <button id="b2" data-click-run="window.__hit4('b2')">2</button>
        </div>`);
      await Core.scan(container);
      await waitForDomSettled();

      (container.querySelector('#b2') as HTMLElement).click();
      (container.querySelector('#b1') as HTMLElement).click();
      expect(hits).toEqual([]);

      dispatcher.release();
      await waitForDomSettled();

      expect(hits).toEqual(['b2', 'b1']);
    });
  });

  describe('data-each-rendered-change', () => {
    let dispatcher: EventDispatcher;

    beforeEach(() => {
      dispatcher = new EventDispatcher(document);
      dispatcher.start();
    });

    afterEach(() => {
      dispatcher.stop();
    });

    it('描画確定後に change を発火し、既定では初回のみ実行される', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__changed: (v: string) => void};
      win.__changed = (v: string) => {
        hits.push(v);
      };

      mount(`
        <div id="state" data-bind='{"months":["2026-06","2026-05"]}'>
          <select
            id="sel"
            name="month"
            data-each="months"
            data-each-arg="m"
            data-each-rendered-change
            data-change-run="window.__changed(this.value)"
          >
            <option data-attr-value="{{m}}">{{m}}</option>
          </select>
        </div>`);
      await Core.scan(container);
      await waitForCondition(() => hits.length >= 1, {
        description: '初回 rendered-change',
        maxAttempts: 40,
        delayMs: 10,
      });

      // ブラウザが先頭 option を自動選択するため、既定選択が確定される。
      expect(hits).toEqual(['2026-06']);

      // 再描画では発火しない（既定は once）。
      const state = container.querySelector('#state') as HTMLElement;
      await Core.setBindingData(state, {months: ['2026-04', '2026-03']});
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(hits).toEqual(['2026-06']);
    });

    it('always 指定では描画確定ごとに発火する', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__changed2: (v: string) => void};
      win.__changed2 = (v: string) => {
        hits.push(v);
      };

      mount(`
        <div id="state2" data-bind='{"months":["2026-06"]}'>
          <select
            id="sel2"
            name="month"
            data-each="months"
            data-each-arg="m"
            data-each-rendered-change="always"
            data-change-run="window.__changed2(this.value)"
          >
            <option data-attr-value="{{m}}">{{m}}</option>
          </select>
        </div>`);
      await Core.scan(container);
      await waitForCondition(() => hits.length >= 1, {
        description: '初回 rendered-change',
        maxAttempts: 40,
        delayMs: 10,
      });

      const state = container.querySelector('#state2') as HTMLElement;
      await Core.setBindingData(state, {months: ['2026-04']});
      await waitForCondition(() => hits.length >= 2, {
        description: '再描画後 rendered-change',
        maxAttempts: 40,
        delayMs: 10,
      });

      expect(hits).toEqual(['2026-06', '2026-04']);
    });

    it('描画行が 0 件のときは発火せず、行が入った描画で発火する', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__changed3: (v: string) => void};
      win.__changed3 = (v: string) => {
        hits.push(v);
      };

      mount(`
        <div id="state3" data-bind='{"months":[]}'>
          <select
            id="sel3"
            name="month"
            data-each="months"
            data-each-arg="m"
            data-each-rendered-change
            data-change-run="window.__changed3(this.value)"
          >
            <option data-attr-value="{{m}}">{{m}}</option>
          </select>
        </div>`);
      await Core.scan(container);
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      // 空配列では既定選択として確定すべき値が無いため発火しない。
      expect(hits).toEqual([]);

      // 行が入った最初の描画で発火する（0 件描画で once を消費しない）。
      const state = container.querySelector('#state3') as HTMLElement;
      await Core.setBindingData(state, {months: ['2026-06']});
      await waitForCondition(() => hits.length >= 1, {
        description: '行追加後 rendered-change',
        maxAttempts: 40,
        delayMs: 10,
      });

      expect(hits).toEqual(['2026-06']);
    });

    it('属性が無い data-each では change を発火しない（回帰）', async () => {
      const hits: string[] = [];
      const win = window as unknown as {__changed4: (v: string) => void};
      win.__changed4 = (v: string) => {
        hits.push(v);
      };

      mount(`
        <div data-bind='{"months":["2026-06"]}'>
          <select
            name="month"
            data-each="months"
            data-each-arg="m"
            data-change-run="window.__changed4(this.value)"
          >
            <option data-attr-value="{{m}}">{{m}}</option>
          </select>
        </div>`);
      await Core.scan(container);
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(hits).toEqual([]);
    });
  });

  // Observer.init は document.body へ MutationObserver を設置し、以降のテストの
  // フラグメント登録タイミングに影響するため、このファイルの最後に検証する。
  describe('Observer.init の購読順序', () => {
    it('初期スキャン前に保留購読を開始し、ready 付与後に解除する', async () => {
      const order: string[] = [];
      vi.spyOn(EventDispatcher.prototype, 'startDeferred').mockImplementation(
        () => {
          order.push(
            `startDeferred:ready=${document.body.hasAttribute(
              'data-haori-ready',
            )}`,
          );
        },
      );
      vi.spyOn(EventDispatcher.prototype, 'release').mockImplementation(() => {
        order.push(
          `release:ready=${document.body.hasAttribute('data-haori-ready')}`,
        );
      });

      (Observer as unknown as ObserverPrivate)._initialized = false;
      document.body.removeAttribute('data-haori-ready');
      await Observer.init();
      await waitForDomSettled();

      expect(order).toEqual([
        'startDeferred:ready=false',
        'release:ready=true',
      ]);
    });
  });
});
