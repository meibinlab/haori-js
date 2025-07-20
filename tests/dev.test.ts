import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {Dev} from '../src/dev';

describe('Dev', () => {
  beforeEach(() => {
    // 各テスト前に開発モードを確実に無効化
    Dev.disable();
  });

  afterEach(() => {
    // 各テスト後にも状態をクリーンアップ
    Dev.disable();
  });

  describe('isEnabled', () => {
    it('初期状態では無効になっている', () => {
      expect(Dev.isEnabled()).toBe(false);
    });

    it('有効化後は true を返す', () => {
      expect(Dev.isEnabled()).toBe(false); // 初期状態確認
      Dev.enable();
      expect(Dev.isEnabled()).toBe(true);
    });
  });

  describe('enable', () => {
    it('開発モードを有効化する', () => {
      expect(Dev.isEnabled()).toBe(false); // 初期状態確認
      Dev.enable();
      expect(Dev.isEnabled()).toBe(true);
    });
  });

  describe('disable', () => {
    it('開発モードを無効化する', () => {
      Dev.enable();
      expect(Dev.isEnabled()).toBe(true); // 有効化確認
      Dev.disable();
      expect(Dev.isEnabled()).toBe(false);
    });
  });

  describe('set', () => {
    it('true を渡すと有効化される', () => {
      expect(Dev.isEnabled()).toBe(false); // 初期状態確認
      Dev.set(true);
      expect(Dev.isEnabled()).toBe(true);
    });

    it('false を渡すと無効化される', () => {
      Dev.enable(); // 一度有効化
      expect(Dev.isEnabled()).toBe(true); // 有効化確認
      Dev.set(false);
      expect(Dev.isEnabled()).toBe(false);
    });

    it('truthy な値を渡すと有効化される', () => {
      expect(Dev.isEnabled()).toBe(false); // 初期状態確認
      Dev.set(new Boolean('test').valueOf());
      expect(Dev.isEnabled()).toBe(true);
    });

    it('falsy な値を渡すと無効化される', () => {
      Dev.enable(); // 一度有効化
      expect(Dev.isEnabled()).toBe(true); // 有効化確認
      Dev.set(0 as unknown as boolean);
      expect(Dev.isEnabled()).toBe(false);
    });
  });

  describe('only', () => {
    it('開発モードが有効な時に関数が実行される', () => {
      let executed = false;
      expect(Dev.isEnabled()).toBe(false); // 初期状態確認

      Dev.enable();
      expect(Dev.isEnabled()).toBe(true); // 有効化確認

      Dev.only(() => {
        executed = true;
      });

      expect(executed).toBe(true);
    });

    it('開発モードが無効な時に関数が実行されない', () => {
      let executed = false;
      expect(Dev.isEnabled()).toBe(false); // 無効状態確認

      Dev.only(() => {
        executed = true;
      });

      expect(executed).toBe(false);
    });

    it('例外が発生した場合でも適切に処理される', () => {
      Dev.enable();
      expect(Dev.isEnabled()).toBe(true); // 有効化確認

      expect(() => {
        Dev.only(() => {
          throw new Error('Test error');
        });
      }).toThrow('Test error');
    });

    it('開発モードが無効な時は例外も発生しない', () => {
      expect(Dev.isEnabled()).toBe(false); // 無効状態確認

      expect(() => {
        Dev.only(() => {
          throw new Error('This should not be executed');
        });
      }).not.toThrow();
    });
  });
});
