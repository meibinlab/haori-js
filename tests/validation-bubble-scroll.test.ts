/* @vitest-environment jsdom */
/**
 * 画面外の入力欄で検証に失敗したときの、検証 UI（バブル）とスクロールの順序のテスト。
 *
 * 期待値は仕様「`data-{event}-validate`」の「対象の欄が**画面外にある場合は、先に
 * 画面内へスクロールし、スクロールが止まってから**検証 UI を表示します」から取って
 * います。
 *
 * 修正前は `reportValidity()` を先に呼んでからスクロールしていたため、バブルが画面外
 * の位置に固定されたまま要求され、`scroll-behavior: smooth` のページではブラウザが
 * 表示を取り消していました（実ブラウザで確認: 呼び出し時点の `top` が -2185）。
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import Haori from '../src/haori';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/**
 * 位置だけを持つ矩形を作ります。
 *
 * @param top 上端の座標
 * @param height 高さ
 * @returns `getBoundingClientRect()` の戻り値として使える矩形
 */
function rect(top: number, height = 30): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 200,
    width: 200,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** ビューポート（jsdom の既定は 1024x768）より上にある位置 */
const OFF_SCREEN = rect(-2000);

/** ビューポートに収まる位置 */
const IN_VIEW = rect(10);

/**
 * 実装がスクロールの静止を判定できるだけの実時間を確保した待ち合わせの設定。
 *
 * `waitForDomSettled()` は `setTimeout(0)` とキューだけを進め、
 * `requestAnimationFrame` のフレームを待ちません。静止判定はフレームごとに位置を
 * 測るため、待ち合わせに実時間を入れないと、負荷の高い環境（CI）でフレームが
 * 来る前に試行を使い切ります。
 */
const FRAME_WAIT = {maxAttempts: 60, delayMs: 25};

/** 静止を待たずに表示する上限（`Procedure.VALIDATION_SCROLL_TIMEOUT_MS`） */
const SCROLL_TIMEOUT_MS = 1000;

/**
 * スムーズスクロールで画面内へ入ってくる矩形の供給を作ります。
 *
 * 位置を**読まれた回数**で切り替えます。実装は 1 フレームに 1 回読むため、実時間
 * ではなく実装の進み方に同期し、環境によらず同じ順序で進みます。
 *
 * @param readsBeforeArrival 到着前の位置を返す回数（1 回目は表示判定で読まれる）
 * @param departure 到着前の位置
 * @returns 現在の位置と、`getBoundingClientRect` として渡す関数
 */
function scrollingRect(
  readsBeforeArrival: number,
  departure: DOMRect = OFF_SCREEN,
): {current: DOMRect; reads: number; rectOf: () => DOMRect} {
  const state = {
    current: departure,
    reads: 0,
    rectOf: (): DOMRect => {
      state.reads += 1;
      state.current = state.reads > readsBeforeArrival ? IN_VIEW : departure;
      return state.current;
    },
  };
  return state;
}

