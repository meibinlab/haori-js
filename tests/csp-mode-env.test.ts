/* @vitest-environment jsdom */
/**
 * @fileoverview CSP モードの有効化と、従来の方式で CSP に阻まれたときの案内のテスト
 *
 * 期待値の根拠は仕様「CSP モード」です。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Env from '../src/env';
import Expression from '../src/expression';
import Haori from '../src/haori';
import Log from '../src/log';

/** テストの前の CSP モード（CSP モードの設定で流す場合を壊さないため） */
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

describe('data-csp による有効化', () => {
  it.each([[''], ['true'], ['strict']])('data-csp="%s" で有効になる', value => {
    // 仕様「CSP モード」の「値を書かないか、`false` / `off` / `0` 以外を書くと有効です」
    Env.setCsp(false);
    placeScript({'data-csp': value});
    Env.detect();
    expect(Env.csp).toBe(true);
  });

  it.each([['false'], ['off'], ['0'], [' OFF ']])(
    'data-csp="%s" では無効になる',
    value => {
      // 仕様「CSP モード」の「値を書かないか、`false` / `off` / `0` 以外を書くと有効です」
      Env.setCsp(true);
      placeScript({'data-csp': value});
      Env.detect();
      expect(Env.csp).toBe(false);
    },
  );

  it.each([[false], [true]])(
    'data-csp が無ければ変えない（読み込み前の設定 %s を保つ）',
    enabled => {
      // 仕様「CSP モード」の「既定は従来の方式（`new Function`）です」「最初の式の評価より前に `Haori.setCsp(true)` を呼びます」
      Env.setCsp(enabled);
      placeScript({});
      Env.detect();
      expect(Env.csp).toBe(enabled);
    },
  );

  it('接頭辞を変えたページでは変えた接頭辞で書く', () => {
    // 仕様「CSP モード」の「`data-prefix="hx"` なら `hx-csp`」
    Env.setCsp(false);
    placeScript({'data-prefix': 'hx', 'hx-csp': ''});
    Env.detect();
    expect(Env.csp).toBe(true);
    // 後のテストのために接頭辞を戻す。
    document.querySelectorAll('script').forEach(script => script.remove());
    placeScript({'data-prefix': 'data'});
    Env.detect();
  });
});

describe('Haori.setCsp と Haori.csp', () => {
  it('setCsp で切り替え、csp で読める', () => {
    // 仕様「CSP モード」の「`Haori.setCsp(true)` を呼びます。`Haori.csp` で現在のモードを読めます」
    Haori.setCsp(true);
    expect(Haori.csp).toBe(true);
    expect(Env.csp).toBe(true);
    Haori.setCsp(false);
    expect(Haori.csp).toBe(false);
  });
});

describe('従来の方式で new Function が CSP に拒否されたとき', () => {
  it('CSP モードを案内する error を 1 回だけ出す', () => {
    // 仕様「CSP モード」の「原因と対処（`data-csp`）を 1 回だけ出します。式ごとの「コンパイル失敗」の `error` も従来どおり出ます」
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
      messages.filter(message => message.includes('data-csp')),
    ).toHaveLength(1);
    expect(
      messages.filter(message =>
        message.includes('Failed to compile expression'),
      ),
    ).toHaveLength(2);
  });
});
