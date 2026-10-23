/* @vitest-environment jsdom */
/**
 * @fileoverview CSP モードと従来の方式の切り替えと、従来の方式で CSP に阻まれた
 * ときの案内のテスト
 *
 * 期待値の根拠は仕様「CSP モード」です。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Env from '../src/env';
import Expression from '../src/expression';
import Haori from '../src/haori';
import Log from '../src/log';

/** テストの前の CSP モード（ほかのテストのモードを壊さないため） */
let previousCsp: boolean;

beforeEach(() => {
  previousCsp = Env.csp;
  document.querySelectorAll('script').forEach(script => script.remove());
});

afterEach(() => {
  Env.setCsp(previousCsp);
  document.querySelectorAll('script').forEach(script => script.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Haori を読み込む `<script>` を置きます。
 *
 * @param attributes 属性
 * @returns 戻り値はありません。
 */
function placeScript(attributes: Record<string, string>): void {
  const script = document.createElement('script');
  script.src = 'haori.js';
  for (const [name, value] of Object.entries(attributes)) {
    script.setAttribute(name, value);
  }
  document.body.appendChild(script);
}

describe('既定のモード', () => {
  it('何も設定しなければ CSP モードになる（回帰）', async () => {
    // 仕様「CSP モード」の「既定は CSP モードです」
    // 従来の方式の設定で流す場合も確かめるため、テストの設定が差し替えた
    // モジュールではなく、読み直した本来のモジュールを見る。
    vi.resetModules();
    vi.doUnmock('../src/env');
    try {
      const fresh = (await import('../src/env')).default;
      expect(fresh.csp).toBe(true);
    } finally {
      vi.resetModules();
    }
  });
});

describe('data-csp による切り替え', () => {
  it.each([[''], ['true'], ['strict']])('data-csp="%s" で有効になる', value => {
    // 仕様「CSP モード」の「`data-csp` の値が `false` / `off` / `0` なら従来の方式です。`data-csp` を書かないか、値を書かないか、ほかの値を書くと CSP モードです」
    Env.setCsp(false);
    placeScript({'data-csp': value});
    Env.detect();
    expect(Env.csp).toBe(true);
  });

  it.each([['false'], ['off'], ['0'], [' OFF ']])(
    'data-csp="%s" では無効になる',
    value => {
      // 仕様「CSP モード」の「`data-csp` の値が `false` / `off` / `0` なら従来の方式です。`data-csp` を書かないか、値を書かないか、ほかの値を書くと CSP モードです」
      Env.setCsp(true);
      placeScript({'data-csp': value});
      Env.detect();
      expect(Env.csp).toBe(false);
    },
  );

  it.each([[false], [true]])(
    'data-csp が無ければ変えない（読み込み前の設定 %s を保つ）',
    enabled => {
      // 仕様「CSP モード」の「最初の式の評価より前に `Haori.setCsp(false)` を呼びます（`Haori.setCsp(true)` で CSP モードに戻ります）」
      Env.setCsp(enabled);
      placeScript({});
      Env.detect();
      expect(Env.csp).toBe(enabled);
    },
  );

  it('接頭辞を変えたページでは変えた接頭辞で書く', () => {
    // 仕様「CSP モード」の「`data-prefix="hx"` なら `hx-csp="false"`」
    Env.setCsp(true);
    placeScript({'data-prefix': 'hx', 'hx-csp': 'false'});
    Env.detect();
    expect(Env.csp).toBe(false);
    // 後のテストのために接頭辞を戻す。
    document.querySelectorAll('script').forEach(script => script.remove());
    placeScript({'data-prefix': 'data'});
    Env.detect();
  });
});

describe('Haori.setCsp と Haori.csp', () => {
  it('setCsp で切り替え、csp で読める', () => {
    // 仕様「CSP モード」の「`Haori.setCsp(true)` で CSP モードに戻ります」「`Haori.csp` で現在のモードを読めます（CSP モードなら `true`）」
    Haori.setCsp(false);
    expect(Haori.csp).toBe(false);
    expect(Env.csp).toBe(false);
    Haori.setCsp(true);
    expect(Haori.csp).toBe(true);
    expect(Env.csp).toBe(true);
  });
});

describe('従来の方式を選んだページで new Function が CSP に拒否されたとき', () => {
  it('CSP モードを案内する error を 1 回だけ出す', () => {
    // 仕様「CSP モード」の「原因と対処（`data-csp="false"` を外す）を 1 回だけ出します。式ごとの「コンパイル失敗」の `error` も従来どおり出ます」
    Env.setCsp(false);
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'Function',
      new Proxy(Function, {
        construct() {
          throw new EvalError('unsafe-eval is not allowed');
        },
      }),
    );
    // 式ごとに別の式にして、評価関数の控えに当たらないようにする。
    Expression.evaluate('cspHintA + 1', {cspHintA: 1});
    Expression.evaluate('cspHintB + 1', {cspHintB: 1});
    const messages = error.mock.calls.map(call => call.join(' '));
    expect(
      messages.filter(message => message.includes('data-csp="false"')),
    ).toHaveLength(1);
    expect(
      messages.filter(message =>
        message.includes('Failed to compile expression'),
      ),
    ).toHaveLength(2);
  });
});
