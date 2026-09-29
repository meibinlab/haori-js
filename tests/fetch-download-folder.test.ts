/* @vitest-environment jsdom */
/**
 * @fileoverview 保存先のフォルダへ受け取りながら書き出す宣言
 * （`data-{event}-fetch-download-folder`）。
 *
 * 背景: 数百 MB のエクスポートを応答本文ごとメモリへ載せると、利用者の PC の
 * メモリを圧迫する。ファイルではなくフォルダを先に選ばせるのは、応答の
 * `Content-Disposition` を受け取ってからファイル名を決めるため。
 *
 * 期待値の根拠は仕様「`data-fetch-download-folder` /
 * `data-{event}-fetch-download-folder`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';
import Haori from '../src/haori';
import Log from '../src/log';
import Procedure from '../src/procedure';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/** 書き出しの記録 */
interface WrittenFile {
  /** 書き込まれたチャンク */
  chunks: Uint8Array[];
  /** 書き終えたか */
  closed: boolean;
  /** 書きかけを捨てたか */
  aborted: boolean;
}

/** 差し替えた保存先フォルダ */
interface FolderStub {
  /** 実装へ渡すハンドル */
  handle: FileSystemDirectoryHandle;
  /** 既にあるものとして扱う名前 */
  existing: Set<string>;
  /** 書き出しの記録（ファイル名ごと） */
  written: Map<string, WrittenFile>;
  /** 取り除かれた名前 */
  removed: string[];
  /** フォルダを触ったときに投げる例外（許可の取り消しを模す） */
  failure: Error | null;
}

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

