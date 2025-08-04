import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

// devモジュールをモック
vi.mock('../src/dev');

import Log from '../src/log';
import Dev from '../src/dev';

describe('ログ機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Dev.isEnabled).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info', () => {
    it('開発モードでconsole.logが呼ばれる', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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
    it('モードに関係なくconsole.errorが呼ばれる（開発モード有効）', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      Log.error('test error', 'arg1', 'arg2');

      expect(consoleSpy).toHaveBeenCalledWith('test error', 'arg1', 'arg2');
    });

    it('モードに関係なくconsole.errorが呼ばれる（開発モード無効）', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(Dev.isEnabled).mockReturnValue(false);

      Log.error('test error', 'arg1', 'arg2');

      expect(consoleSpy).toHaveBeenCalledWith('test error', 'arg1', 'arg2');
    });
  });
});
