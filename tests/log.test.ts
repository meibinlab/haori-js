import {describe, it, expect, vi, beforeEach} from 'vitest';
import {logWarning, logError, logInfo} from '../src/log';

// devモジュールをモック
vi.mock('../src/dev', () => ({isDevMode: vi.fn(() => true)}));

describe('ログ機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logInfo', () => {
    it('開発モードでconsole.logが呼ばれる', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logInfo('test info', 'arg1', 'arg2');

      expect(consoleSpy).toHaveBeenCalledWith('test info', 'arg1', 'arg2');
      consoleSpy.mockRestore();
    });
  });

  describe('logWarning', () => {
    it('開発モードでconsole.warnが呼ばれる', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logWarning('test warning', 'arg1', 'arg2');

      expect(consoleSpy).toHaveBeenCalledWith('test warning', 'arg1', 'arg2');
      consoleSpy.mockRestore();
    });
  });

  describe('logError', () => {
    it('開発モードでconsole.errorが呼ばれる', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      logError('test error', 'arg1', 'arg2');

      expect(consoleSpy).toHaveBeenCalledWith('test error', 'arg1', 'arg2');
      consoleSpy.mockRestore();
    });
  });
});
