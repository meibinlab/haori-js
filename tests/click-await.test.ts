/* @vitest-environment jsdom */
/**
 * @fileoverview クリックの完了待ち（`data-{event}-click-await`）。
 *
 * 背景: 一覧の並べ替えのように「移動元と移動先の 2 件を順に更新し、前段が失敗
 * したら後段を送らない」構成は、`data-{event}-click` だけでは書けなかった。
 * 複数の対象は直列にクリックされるが、起動された手続きの完了を待たないため、
 * 順序も保証されず、失敗しても後続が止まらない。
 *
 * 期待値の根拠は仕様「`data-{event}-click-await`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Haori from '../src/haori';
import Log from '../src/log';
import {waitForCondition, waitForIdle} from './helpers/async';

/**
 * 記録した通信の順序（開始と終了を並べる）。
 *
 * テストごとに作り直し、スタブは**作られた時点の配列**へ書きます。遅れて届いた
 * 応答は前のテストの配列へ入るため、次のテストの観測へ混ざりません（実際に CI で
 * 遅れた `end` が次のテストへ混ざって落ちました）。
 */
let log: string[] = [];

describe('data-{event}-click-await', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    log = [];
    await import('../src/observer');
  });

  afterEach(() => {
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * URL ごとに応答と遅延を決めるフェッチのスパイを設定します。
   *
   * @param plan URL の一部と、その応答（状態と遅延）の対応
   * @returns 設定したスパイ
   */
  const stubFetch = (
    plan: Record<string, {status: number; delay: number}>,
  ): ReturnType<typeof vi.spyOn> => {
    // このテストの配列を捕まえる（後で `log` が差し替わっても書き先は変わらない）。
    const sink = log;
    return vi.spyOn(globalThis, 'fetch').mockImplementation((input: unknown) => {
      const url = String(input);
      const key = Object.keys(plan).find(part => url.includes(part)) as string;
      const {status, delay} = plan[key];
      sink.push(`start:${key}`);
      return new Promise(resolve => {
        setTimeout(() => {
          sink.push(`end:${key}`);
          resolve(
            new Response(JSON.stringify({}), {
              status,
              headers: {'Content-Type': 'application/json'},
            }),
          );
        }, delay);
      }) as Promise<Response>;
    }) as ReturnType<typeof vi.spyOn>;
  };

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

  /** 2 件の更新を順に起動する構成（1 件目が遅く、2 件目が速い） */
  const TWO_UPDATERS =
    '<span hidden class="updater" data-click-fetch="/api/first"' +
    ' data-click-fetch-method="PUT"></span>' +
    '<span hidden class="updater" data-click-fetch="/api/second"' +
    ' data-click-fetch-method="PUT"></span>';

  it('宣言した順に直列で発行する', async () => {
    // 仕様「`data-{event}-click-await`」の「宣言した順に 1 件ずつ待つため、複数の
    // リクエストが**直列**になり」。1 件目を遅くしても順序が入れ替わらないこと
    // で、待っていることを観測する。
    stubFetch({
      '/api/first': {status: 200, delay: 30},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        TWO_UPDATERS,
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(log).toEqual([
      'start:/api/first',
      'end:/api/first',
      'start:/api/second',
      'end:/api/second',
    ]);
  });

  it('宣言が無ければ完了を待たない（従来の動作）', async () => {
    // 仕様「`data-{event}-click`」の「起動された手続き（fetch 等）は**非同期**で、
    // 呼び出し元はその完了を待ちません」。待たないため、遅い 1 件目の完了より
    // 先に 2 件目が始まる。
    stubFetch({
      '/api/first': {status: 200, delay: 30},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater">↑</button>' + TWO_UPDATERS,
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(log.slice(0, 2)).toEqual(['start:/api/first', 'start:/api/second']);
    // 飛行中の通信を残したまま終わらない（遅れて届いた記録が次のテストの観測へ
    // 混ざる）。
    await waitForCondition(() => log.includes('end:/api/first'), {
      description: '遅い方の更新が終わる',
      maxAttempts: 60,
      delayMs: 20,
    });
  });

  it('失敗したら後続をクリックしない', async () => {
    // 仕様「`data-{event}-click-await`」の「**失敗したら後続の対象をクリック
    // しません。** 失敗とは、HTTP エラー応答（4xx/5xx）…です」。
    stubFetch({
      '/api/first': {status: 500, delay: 0},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        TWO_UPDATERS,
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(log).toEqual(['start:/api/first', 'end:/api/first']);
  });

  it('失敗したら呼び出し元の後続アクションも実行しない', async () => {
    // 仕様「`data-{event}-click-await`」の「失敗で止めた場合、**呼び出し元の
    // 手続きも以降のアクションを実行しません**」。並べ替えが片方しか通って
    // いないのに「保存しました」と出しては困る。
    const openDialog = vi
      .spyOn(Haori, 'openDialog')
      .mockResolvedValue(undefined);
    const closeDialog = vi
      .spyOn(Haori, 'closeDialog')
      .mockResolvedValue(undefined);
    stubFetch({'/api/first': {status: 500, delay: 0}});
    await mount(
      '<dialog id="done"></dialog>' +
        '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await data-click-open="#done"' +
        ' data-click-close="#done"' +
        ' data-click-toast="更新しました">↑</button>' +
        '<span hidden class="updater" data-click-fetch="/api/first"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    // 処理順 16（ダイアログ操作）と 17（メッセージ表示）は、どちらも
    // クリック実行（15）より後にある。
    expect(openDialog).not.toHaveBeenCalled();
    expect(closeDialog).not.toHaveBeenCalled();
    expect(document.querySelector('.haori-toast')).toBeNull();
  });

  it('起動が遅延される対象では待たずに次へ進む', async () => {
    // 仕様「`data-{event}-click-await`」の「対象が`data-click-defer`を宣言して
    // いる場合は、起動が次フレームになるため**待てません**。開発モードで警告し、
    // 待たずに次の対象へ進みます」。待てないことを黙って「待った」ことにすると、
    // 直列だと思っている構成が実は並行で走る。
    Dev.set(true);
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    stubFetch({
      '/api/first': {status: 200, delay: 30},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        '<span hidden class="updater" data-click-fetch="/api/first"' +
        ' data-click-fetch-method="PUT" data-click-defer></span>' +
        '<span hidden class="updater" data-click-fetch="/api/second"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(warn).toHaveBeenCalled();
    // 2 件目は 1 件目の完了を待たずに始まる。
    expect(log.slice(0, 2)).toEqual(['start:/api/second', 'end:/api/second']);
  });

  it('すでに実行中の対象では止める', async () => {
    // 仕様「`data-{event}-click-await`」の「対象が**すでに実行中**（多重実行の
    // 抑止に掛かった）の場合は失敗として扱い、後続を止めます」。押した操作が
    // 実行されていないのに次を送ると、片方だけが反映される。
    stubFetch({
      '/api/first': {status: 200, delay: 200},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        TWO_UPDATERS,
    );

    // 1 件目を先に走らせておく（多重実行の抑止が掛かった状態を作る）。
    (container!.querySelectorAll('.updater')[0] as HTMLElement).click();
    (container!.querySelector('#move') as HTMLElement).click();
    // 先に走らせた通信が終わるまで見届ける（残したまま次のテストへ進むと、
    // 遅れて届いた記録が次のテストの観測へ混ざる）。
    await waitForCondition(() => log.includes('end:/api/first'), {
      description: '先行した更新が終わる',
      maxAttempts: 60,
      delayMs: 20,
    });
    await waitForIdle();

    // 2 件目は送らない（1 件目は最初のクリックの分だけが動く）。
    expect(log).toEqual(['start:/api/first', 'end:/api/first']);
  });

  it('祖先への委譲で起動する対象も待つ', async () => {
    // 仕様「`data-{event}-click-await`」の「対象自身が `data-{event}-click-*` を
    // 持たず、**祖先への委譲で手続きが起動する場合も待ちます**」。押した要素を
    // 基準に結果を受け取らないと、この構成だけ黙って並行に走る。
    stubFetch({
      '/api/first': {status: 200, delay: 30},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        '<div data-click-fetch="/api/first" data-click-fetch-method="PUT">' +
        '<span hidden class="updater"></span></div>' +
        '<span hidden class="updater" data-click-fetch="/api/second"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(log).toEqual([
      'start:/api/first',
      'end:/api/first',
      'start:/api/second',
      'end:/api/second',
    ]);
  });

  it('祖先への委譲で起動した手続きの失敗でも後続を止める', async () => {
    // 同節の「**失敗したら後続の対象をクリックしません。**」。委譲の構成でも
    // 打ち切りが効かないと、前段が失敗したまま後段が飛ぶ。
    stubFetch({
      '/api/first': {status: 500, delay: 0},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        '<div data-click-fetch="/api/first" data-click-fetch-method="PUT">' +
        '<span hidden class="updater"></span></div>' +
        '<span hidden class="updater" data-click-fetch="/api/second"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(log).toEqual(['start:/api/first', 'end:/api/first']);
  });

  it('待てない対象は開発モードでなくても記録する', async () => {
    // 仕様「`data-{event}-click-await`」の「この場合は**警告を記録し**（開発
    // モードに限らず。宣言どおりに直列化できていないため）」。本番で黙って
    // 並行になると、直列のつもりの構成が気づかれずに壊れる。
    Dev.set(false);
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    stubFetch({
      '/api/first': {status: 200, delay: 30},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        '<span hidden class="updater" data-click-fetch="/api/first"' +
        ' data-click-fetch-method="PUT" data-click-defer></span>' +
        '<span hidden class="updater" data-click-fetch="/api/second"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(warn).toHaveBeenCalled();
  });

  it('確認ダイアログのキャンセルでも後続を止める', async () => {
    // 仕様「`data-{event}-click-await`」の「失敗とは、HTTP エラー応答（4xx/5xx）・
    // 通信の例外・検証エラー（`data-{event}-validate`）・確認ダイアログの
    // キャンセル（`data-{event}-confirm`）です」。
    vi.spyOn(Haori, 'confirm').mockResolvedValue(false);
    stubFetch({
      '/api/first': {status: 200, delay: 0},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        '<span hidden class="updater" data-click-fetch="/api/first"' +
        ' data-click-fetch-method="PUT" data-click-confirm="よろしいですか"' +
        '></span>' +
        '<span hidden class="updater" data-click-fetch="/api/second"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(log).toEqual([]);
  });

  it('検証エラーでも後続を止める', async () => {
    // 同節の「検証エラー（`data-{event}-validate`）」。入力が直っていないのに
    // 後続だけ送ると、片方だけが反映される。
    stubFetch({
      '/api/first': {status: 200, delay: 0},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<form id="f"><input name="keyword" required value=""></form>' +
        '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        '<span hidden class="updater" data-click-fetch="/api/first"' +
        ' data-click-fetch-method="PUT" data-click-form="#f"' +
        ' data-click-validate></span>' +
        '<span hidden class="updater" data-click-fetch="/api/second"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(log).toEqual([]);
  });

  it('前のクリックの結果を持ち越さない', async () => {
    // 待ち合わせは「今回のクリックが起こした手続き」の結果だけを見る。前の結果が
    // 残っていると、クリックが発火しなかった対象（`disabled` など）で古い失敗を
    // 拾い、送れるはずの後続まで止まる。
    Dev.set(true);
    vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    stubFetch({
      '/api/first': {status: 500, delay: 0},
      '/api/second': {status: 200, delay: 0},
    });
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        '<button hidden class="updater" data-click-fetch="/api/first"' +
        ' data-click-fetch-method="PUT"></button>' +
        '<span hidden class="updater" data-click-fetch="/api/second"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    // 1 件目を直接押して失敗させ、その結果を残した状態にする。
    const first = container!.querySelectorAll('.updater')[0] as HTMLElement;
    first.click();
    await waitForIdle();
    log.length = 0;

    // 押しても発火しない状態にしてから、待ち合わせつきで起動する。
    first.setAttribute('disabled', '');
    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    // 古い失敗で止めず、2 件目まで進む。
    expect(log).toEqual(['start:/api/second', 'end:/api/second']);
  });

  it('data-{event}-if が偽で実行されなかった対象では止めない', async () => {
    // 仕様「`data-{event}-click-await`」の「**`data-{event}-if` が偽で実行され
    // なかった場合は失敗として扱いません**（意図したスキップのため、後続へ
    // 進みます）」。条件付きで一部だけ送る構成が書けなくなるため。
    stubFetch({'/api/second': {status: 200, delay: 0}});
    await mount(
      '<button id="move" data-click-click=".updater"' +
        ' data-click-click-await>↑</button>' +
        '<span hidden class="updater" data-click-fetch="/api/skipped"' +
        ' data-click-fetch-method="PUT" data-click-if="false"></span>' +
        '<span hidden class="updater" data-click-fetch="/api/second"' +
        ' data-click-fetch-method="PUT"></span>',
    );

    (container!.querySelector('#move') as HTMLElement).click();
    await waitForIdle();

    expect(log).toEqual(['start:/api/second', 'end:/api/second']);
  });
});
