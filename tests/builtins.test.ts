/* @vitest-environment jsdom */
/**
 * @fileoverview 組み込みヘルパー（haori.date / number / range / pages）の単体テストと、
 * 式評価エンジンへの予約名前空間 `haori` 注入の統合テストです。
 */
import {describe, it, expect} from 'vitest';
import Builtins, {
  date,
  findBy,
  monthAdd,
  monthRange,
  number,
  pageSummary,
  range,
  pages,
} from '../src/builtins';
import Expression from '../src/expression';
import Haori from '../src/haori';

describe('Builtins', () => {
  describe('date()', () => {
    it('既定フォーマット yyyy/MM/dd HH:mm で整形する', () => {
      // タイムゾーン依存を避けるため、オフセットなし ISO（ローカル時刻扱い）を使う
      expect(date('2024-01-05T09:05:03')).toBe('2024/01/05 09:05');
    });

    it('カスタムフォーマットのトークンを置換する', () => {
      expect(date('2024-01-05T09:05:03', 'yy-M-d H:mm:ss')).toBe(
        '24-1-5 9:05:03',
      );
    });

    it('Date オブジェクトとエポックミリ秒を受け付ける', () => {
      const local = new Date(2024, 0, 5, 9, 5, 3);
      expect(date(local, 'yyyy/MM/dd')).toBe('2024/01/05');
      expect(date(local.getTime(), 'yyyy/MM/dd')).toBe('2024/01/05');
    });

    it('空・null・不正な日時は空文字を返す', () => {
      expect(date('')).toBe('');
      expect(date(null)).toBe('');
      expect(date(undefined)).toBe('');
      expect(date('not-a-date')).toBe('');
    });
  });

  describe('number()', () => {
    it('桁区切りを付ける', () => {
      expect(number(1234567)).toBe('1,234,567');
    });

    it('小数桁を固定する', () => {
      expect(number(1234.5, 2)).toBe('1,234.50');
    });

    it('数値文字列を受け付け、指定桁で丸める', () => {
      expect(number('1234.5', 0)).toBe('1,235');
    });

    it('負数を整形する', () => {
      expect(number(-1234.5, 1)).toBe('-1,234.5');
    });

    it('非数値・null・空文字は空文字を返す', () => {
      expect(number('abc')).toBe('');
      expect(number(null)).toBe('');
      expect(number('')).toBe('');
      expect(number(Number.NaN)).toBe('');
    });
  });

  describe('range()', () => {
    it('range(n) は 0..n-1 を返す', () => {
      expect(range(5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('range(start, end) は終端排他', () => {
      expect(range(2, 5)).toEqual([2, 3, 4]);
    });

    it('step を指定できる', () => {
      expect(range(1, 10, 2)).toEqual([1, 3, 5, 7, 9]);
    });

    it('負の step で降順にできる', () => {
      expect(range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
    });

    it('空になるケース・step 0 は空配列', () => {
      expect(range(0)).toEqual([]);
      expect(range(3, 3)).toEqual([]);
      expect(range(0, 5, 0)).toEqual([]);
    });
  });

  describe('pages()', () => {
    it('総ページが少なければ省略記号なしで全ページを返す', () => {
      const result = pages(3, 0);
      expect(result.map(item => item.label)).toEqual([1, 2, 3]);
      expect(result.map(item => item.page)).toEqual([0, 1, 2]);
      expect(result[0].active).toBe(true);
      expect(result.some(item => item.ellipsis)).toBe(false);
    });

    it('現在ページが 0 始まり、表示ラベルは +1 になる', () => {
      const result = pages(5, 2);
      const active = result.find(item => item.active);
      expect(active?.page).toBe(2);
      expect(active?.label).toBe(3);
    });

    it('中央で両側に省略記号を挿入する', () => {
      const result = pages(20, 9, {window: 2});
      // 先頭ページ・末尾ページ・現在周辺・省略記号2つ
      expect(result[0].page).toBe(0);
      expect(result[0].label).toBe(1);
      expect(result[result.length - 1].page).toBe(19);
      expect(result[result.length - 1].label).toBe(20);
      expect(result.filter(item => item.ellipsis).length).toBe(2);
      const active = result.find(item => item.active);
      expect(active?.page).toBe(9);
      expect(active?.label).toBe(10);
    });

    it('current は範囲内にクランプされる', () => {
      const result = pages(5, 99);
      const active = result.find(item => item.active);
      expect(active?.page).toBe(4);
    });

    it('totalPages が 0 以下なら空配列', () => {
      expect(pages(0, 0)).toEqual([]);
      expect(pages(-3, 0)).toEqual([]);
    });

    it('省略記号要素は page=null, label=… を持つ', () => {
      const ellipsis = pages(20, 9, {window: 1}).find(item => item.ellipsis);
      expect(ellipsis?.page).toBeNull();
      expect(ellipsis?.label).toBe('…');
    });
  });

  describe('monthAdd()', () => {
    it('月を加算する（YYYY-MM 形式で返す）', () => {
      expect(monthAdd('2026-06', 1)).toBe('2026-07');
      expect(monthAdd('2026-06', -1)).toBe('2026-05');
    });

    it('年をまたいで繰り上がり・繰り下がりする', () => {
      expect(monthAdd('2026-12', 1)).toBe('2027-01');
      expect(monthAdd('2026-01', -1)).toBe('2025-12');
      expect(monthAdd('2026-06', -18)).toBe('2024-12');
    });

    it('delta が 0 なら正規化して返す', () => {
      expect(monthAdd('2026-06', 0)).toBe('2026-06');
      expect(monthAdd('2026-6', 0)).toBe('2026-06');
    });

    it('不正な入力は空文字を返す', () => {
      expect(monthAdd('', 1)).toBe('');
      expect(monthAdd(null, 1)).toBe('');
      expect(monthAdd('2026-13', 1)).toBe('');
      expect(monthAdd('2026/06', 1)).toBe('');
      expect(monthAdd('not-a-month', 1)).toBe('');
    });
  });

  describe('monthRange()', () => {
    it('基準月から降順に count + 1 個返す', () => {
      const result = monthRange(3, '2026-06');
      expect(result.map(item => item.targetMonth)).toEqual([
        '2026-06',
        '2026-05',
        '2026-04',
        '2026-03',
      ]);
      expect(result[0].label).toBe('2026/06');
    });

    it('count が 0 なら基準月だけを返す', () => {
      expect(monthRange(0, '2026-06')).toEqual([
        {targetMonth: '2026-06', label: '2026/06'},
      ]);
    });

    it('base 省略時は現在月を先頭にする', () => {
      const now = new Date();
      const year = String(now.getFullYear()).padStart(4, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const result = monthRange(2);
      expect(result.length).toBe(3);
      expect(result[0].targetMonth).toBe(`${year}-${month}`);
    });

    it('不正な count・base は空配列を返す', () => {
      expect(monthRange(-1, '2026-06')).toEqual([]);
      expect(monthRange(3, 'bad')).toEqual([]);
    });
  });

  describe('pageSummary()', () => {
    it('先頭ページのサマリーを計算する', () => {
      expect(
        pageSummary({number: 0, size: 20, totalElements: 100}),
      ).toEqual({start: 1, end: 20, total: 100, empty: false});
    });

    it('途中ページのサマリーを計算する', () => {
      expect(
        pageSummary({number: 2, size: 20, totalElements: 100}),
      ).toEqual({start: 41, end: 60, total: 100, empty: false});
    });

    it('末尾ページの端数は visibleCount を優先する', () => {
      expect(
        pageSummary({number: 4, size: 20, totalElements: 90}, 10),
      ).toEqual({start: 81, end: 90, total: 90, empty: false});
    });

    it('numberOfElements があれば末尾の端数に使う', () => {
      expect(
        pageSummary({
          number: 4,
          size: 20,
          totalElements: 90,
          numberOfElements: 10,
        }),
      ).toEqual({start: 81, end: 90, total: 90, empty: false});
    });

    it('totalCount も総件数として受け付ける', () => {
      expect(pageSummary({number: 0, size: 10, totalCount: 25})).toEqual({
        start: 1,
        end: 10,
        total: 25,
        empty: false,
      });
    });

    it('総件数 0・不正な入力は empty を返す', () => {
      const empty = {start: 0, end: 0, total: 0, empty: true};
      expect(pageSummary({number: 0, size: 20, totalElements: 0})).toEqual(
        empty,
      );
      expect(pageSummary(null)).toEqual(empty);
      expect(pageSummary(undefined)).toEqual(empty);
    });
  });

  describe('findBy()', () => {
    const items = [
      {id: 1, name: 'A'},
      {id: 2, name: 'B'},
      {id: 3, name: 'C'},
    ];

    it('key が一致する最初の要素を返す', () => {
      expect(findBy(items, 'id', 2)).toEqual({id: 2, name: 'B'});
    });

    it('文字列化して比較する（数値と文字列の差を吸収）', () => {
      expect(findBy(items, 'id', '3')).toEqual({id: 3, name: 'C'});
    });

    it('一致しなければ null を返す（先頭は返さない）', () => {
      expect(findBy(items, 'id', 99)).toBeNull();
    });

    it('非配列・空配列は null を返す', () => {
      expect(findBy(null, 'id', 1)).toBeNull();
      expect(findBy(undefined, 'id', 1)).toBeNull();
      expect(findBy([], 'id', 1)).toBeNull();
      expect(findBy('x', 'id', 1)).toBeNull();
    });

    it('要素が null/undefined を含んでいても安全に扱う', () => {
      expect(findBy([null, {id: 1}], 'id', 1)).toEqual({id: 1});
    });
  });

  describe('Haori 公開 API との共用', () => {
    it('Haori.date / number / range / pages が同じ実装を返す', () => {
      expect(Haori.date('2024-01-05T09:05:03')).toBe('2024/01/05 09:05');
      expect(Haori.number(1234567)).toBe('1,234,567');
      expect(Haori.range(3)).toEqual([0, 1, 2]);
      expect(Haori.pages(3, 0).length).toBe(3);
    });

    it('Haori.monthAdd / monthRange / pageSummary が同じ実装を返す', () => {
      expect(Haori.monthAdd('2026-06', -1)).toBe('2026-05');
      expect(Haori.monthRange(1, '2026-06').map(m => m.targetMonth)).toEqual([
        '2026-06',
        '2026-05',
      ]);
      expect(
        Haori.pageSummary({number: 0, size: 20, totalElements: 100}),
      ).toEqual({start: 1, end: 20, total: 100, empty: false});
    });

    it('Haori.findBy が同じ実装を返す', () => {
      expect(Haori.findBy([{id: 1}, {id: 2}], 'id', 2)).toEqual({id: 2});
      expect(Haori.findBy([{id: 1}], 'id', 9)).toBeNull();
    });
  });

  describe('式評価への注入（予約名 haori）', () => {
    it('式から haori.date を呼べる', () => {
      const result = Expression.evaluate("haori.date(d, 'yyyy/MM/dd')", {
        d: '2024-01-05T09:05:03',
      });
      expect(result).toBe('2024/01/05');
    });

    it('式から haori.range を呼べる', () => {
      expect(Expression.evaluate('haori.range(3)', {})).toEqual([0, 1, 2]);
    });

    it('式から haori.pages を呼べる（data-each 用途）', () => {
      const result = Expression.evaluate('haori.pages(3, n)', {n: 0}) as Array<
        Record<string, unknown>
      >;
      expect(result.length).toBe(3);
      expect(result[0].label).toBe(1);
    });

    it('式から haori.monthAdd / monthRange を呼べる', () => {
      expect(
        Expression.evaluate("haori.monthAdd(m, -1)", {m: '2026-06'}),
      ).toBe('2026-05');
      const months = Expression.evaluate(
        "haori.monthRange(1, '2026-06')",
        {},
      ) as Array<Record<string, unknown>>;
      expect(months.map(item => item.targetMonth)).toEqual([
        '2026-06',
        '2026-05',
      ]);
    });

    it('式から haori.pageSummary を呼べる', () => {
      const result = Expression.evaluate('haori.pageSummary(view)', {
        view: {number: 0, size: 20, totalElements: 100},
      }) as Record<string, unknown>;
      expect(result.start).toBe(1);
      expect(result.end).toBe(20);
    });

    it('式から haori.findBy を呼べる（フォールバックは ?? で表現）', () => {
      const items = [
        {id: 1, name: 'A'},
        {id: 2, name: 'B'},
      ];
      expect(
        Expression.evaluate('haori.findBy(items, "id", sel)?.name', {
          items,
          sel: 2,
        }),
      ).toBe('B');
      // 一致なしは null、?? で先頭フォールバック
      expect(
        Expression.evaluate('(haori.findBy(items, "id", sel) ?? items[0]).name', {
          items,
          sel: 9,
        }),
      ).toBe('A');
    });

    it('haori はユーザーのバインド値より優先される（上書き不可）', () => {
      const result = Expression.evaluate('haori.range(2)', {
        haori: {range: () => 'overridden'},
      });
      expect(result).toEqual([0, 1]);
    });

    it('プロパティアクセス foo.haori は注入の影響を受けない', () => {
      const result = Expression.evaluate('foo.haori', {foo: {haori: 42}});
      expect(result).toBe(42);
    });

    it('haori を参照しない式は従来どおり評価される', () => {
      expect(Expression.evaluate('x + 1', {x: 1})).toBe(2);
    });

    it('Builtins は凍結されている', () => {
      expect(Object.isFrozen(Builtins)).toBe(true);
    });

    it('文字列リテラル内の haori は識別子として扱わない', () => {
      // 文字列リテラルはそのまま評価され、注入による破壊や誤検出が起きない
      expect(Expression.evaluate("'haori'", {})).toBe('haori');
      expect(Expression.evaluate('"haori is reserved"', {x: 1})).toBe(
        'haori is reserved',
      );
    });
  });

  describe('レビュー指摘の追加検証', () => {
    it('date: リテラルエスケープ（\'...\'）でトークン英字をそのまま出力する', () => {
      expect(date('2024-01-05T09:05:03', "yyyy-MM-dd'T'HH:mm:ss")).toBe(
        '2024-01-05T09:05:03',
      );
      expect(date('2024-01-05T09:05:03', "HH'h'mm")).toBe('09h05');
      // '' はリテラルのシングルクォート1文字
      expect(date('2024-01-05T09:05:03', "HH''mm")).toBe("09'05");
    });

    it('number: decimals 省略時は最大3桁に丸められる', () => {
      expect(number(1234.56789)).toBe('1,234.568');
    });

    it('number: 空白のみ・前後空白を適切に扱う', () => {
      expect(number('   ')).toBe('');
      expect(number(' 12 ')).toBe('12');
      expect(number('1e3')).toBe('1,000');
      expect(number(Infinity)).toBe('');
    });

    it('range: 非整数は切り捨て、上限で打ち切る', () => {
      expect(range(1.9, 5.9)).toEqual([1, 2, 3, 4]);
      expect(range(0, 20000).length).toBe(10000);
    });

    it('pages: 隠れるのが1ページなら省略記号でなく番号を出す', () => {
      const result = pages(5, 2, {window: 0});
      expect(result.map(item => item.label)).toEqual([1, 2, 3, 4, 5]);
      expect(result.some(item => item.ellipsis)).toBe(false);
      expect(result.find(item => item.active)?.label).toBe(3);
    });

    it('pages: 大きなギャップでは従来どおり省略記号を出す', () => {
      const result = pages(20, 9, {window: 2});
      expect(result.filter(item => item.ellipsis).length).toBe(2);
    });

    it('pages: boundary を増やすと先頭・末尾の表示数が増える', () => {
      const result = pages(20, 9, {window: 1, boundary: 2});
      // 先頭2ページ（label 1,2）と末尾2ページ（label 19,20）が含まれる
      const labels = result.filter(i => !i.ellipsis).map(i => i.label);
      expect(labels).toContain(1);
      expect(labels).toContain(2);
      expect(labels).toContain(19);
      expect(labels).toContain(20);
    });
  });
});