describe('画面外の入力欄の検証 UI とスクロールの順序', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.spyOn>;
  let reportValiditySpy: ReturnType<typeof vi.spyOn>;
  /** 呼び出し順の記録（'scroll' / 'report'） */
  let order: string[];

  beforeEach(async () => {
    vi.restoreAllMocks();
    (window as Window & typeof globalThis & {Haori?: unknown}).Haori = Haori;
    await import('../src/observer');
    order = [];
    // jsdom は scrollIntoView を実装していないため先に定義してからスパイする
    Element.prototype.scrollIntoView = () => {};
    scrollIntoViewSpy = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {
        order.push('scroll');
      });
    reportValiditySpy = vi
      .spyOn(HTMLInputElement.prototype, 'reportValidity')
      .mockImplementation(() => {
        order.push('report');
        return false;
      });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (Element.prototype as unknown as {scrollIntoView?: unknown})
      .scrollIntoView;
  });

  /**
   * 検証に失敗するフォームと押下ボタンを組み立てます。
   *
   * @param options 入力欄の位置を返す関数と、`data-click-scroll-error` の指定
   * @returns 組み立てた要素
   */
  function build(options: {
    rectOf: () => DOMRect;
    scrollOnError?: boolean;
    id?: string;
  }): {form: HTMLFormElement; input: HTMLInputElement; button: HTMLElement} {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = options.id ?? 'name';
    input.required = true;
    input.value = '';
    input.getBoundingClientRect = options.rectOf;
    form.appendChild(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-click-validate', '');
    button.setAttribute('data-click-form', '');
    if (options.scrollOnError) {
      button.setAttribute('data-click-scroll-error', '');
    }
    form.appendChild(button);
    document.body.appendChild(form);
    return {form, input, button};
  }

  it('画面外のときは、スクロールしてから検証 UI を出す（回帰）', async () => {
    // スムーズスクロールを模して、数フレームかけて画面内へ入れる
    const scroll = scrollingRect(3);
    /** reportValidity を呼ばれた時点で入力欄が画面外だったか */
    let reportedWhileOffScreen: boolean | null = null;
    /**
     * 表示までに位置を読んだ回数（＝経過フレーム数）。静止の検出なら数フレームで
     * 表示し、検出できていなければ上限（1 秒）まで読み続ける。実時間で判定すると
     * 負荷の高い環境で誤判定するため、フレーム数で区別する。
     */
    let readsAtReport: number | null = null;
    reportValiditySpy.mockImplementation(() => {
      order.push('report');
      reportedWhileOffScreen = scroll.current === OFF_SCREEN;
      readsAtReport = scroll.reads;
      return false;
    });

    const {button} = build({rectOf: scroll.rectOf, scrollOnError: true});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      ...FRAME_WAIT,
      description: 'validation bubble shown after scroll settled',
    });

    // 先にスクロールし、静止後に検証 UI を出す
    expect(order).toEqual(['scroll', 'report']);
    // 修正前はここが true（画面外の位置でバブルを要求していた）
    expect(reportedWhileOffScreen).toBe(false);
    // 静止を検出して表示している（上限まで待っていない）。到着まで 3 回 + 静止判定に
    // 3 回の読み取りで足りる。
    expect(readsAtReport).toBeLessThanOrEqual(12);
  });

  it('画面外のときは focus がスクロールを伴わない（回帰）', async () => {
    // 自前のスクロールと競合させないため、focus は preventScroll で呼ぶ
    const focusCalls: {target: HTMLElement; options?: FocusOptions}[] = [];
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      focusCalls.push({target: this, options});
    });
    const scroll = scrollingRect(3);

    const {input, button} = build({rectOf: scroll.rectOf});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      ...FRAME_WAIT,
      description: 'validation bubble shown',
    });

    const focusCall = focusCalls.find(call => call.target === input);
    expect(focusCall?.options).toEqual({preventScroll: true});
  });

  it('画面外のときは `data-{event}-scroll-error` が無くてもスクロールする（回帰）', async () => {
    // 仕様「`data-{event}-validate`」の「このスクロールは `data-{event}-scroll-error`
    // の指定に関わらず行います」
    const scroll = scrollingRect(3);

    const {input, button} = build({rectOf: scroll.rectOf});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      ...FRAME_WAIT,
      description: 'validation bubble shown',
    });

    expect(order).toEqual(['scroll', 'report']);
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
    });
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(input);
  });

  it('画面内のときはその場で検証 UI を出す', async () => {
    // 仕様「`data-{event}-validate`」の「対象の欄が**全体とも**画面内に収まっている場合は、
    // その場で検証 UI を表示します」
    const {button} = build({rectOf: () => IN_VIEW, scrollOnError: true});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      description: 'validation bubble shown immediately',
    });

    expect(order).toEqual(['report', 'scroll']);
  });

  it('1 ピクセルでも画面外へ出ていればスクロールしてから出す（回帰）', async () => {
    // 仕様「`data-{event}-validate`」の「一部でも画面の外に出ている場合は、先に画面内へ
    // スクロールし、スクロールが止まってから」。判定を「一部でも見えていれば画面内」と
    // 緩めると、残ったスクロールでバブルが消える症状が戻る。
    // 下端から 1 ピクセル出た位置から画面内へ入る
    const scroll = scrollingRect(3, rect(window.innerHeight - 29));

    const {button} = build({rectOf: scroll.rectOf});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      ...FRAME_WAIT,
      description: 'validation bubble shown after scroll',
    });

    expect(order).toEqual(['scroll', 'report']);
  });

  it('下端にぴったり収まっているならその場で出す', async () => {
    // 境界の反対側。ぴったり収まっていればスクロールの余地は無い。
    const flush = rect(window.innerHeight - 30);
    const {button} = build({rectOf: () => flush, scrollOnError: true});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      description: 'validation bubble shown immediately',
    });

    expect(order).toEqual(['report', 'scroll']);
  });

  it('スクロールが止まらないまま 1 秒を過ぎたら検証 UI を出す', async () => {
    // 仕様「`data-{event}-validate`」の「1 秒を過ぎた場合は静止を待たずに表示します」。
    // 画面内へ入らないまま静止した場合に、バブルが永久に出ないことを防ぐ。
    const {button} = build({rectOf: () => OFF_SCREEN, scrollOnError: true});
    await waitForDomSettled();
    const startedAt = performance.now();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      maxAttempts: 30,
      delayMs: 100,
      description: 'validation bubble shown after the timeout',
    });

    expect(order).toEqual(['scroll', 'report']);
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(1000);
  });

  it('待機中に別の検証が失敗したら、後の欄だけ検証 UI を出す（回帰）', async () => {
    // 仕様「`data-{event}-validate`」の「待機中に別の検証が失敗した場合は、**後から
    // 始まった検証の欄だけ**を表示します」
    // 先の欄は画面内へ入らない（上限まで待つ）。後の欄はスクロール後に画面内へ入る。
    const first = build({rectOf: () => OFF_SCREEN, id: 'first'});
    const secondScroll = scrollingRect(3);
    const second = build({
      rectOf: secondScroll.rectOf,
      id: 'second',
      scrollOnError: true,
    });

    await waitForDomSettled();
    // await を挟まずに続けて押し、先の待機中に次の検証を始める
    first.button.click();
    second.button.click();
    await waitForCondition(() => order.includes('report'), {
      ...FRAME_WAIT,
      description: 'validation bubble shown for the later field',
    });
    // 上限（1 秒）を過ぎても先の欄が表示しないことまで確認する
    await new Promise(resolve => setTimeout(resolve, SCROLL_TIMEOUT_MS + 300));

    expect(reportValiditySpy).toHaveBeenCalledTimes(1);
    expect(reportValiditySpy.mock.instances[0]).toBe(second.input);
  });
});
