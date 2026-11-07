/**
 * @fileoverview 環境検出（接頭辞・開発モード）のテスト。
 *
 * 期待値の根拠は仕様「環境検出」。
 */
import Dev from '../src/dev';
import Env from '../src/env';
import Haori from '../src/haori';

describe('環境から開発モードを検出します', () => {
  beforeEach(() => {
    Dev.set(false);
    Env.setRuntime('embedded');
    document.querySelectorAll('script').forEach(script => script.remove());
    Object.defineProperty(window, 'location', {
      value: new URL('http://test.com'),
      writable: true,
    });
  });

  it('runtime の既定値は embedded です', () => {
    expect(Env.runtime).toBe('embedded');
  });

  it('runtime を demo に設定できます', () => {
    Env.setRuntime('demo');
    expect(Env.runtime).toBe('demo');
  });

  it('Haori.runtime は Env.runtime を参照します', () => {
    Env.setRuntime('demo');
    expect(Haori.runtime).toBe('demo');
  });

  it('Haori.setRuntime で Env.runtime を更新できます', () => {
    Haori.setRuntime('demo');
    expect(Env.runtime).toBe('demo');
  });

  it('data-runtime="demo"属性がある場合', () => {
    mockScriptWithAttribute('data-runtime', 'haori.js', 'demo');
    Env.detect();
    expect(Env.runtime).toBe('demo');
  });

  it('無効な data-runtime 属性は embedded に正規化される', () => {
    Env.setRuntime('demo');
    mockScriptWithAttribute('data-runtime', 'haori.js', 'invalid');
    Env.detect();
    expect(Env.runtime).toBe('embedded');
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

describe('接頭辞の規則', () => {
  /**
   * `data-prefix` を持つ script を置いて環境を検出します。
   *
   * @param prefix `data-prefix` の値
   */
  function detectWithPrefix(prefix: string): void {
    document.querySelectorAll('script').forEach(script => script.remove());
    const script = document.createElement('script');
    script.setAttribute('data-prefix', prefix);
    script.src = 'haori.js';
    document.body.appendChild(script);
    Env.detect();
  }

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://test.com'),
      writable: true,
    });
  });

  afterEach(() => {
    detectWithPrefix('data');
    document.querySelectorAll('script').forEach(script => script.remove());
    vi.restoreAllMocks();
  });

  it('ハイフンを含まない値は、末尾にハイフンを補って使う', () => {
    // 仕様「接頭辞の規則」の「末尾のハイフンは省略でき、省略した場合は補います」
    detectWithPrefix('hx');
    expect(Env.prefix).toBe('hx-');
  });

  it('末尾だけにハイフンを含む値は、そのまま使う', () => {
    // 仕様「接頭辞の規則」の「`hx`・`haori-` は使えます」
    detectWithPrefix('haori-');
    expect(Env.prefix).toBe('haori-');
  });

  it('途中にハイフンを含む値は、開発モードでなくてもエラーを記録して data- で動く', () => {
    // 仕様「接頭辞の規則」の「使えない値を書いた場合は、開発モードに限らず
    // `error` ログを出し、既定の `data-` で動きます」
    detectWithPrefix('hor');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    detectWithPrefix('data-haori');
    expect(Dev.isEnabled()).toBe(false);
    expect(Env.prefix).toBe('data-');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('途中と末尾にハイフンを含む値も使えない', () => {
    // 仕様「接頭辞の規則」の「末尾を除いてハイフンを含められません」
    detectWithPrefix('hor');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    detectWithPrefix('data-x-');
    expect(Env.prefix).toBe('data-');
  });
});
