/* @vitest-environment jsdom */
/**
 * @fileoverview ダウンロードの受信の進み具合（`_fetch.receivedBytes` /
 * `_fetch.totalBytes`）。
 *
 * 背景: 数百 MB のエクスポートは受け取りに数分かかる。`loading` だけでは止まって
 * いるのか進んでいるのかが分からないため、利用者は待ちきれずに画面を離れたり、
 * ボタンを何度も押したりする。
 *
 * 期待値の根拠は仕様「`data-fetch-state` / `data-{event}-fetch-state`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/** 受け取りを 1 チャンクずつ進めるための操作口 */
interface StreamHandle {
  /** フェッチが返す応答 */
  response: Response;
  /** 本文を 1 チャンク送る */
  push(text: string): void;
  /** 本文の終わりを告げる */
  close(): void;
  /** 受け取りを途中で切る */
  fail(error: unknown): void;
}

describe('ダウンロードの受信の進み具合', () => {
  let container: HTMLElement | null = null;
  let saved: Blob[] = [];
  let objectUrls: Map<string, Blob>;
  let clock = 0;
  /** 保存を観測するリスナー（テストごとに付け外しする） */
  let saveListener: (event: Event) => void;

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    saved = [];
    objectUrls = new Map();
    clock = 1_000_000;
    // 間引きの判定を実時間から切り離す。時計を進めるのはテストの側。
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    // jsdom は Blob の URL を作れないため、生成と解放を差し替える。
    let sequence = 0;
    (
      URL as unknown as {createObjectURL: (blob: Blob) => string}
    ).createObjectURL = (blob: Blob) => {
      const url = `blob:test/${++sequence}`;
      objectUrls.set(url, blob);
      return url;
    };
    (
      URL as unknown as {revokeObjectURL: (url: string) => void}
    ).revokeObjectURL = () => {};
    // 実際の保存はブラウザの機能なので、クリックを捕まえて記録する。
    saveListener = event => {
      const anchor = (event.target as HTMLElement).closest?.('a[download]');
      if (anchor instanceof HTMLAnchorElement) {
        saved.push(objectUrls.get(anchor.href) as Blob);
      }
    };
    document.addEventListener('click', saveListener);
    await import('../src/observer');
  });

  afterEach(() => {
    document.removeEventListener('click', saveListener);
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * 本文をチャンクごとに送れる応答を作ります。
   *
   * @param init 応答の状態とヘッダー
   * @returns 受け取りを進めるための操作口
   */
  const makeStream = (init: ResponseInit): StreamHandle => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(source) {
        controller = source;
      },
    });
    const encoder = new TextEncoder();
    return {
      response: new Response(stream, init),
      push: text => controller.enqueue(encoder.encode(text)),
      close: () => controller.close(),
      fail: error => controller.error(error),
    };
  };

  /**
   * ダウンロードの画面をマウントし、応答を差し替えます。
   *
   * @param response フェッチが返す応答
   * @returns 走査完了の Promise
   */
  const mount = async (response: Response): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    container = document.createElement('div');
    container.innerHTML =
      '<div id="state"></div>' +
      '<button data-click-fetch="/api/export" ' +
      'data-click-fetch-download="export.csv" ' +
      'data-click-fetch-state="#state">出力</button>';
    document.body.appendChild(container);
    await Core.scan(container);
  };

  /**
   * 注入された `_fetch` を読み取ります。
   *
   * @returns `_fetch` の中身（未注入なら undefined）
   */
  const getFetch = (): Record<string, unknown> | undefined =>
    (
      Fragment.get(
        container!.querySelector('#state') as HTMLElement,
      ) as ElementFragment
    ).getBindingData()._fetch as Record<string, unknown> | undefined;

  /** ボタンを押します。 */
  const click = (): void => {
    (container!.querySelector('button') as HTMLElement).click();
  };

  it('受け取ったバイト数と全体のバイト数を _fetch へ入れる', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「`receivedBytes` はフェッチを始めた時点で `0` です」。
    const handle = makeStream({status: 200, headers: {'Content-Length': '9'}});
    await mount(handle.response);
    click();

    // 全体の量は応答のヘッダーを受け取った時点で決まる。
    await waitForCondition(() => getFetch()?.totalBytes === 9, {
      description: '全体のバイト数が入る',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(0);
    expect(getFetch()!.status).toBe('loading');

    clock += 100;
    handle.push('abcde');
    await waitForCondition(() => getFetch()?.receivedBytes === 5, {
      description: '受け取った分が入る',
      maxAttempts: 40,
    });
    // 受け取っている間は `loading` のままにする。
    expect(getFetch()!.status).toBe('loading');

    handle.push('fghi');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「保存が終わったあと（`status="success"`）と、保存に失敗したとき
    // （`status="error"`）も、最後に受け取った量が残ります」。
    expect(getFetch()!.status).toBe('success');
    expect(getFetch()!.receivedBytes).toBe(9);
    expect(getFetch()!.totalBytes).toBe(9);
  });

  it('100 ミリ秒の間は間引き、受け取りの完了時には最終値を入れる', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「更新は 100 ミリ秒を下限に間引きます」。
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    await waitForCondition(() => getFetch()?.status === 'loading', {
      description: '受け取りが始まる',
      maxAttempts: 40,
    });
    clock += 100;
    handle.push('abcde');
    await waitForCondition(() => getFetch()?.receivedBytes === 5, {
      description: '間引きを超えた分が入る',
      maxAttempts: 40,
    });

    // 時計を進めずに送った分は間引かれ、注入されない。
    handle.push('fg');
    await waitForDomSettled();
    await waitForDomSettled();
    expect(getFetch()!.receivedBytes).toBe(5);

    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「受け取りの完了時には必ず最終値を入れます」。
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(7);
  });

  it('Content-Length が無ければ totalBytes は null のまま', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「ヘッダーが無い場合（チャンク転送）は `null` のままです」。
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    clock += 100;
    handle.push('abcde');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(5);
    expect(getFetch()!.totalBytes).toBeNull();
  });

  it('圧縮された転送では totalBytes を入れない', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「圧縮された転送では `totalBytes` を入れません」。`Content-Length` は
    // 圧縮後のバイト数で、受け取れるのは展開後のバイト数なので突き合わせられない。
    const handle = makeStream({
      status: 200,
      headers: {'Content-Length': '20', 'Content-Encoding': 'gzip'},
    });
    await mount(handle.response);
    click();

    clock += 100;
    handle.push('abcdefghi');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(9);
    expect(getFetch()!.totalBytes).toBeNull();
  });

  it('受け取った量が全体の量を追い越したら totalBytes を捨てる', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「`receivedBytes` が `totalBytes` を追い越した時点で `totalBytes` を
    // `null` へ落とします」。別オリジンでは `Content-Encoding` を読めないため、
    // 事前には判断できない。
    const handle = makeStream({status: 200, headers: {'Content-Length': '4'}});
    await mount(handle.response);
    click();

    await waitForCondition(() => getFetch()?.totalBytes === 4, {
      description: '全体のバイト数が入る',
      maxAttempts: 40,
    });
    clock += 100;
    handle.push('abcdefghi');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(9);
    expect(getFetch()!.totalBytes).toBeNull();
  });

  it('ダウンロード以外のフェッチには入れない', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「ダウンロード以外のフェッチには入りません」。進み具合を数えるには応答
    // 本文を読み進める必要があり、読み進めた本文はバインドのために読み直せない。
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"name":"鈴木"}', {
        status: 200,
        headers: {'Content-Type': 'application/json', 'Content-Length': '21'},
      }) as Response,
    );
    container = document.createElement('div');
    container.innerHTML =
      '<div id="state" data-fetch="/api/user" data-fetch-state></div>';
    document.body.appendChild(container);
    await Core.scan(container);

    await waitForCondition(() => getFetch()?.status === 'success', {
      description: '成功状態が注入される',
      maxAttempts: 40,
    });
    expect('receivedBytes' in getFetch()!).toBe(false);
    expect('totalBytes' in getFetch()!).toBe(false);
  });

  it('本文をストリームとして読めない環境では完了時に一度だけ入れる', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「応答本文をストリームとして読めない環境では、受け取り終えた時点で
    // `receivedBytes` に全体のバイト数が一度だけ入ります」。
    const response = new Response('abcdefghi', {
      status: 200,
      headers: {'Content-Length': '9'},
    });
    Object.defineProperty(response, 'body', {value: null});
    await mount(response);
    click();

    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(9);
    expect(getFetch()!.totalBytes).toBe(9);
  });

  it('受け取りが途中で切れたら失敗として出し、受け取った量を残す', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「保存そのものに失敗した場合は、画面へ失敗として出します」。通信は成功して
    // いるため `statusCode` は応答のステータスのままにする。
    const handle = makeStream({status: 200, headers: {'Content-Length': '9'}});
    await mount(handle.response);
    click();

    await waitForCondition(() => getFetch()?.totalBytes === 9, {
      description: '全体のバイト数が入る',
      maxAttempts: 40,
    });
    clock += 100;
    handle.push('abcde');
    await waitForCondition(() => getFetch()?.receivedBytes === 5, {
      description: '受け取った分が入る',
      maxAttempts: 40,
    });
    handle.fail(new Error('切断'));

    await waitForCondition(() => getFetch()?.status === 'error', {
      description: '失敗が注入される',
      maxAttempts: 40,
    });
    expect(saved).toHaveLength(0);
    expect(getFetch()!.statusCode).toBe(200);
    expect(getFetch()!.receivedBytes).toBe(5);
  });

  it('Content-Length が数として読めなければ totalBytes は null', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「値が 0 以上の整数として読めない場合は `null` のままです」。
    const handle = makeStream({status: 200, headers: {'Content-Length': 'abc'}});
    await mount(handle.response);
    click();

    clock += 100;
    handle.push('abcde');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(5);
    expect(getFetch()!.totalBytes).toBeNull();
  });

  it('保存する Blob に応答の Content-Type を持たせる', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「保存する `Blob` には応答の `Content-Type` を持たせます」。
    const handle = makeStream({
      status: 200,
      headers: {'Content-Type': 'text/csv'},
    });
    await mount(handle.response);
    click();

    clock += 100;
    handle.push('a,b\n1,2\n');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(saved[0].type).toBe('text/csv');
    expect(saved[0].size).toBe(8);
  });

  it('ストリームとして読めない環境でも、追い越したら totalBytes を捨てる', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「`receivedBytes` が `totalBytes` を追い越した時点で `totalBytes` を
    // `null` へ落とします」。読めない環境でも突き合わせは同じ。
    const response = new Response('abcdefghi', {
      status: 200,
      headers: {'Content-Length': '4'},
    });
    Object.defineProperty(response, 'body', {value: null});
    await mount(response);
    click();

    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(9);
    expect(getFetch()!.totalBytes).toBeNull();
  });

  it('Content-Length が空なら totalBytes は null', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「値が 0 以上の整数として読めない場合は `null` のままです」。空の値を数へ
    // 直すと 0 になり、「全体が 0 バイト」という誤った表示になる。
    const handle = makeStream({status: 200, headers: {'Content-Length': ''}});
    await mount(handle.response);
    click();

    // 本文が空のままでも保存する。受け取った量が 0 なので、追い越しで捨てたのか
    // 初めから入れなかったのかを取り違えずに見られる。
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(0);
    expect(getFetch()!.totalBytes).toBeNull();
  });

  it('受け取ったチャンクは、そのつど Blob へ移す', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「受け取ったそばから `Blob` へ移すため JavaScript が全量を抱えることは
    // ありません」。積み上げてから 1 度に作ると、巨大な出力で利用者の PC の
    // メモリを圧迫する。
    const RealBlob = globalThis.Blob;
    const partCounts: number[] = [];
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          partCounts.push(parts?.length ?? 0);
          super(parts, options);
        }
      },
    );
    try {
      const handle = makeStream({status: 200});
      await mount(handle.response);
      click();

      clock += 100;
      handle.push('abc');
      clock += 100;
      handle.push('de');
      handle.close();
      await waitForCondition(() => saved.length === 1, {
        description: 'ファイルが保存される',
        maxAttempts: 40,
      });
      // チャンク 2 つがその場で 1 つずつ `Blob` になり、最後にまとめる。
      expect(partCounts).toEqual([1, 1, 2]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('2 回目のダウンロードは 0 から数え直す', async () => {
    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「`receivedBytes` はフェッチを始めた時点で `0` です」。前回の受信量が
    // 残ると、2 回目のエクスポートが初めから終わりかけに見える。
    const first = makeStream({status: 200});
    await mount(first.response);
    click();
    clock += 100;
    first.push('abcde');
    first.close();
    await waitForCondition(() => saved.length === 1, {
      description: '1 回目が保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(5);

    const second = makeStream({status: 200});
    vi.mocked(globalThis.fetch).mockResolvedValue(second.response);
    click();
    clock += 100;
    second.push('fg');
    second.close();
    await waitForCondition(() => saved.length === 2, {
      description: '2 回目が保存される',
      maxAttempts: 40,
    });
    expect(getFetch()!.receivedBytes).toBe(2);
  });
});
