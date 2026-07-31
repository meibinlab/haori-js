/* @vitest-environment jsdom */
/**
 * @fileoverview `data-each` 行への値反映と宣言バインドの優先順位の検証。
 *
 * 行の中で「取得した候補から選択中の 1 件を引いて hidden へ載せる」構成の回帰
 * ガードです。行の値反映は行の再評価の直後に走るため、宣言バインドの評価結果を
 * 収集値（多くは空文字）で上書きすると、その空値が次の収集で行データへ焼き付き、
 * 以後ずっと空になります。
 * 1. 宣言バインドの評価が解決していれば、行データにキーがあっても上書きしない
 * 2. 反映された値はそのまま収集値（送信値・ストア）へ載る
 * 3. 評価が未解決のときは従来どおり行データを反映する（保存済みレコードの復元）
 * 4. 宣言バインドの無い入力は従来どおり行データで上書きされる
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

/** 候補一覧の応答（Spring の Page 相当） */
const PLANS = {
  content: [
    {id: 'p1', planName: 'スタンダードプラン'},
    {id: 'p2', planName: 'おトクプラン'},
  ],
};

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: {'Content-Type': 'application/json'},
  });

describe('data-each 行への値反映と宣言バインド', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    vi.spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(jsonResponse(PLANS))) as never);
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  /** 行内の select を選択して change を発火します。 */
  const select = async (name: string, value: string): Promise<void> => {
    const element = container.querySelector<HTMLSelectElement>(
      `select[name="${name}"]`,
    )!;
    element.value = value;
    element.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(12);
    await waitForDomSettled(12);
  };

  /** フォームの収集値を返します。 */
  const collect = (): Record<string, unknown> => {
    const form = container.querySelector('form') as HTMLElement;
    return Form.getValues(Fragment.get(form) as ElementFragment);
  };

  describe('規則1・2: 解決した宣言バインドは行データより優先する', () => {
    beforeEach(async () => {
      container.innerHTML = `
        <form data-form data-bind='{"rows":[{}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="c"
               data-each-index="i">
            <div class="row-block">
              <div class="row-body" id="row-body-{{i}}">
                <div class="candidates" data-fetch="/api/plans"
                     data-fetch-arg="planCandidates"
                     data-fetch-bind="#row-body-{{i}}">
                  <select name="planId" data-each="planCandidates.content ?? []"
                          data-each-arg="p">
                    <option data-each-before value="">選択してください</option>
                    <option value="{{p.id}}">{{p.planName}}</option>
                  </select>
                </div>
                <input type="hidden" name="planName"
                  data-attr-value="{{haori.findBy(planCandidates.content ?? [], 'id', c.planId).planName}}">
              </div>
            </div>
          </div>
        </form>`;
      await Core.scan(container);
      await waitForDomSettled(12);
    });

    it('選択に追随して hidden の値が入る', async () => {
      await select('planId', 'p2');

      const hidden = container.querySelector<HTMLInputElement>(
        'input[name="planName"]',
      )!;
      expect(hidden.value).toBe('おトクプラン');
      expect(hidden.getAttribute('value')).toBe('おトクプラン');
    });

    it('反映された値が収集値へ載る', async () => {
      await select('planId', 'p2');

      const rows = collect().rows as Record<string, unknown>[];
      expect(rows[0].planName).toBe('おトクプラン');
    });

    it('選択を変えると値も追随する', async () => {
      await select('planId', 'p2');
      await select('planId', 'p1');

      const hidden = container.querySelector<HTMLInputElement>(
        'input[name="planName"]',
      )!;
      expect(hidden.value).toBe('スタンダードプラン');
    });

    it('行の値反映を直接呼んでも解決済みの宣言バインドを上書きしない', async () => {
      await select('planId', 'p2');
      const row = Fragment.get(
        container.querySelector('.row-block') as HTMLElement,
      ) as ElementFragment;

      // 行の差分更新が呼ぶ経路（`Core.applyRowFormValues`）と同じ書き込み。
      await Form.syncRowValues(row, {planId: 'p2', planName: ''});

      const hidden = container.querySelector<HTMLInputElement>(
        'input[name="planName"]',
      )!;
      expect(hidden.value).toBe('おトクプラン');
    });
  });

  describe('規則3: 評価が未解決なら行データを反映する', () => {
    it('候補が届いていない間は行データの値を保つ', async () => {
      // 候補を取得しない構成（保存済みレコードからの復元相当）。
      container.innerHTML = `
        <form data-form data-bind='{"rows":[{"planName":"保存済みプラン"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="c"
               data-each-index="i">
            <div class="row-block">
              <input type="hidden" name="planName"
                data-attr-value="{{haori.findBy(planCandidates.content ?? [], 'id', c.planId).planName}}">
            </div>
          </div>
        </form>`;
      await Core.scan(container);
      await waitForDomSettled(12);

      const hidden = container.querySelector<HTMLInputElement>(
        'input[name="planName"]',
      )!;
      expect(hidden.value).toBe('保存済みプラン');
    });
  });

  describe('優先順位の変更点', () => {
    it('行データが同名キーを持っていても宣言バインドの評価結果が勝つ', async () => {
      // サーバーが行ごとに token を返しても、宣言バインドがある入力では
      // 評価結果（祖先の共通値）が権威になる（0.36.0 の変更点）。
      container.innerHTML = `
        <form data-form id="f" data-bind='{"token":"共通","rows":[{"memo":"A"},{"memo":"B"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="c">
            <div class="row-block">
              <input type="text" name="memo" data-attr-value="{{c.memo}}">
              <input type="hidden" name="token" data-attr-value="{{token}}">
            </div>
          </div>
        </form>`;
      await Core.scan(container);
      await waitForDomSettled(12);

      await Core.setBindingData(container.querySelector('#f') as HTMLElement, {
        token: '共通',
        rows: [
          {memo: 'A', token: '行A'},
          {memo: 'B', token: '行B'},
        ],
      });
      await waitForDomSettled(14);

      const tokens = Array.from(
        container.querySelectorAll<HTMLInputElement>('input[name="token"]'),
      ).map(input => input.value);
      expect(tokens).toEqual(['共通', '共通']);
    });

    it('利用者が編集した行の値は巻き戻らない', async () => {
      container.innerHTML = `
        <form data-form data-bind='{"rows":[{"memo":"A"},{"memo":"B"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="c">
            <div class="row-block">
              <input type="text" name="memo" data-attr-value="{{c.memo}}">
            </div>
          </div>
        </form>`;
      await Core.scan(container);
      await waitForDomSettled(12);

      const inputs = container.querySelectorAll<HTMLInputElement>(
        'input[name="memo"]',
      );
      inputs[0].value = 'A2';
      inputs[0].dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(14);
      inputs[1].value = 'B2';
      inputs[1].dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(14);

      expect([inputs[0].value, inputs[1].value]).toEqual(['A2', 'B2']);
      const rows = collect().rows as Record<string, unknown>[];
      expect(rows.map(row => row.memo)).toEqual(['A2', 'B2']);
    });
  });

  describe('規則4: 宣言バインドの無い入力は従来どおり', () => {
    it('行データの値で上書きされる', async () => {
      container.innerHTML = `
        <form data-form data-bind='{"rows":[{"memo":"行データ"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="c">
            <div class="row-block">
              <input type="text" name="memo">
            </div>
          </div>
        </form>`;
      await Core.scan(container);
      await waitForDomSettled(12);

      const input = container.querySelector<HTMLInputElement>(
        'input[name="memo"]',
      )!;
      expect(input.value).toBe('行データ');
    });

    it('行データにキーが無い宣言バインドは空にされない（既存仕様の回帰）', async () => {
      container.innerHTML = `
        <form data-form data-bind='{"kept":"URL 由来","rows":[{"memo":"行データ"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="c">
            <div class="row-block">
              <input type="text" name="memo">
              <input type="hidden" name="token" data-attr-value="{{kept}}">
            </div>
          </div>
        </form>`;
      await Core.scan(container);
      await waitForDomSettled(12);

      const token = container.querySelector<HTMLInputElement>(
        'input[name="token"]',
      )!;
      expect(token.value).toBe('URL 由来');
    });
  });
});
