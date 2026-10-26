/* @vitest-environment jsdom */
/**
 * @fileoverview 初期化中（初回の取得の応答を待つあいだ）に入力した値の保護の検証。
 *
 * 初期化中に受けた `input` / `change` について、手続きの実行は `data-haori-ready`
 * の付与後まで保留するが、利用者の編集の印は受けた時点で付けることを確かめます。
 * 印まで保留すると、初回の取得の応答を反映して配下を評価し直したときに、宣言
 * バインドの評価結果が入力した値を上書きします。
 *
 * 初期表示の再現: `src/observer.ts` は読み込まれた時点で初期化を始めるため、試験
 * ごとにモジュールを読み込み直し、ブラウザと同じ順（`<body>` が解析される →
 * `DOMContentLoaded` で初期化する）を再現します。待機は読み込み直した `Queue` で
 * 行います（`tests/helpers/async.ts` の待機は別インスタンスの `Queue` を見るため
 * 使えません）。応答を止めたまま入力するため、fetch は解決関数を控えるモックにします。
 *
 * 期待値の根拠は仕様「ユーザー編集と宣言バインドの権威」「反映待ちの間に起きた変化」
 * 「初期スキャン中に発火したイベントの扱い」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

/** 読み込み直した Haori のモジュール */
type HaoriModule = typeof import('../src/index');

/** 読み込み直した監視のクラス */
type ObserverClass = typeof import('../src/observer').Observer;

