import {isDevMode, setDevMode} from '../src/dev';
import {detectDevModeFromEnv} from '../src/env';

describe('環境から開発モードを検出します', () => {
  beforeEach(() => {
    setDevMode(false);
    document.querySelectorAll('script').forEach(script => script.remove());
    Object.defineProperty(window, 'location', {
      value: new URL('http://test.com'),
      writable: true,
    });
  });

  /**
   * scriptタグを追加します。
   *
   * @param attr scriptタグに設定する属性名
   * @param src scriptタグのsrc属性
   */
  function mockScriptWithAttribute(attr: string, src: string): void {
    const script = document.createElement('script');
    script.setAttribute(attr, '');
    script.src = src;
    document.body.appendChild(script);
  }

  /**
   * ホスト名をモックします。
   *
   * @param hostname モックするホスト名
   */
  function mockHostname(hostname: string): void {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: hostname,
        href: `http://${hostname}`,
      },
      writable: true,
    });
  }

  it('data-dev属性がある場合', () => {
    mockScriptWithAttribute('data-dev', 'haori.js');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(true);
  });

  it('hor-dev属性がある場合', () => {
    mockScriptWithAttribute('hor-dev', 'haori.js');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(true);
  });

  it('localhostの場合', () => {
    mockHostname('localhost');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(true);
  });

  it('127.0.0.1の場合', () => {
    mockHostname('127.0.0.1');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(true);
  });

  it('::1の場合', () => {
    mockHostname('::1');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(true);
  });

  it('*.localの場合', () => {
    mockHostname('test.local');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(true);
  });

  it('*.localhostの場合', () => {
    mockHostname('test.localhost');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(true);
  });

  it('ローカルでないホスト名の場合', () => {
    mockHostname('test.app');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(false);
  });

  it('無関係なスクリプトの場合', () => {
    mockScriptWithAttribute('data-dev', 'other.js');
    detectDevModeFromEnv();
    expect(isDevMode()).toBe(false);
  });
});
