import Dev from '../src/dev';
import Env from '../src/env';

describe('環境から開発モードを検出します', () => {
  beforeEach(() => {
    Dev.set(false);
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
   * @param value 属性の値（省略可能）
   */
  function mockScriptWithAttribute(
    attr: string,
    src: string,
    value?: string,
  ): void {
    const script = document.createElement('script');
    if (value !== undefined) {
      script.setAttribute(attr, value);
    } else {
      script.setAttribute(attr, '');
    }
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
      value: {hostname: hostname, href: `http://${hostname}`},
      writable: true,
    });
  }

  it('data-dev属性がある場合', () => {
    mockScriptWithAttribute('data-dev', 'haori.js');
    Env.detect();
    expect(Dev.isEnabled()).toBe(true);
  });

  it('data-prefix="hor"属性がある場合', () => {
    const script = document.createElement('script');
    script.setAttribute('data-prefix', 'hor');
    script.setAttribute('hor-dev', '');
    script.src = 'haori.js';
    document.body.appendChild(script);
    Env.detect();
    expect(Dev.isEnabled()).toBe(true);
  });

  it('hor-dev属性がある場合', () => {
    mockScriptWithAttribute('hor-dev', 'haori.js');
    Env.detect();
    expect(Dev.isEnabled()).toBe(true);
  });

  it('localhostの場合', () => {
    mockHostname('localhost');
    Env.detect();
    expect(Dev.isEnabled()).toBe(true);
  });

  it('127.0.0.1の場合', () => {
    mockHostname('127.0.0.1');
    Env.detect();
    expect(Dev.isEnabled()).toBe(true);
  });

  it('::1の場合', () => {
    mockHostname('::1');
    Env.detect();
    expect(Dev.isEnabled()).toBe(true);
  });

  it('*.localの場合', () => {
    mockHostname('test.local');
    Env.detect();
    expect(Dev.isEnabled()).toBe(true);
  });

  it('*.localhostの場合', () => {
    mockHostname('test.localhost');
    Env.detect();
    expect(Dev.isEnabled()).toBe(true);
  });

  it('ローカルでないホスト名の場合', () => {
    mockHostname('test.app');
    Env.detect();
    expect(Dev.isEnabled()).toBe(false);
  });

  it('無関係なスクリプトの場合', () => {
    mockScriptWithAttribute('data-dev', 'other.js');
    Env.detect();
    expect(Dev.isEnabled()).toBe(false);
  });
});
