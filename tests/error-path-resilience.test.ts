/* @vitest-environment jsdom */
/**
 * @fileoverview 異常な入力を受けても全体が止まらないことを検証します。
 *
 * セレクタの指定はテンプレート式の評価結果で決まり、失敗するタスクは利用者の
 * 操作から任意に発生します。これらを例外にすると、以降の手続きや描画がまとめて
 * 止まり、画面が固まったまま原因も分からない状態になります。「記録して続行する」
 * 方針が保たれていることを、経路ごとに固定します。
 *
 * 期待値の根拠は仕様「セレクタを値に取る属性の解決」と仕様「エラーハンドリング」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Log from '../src/log';
import Queue from '../src/queue';
import Selector from '../src/selector';
import Url from '../src/url';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('異常な入力に対する耐性', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('セレクタの照会', () => {
    it('不正なセレクタでも例外にせず空の結果を返す', () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      expect(Selector.queryAll('##bad', 'data-click-bind')).toEqual([]);
      expect(Selector.query('##bad', 'data-click-bind')).toBeNull();
      expect(error).toHaveBeenCalledTimes(2);
    });

    it('正しいセレクタは起点の配下だけを照会する', () => {
      container.innerHTML = '<div class="a"></div><div class="a"></div>';
      const outside = document.createElement('div');
      outside.className = 'a';
      document.body.appendChild(outside);

      expect(Selector.queryAll('.a', 'data-click-bind', container).length).toBe(
        2,
      );
      expect(Selector.query('.a', 'data-click-bind', container)).toBe(
        container.firstElementChild,
      );
    });

    it('属性が無い場合と評価結果が文字列でない場合は null を返す', async () => {
      container.innerHTML =
        '<div id="a" data-click-bind="#x"></div>' +
        '<div id="b" data-click-bind="{{missing}}"></div>';
      await Core.scan(container);
      await waitForDomSettled();

      const frag = (id: string): ElementFragment =>
        Fragment.get(container.querySelector('#' + id) as HTMLElement) as
          ElementFragment;

      expect(Selector.read(frag('a'), 'data-click-bind')).toBe('#x');
      // 属性そのものが無い場合
      expect(Selector.read(frag('a'), 'data-click-copy')).toBeNull();
      // 単体プレースホルダが未解決参照になった場合（属性は削除される）
      expect(Selector.read(frag('b'), 'data-click-bind')).toBeNull();
    });
  });

  describe('描画キュー', () => {
    it('失敗したタスクは reject し、後続のタスクは実行される', async () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      const order: string[] = [];

      const failed = Queue.enqueue(() => {
        order.push('failing');
        throw new Error('boom');
      });
      const next = Queue.enqueue(() => {
        order.push('next');
        return 'ok';
      });

      await expect(failed).rejects.toThrow('boom');
      await expect(next).resolves.toBe('ok');
      expect(order).toEqual(['failing', 'next']);
      expect(error).toHaveBeenCalled();
    });

    it('優先実行のタスクは待機中のタスクより先に実行される', async () => {
      const order: string[] = [];
      const normal = Queue.enqueue(() => {
        order.push('normal');
      });
      const urgent = Queue.enqueue(() => {
        order.push('urgent');
      }, true);

      await Promise.all([normal, urgent]);

      expect(order[0]).toBe('urgent');
    });
  });

  describe('戻り先パスの検証', () => {
    it.each([
      ['/list', true],
      ['  /list?a=1#b  ', true],
      ['', false],
      ['   ', false],
      ['list', false],
      ['//evil.example.com', false],
      ['/\\evil.example.com', false],
      ['https://evil.example.com/', false],
      ['javascript:alert(1)', false],
    ])('%s の判定は %s', (value, expected) => {
      expect(Url.isSafeLocalPath(value as string)).toBe(expected);
    });
  });
});
