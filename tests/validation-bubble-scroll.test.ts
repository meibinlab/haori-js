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
    // スムーズスクロールを模して、scrollIntoView の数フレーム後に画面内へ入れる
    let current = OFF_SCREEN;
    scrollIntoViewSpy.mockImplementation(() => {
      order.push('scroll');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          current = IN_VIEW;
        }),
      );
    });
    /** reportValidity を呼ばれた時点で入力欄が画面外だったか */
    let reportedWhileOffScreen: boolean | null = null;
    reportValiditySpy.mockImplementation(() => {
      order.push('report');
      reportedWhileOffScreen = current === OFF_SCREEN;
      return false;
    });

    const {button} = build({rectOf: () => current, scrollOnError: true});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      description: 'validation bubble shown after scroll settled',
    });

    // 先にスクロールし、静止後に検証 UI を出す
    expect(order).toEqual(['scroll', 'report']);
    // 修正前はここが true（画面外の位置でバブルを要求していた）
    expect(reportedWhileOffScreen).toBe(false);
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
    let current = OFF_SCREEN;
    scrollIntoViewSpy.mockImplementation(() => {
      order.push('scroll');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          current = IN_VIEW;
        }),
      );
    });

    const {input, button} = build({rectOf: () => current});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
      description: 'validation bubble shown',
    });

    const focusCall = focusCalls.find(call => call.target === input);
    expect(focusCall?.options).toEqual({preventScroll: true});
  });

  it('画面外のときは `data-{event}-scroll-error` が無くてもスクロールする（回帰）', async () => {
    // 仕様「`data-{event}-validate`」の「このスクロールは `data-{event}-scroll-error`
    // の指定に関わらず行います」
    let current = OFF_SCREEN;
    scrollIntoViewSpy.mockImplementation(() => {
      order.push('scroll');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          current = IN_VIEW;
        }),
      );
    });

    const {input, button} = build({rectOf: () => current});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
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
    let current = rect(window.innerHeight - 29); // 下端から 1 ピクセル出る
    scrollIntoViewSpy.mockImplementation(() => {
      order.push('scroll');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          current = IN_VIEW;
        }),
      );
    });

    const {button} = build({rectOf: () => current});
    await waitForDomSettled();
    button.click();
    await waitForCondition(() => order.includes('report'), {
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
    let secondRect = OFF_SCREEN;
    // 先の欄は画面内へ入らない（上限まで待つ）。後の欄はスクロール後に画面内へ入る。
    const first = build({rectOf: () => OFF_SCREEN, id: 'first'});
    const second = build({
      rectOf: () => secondRect,
      id: 'second',
      scrollOnError: true,
    });
    scrollIntoViewSpy.mockImplementation(function (this: Element) {
      order.push('scroll');
      if (this === second.input) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            secondRect = IN_VIEW;
          }),
        );
      }
    });

    await waitForDomSettled();
    // await を挟まずに続けて押し、先の待機中に次の検証を始める
    first.button.click();
    second.button.click();
    await waitForCondition(() => order.includes('report'), {
      description: 'validation bubble shown for the later field',
    });
    // 上限（1 秒）を過ぎても先の欄が表示しないことまで確認する
    await new Promise(resolve => setTimeout(resolve, 1300));

    expect(reportValiditySpy).toHaveBeenCalledTimes(1);
    expect(reportValiditySpy.mock.instances[0]).toBe(second.input);
  });
});
