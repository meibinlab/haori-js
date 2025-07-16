import { isDevMode, setDevMode } from '../src/dev';

describe('devMode', () => {
  it('デフォルトはfalseであること', () => {
    expect(isDevMode()).toBe(false);
  });

  it('setDevMode()で設定した値が反映されること', () => {
    setDevMode(true);
    expect(isDevMode()).toBe(true);
    setDevMode(false);
    expect(isDevMode()).toBe(false);
  });
});
