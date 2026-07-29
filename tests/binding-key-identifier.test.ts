/* @vitest-environment jsdom */
/**
 * @fileoverview 識別子として使えないバインドキーの扱いのテスト。
 *
 * 評価器は `new Function(...bindKeys, body)` で組み立てるため、引数名にできない
 * キー（`customer.email` のようにドットを含む `name` 由来のキーなど）が 1 つでも
 * 混ざると引数リストが壊れ、**そのスコープで評価するすべての式**がコンパイル
 * できなくなっていた。カンマを含むキーは引数の位置をずらし、例外も出さずに他の
 * キーの値を壊していた。
 *
 * ここでは「使えないキーはスコープへ載せない（他の式は正常に評価される）」
 * 「載せなかったキーは `haori.data` から読める」「開発モードで一度だけ警告する」
 * を固定する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import Expression from '../src/expression';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

describe('識別子として使えないバインドキー', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    Dev.disable();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * HTML をマウントして初期評価を終えます。
   *
   * @param html マウントする HTML
   * @returns 戻り値はありません。
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  describe('他の式への巻き添え', () => {
    it('ドットを含む name があっても同スコープの data-if が評価される', async () => {
      await mount(`
        <div id="state" data-bind='{"route":"x"}'>
          <form id="f">
            <select id="sel" name="customer.contractorType">
              <option value="">-</option>
              <option value="法人">法人</option>
            </select>
            <input id="flat" name="plainKey">
            <div id="cond" data-if='plainKey === "abc"'>IN-PLAIN-OK</div>
          </form>
        </div>`);
      const sel = container.querySelector('#sel') as HTMLSelectElement;
      const flat = container.querySelector('#flat') as HTMLInputElement;
      const cond = container.querySelector('#cond') as HTMLElement;
      const form = container.querySelector('#f') as HTMLElement;

      sel.value = '法人';
      sel.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();
      flat.value = 'abc';
      flat.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();

      // ドット付きキーはフラットなキー名として収集される（送信形式は不変）。
      expect(Core.getBindingData(form, {resolved: true})).toMatchObject({
        route: 'x',
        'customer.contractorType': '法人',
        plainKey: 'abc',
      });
      // 巻き添えで壊れず、無関係な式が正しく評価される。
      expect(cond.hasAttribute('data-if-false')).toBe(false);
    });

    it.each([
      ['ドット', 'customer.email'],
      ['ハイフン', 'a-b'],
      ['先頭が数字', '1st'],
      ['空白', 'foo bar'],
      ['予約語', 'class'],
      ['カンマ', 'a,b'],
      ['分割代入の形', '{a}'],
      ['既定値の形', 'a=1'],
    ])('%s のキーは他のキーの評価を壊さない', (_label, key) => {
      expect(
        Expression.evaluate('plainKey === "abc"', {
          plainKey: 'abc',
          [key]: 'v',
        }),
      ).toBe(true);
    });

    it('カンマを含むキーが他のキーの値をずらさない', () => {
      // 修正前は引数の位置がずれ、例外も警告もなく undefined になっていた。
      expect(
        Expression.evaluate('plainKey', {'a,b': 'ZZZ', plainKey: 'abc'}),
      ).toBe('abc');
    });

    it('分割代入の形のキーは同名のキーを遮蔽しない', () => {
      // `{a}` を引数名にすると値が分割代入され、ローカルの `a` が本来のキー `a`
      // を遮蔽してしまう。
      expect(Expression.evaluate('a', {'{a}': {a: 'ZZZ'}, a: 'ok'})).toBe('ok');
    });

    it('ASCII の識別子キーは従来どおり参照できる', () => {
      expect(Expression.evaluate('_ok', {_ok: 1})).toBe(1);
      expect(Expression.evaluate('$x', {$x: 'v'})).toBe('v');
    });

    it('非 ASCII のキーは他の式を壊さない（式からの参照は元から不可）', () => {
      // 式そのものに非 ASCII 識別子を書くと、式の検証（dangerous patterns）で
      // 従来から拒否される。キーとして存在すること自体は問題にしない。
      expect(
        Expression.evaluate('plainKey === "abc"', {
          氏名: '山田',
          plainKey: 'abc',
        }),
      ).toBe(true);
      expect(Expression.evaluate('haori.data["氏名"]', {氏名: '山田'})).toBe(
        '山田',
      );
    });
  });

  describe('載せなかったキーの扱い', () => {
    it('式から直接参照すると未解決参照になる', async () => {
      await mount(`
        <div data-bind='{"customer.email":"a@example.com"}'>
          <span id="out" data-attr-title="{{customer}}">X</span>
        </div>`);
      const out = container.querySelector('#out') as HTMLElement;
      // 未解決参照のため属性は付かない（既存の規則に合流する）。
      expect(out.hasAttribute('title')).toBe(false);
    });

    it('haori.data でブラケット記法で読める', () => {
      const data = {'customer.email': 'a@example.com', plainKey: 'abc'};
      expect(Expression.evaluate('haori.data["customer.email"]', data)).toBe(
        'a@example.com',
      );
      expect(
        Expression.evaluate(
          'haori.data["customer.email"] === "a@example.com"',
          data,
        ),
      ).toBe(true);
      expect(
        Expression.evaluate('haori.data["no.such"] || "default"', data),
      ).toBe('default');
    });

    it('haori.data は宣言バインドと data-if から使える', async () => {
      await mount(`
        <div data-bind='{"customer.contractorType":"法人"}'>
          <span id="out" data-attr-title="{{haori.data['customer.contractorType']}}">X</span>
          <div id="cond" data-if="haori.data['customer.contractorType'] === '法人'">CORP</div>
        </div>`);
      const out = container.querySelector('#out') as HTMLElement;
      const cond = container.querySelector('#cond') as HTMLElement;
      expect(out.getAttribute('title')).toBe('法人');
      expect(cond.hasAttribute('data-if-false')).toBe(false);
    });

    it('ブラケット記法や空白を挟んだ書き方でも読める', () => {
      // 要素データは `haori.data` を参照する式にだけ載せるため、注入判定が
      // 各記法を取りこぼさないことを固定する。
      const data = {'customer.email': 'a@example.com'};
      expect(Expression.evaluate('haori . data ["customer.email"]', data)).toBe(
        'a@example.com',
      );
      expect(Expression.evaluate('haori["data"]["customer.email"]', data)).toBe(
        'a@example.com',
      );
    });

    it('組み込みヘルパーは従来どおり使える', () => {
      expect(typeof Expression.evaluate('haori.today()', {})).toBe('string');
      expect(
        Expression.evaluate('haori.date("2026-07-29", "yyyy/MM/dd")', {}),
      ).toBe('2026/07/29');
    });
  });

  describe('診断', () => {
    it('開発モードで除外したキーをキーごとに一度だけ警告する', () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const data = {'diag.only.key': 1, plainKey: 'abc'};
      Expression.evaluate('plainKey', data);
      Expression.evaluate('plainKey === "abc"', data);
      const messages = warn.mock.calls
        .map(args => args.join(' '))
        .filter(message => message.includes('diag.only.key'));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('haori.data');
    });

    it('Unicode の識別子キーは除外対象として警告しない', () => {
      // 判定を ASCII だけの正規表現で書くと、妥当な識別子（`氏名` など）まで
      // 誤って除外してしまう。除外していないことを警告の内容で確認する。
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      Expression.evaluate('plainKey', {氏名: '山田', plainKey: 'abc'});
      expect(
        warn.mock.calls
          .map(args => args.join(' '))
          .filter(message => message.includes('氏名')),
      ).toEqual([]);
    });

    it('本番モードでは警告しない', () => {
      Dev.disable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      Expression.evaluate('plainKey', {'prod.only.key': 1, plainKey: 'abc'});
      expect(
        warn.mock.calls
          .map(args => args.join(' '))
          .filter(message => message.includes('prod.only.key')),
      ).toEqual([]);
    });

    it('コンパイルできない式の data-if は falsy ではなくコンパイル失敗として報告する', async () => {
      Dev.enable();
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const info = vi.spyOn(Log, 'info').mockImplementation(() => undefined);
      vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      await mount('<div id="cond" data-if="a ===">NG</div>');
      const cond = container.querySelector('#cond') as HTMLElement;
      expect(cond.hasAttribute('data-if-false')).toBe(true);
      expect(
        warn.mock.calls
          .map(args => args.join(' '))
          .some(message => message.includes('could not be compiled')),
      ).toBe(true);
      expect(
        info.mock.calls
          .map(args => args.join(' '))
          .some(message => message.includes('data-if is falsy')),
      ).toBe(false);
    });
  });
});
