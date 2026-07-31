/* @vitest-environment jsdom */
/**
 * @fileoverview 外部ライブラリ連携（`data-enhance` / `data-enhance-new`）の検証。
 *
 * DOM を走査して機能を付加する外部ライブラリを、画面側の JavaScript なしで
 * 宣言から適用・再同期・破棄できることを確認します。
 * 1. 適用は要素ごと・名前ごとに一度だけ（冪等）
 * 2. `data-each` の行追加では追加された行にだけ適用する
 * 3. `data-each` の描画確定と `data-if` の再表示で再同期する
 * 4. DOM から外れたら破棄する
 * 5. 登録がスクリプトの読み込み順に依存しない
 * 6. `data-enhance-new` はドット区切りのグローバル参照だけを `new` する
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Enhance from '../src/enhance';
import EventDispatcher from '../src/event_dispatcher';
import Haori from '../src/haori';
import {waitForDomSettled} from './helpers/async';

/** 連携の呼び出し記録 */
interface Calls {
  init: HTMLElement[];
  refresh: HTMLElement[];
  destroy: HTMLElement[];
}

describe('外部ライブラリ連携', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let calls: Calls;
  let sequence: number;

  beforeEach(() => {
    vi.restoreAllMocks();
    sequence = 0;
    calls = {init: [], refresh: [], destroy: []};
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    Dev.disable();
    dispatcher.stop();
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  /** 記録用の連携を登録し、その名前を返します。 */
  const registerRecorder = (label: string): string => {
    sequence += 1;
    const name = `${label}-${sequence}`;
    Haori.enhancers.register(name, {
      init(element) {
        calls.init.push(element);
        return {id: name};
      },
      refresh(element) {
        calls.refresh.push(element);
      },
      destroy(element) {
        calls.destroy.push(element);
      },
    });
    return name;
  };

  describe('規則1: 適用は要素ごと・名前ごとに一度だけ', () => {
    it('初期スキャンで宣言した要素へ適用する', async () => {
      const name = registerRecorder('once');
      container.innerHTML = `<div id="target" data-enhance="${name}"></div>`;
      await Core.scan(container);
      await waitForDomSettled(6);

      expect(calls.init.length).toBe(1);
      expect(calls.init[0]).toBe(container.querySelector('#target'));
    });

    it('再スキャンしても二重に適用しない', async () => {
      const name = registerRecorder('idempotent');
      container.innerHTML = `<div data-enhance="${name}"></div>`;
      await Core.scan(container);
      await Core.scan(container);
      await waitForDomSettled(6);

      expect(calls.init.length).toBe(1);
    });

    it('空白区切りで複数の連携を適用する', async () => {
      const first = registerRecorder('multi-a');
      const second = registerRecorder('multi-b');
      container.innerHTML = `<div data-enhance="${first} ${second}"></div>`;
      await Core.scan(container);
      await waitForDomSettled(6);

      expect(calls.init.length).toBe(2);
    });
  });

  describe('規則2・3: 行の追加と再同期', () => {
    it('行を追加すると追加された行にだけ適用する', async () => {
      const name = registerRecorder('rows');
      container.innerHTML = `
        <div id="host" data-bind='{"rows":[{"v":1}]}'>
          <div data-each="rows" data-each-arg="r">
            <div class="cell" data-enhance="${name}">{{r.v}}</div>
          </div>
        </div>`;
      await Core.scan(container);
      await waitForDomSettled(8);
      expect(calls.init.length).toBe(1);

      await Core.setBindingData(container.querySelector('#host') as HTMLElement, {
        rows: [{v: 1}, {v: 2}],
      });
      await waitForDomSettled(10);

      expect(calls.init.length).toBe(2);
      expect(calls.init[1]).toBe(container.querySelectorAll('.cell')[1]);
    });

    it('data-each の描画確定で再同期する', async () => {
      const name = registerRecorder('refresh');
      container.innerHTML = `
        <div id="host" data-bind='{"items":[{"v":"a"}]}'>
          <select data-enhance="${name}" data-each="items" data-each-arg="it">
            <option value="{{it.v}}">{{it.v}}</option>
          </select>
        </div>`;
      await Core.scan(container);
      await waitForDomSettled(8);
      expect(calls.init.length).toBe(1);
      const refreshedBefore = calls.refresh.length;

      await Core.setBindingData(container.querySelector('#host') as HTMLElement, {
        items: [{v: 'a'}, {v: 'b'}],
      });
      await waitForDomSettled(10);

      expect(calls.refresh.length).toBeGreaterThan(refreshedBefore);
      expect(calls.refresh[calls.refresh.length - 1]).toBe(
        container.querySelector('select'),
      );
      // 再同期では init を繰り返さない。
      expect(calls.init.length).toBe(1);
    });

    it('data-if の再表示で再同期する', async () => {
      const name = registerRecorder('branch');
      container.innerHTML = `
        <div id="host" data-bind='{"show":true}'>
          <div data-if="show">
            <div class="inner" data-enhance="${name}"></div>
          </div>
        </div>`;
      await Core.scan(container);
      await waitForDomSettled(8);
      expect(calls.init.length).toBe(1);

      const host = container.querySelector('#host') as HTMLElement;
      await Core.setBindingData(host, {show: false});
      await waitForDomSettled(8);
      await Core.setBindingData(host, {show: true});
      await waitForDomSettled(8);

      expect(calls.refresh.length).toBeGreaterThan(0);
      expect(calls.init.length).toBe(1);
    });
  });

  describe('規則4: DOM から外れたら破棄する', () => {
    it('行を削除すると destroy が呼ばれる', async () => {
      const name = registerRecorder('destroy');
      container.innerHTML = `
        <div id="host" data-bind='{"rows":[{"v":1},{"v":2}]}'>
          <div data-each="rows" data-each-arg="r">
            <div class="cell" data-enhance="${name}">{{r.v}}</div>
          </div>
        </div>`;
      await Core.scan(container);
      await waitForDomSettled(8);
      expect(calls.init.length).toBe(2);

      await Core.setBindingData(container.querySelector('#host') as HTMLElement, {
        rows: [{v: 1}],
      });
      await waitForDomSettled(10);

      expect(calls.destroy.length).toBe(1);
    });
  });

  describe('規則5: 登録の順序に依存しない', () => {
    it('描画より後に登録しても遡って適用する', async () => {
      sequence += 1;
      const name = `late-${sequence}`;
      container.innerHTML = `<div data-enhance="${name}"></div>`;
      await Core.scan(container);
      await waitForDomSettled(6);
      expect(calls.init.length).toBe(0);

      Haori.enhancers.register(name, {
        init(element) {
          calls.init.push(element);
          return null;
        },
      });

      expect(calls.init.length).toBe(1);
      expect(Enhance.has(name)).toBe(true);
    });

    it('未登録の名前は開発モードで一度だけ警告する', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      Dev.enable();
      container.innerHTML = `
        <div data-enhance="unregistered-name"></div>
        <div data-enhance="unregistered-name"></div>`;
      await Core.scan(container);
      await waitForDomSettled(6);

      const messages = warn.mock.calls
        .map(args => args.map(arg => String(arg)).join(' '))
        .filter(message => message.includes('unregistered-name'));
      expect(messages.length).toBe(1);
    });
  });

  describe('規則6: data-enhance-new', () => {
    it('ドット区切りのグローバル参照を対象要素で new する', async () => {
      const created: HTMLElement[] = [];
      (globalThis as unknown as Record<string, unknown>).DemoLib = {
        Widget: class {
          constructor(element: HTMLElement) {
            created.push(element);
          }
        },
      };

      container.innerHTML = '<div id="w" data-enhance-new="DemoLib.Widget"></div>';
      await Core.scan(container);
      await Core.scan(container);
      await waitForDomSettled(6);

      expect(created.length).toBe(1);
      expect(created[0]).toBe(container.querySelector('#w'));
      delete (globalThis as unknown as Record<string, unknown>).DemoLib;
    });

    it('式やコードは受け付けない', async () => {
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      container.innerHTML = '<div data-enhance-new="alert(\'x\')"></div>';
      await Core.scan(container);
      await waitForDomSettled(6);

      const messages = error.mock.calls
        .map(args => args.map(arg => String(arg)).join(' '))
        .filter(message => message.includes('dot-separated global reference'));
      expect(messages.length).toBe(1);
    });

    it('解決できない参照は開発モードで警告し、描画は止めない', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      Dev.enable();
      container.innerHTML = `
        <div data-enhance-new="MissingLib.Widget">{{'描画は続く'}}</div>`;
      await Core.scan(container);
      await waitForDomSettled(6);

      const messages = warn.mock.calls
        .map(args => args.map(arg => String(arg)).join(' '))
        .filter(message => message.includes('MissingLib.Widget'));
      expect(messages.length).toBe(1);
      expect(container.textContent).toContain('描画は続く');
    });
  });

  describe('異常系', () => {
    it('init が例外を投げても描画は続く', async () => {
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      sequence += 1;
      const name = `throwing-${sequence}`;
      Haori.enhancers.register(name, {
        init() {
          throw new Error('init failed');
        },
      });

      container.innerHTML = `<div data-enhance="${name}">{{'描画は続く'}}</div>`;
      await Core.scan(container);
      await waitForDomSettled(6);

      expect(container.textContent).toContain('描画は続く');
      expect(error).toHaveBeenCalled();
    });

    it('data-external 配下でも宣言した要素へ適用する', async () => {
      const name = registerRecorder('external');
      container.innerHTML = `
        <div data-external>
          <select data-enhance="${name}"></select>
        </div>`;
      await Core.scan(container);
      await waitForDomSettled(6);

      expect(calls.init.length).toBe(1);
      expect(calls.init[0]).toBe(container.querySelector('select'));
    });
  });
});
