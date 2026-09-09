/* @vitest-environment jsdom */
/**
 * @fileoverview 応答をファイルとして保存する宣言（`data-{event}-fetch-download`）。
 *
 * 背景: CSV のエクスポートや PDF のダウンロードは、宣言が無いためブラウザの
 * ダウンロード（`type="submit"` と `formaction`）に委ねるしかなく、その経路は
 * Haori のエラー振り分けを通らない。失敗しても画面に何も出ないため、利用者からは
 * 「押しても何も起きない」ように見える。
 *
 * 期待値の根拠は仕様「`data-fetch-download` / `data-{event}-fetch-download`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import {waitForCondition} from './helpers/async';

/** 保存に使われたアンカーの記録（ファイル名と Blob の対応） */
interface SavedFile {
  name: string;
  blob: Blob;
  /** 押された時点で解放済みだった URL の数（解放の時点を見るために控える） */
  revokedAtSave: number;
}

describe('data-{event}-fetch-download', () => {
  let container: HTMLElement | null = null;
  let saved: SavedFile[] = [];
  let revoked: string[] = [];
  let objectUrls: Map<string, Blob>;
  /** 保存を観測するリスナー（テストごとに付け外しする） */
  let saveListener: (event: Event) => void;

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    saved = [];
    revoked = [];
    objectUrls = new Map();
    // jsdom は Blob の URL を作れないため、生成と解放を差し替えて観測する。
    let sequence = 0;
    (URL as unknown as {createObjectURL: (blob: Blob) => string}).createObjectURL
      = (blob: Blob) => {
      const url = `blob:test/${++sequence}`;
      objectUrls.set(url, blob);
      return url;
    };
    (URL as unknown as {revokeObjectURL: (url: string) => void}).revokeObjectURL
      = (url: string) => {
      revoked.push(url);
    };
    // 実際の保存はブラウザの機能なので、クリックを捕まえて記録する。
    // 登録したリスナーは必ず外す。外さないとテストごとに積み上がり、1 回の保存が
    // 登録数だけ記録されて「保存された回数」を観測できなくなる。
    saveListener = event => {
      const anchor = (event.target as HTMLElement).closest?.('a[download]');
      if (anchor instanceof HTMLAnchorElement) {
        saved.push({
          name: anchor.download,
          blob: objectUrls.get(anchor.href) as Blob,
          revokedAtSave: revoked.length,
        });
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
   * 応答を返すフェッチのスパイを設定します。
   *
   * @param body 応答本文
   * @param init 応答の状態とヘッダー
   * @returns 設定したスパイ
   */
  const stubFetch = (body: string, init: ResponseInit) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(new Response(body, init)) as Promise<Response>;
    });

  /**
   * HTML をマウントして走査します。
   *
   * @param html マウントする HTML 文字列
   * @returns 走査完了の Promise
   */
  const mount = async (html: string): Promise<void> => {
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
  };

  /**
   * ボタンを押し、保存が行われるまで待ちます。
   *
   * @returns 保存の記録
   */
  const clickAndWaitForSave = async (): Promise<SavedFile> => {
    (container!.querySelector('button') as HTMLElement).click();
    await waitForCondition(() => saved.length > 0, {
      description: 'ファイルが保存される',
      maxAttempts: 40,
    });
    return saved[0];
  };

  it('Content-Disposition のファイル名で保存する', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「応答の `Content-Disposition` のファイル名」。
    stubFetch('a,b\n1,2\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="customers-2026.csv"',
      },
    });
    await mount(
      '<button data-click-fetch="/api/export" ' +
        'data-click-fetch-download="fallback.csv">出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('customers-2026.csv');
    // 1 クリックにつき 1 回だけ保存する。
    expect(saved).toHaveLength(1);
    // jsdom の Blob には text() が無いため、大きさで中身が渡ったことを見る。
    expect(file.blob.size).toBe('a,b\n1,2\n'.length);
    // 保存に使った要素を DOM に残さない。
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「保存に使う一時的な URL は、保存を始めた**次のタスクで解放します**」。
    // 押した時点ではまだ解放していない（保存が始まる前に解放すると中身を読めない）。
    expect(file.revokedAtSave).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(revoked).toEqual([Array.from(objectUrls.keys())[0]]);
  });

  it('filename* を filename より優先する', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「`filename*` の RFC 5987 形式を `filename` より優先します」。
    // 非 ASCII のファイル名はこちらにしか入らない。
    stubFetch('x', {
      status: 200,
      headers: {
        'Content-Disposition':
          'attachment; filename="fallback.csv"; ' +
          "filename*=UTF-8''%E9%A1%A7%E5%AE%A2.csv",
      },
    });
    await mount(
      '<button data-click-fetch="/api/export" ' +
        'data-click-fetch-download>出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('顧客.csv');
  });

  it('ヘッダーが無ければ属性値を使う', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「ファイル名の決定」の 2「属性値」。
    stubFetch('x', {status: 200});
    await mount(
      '<button data-click-fetch="/api/export" ' +
        'data-click-fetch-download="customers.csv">出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('customers.csv');
  });

  it('属性値が無ければ URL の末尾を使う', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「フェッチ URL の末尾のセグメント（クエリと断片を除きます）」。
    stubFetch('x', {status: 200});
    await mount(
      '<button data-click-fetch="/api/reports/summary.pdf?year=2026" ' +
        'data-click-fetch-download>出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('summary.pdf');
  });

  it('どれからも決まらなければ download という名前で保存する', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「いずれも決まらない場合は `download` という名前で保存します」。
    // 名前が空のままだと、ブラウザは保存ではなく表示へ回すことがある。
    stubFetch('x', {status: 200});
    await mount(
      '<button data-click-fetch="/api/export/" ' +
        'data-click-fetch-download>出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('download');
  });

  it('パス区切りを含むファイル名は保存先を移動させない', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「パス区切り（`/` `\`）と制御文字は、保存先を移動させないため取り除きます」。
    stubFetch('x', {
      status: 200,
      headers: {
        'Content-Disposition': 'attachment; filename="../../etc/passwd"',
      },
    });
    await mount(
      '<button data-click-fetch="/api/export" ' +
        'data-click-fetch-download>出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('....etcpasswd');
  });

  it('2xx 以外は保存せず、エラーメッセージを表示する', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「保存するのは**成功応答（2xx）だけ**です」「通常のフェッチと同じエラーの
    // 振り分け（フィールドエラー・全体エラー）に載せます」。
    stubFetch(JSON.stringify({message: '出力に失敗しました'}), {
      status: 500,
      headers: {'Content-Type': 'application/json'},
    });
    await mount(
      '<div id="scope"><button data-click-fetch="/api/export" ' +
        'data-click-fetch-download="customers.csv">出力</button></div>',
    );
    (container!.querySelector('button') as HTMLElement).click();
    const scope = () => container!.querySelector('#scope') as HTMLElement;
    await waitForCondition(
      () => scope().getAttribute('data-message') === '出力に失敗しました',
      {description: 'エラーメッセージが表示される', maxAttempts: 40},
    );
    expect(scope().getAttribute('data-message-level')).toBe('error');
    expect(saved).toHaveLength(0);
  });

  it('本文が空でも応答のとおりに保存する', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「**本文が空でも、応答のとおりに保存します。**」。0 件のエクスポートで
    // 0 バイトの CSV が返る構成があり、握りつぶすと「押しても何も起きない」に
    // なる。
    stubFetch('', {status: 200});
    await mount(
      '<button data-click-fetch="/api/export" ' +
        'data-click-fetch-download="customers.csv">出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('customers.csv');
    expect(file.blob.size).toBe(0);
  });

  it('ダウンロードを宣言すると応答を自要素へバインドしない', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「**応答をバインドしません。**」「この宣言があるときは既定 self-bind を
    // 行いません」。本文は 1 度しか読めないため、保存とバインドは両立しない。
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    stubFetch(JSON.stringify({name: '受け取った値'}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });
    await mount(
      '<button id="btn" data-click-fetch="/api/export" ' +
        'data-click-fetch-download="customers.csv">出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('customers.csv');
    const button = container!.querySelector('#btn') as HTMLElement;
    const fragment = Fragment.get(button) as ElementFragment;
    expect(fragment.getBindingData()?.name).toBeUndefined();
    // バインド先が残っていると、本文を読み終えた応答をもう一度読もうとして
    // 失敗が記録される。宣言していないのだから警告も出ない。
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('引用符の無い filename も読み取る', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「応答の `Content-Disposition` のファイル名」。引用符は必須ではないため、
    // 引用符付きだけを読むと、そのままの応答でファイル名を落とす。
    stubFetch('x', {
      status: 200,
      headers: {'Content-Disposition': 'attachment; filename=report.pdf'},
    });
    await mount(
      '<button data-click-fetch="/api/export" ' +
        'data-click-fetch-download="fallback.csv">出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('report.pdf');
  });

  it('バインド先を明示していても保存を優先し、警告を記録する', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「バインド先を明示している場合は警告を記録し、保存を優先します」。
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    stubFetch(JSON.stringify({name: '受け取った値'}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });
    await mount(
      '<div id="target"></div>' +
        '<button data-click-fetch="/api/export" ' +
        'data-click-fetch-download="customers.csv" ' +
        'data-click-bind="#target">出力</button>',
    );
    const file = await clickAndWaitForSave();
    expect(file.name).toBe('customers.csv');
    // 保存は 1 回だけ（宣言が競合しても二重に落ちない）。
    expect(saved).toHaveLength(1);
    const target = container!.querySelector('#target') as HTMLElement;
    const fragment = Fragment.get(target) as ElementFragment;
    expect(fragment.getBindingData()?.name).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    // 取り消さずに残すと、読み終えた応答をもう一度読んで失敗が記録される。
    expect(error).not.toHaveBeenCalled();
  });

  it('本文を読み取れない応答は保存の失敗として扱う', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「**保存そのものに失敗した場合は、フェッチの失敗と同じ扱いにします。**
    // 応答本文を読めない場合（通信が途中で切れたなど）」。
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const failing = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        blob: () => Promise.reject(new Error('切断されました')),
        text: () => Promise.resolve(''),
      };
      return Promise.resolve(failing as unknown as Response);
    });
    await mount(
      '<button id="btn" data-click-fetch="/api/export" ' +
        'data-click-fetch-download="customers.csv" ' +
        'data-click-fetch-state>出力</button>',
    );
    (container!.querySelector('button') as HTMLElement).click();
    await waitForCondition(() => error.mock.calls.length > 0, {
      description: '読み取れない旨が記録される',
      maxAttempts: 40,
    });
    expect(saved).toHaveLength(0);
    const button = container!.querySelector('#btn') as HTMLElement;
    const fragment = Fragment.get(button) as ElementFragment;
    await waitForCondition(
      () =>
        (fragment.getBindingData()?._fetch as {status?: string} | undefined)
          ?.status === 'error',
      {description: 'フェッチ状態が error になる', maxAttempts: 40},
    );
    expect(container!.getAttribute('data-message')).toBe(
      'ファイルを保存できませんでした',
    );
  });

  it('Blob の URL を作れない環境も保存の失敗として扱う', async () => {
    // 同節の「`Blob` の URL を生成できない環境がこれにあたります」。失敗を
    // 画面へ出さないと、要望が挙げた「押しても何も起きない」に戻ってしまう。
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    (URL as unknown as {createObjectURL: unknown}).createObjectURL = undefined;
    stubFetch('x', {status: 200});
    await mount(
      '<button id="btn" data-click-fetch="/api/export" ' +
        'data-click-fetch-download="customers.csv" ' +
        'data-click-fetch-state data-click-toast="出力しました">出力</button>',
    );
    (container!.querySelector('button') as HTMLElement).click();
    await waitForCondition(() => error.mock.calls.length > 0, {
      description: '保存できない旨が記録される',
      maxAttempts: 40,
    });
    expect(saved).toHaveLength(0);
    const button = container!.querySelector('#btn') as HTMLElement;
    const fragment = Fragment.get(button) as ElementFragment;
    await waitForCondition(
      () =>
        (fragment.getBindingData()?._fetch as {status?: string} | undefined)
          ?.status === 'error',
      {description: 'フェッチ状態が error になる', maxAttempts: 40},
    );
    expect(container!.getAttribute('data-message')).toBe(
      'ファイルを保存できませんでした',
    );
    // 同節の「**以降のアクション（ダイアログ・トースト・リダイレクトなど）は
    // 実行しません**」。
    expect(document.querySelector('.haori-toast')).toBeNull();
  });

  it('フェッチ URL が無い宣言は無視して記録する', async () => {
    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「**`data-{event}-fetch` と併せて宣言してください。** フェッチ URL が無い
    // 場合、この宣言は無視して警告を記録します」。収集値をそのままファイルに
    // すると、バインドが効かないうえ意図しないファイルが落ちる。
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    await mount(
      '<div id="target" data-bind="{}"></div>' +
        '<button id="btn" data-click-fetch-download="x.csv" ' +
        'data-click-data="a=1" data-click-bind="#target">押す</button>',
    );
    (container!.querySelector('#btn') as HTMLElement).click();
    await waitForCondition(() => warn.mock.calls.length > 0, {
      description: '宣言を無視した旨が記録される',
      maxAttempts: 40,
    });
    expect(saved).toHaveLength(0);
    // バインドは通常どおり効く（保存を優先して無効化してしまわない）。
    const target = container!.querySelector('#target') as HTMLElement;
    const fragment = Fragment.get(target) as ElementFragment;
    await waitForCondition(
      () => fragment.getBindingData()?.a === '1',
      {description: 'バインドが行われる', maxAttempts: 40},
    );
  });
});