describe('初期化中に入力した値の保護', () => {
  /** 読み込み直した Haori のモジュール */
  let mod: HaoriModule | null;
  /** 読み込み直した監視のクラス（後始末に使う） */
  let observer: ObserverClass | null;
  /** 応答を止めている取得の解決関数（要求順） */
  let pending: ((response: Response) => void)[];

  beforeEach(() => {
    mod = null;
    observer = null;
    pending = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          pending.push(resolve);
        }) as unknown as Promise<Response>,
    );
  });

  afterEach(async () => {
    pending.forEach(resolve => resolve(jsonResponse()));
    if (mod !== null && observer !== null) {
      await settle(mod);
      // 読み込み直したインスタンスの監視を止める（次の試験の DOM を処理させない）。
      const observers = (
        observer as unknown as {_mutationObservers: MutationObserver[]}
      )._mutationObservers;
      observers.forEach(entry => entry.disconnect());
      observer.getDispatcher()?.stop();
    }
    document.body.innerHTML = '';
    document.body.removeAttribute('data-haori-ready');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /**
   * JSON の応答を作ります。
   *
   * @returns 応答
   */
  function jsonResponse(): Response {
    return new Response('{"loaded":true}', {
      headers: {'Content-Type': 'application/json'},
    });
  }

  /**
   * 読み込み直した `Queue` で、監視の通知とキューの処理が落ち着くまで待ちます。
   *
   * @param target 読み込み直した Haori のモジュール
   * @returns 待機完了の Promise
   */
  async function settle(target: HaoriModule): Promise<void> {
    for (let index = 0; index < 4; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
      await target.Queue.waitForIdle();
    }
  }

  /**
   * 条件が成り立つまで待ちます。
   *
   * @param condition 待つ条件
   * @param description 失敗時に示す説明
   * @returns 待機完了の Promise
   */
  async function until(
    condition: () => boolean,
    description: string,
  ): Promise<void> {
    for (let index = 0; index < 200; index += 1) {
      if (condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  /**
   * ブラウザの読み込みと同じ順でページを用意し、初期化を始めます。
   *
   * @param markup `<body>` のマークアップ
   * @returns 初期化の完了（`haori:ready`）を待つ Promise を持つオブジェクト
   */
  async function load(markup: string): Promise<{ready: Promise<void>}> {
    vi.resetModules();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-haori-ready');
    // 解析中に読み込まれた状態にする（`src/observer.ts` は `DOMContentLoaded` を待つ）。
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    });
    try {
      mod = await import('../src/index');
      observer = (await import('../src/observer')).Observer;
      document.body.innerHTML = markup;
    } finally {
      Reflect.deleteProperty(document, 'readyState');
    }
    const ready = new Promise<void>(resolve => {
      document.addEventListener('haori:ready', () => resolve(), {once: true});
    });
    document.dispatchEvent(new Event('DOMContentLoaded'));
    return {ready};
  }

  /**
   * 止めていた取得のうち、最も古いものへ応答を返します。
   *
   * @returns 戻り値はない。
   */
  function respondNext(): void {
    pending.shift()!(jsonResponse());
  }

  /**
   * 初期化が終わっていないこと（`data-haori-ready` が無いこと）を確かめます。
   *
   * @returns 戻り値はない。
   */
  function expectInitializing(): void {
    expect(document.body.hasAttribute('data-haori-ready')).toBe(false);
  }

  it('取得の応答を待つあいだに打った値は、応答の反映で既定値へ戻らない', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「印は打鍵ごと（`input`）に
    // 付きます」「その欄への宣言バインドの再適用を抑止します」。仕様「初期スキャン
    // 中に発火したイベントの扱い」が `data-haori-ready` の付与後まで保留するのは
    // 「手続きの実行」だけである。応答の反映で解除されるのは「リクエストを組み立てた
    // 時点までの編集」で、この入力は要求より後なので印が残る。
    const {ready} = await load(`
      <div data-fetch="/a.json" data-fetch-arg="a">
        <div data-fetch="/b.json" data-fetch-arg="b">
          <form data-bind='{"other":""}'>
            <input id="i" name="x" type="date"
              data-attr-value="{{ '2026-10-06' }}">
            <input id="j" name="y">
          </form>
        </div>
      </div>`);
    const input = document.getElementById('i') as HTMLInputElement;
    await until(() => pending.length === 1, '外側の取得の要求');
    respondNext();
    await until(() => pending.length === 1, '内側の取得の要求');

    expectInitializing();
    input.value = '2025-01-01';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    respondNext();
    await ready;
    await settle(mod!);
    expect(input.value).toBe('2025-01-01');
  });

  it('data-input-* を宣言した欄に打った値も、応答の反映で既定値へ戻らない', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「印は打鍵ごと（`input`）に
    // 付きます」。`data-input-*` を宣言した欄の `input` は手続きを起動するため、
    // 仕様「初期スキャン中に発火したイベントの扱い」により手続きは保留されるが、
    // 印は保留の対象ではない。
    const {ready} = await load(`
      <div data-fetch="/b.json" data-fetch-arg="b">
        <form data-bind='{"other":""}'>
          <input id="i" name="x" data-input-if="{{ false }}"
            data-attr-value="{{ '2026-10-06' }}">
        </form>
      </div>`);
    const input = document.getElementById('i') as HTMLInputElement;
    await until(() => pending.length === 1, '取得の要求');

    expectInitializing();
    input.value = '2025-01-01';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    respondNext();
    await ready;
    await settle(mod!);
    expect(input.value).toBe('2025-01-01');
  });

  it('取得の要求の後に打ち直した値は、その応答の反映で既定値へ戻らない', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「印は打鍵ごと（`input`）に
    // 付きます」と、応答の反映が解除する「リクエストを組み立てた時点までの編集」。
    // 内側の取得は 1 文字目の後に要求し、2 文字目はその要求より後に打つ。欄の宣言
    // バインドは内側の応答（`b`）を参照するため、1 文字目の印はその応答で外れる。
    const {ready} = await load(`
      <div data-fetch="/a.json" data-fetch-arg="a">
        <div data-fetch="/b.json" data-fetch-arg="b">
          <form data-bind='{"other":""}'>
            <input id="i" name="x"
              data-attr-value="{{ b.loaded ? '2026-10-06' : '' }}">
          </form>
        </div>
      </div>`);
    const input = document.getElementById('i') as HTMLInputElement;
    await until(() => pending.length === 1, '外側の取得の要求');

    expectInitializing();
    input.value = 'a';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    respondNext();
    await until(() => pending.length === 1, '内側の取得の要求');
    input.value = 'ab';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    respondNext();
    await ready;
    await settle(mod!);
    expect(input.value).toBe('ab');
  });

  it('打鍵を伴わない change で変えた値も、応答の反映で既定値へ戻らない', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「打鍵の無い `change`（外部
    // ライブラリが `<select>` の値を差し替えたときなど）は、値が変わったことを
    // そこで初めて知るため、その `change` の時点を編集の時点とします」
    const {ready} = await load(`
      <div data-fetch="/b.json" data-fetch-arg="b">
        <form data-bind='{"other":""}'>
          <select id="s" name="x" data-attr-value="{{ 'A' }}">
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </form>
      </div>`);
    const select = document.getElementById('s') as HTMLSelectElement;
    await until(() => pending.length === 1, '取得の要求');

    expectInitializing();
    select.value = 'B';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    respondNext();
    await ready;
    await settle(mod!);
    expect(select.value).toBe('B');
  });

  it('選んだラジオボタンは、群の他の欄の宣言バインドで外れない', async () => {
    // 仕様「反映待ちの間に起きた変化」の「同名チェックボックス・ラジオの群は、
    // 欄ごとではなく群単位で保護します」「群のいずれかの欄が要求より後に操作され
    // ていれば、その群の現在の選択集合をそのまま保護します」
    const {ready} = await load(`
      <div data-fetch="/b.json" data-fetch-arg="b">
        <form data-bind='{"other":""}'>
          <input id="r1" type="radio" name="x" value="a"
            data-attr-checked="{{ true }}">
          <input id="r2" type="radio" name="x" value="b"
            data-attr-checked="{{ false }}">
        </form>
      </div>`);
    const first = document.getElementById('r1') as HTMLInputElement;
    const second = document.getElementById('r2') as HTMLInputElement;
    await until(() => pending.length === 1, '取得の要求');

    expectInitializing();
    second.click();
    respondNext();
    await ready;
    await settle(mod!);
    expect([first.checked, second.checked]).toEqual([false, true]);
  });

  it('打鍵の後・change の前に要求した取得の応答は、その打鍵の印を解除する', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「`change` の発火はそれ自体では
    // 編集の時点になりません」「直前の `change` より後に打鍵があれば、その**打鍵の
    // 時点**を編集の時点とします」と、応答の反映が解除する「リクエストを組み立てた
    // 時点までの編集」。内側の取得は、外側の応答を受けた後（打鍵の後）に要求する。
    // 欄の宣言バインドは内側の応答（`b`）を参照するため、その応答で値が決まる。
    const {ready} = await load(`
      <div data-fetch="/a.json" data-fetch-arg="a">
        <div data-fetch="/b.json" data-fetch-arg="b">
          <form data-bind='{"other":""}'>
            <input id="i" name="x"
              data-attr-value="{{ b.loaded ? '2026-10-06' : '' }}">
          </form>
        </div>
      </div>`);
    const input = document.getElementById('i') as HTMLInputElement;
    await until(() => pending.length === 1, '外側の取得の要求');

    expectInitializing();
    input.value = '2025-01-01';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    respondNext();
    await until(() => pending.length === 1, '内側の取得の要求');
    input.dispatchEvent(new Event('change', {bubbles: true}));
    respondNext();
    await ready;
    await settle(mod!);
    expect(input.value).toBe('2026-10-06');
  });

  it('入力の後に要求した取得でも、応答と関係のない既定値の欄の入力は残る', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「応答の反映が印を解除するのは、
    // その応答で値が決まる欄だけです」。依頼の再現のうち、外側の応答を止めて、
    // 内側の取得が入力より後に要求される場合。
    const {ready} = await load(`
      <div data-fetch="/a.json" data-fetch-arg="a">
        <div data-fetch="/b.json" data-fetch-arg="b">
          <form data-bind='{"other":""}'>
            <input id="i" name="x" type="date"
              data-attr-value="{{ '2026-10-06' }}">
          </form>
        </div>
      </div>`);
    const input = document.getElementById('i') as HTMLInputElement;
    await until(() => pending.length === 1, '外側の取得の要求');

    expectInitializing();
    input.value = '2025-01-01';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    respondNext();
    await until(() => pending.length === 1, '内側の取得の要求');
    respondNext();
    await ready;
    await settle(mod!);
    expect(input.value).toBe('2025-01-01');
  });
});