describe('保存先のフォルダへ書き出す', () => {
  let container: HTMLElement | null = null;
  let saved: string[] = [];
  let clock = 0;
  let pickerCalls = 0;
  /** `showDirectoryPicker` が返すもの（例外を投げる場合は throw する） */
  let pickerResult: () => Promise<FileSystemDirectoryHandle>;
  /** 保存を観測するリスナー（テストごとに付け外しする） */
  let saveListener: (event: Event) => void;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Dev.set(false);
    Env.setRuntime('embedded');
    // 覚えた保存先はページの寿命だけ残るため、テストごとに忘れさせる。
    Procedure.forgetDownloadFolder();
    saved = [];
    clock = 1_000_000;
    pickerCalls = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    (
      URL as unknown as {createObjectURL: (blob: Blob) => string}
    ).createObjectURL = () => 'blob:test/1';
    (
      URL as unknown as {revokeObjectURL: (url: string) => void}
    ).revokeObjectURL = () => {};
    // 今までどおりの保存（`<a download>`）へ落ちたことを捕まえる。
    saveListener = event => {
      const anchor = (event.target as HTMLElement).closest?.('a[download]');
      if (anchor instanceof HTMLAnchorElement) {
        saved.push(anchor.download);
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * 保存先のフォルダを模したものを作ります。
   *
   * @returns 差し替えたフォルダ
   */
  const makeFolder = (): FolderStub => {
    const stub = {
      existing: new Set<string>(),
      written: new Map<string, WrittenFile>(),
      removed: [] as string[],
      failure: null as Error | null,
    } as FolderStub;
    stub.handle = {
      getFileHandle: async (name: string, options?: {create?: boolean}) => {
        if (stub.failure) {
          throw stub.failure;
        }
        if (!options?.create) {
          // 存在の確認。無ければブラウザと同じ名前の例外を投げる。
          if (!stub.existing.has(name)) {
            const error = new Error(`${name} は見つかりません`);
            error.name = 'NotFoundError';
            throw error;
          }
          return {} as FileSystemFileHandle;
        }
        const record: WrittenFile = {chunks: [], closed: false, aborted: false};
        stub.written.set(name, record);
        return {
          createWritable: async () => ({
            write: async (chunk: Uint8Array) => {
              record.chunks.push(chunk);
            },
            close: async () => {
              record.closed = true;
            },
            abort: async () => {
              record.aborted = true;
            },
          }),
        } as unknown as FileSystemFileHandle;
      },
      removeEntry: async (name: string) => {
        stub.removed.push(name);
      },
    } as unknown as FileSystemDirectoryHandle;
    return stub;
  };

  /**
   * 保存先を選ばせる求めを差し替えます。
   *
   * @param result 求めに応じて返すもの
   */
  const stubPicker = (
    result: () => Promise<FileSystemDirectoryHandle>,
  ): void => {
    pickerResult = result;
    vi.stubGlobal('showDirectoryPicker', async () => {
      pickerCalls += 1;
      return pickerResult();
    });
  };

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
   * @param attributes ボタンへ足す宣言
   * @returns 走査完了の Promise
   */
  const mount = async (
    response: Response,
    attributes = 'data-click-fetch-download-folder',
  ): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    container = document.createElement('div');
    container.innerHTML =
      '<div id="state"></div>' +
      '<button data-click-fetch="/api/export" ' +
      'data-click-fetch-download="export.csv" ' +
      `${attributes} ` +
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

  /**
   * 書き出された中身を文字列にします。
   *
   * @param file 書き出しの記録
   * @returns 書き込まれた内容
   */
  const textOf = (file: WrittenFile): string =>
    file.chunks.map(chunk => new TextDecoder().decode(chunk)).join('');

  it('選んだフォルダへ、応答の名前で受け取りながら書き出す', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「ファイル名は今までどおりに決めます」。フォルダだけを先に選ばせるのは、
    // 応答の `Content-Disposition` を受け取ってから名前を決めるため。
    const folder = makeFolder();
    stubPicker(async () => folder.handle);
    const handle = makeStream({
      status: 200,
      headers: {
        'Content-Disposition': 'attachment; filename="customers-2026.csv"',
      },
    });
    await mount(handle.response);
    click();

    await waitForCondition(() => pickerCalls === 1, {
      description: '保存先を選ばせる',
      maxAttempts: 40,
    });
    clock += 100;
    handle.push('a,b\n');
    handle.push('1,2\n');
    handle.close();

    await waitForCondition(
      () => folder.written.get('customers-2026.csv')?.closed === true,
      {description: 'ファイルを書き終える', maxAttempts: 40},
    );
    const file = folder.written.get('customers-2026.csv')!;
    expect(textOf(file)).toBe('a,b\n1,2\n');
    // 今までどおりの保存（メモリへ載せる経路）は使わない。
    expect(saved).toHaveLength(0);
    // 受け取った量は今までと同じく参照できる。
    expect(getFetch()!.receivedBytes).toBe(8);
    expect(getFetch()!.status).toBe('success');
  });

  it('2 回目のダウンロードでは保存先を選ばせない', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「選んだフォルダは、そのページが開いている間だけ覚えます」。
    const folder = makeFolder();
    stubPicker(async () => folder.handle);
    const first = makeStream({status: 200});
    await mount(first.response);
    click();
    await waitForCondition(() => pickerCalls === 1, {
      description: '1 回目に保存先を選ばせる',
      maxAttempts: 40,
    });
    clock += 100;
    first.push('one');
    first.close();
    await waitForCondition(
      () => folder.written.get('export.csv')?.closed === true,
      {description: '1 回目を書き終える', maxAttempts: 40},
    );

    const second = makeStream({status: 200});
    vi.mocked(globalThis.fetch).mockResolvedValue(second.response);
    click();
    clock += 100;
    second.push('two');
    second.close();
    await waitForCondition(
      () => textOf(folder.written.get('export.csv')!) === 'two',
      {description: '2 回目を書き終える', maxAttempts: 40},
    );
    expect(pickerCalls).toBe(1);
  });

  it('同じ名前があれば上書きを確認し、承諾すれば書き出す', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「同じ名前のファイルが既にある場合は、上書きしてよいかを確認します」。
    const folder = makeFolder();
    folder.existing.add('export.csv');
    stubPicker(async () => folder.handle);
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => true);
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    await waitForCondition(() => confirm.mock.calls.length > 0, {
      description: '上書きを確認する',
      maxAttempts: 40,
    });
    expect(confirm).toHaveBeenCalledWith('export.csv は既にあります。上書きしますか?');
    clock += 100;
    handle.push('new');
    handle.close();
    await waitForCondition(
      () => folder.written.get('export.csv')?.closed === true,
      {description: 'ファイルを書き終える', maxAttempts: 40},
    );
    expect(textOf(folder.written.get('export.csv')!)).toBe('new');
  });

  it('上書きを取り消したら保存せず、画面にもエラーを出さない', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「取り消したときは保存せずに手続きを終えます」。失敗としては扱わない。
    const folder = makeFolder();
    folder.existing.add('export.csv');
    stubPicker(async () => folder.handle);
    vi.spyOn(window, 'confirm').mockImplementation(() => false);
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    await waitForCondition(() => getFetch()?.status === 'success', {
      description: '通信の成功が入る',
      maxAttempts: 40,
    });
    // 書き出しにも、今までどおりの保存にも進まない。
    expect(folder.written.size).toBe(0);
    expect(saved).toHaveLength(0);
    expect(document.querySelectorAll('.haori-message-error')).toHaveLength(0);
  });

  it('保存先の選択を取り消したら、取得を始めない', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「保存先の選択を取り消したときは、取得を始めずに手続きを終えます」。
    stubPicker(async () => {
      const error = new Error('利用者が取り消した');
      error.name = 'AbortError';
      throw error;
    });
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    await waitForCondition(() => pickerCalls === 1, {
      description: '保存先を選ばせる',
      maxAttempts: 40,
    });
    await waitForDomSettled();
    await waitForDomSettled();
    // フェッチを始める前なので `_fetch` も注入しない。
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(getFetch()).toBeUndefined();
    expect(saved).toHaveLength(0);
  });

  it('保存先を選ばせられない環境では今までどおり保存する', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「ブラウザが保存先の選択に対応していない」。
    vi.stubGlobal('showDirectoryPicker', undefined);
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    clock += 100;
    handle.push('abc');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: '今までどおり保存される',
      maxAttempts: 40,
    });
    expect(saved[0]).toBe('export.csv');
  });

  it('選択を断られたら今までどおり保存する', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「利用者の操作の直後ではないとして、ブラウザが求めを断った」。
    stubPicker(async () => {
      const error = new Error('操作の直後ではない');
      error.name = 'SecurityError';
      throw error;
    });
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    clock += 100;
    handle.push('abc');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: '今までどおり保存される',
      maxAttempts: 40,
    });
    expect(pickerCalls).toBe(1);
  });

  it('覚えたフォルダへ書けなくなっていたら今までどおり保存する', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「覚えていたフォルダへ書き込めなくなっていた」。応答本文はまだ読んでいない
    // ので、メモリへ載せる経路へ落とせる。
    const folder = makeFolder();
    folder.failure = Object.assign(new Error('許可がありません'), {
      name: 'NotAllowedError',
    });
    stubPicker(async () => folder.handle);
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    clock += 100;
    handle.push('abc');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: '今までどおり保存される',
      maxAttempts: 40,
    });
    expect(folder.written.size).toBe(0);
  });

  it('書き込みが途中で切れたら、書きかけを捨てて作ったファイルを取り除く', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「保存に失敗したときは、書きかけを残しません」。
    const folder = makeFolder();
    stubPicker(async () => folder.handle);
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    await waitForCondition(() => folder.written.has('export.csv'), {
      description: 'ファイルを作る',
      maxAttempts: 40,
    });
    clock += 100;
    handle.push('abc');
    handle.fail(new Error('切断'));

    await waitForCondition(() => getFetch()?.status === 'error', {
      description: '失敗が注入される',
      maxAttempts: 40,
    });
    const file = folder.written.get('export.csv')!;
    expect(file.closed).toBe(false);
    expect(file.aborted).toBe(true);
    expect(folder.removed).toEqual(['export.csv']);
  });

  it('既にあったファイルへの上書きに失敗しても、そのファイルを取り除かない', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「既にあったファイルへ上書きしていた場合は、元の内容が残ります」。
    const folder = makeFolder();
    folder.existing.add('export.csv');
    stubPicker(async () => folder.handle);
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    await waitForCondition(() => folder.written.has('export.csv'), {
      description: 'ファイルを開く',
      maxAttempts: 40,
    });
    clock += 100;
    handle.push('abc');
    handle.fail(new Error('切断'));

    await waitForCondition(() => getFetch()?.status === 'error', {
      description: '失敗が注入される',
      maxAttempts: 40,
    });
    expect(folder.written.get('export.csv')!.aborted).toBe(true);
    expect(folder.removed).toHaveLength(0);
  });

  it('保存の宣言が無ければ、この宣言を無視して警告を記録する', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「保存の宣言が無い場合、この宣言は無視して警告を記録します」。
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    const folder = makeFolder();
    stubPicker(async () => folder.handle);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"name":"鈴木"}', {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }) as Response,
    );
    container = document.createElement('div');
    container.innerHTML =
      '<div id="state"></div>' +
      '<button data-click-fetch="/api/export" ' +
      'data-click-fetch-download-folder ' +
      'data-click-fetch-state="#state">出力</button>';
    document.body.appendChild(container);
    await Core.scan(container);
    click();

    await waitForCondition(() => getFetch()?.status === 'success', {
      description: '通常のフェッチとして終わる',
      maxAttempts: 40,
    });
    expect(warn).toHaveBeenCalled();
    expect(pickerCalls).toBe(0);
    expect(folder.written.size).toBe(0);
  });

  it('保存先を選ばせられない環境では、その旨をログへ記録する', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「落ちたことは開発モードのログへ記録します」。断られた場合と区別できないと、
    // 画面の作り手が原因を切り分けられない。
    const info = vi.spyOn(Log, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('showDirectoryPicker', undefined);
    const handle = makeStream({status: 200});
    await mount(handle.response);
    click();

    clock += 100;
    handle.push('abc');
    handle.close();
    await waitForCondition(() => saved.length === 1, {
      description: '今までどおり保存される',
      maxAttempts: 40,
    });
    expect(
      info.mock.calls.some(call =>
        String(call[1]).includes('この環境では保存先のフォルダを選ばせられない'),
      ),
    ).toBe(true);
  });

  it('本文をストリームとして読めないときは今までどおり保存する', async () => {
    // 書き出しは応答本文を読み進められることが前提で、読めないなら選んだ
    // フォルダへ書きようがない。仕様「`data-fetch-download-folder` /
    // `data-{event}-fetch-download-folder`」の「今までどおりの保存へ落とす場合」。
    const folder = makeFolder();
    stubPicker(async () => folder.handle);
    const response = new Response('abcdefghi', {status: 200});
    Object.defineProperty(response, 'body', {value: null});
    await mount(response);
    click();

    await waitForCondition(() => saved.length === 1, {
      description: '今までどおり保存される',
      maxAttempts: 40,
    });
    expect(folder.written.size).toBe(0);
  });

  it('書けなくなったフォルダは忘れ、次は選び直させる', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「覚えていたフォルダへ書き込めなくなっていた」。忘れないと、以降のすべての
    // ダウンロードが今までどおりの保存へ落ち続ける。
    const broken = makeFolder();
    broken.failure = Object.assign(new Error('許可がありません'), {
      name: 'NotAllowedError',
    });
    const fresh = makeFolder();
    let next = broken;
    stubPicker(async () => next.handle);
    const first = makeStream({status: 200});
    await mount(first.response);
    click();
    clock += 100;
    first.push('abc');
    first.close();
    await waitForCondition(() => saved.length === 1, {
      description: '1 回目は今までどおり保存される',
      maxAttempts: 40,
    });

    next = fresh;
    const second = makeStream({status: 200});
    vi.mocked(globalThis.fetch).mockResolvedValue(second.response);
    click();
    clock += 100;
    second.push('def');
    second.close();
    await waitForCondition(
      () => fresh.written.get('export.csv')?.closed === true,
      {description: '2 回目は選び直したフォルダへ書き出す', maxAttempts: 40},
    );
    expect(pickerCalls).toBe(2);
  });

  it('上書きを取り消したら、以降のアクションを実行しない', async () => {
    // 仕様「`data-fetch-download-folder` / `data-{event}-fetch-download-folder`」の
    // 「以降のアクション（ダイアログ・トースト・リダイレクトなど）は実行しません」。
    const toast = vi
      .spyOn(Haori, 'toast')
      .mockImplementation(() => Promise.resolve());
    const folder = makeFolder();
    folder.existing.add('export.csv');
    stubPicker(async () => folder.handle);
    vi.spyOn(window, 'confirm').mockImplementation(() => false);
    const handle = makeStream({status: 200});
    await mount(
      handle.response,
      'data-click-fetch-download-folder data-click-toast="保存しました"',
    );
    click();

    await waitForCondition(() => getFetch()?.status === 'success', {
      description: '通信の成功が入る',
      maxAttempts: 40,
    });
    await waitForDomSettled();
    expect(toast).not.toHaveBeenCalled();
  });
});
