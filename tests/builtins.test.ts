/* @vitest-environment jsdom */
/**
 * @fileoverview 組み込みヘルパー（haori.date / number / range / pages）の単体テストと、
 * 式評価エンジンへの予約名前空間 `haori` 注入の統合テストです。
 */
import {describe, it, expect} from 'vitest';
import Builtins, {date, number, range, pages} from '../src/builtins';
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

  describe('Haori 公開 API との共用', () => {
    it('Haori.date / number / range / pages が同じ実装を返す', () => {
      expect(Haori.date('2024-01-05T09:05:03')).toBe('2024/01/05 09:05');
      expect(Haori.number(1234567)).toBe('1,234,567');
      expect(Haori.range(3)).toEqual([0, 1, 2]);
      expect(Haori.pages(3, 0).length).toBe(3);
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
