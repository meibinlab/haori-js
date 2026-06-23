/* @vitest-environment jsdom */
/**
 * @fileoverview select 拡張ライブラリ連携機能の統合テスト。
 *
 * 改修要望「select 拡張ライブラリ（Choices.js 等）との連携容易化」に対応する
 * 以下を検証します。
 * - `<select multiple>` の選択値を配列としてフォーム値に収集・反映できること
 * - `data-external` 配下の DOM 変更が Haori の自動監視から除外されること
 * - `data-each-rendered-run` が描画確定ごとに一度実行されること
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import {waitForCondition, waitForDomSettled} from './helpers/async';

type ObserverPrivate = {_initialized: boolean};

function resetObserver(): void {
  (Observer as unknown as ObserverPrivate)._initialized = false;
  document.body.removeAttribute('data-haori-ready');
}

describe('select 拡張ライブラリ連携', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  describe('#3 <select multiple> の配列値', () => {
    it('選択済み option の値を配列としてフォーム値に収集する', async () => {
      container.innerHTML = `
        <form>
          <select name="plans" multiple>
            <option value="A" selected>A</option>
            <option value="B">B</option>
            <option value="C" selected>C</option>
          </select>
        </form>`;

      await Core.scan(container);
      await waitForDomSettled();

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.plans).toEqual(['A', 'C']);
    });

    it('単一選択 select は従来どおりスカラー値として収集する（回帰）', async () => {
      container.innerHTML = `
        <form>
          <select name="plan">
            <option value="A">A</option>
            <option value="B" selected>B</option>
          </select>
        </form>`;

      await Core.scan(container);
      await waitForDomSettled();

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.plan).toBe('B');
    });

    it('change イベントでの選択変更が配列として内部値へ同期される', async () => {
      container.innerHTML = `
        <form>
          <select name="plans" multiple>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </form>`;

      await Core.scan(container);
      await waitForDomSettled();

      const select = container.querySelector('select')!;
      (select.options[0] as HTMLOptionElement).selected = true;
      (select.options[2] as HTMLOptionElement).selected = true;
      select.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.plans).toEqual(['A', 'C']);
    });

    it('バインドデータの配列値が各 option の選択状態へ反映される', async () => {
      container.innerHTML = `
        <form id="f">
          <select name="plans" multiple>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </form>`;

      await Core.scan(container);
      await waitForDomSettled();

      // フォームへのバインドデータ反映（fetch 応答・プログラム更新相当）で
      // 複数選択 select の選択状態が配列から復元されること。
      const form = container.querySelector('#f') as HTMLElement;
      await Core.setBindingData(form, {plans: ['A', 'C']});
      await waitForDomSettled();

      const select = container.querySelector('select')!;
      expect((select.options[0] as HTMLOptionElement).selected).toBe(true);
      expect((select.options[1] as HTMLOptionElement).selected).toBe(false);
      expect((select.options[2] as HTMLOptionElement).selected).toBe(true);
    });
  });

  describe('#2 data-each-rendered-run', () => {
    it('描画確定ごとに一度、this をコンテナに束縛して実行される', async () => {
      const calls: HTMLElement[] = [];
      const win = window as unknown as {
        __recordRendered: (el: HTMLElement) => void;
      };
      win.__recordRendered = (el: HTMLElement) => {
        calls.push(el);
      };

      // observer.ts は import 時に自動で監視を開始する。本番同様に監視が安定
      // した状態から検証するため、初期化完了を待つ。サブツリーを構築済みの
      // 要素として一括追加し、ライブ監視に処理させる（本番の DOM 投入と同じ経路）。
      await Observer.init();
      await waitForDomSettled();

      const host = document.createElement('div');
      host.innerHTML = `
        <div id="state" data-bind='{"items":[{"id":1,"v":"x"}]}'>
          <select
            id="sel"
            data-each="items"
            data-each-key="id"
            data-each-arg="it"
            data-each-rendered-run="window.__recordRendered(this)"
          >
            <option value="{{it.v}}">{{it.v}}</option>
          </select>
        </div>`;
      container.appendChild(host);

      await waitForCondition(
        () => calls.length >= 1,
        {description: '初回 rendered-run', maxAttempts: 40, delayMs: 20},
      );

      const select = host.querySelector('#sel') as HTMLElement;
      expect(calls.length).toBe(1);
      expect(calls[0]).toBe(select);

      // 再バインドで再描画すると、もう一度だけ実行される。
      const state = host.querySelector('#state') as HTMLElement;
      await Core.setBindingData(state, {
        items: [
          {id: 1, v: 'x'},
          {id: 2, v: 'y'},
        ],
      });
      await waitForCondition(
        () => calls.length >= 2,
        {description: '再描画後 rendered-run', maxAttempts: 40, delayMs: 20},
      );

      expect(calls.length).toBe(2);
      expect(calls[1]).toBe(select);
    });
  });

  describe('#1 data-external による監視除外', () => {
    beforeEach(() => {
      resetObserver();
    });

    afterEach(() => {
      resetObserver();
    });

    it('data-external 配下に後から追加された DOM は Haori が処理しない', async () => {
      const ext = document.createElement('div');
      ext.setAttribute('data-external', '');
      container.appendChild(ext);

      await Observer.init();
      await waitForDomSettled();

      // 外部ライブラリによる DOM 生成を模して、補間付き要素を後から追加する。
      const injected = document.createElement('span');
      injected.setAttribute('data-bind', '{"x":"VAL"}');
      injected.textContent = '{{x}}';
      ext.appendChild(injected);
      await waitForDomSettled();

      // 監視除外されているため補間は評価されず、生のテンプレートのまま残る。
      expect(injected.textContent).toBe('{{x}}');
    });

    it('data-external の外側に追加された DOM は通常どおり処理される（対照）', async () => {
      await Observer.init();
      await waitForDomSettled();

      const normal = document.createElement('span');
      normal.setAttribute('data-bind', '{"x":"VAL"}');
      normal.textContent = '{{x}}';
      container.appendChild(normal);
      await waitForCondition(
        () => normal.textContent === 'VAL',
        {description: '通常要素の補間評価', maxAttempts: 40, delayMs: 20},
      );

      expect(normal.textContent).toBe('VAL');
    });

    it('data-external 配下でも data-each の option 生成・再バインド更新は維持される', async () => {
      // 本機能の中核保証: 外部生成 DOM は監視除外しつつ、data-each による
      // <option> の配列バインド（バインド評価パイプライン駆動）は維持されること。
      await Observer.init();
      await waitForDomSettled();

      const host = document.createElement('div');
      host.innerHTML = `
        <div data-external>
          <div id="estate" data-bind='{"items":[{"id":1,"v":"A"}]}'>
            <select
              id="esel"
              data-each="items"
              data-each-key="id"
              data-each-arg="it"
            >
              <option value="{{it.v}}">{{it.v}}</option>
            </select>
          </div>
        </div>`;
      container.appendChild(host);

      // 初回描画: option が 1 件生成され補間済みであること。
      await waitForCondition(
        () => host.querySelectorAll('#esel option').length === 1,
        {description: '初回 option 描画', maxAttempts: 40, delayMs: 20},
      );
      expect(
        Array.from(host.querySelectorAll('#esel option')).map(o =>
          o.getAttribute('value'),
        ),
      ).toEqual(['A']);

      // 再バインド: option が 3 件へ更新されること（監視除外下でも反映）。
      const state = host.querySelector('#estate') as HTMLElement;
      await Core.setBindingData(state, {
        items: [
          {id: 1, v: 'A'},
          {id: 2, v: 'B'},
          {id: 3, v: 'C'},
        ],
      });
      await waitForCondition(
        () => host.querySelectorAll('#esel option').length === 3,
        {description: '再バインド後 option 更新', maxAttempts: 40, delayMs: 20},
      );
      expect(
        Array.from(host.querySelectorAll('#esel option')).map(o =>
          o.getAttribute('value'),
        ),
      ).toEqual(['A', 'B', 'C']);
    });
  });
});
