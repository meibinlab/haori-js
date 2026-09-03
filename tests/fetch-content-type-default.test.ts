/* @vitest-environment jsdom */
/**
 * @fileoverview `Content-Type` の既定値と `data-fetch-headers` の指定の優先順位。
 *
 * 既定値は宣言を補うものであって、上書きするものではありません。仕様
 * 「`data-{event}-fetch-content-type`」は、メソッドを宣言しない場合について
 * 「`data-{event}-fetch-headers` で指定した値はそのまま残ります」と定めています。
 * メソッドを宣言したときだけ黙って上書きすると、同じ宣言が消える構成と残る構成に
 * 分かれます。
 *
 * 期待値の根拠は仕様「`data-{event}-fetch-content-type`」の「優先順位」と、同節の
 * 「デフォルト値」。
 *
 * ボディを作る経路（POST に payload がある場合）は、作ったボディの形式に合わせて
 * `Content-Type` を決め直します。ここで見るのはその手前、既定値を補う段階なので、
 * ボディを持たない構成で観測します。
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import Dev from '../src/dev';
import Env from '../src/env';
import Log from '../src/log';
import {waitForCondition} from './helpers/async';

/**
 * スパイが呼ばれるまで待機します。
 *
 * @param spy 対象のスパイ
 * @param description タイムアウト時の説明
 * @returns 呼び出しが観測されたら解決される Promise
 */
async function waitForCall(
  spy: {mock: {calls: unknown[][]}},
  description: string,
): Promise<void> {
  await waitForCondition(() => spy.mock.calls.length > 0, {
    description,
    maxAttempts: 30,
  });
}

describe('Content-Type の既定値と data-fetch-headers', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    await import('../src/observer');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * `data-fetch` を宣言した要素を置いて、実際に渡されたヘッダーを取り出します。
   *
   * @param attributes 対象要素へ書く属性
   * @returns fetch へ渡されたヘッダー
   */
  const collectHeaders = async (
    attributes: Record<string, string>,
  ): Promise<Headers> => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const src = document.createElement('div');
    Object.entries(attributes).forEach(([name, value]) => {
      src.setAttribute(name, value);
    });
    container.appendChild(src);

    await waitForCall(
      fetchSpy as unknown as {mock: {calls: unknown[][]}},
      'fetch が呼ばれる',
    );
    const calls = (fetchSpy as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    const options = calls[calls.length - 1][1] as RequestInit;
    container.remove();
    // 実際に渡るヘッダーは Headers インスタンス。名前の大小を区別しないため、
    // 綴り違いで 2 つ入った場合はカンマ区切りに結合された値として観測できる。
    return new Headers(options.headers as HeadersInit | undefined);
  };

  it('GET でも data-fetch-headers の Content-Type を残す', async () => {
    // 仕様「`data-{event}-fetch-content-type`」の「`data-{event}-fetch-headers` で
    // 指定した値はそのまま残ります」。メソッドを宣言しないときは残るのに、GET を
    // 宣言したときだけ既定値で上書きされるのは、同じ宣言が構成によって消えること
    // を意味する。
    const headers = await collectHeaders({
      'data-fetch': 'http://api.test/get',
      'data-fetch-method': 'GET',
      'data-fetch-headers': '{"Content-Type": "text/plain"}',
    });
    expect(headers.get('Content-Type')).toBe('text/plain');
  });

  it('綴りが違う content-type の指定も既定値で上書きしない', async () => {
    // HTTP のヘッダー名は大小を区別しない（RFC 9110）。`content-type` と書いた
    // 指定も Content-Type の宣言なので、既定値で上書きしない。区別すると、同じ
    // 意味の値が 2 つ入り、結合された `text/plain, application/json` を送る。
    const headers = await collectHeaders({
      'data-fetch': 'http://api.test/post',
      'data-fetch-method': 'POST',
      'data-fetch-headers': '{"content-type": "text/plain"}',
    });
    expect(headers.get('content-type')).toBe('text/plain');
  });

  it('指定が無ければ GET の既定値を入れる', async () => {
    // 対照。仕様「`data-{event}-fetch-content-type`」の「デフォルト値」の
    // 「GET/HEAD/OPTIONS: `application/x-www-form-urlencoded`」。
    const headers = await collectHeaders({
      'data-fetch': 'http://api.test/get',
      'data-fetch-method': 'GET',
    });
    expect(headers.get('Content-Type')).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('指定が無ければ POST の既定値を入れる', async () => {
    // 対照。仕様「`data-{event}-fetch-content-type`」の「デフォルト値」の
    // 「その他: `application/json`」。
    const headers = await collectHeaders({
      'data-fetch': 'http://api.test/post',
      'data-fetch-method': 'POST',
    });
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('data-fetch-content-type の明示は headers の指定より優先する', async () => {
    // 仕様「`data-{event}-fetch-content-type`」の「優先順位」の「`data-{event}-fetch-content-type`
    // の明示 > `data-{event}-fetch-headers` の指定 > デフォルト値」。
    const headers = await collectHeaders({
      'data-fetch': 'http://api.test/get',
      'data-fetch-method': 'GET',
      'data-fetch-headers': '{"Content-Type": "text/plain"}',
      'data-fetch-content-type': 'application/xml',
    });
    expect(headers.get('Content-Type')).toBe('application/xml');
  });

  it('オブジェクトでない data-fetch-headers は設定せず記録する', async () => {
    // 宣言はヘッダー名と値のオブジェクト。配列をそのまま設定すると、添字が
    // ヘッダー名になった `0: a` のような宣言になり、送信内容が黙って壊れる。
    // 解析の失敗と同じく宣言の誤りなので、設定せずに記録する。
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    const headers = await collectHeaders({
      'data-fetch': 'http://api.test/get',
      'data-fetch-method': 'GET',
      'data-fetch-headers': '["a", "b"]',
    });
    expect(headers.get('0')).toBeNull();
    expect(headers.get('1')).toBeNull();
    // 既定値の扱いは宣言が無い場合と同じ。
    expect(headers.get('Content-Type')).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(warn).toHaveBeenCalled();
  });

  it('綴りが違う指定があっても明示が優先する', async () => {
    // 明示が最優先という規則は、`data-{event}-fetch-headers` の綴りが違っても
    // 変わらない。綴りで区別すると両方が残り、結合された値を送ってしまう。
    const headers = await collectHeaders({
      'data-fetch': 'http://api.test/get',
      'data-fetch-method': 'GET',
      'data-fetch-headers': '{"content-type": "text/plain"}',
      'data-fetch-content-type': 'application/xml',
    });
    expect(headers.get('Content-Type')).toBe('application/xml');
  });
});
