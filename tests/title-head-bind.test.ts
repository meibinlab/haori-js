/* @vitest-environment jsdom */
/**
 * @fileoverview `<head>` / `<title>` への実行時バインドの回帰テスト。
 *
 * 背景: 公開ページの `<title>` に会社名を実行時取得（data-fetch）で表示したい
 * という要望に対し、`<head>` がスキャン・監視対象であり、`<title>` 自身に
 * `data-bind` / `data-fetch` を付与すればテキストの {{}} 補間が機能することを
 * 保証する。あわせて、兄弟要素のスコープが継承されないこと、`data-fetch-bind`
 * の対象セレクタが `<body>` 配下限定で `<head>` 内要素を狙えないことも固定する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('<head> / <title> への実行時バインド', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    await import('../src/observer');
  });

  afterEach(() => {
    document.head.querySelectorAll('title,meta').forEach(node => node.remove());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('data-bind を付けた <title> 自身のテキストが {{}} 補間される', async () => {
    document.head.innerHTML =
      `<title data-bind='{"company":"明文堂"}'>{{company}} - ログイン</title>`;
    await Core.scan(document.head);
    await waitForDomSettled();
    expect(document.title).toBe('明文堂 - ログイン');
  });

  it('data-fetch を付けた <title> は応答を self-bind してテキストへ反映する', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response('{"company":"明文堂株式会社"}', {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>,
    );
    document.head.innerHTML =
      `<title data-bind='{"company":""}' data-fetch="http://api.test/site">{{company}} - ログイン</title>`;
    // 実際の初期化（Observer.init）と同じ Core.scan(document.head) 経路。
    await Core.scan(document.head);
    await waitForCondition(() => document.title.includes('明文堂株式会社'), {
      description: 'title reflects fetched company',
    });
    expect(document.title).toBe('明文堂株式会社 - ログイン');
  });

  it('data-fetch-arg でネストキーに受けてテキストへ反映する', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response('{"company":"明文堂","unit":"出版部"}', {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>,
    );
    document.head.innerHTML =
      `<title data-bind='{"site":{}}' data-fetch="http://api.test/site" data-fetch-arg="site">{{site.company}} / {{site.unit}}</title>`;
    await Core.scan(document.head);
    await waitForCondition(() => document.title.includes('明文堂'), {
      description: 'title reflects nested company',
    });
    expect(document.title).toBe('明文堂 / 出版部');
  });

  it('兄弟要素（meta）のスコープは <title> に継承されない', async () => {
    document.head.innerHTML =
      `<meta data-bind='{"company":"継承元"}'>` +
      `<title>{{company}} - サイト</title>`;
    await Core.scan(document.head);
    await waitForDomSettled();
    // 兄弟のスコープは届かないため未解決のまま（補間されない）。
    expect(document.title).toContain('{{company}}');
  });

  it('data-fetch-bind で <head> 内の <title> はバインド先に指定できない', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response('{"company":"明文堂株式会社"}', {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>,
    );
    // バインド先解決エラーのログを握りつぶし、出力有無で検証する。
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    document.head.innerHTML =
      `<title id="page-title" data-bind='{"company":""}'>{{company}} - ログイン</title>`;
    const fetcher = document.createElement('div');
    fetcher.setAttribute('data-fetch', 'http://api.test/site');
    fetcher.setAttribute('data-fetch-bind', '#page-title');
    document.body.appendChild(fetcher);

    await Core.scan(document.head);
    await Core.scan(document.body);
    await waitForDomSettled();

    // フェッチ自体は走るが、バインド先（head 内 #page-title）は <body> 配下から
    // 見つからないため反映されず、title は種まき値のまま。
    expect(fetchSpy).toHaveBeenCalled();
    // document.title は前後空白をトリムするため、種まき値（空文字）のままなら
    // 「- ログイン」となる（フェッチ応答は反映されない）。
    expect(document.title).toBe('- ログイン');
    expect(
      errorSpy.mock.calls.some(args =>
        args.some(
          arg => typeof arg === 'string' && arg.includes('Bind element not found'),
        ),
      ),
    ).toBe(true);
  });
});
