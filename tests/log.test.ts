import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Log} from '../src/log';
import {Dev} from '../src/dev';

// devモジュールをモック
vi.mock('../src/dev', () => ({
  Dev: {
    isEnabled: vi.fn(() => true),
  },
}));

describe('ログ機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info', () => {
    it('開発モードでconsole.logが呼ばれる', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(Dev.isEnabled).mockReturnValue(true);

      Log.info('test info', 'arg1', 'arg2');

      expect(consoleSpy).toHaveBeenCalledWith('test info', 'arg1', 'arg2');
    });

    it('開発モードが無効の時はconsole.logが呼ばれない', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(Dev.isEnabled).mockReturnValue(false);

      Log.info('test info', 'arg1', 'arg2');

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('開発モードでconsole.warnが呼ばれる', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(Dev.isEnabled).mockReturnValue(true);

      Log.warn('test warning', 'arg1', 'arg2');

      expect(consoleSpy).toHaveBeenCalledWith('test warning', 'arg1', 'arg2');
    });

    it('開発モードが無効の時はconsole.warnが呼ばれない', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(Dev.isEnabled).mockReturnValue(false);

      Log.warn('test warning', 'arg1', 'arg2');

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('開発モードでconsole.errorが呼ばれる', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(Dev.isEnabled).mockReturnValue(true);

      Log.error('test error', 'arg1', 'arg2');

      expect(consoleSpy).toHaveBeenCalledWith('test error', 'arg1', 'arg2');
    });

    it('開発モードが無効の時はconsole.errorが呼ばれない', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(Dev.isEnabled).mockReturnValue(false);

      Log.error('test error', 'arg1', 'arg2');

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});
