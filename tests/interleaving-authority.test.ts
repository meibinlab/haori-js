/* @vitest-environment jsdom */
/**
 * @fileoverview 値の供給と編集が割り込んだときの権威規則の検証。
 *
 * **期待値はすべて仕様書（`docs/ja/specs.md`）から取っています。** 現在の実装の
 * 挙動を写したものではありません。落ちる組み合わせは実装側の不具合です。
 *
 * 根拠にした規定:
 *
 * - 「反映待ちの間に起きた変化」の「別の値の反映が要求されたら、**後から来た値が
 *   載ります**（後勝ち）。先の書き込みの完了を待ってから改めて反映するため、**最後に
 *   供給された値が画面とバインドデータの双方に残ります**」
 * - 同節の「**利用者が入力を確定したら、待っていた書き込みは行いません**。反映を
 *   要求した時点より後の編集は…保護します（**要求より前の編集は、明示的な供給が
 *   権威なので上書きします**）」
 * - 「`data-bind`」の「外部からの書き換えは『明示的な値の供給』として扱い、配下の
 *   入力欄からユーザー編集の印を解除します。**利用者が編集した欄も、書き換えた値へ
 *   更新されます**」
 * - 「ユーザー編集と宣言バインドの権威」の「`Core.setBindingData()` の直接呼び出し」は
 *   編集の印を解除する供給
 * - 「`data-{event}-reset`」 リセットは DOM の値を既定値へ戻し、バインドデータを初期
 *   `data-bind` 宣言へ戻したうえで、フォーム値で更新する
 *
 * これまでの回帰はすべて「非同期の段が、別の段が進めた状態に対して走る」形でした。
 * 各操作の間に `await` を挟むとその割り込みは起きないため、**挟まない版と挟む版の
 * 両方**を回します。挟まない版が本体です。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

/** 初期の `data-bind` 宣言（リセットの戻り先。仕様「`data-{event}-reset`」） */
const INITIAL_BIND = '{"keyword":"初期"}';

/** 割り込みの相手となる操作 */
interface Operation {
  /** 表示名 */
  readonly label: string;
  /** この操作が供給する（または確定する）値 */
  readonly value: string;
  /** 操作を開始する（完了は待たない） */
  readonly start: (context: Context) => void;
}

/** 各テストで組み立てた要素 */
interface Context {
  readonly form: HTMLFormElement;
  readonly input: HTMLInputElement;
  readonly resetButton: HTMLButtonElement;
}

/**
 * 明示的な値の供給にあたる操作。
 *
 * リセットが供給する値は `初期` です。仕様「`data-{event}-reset`」「フォーム自身のバインドデータを
 * 初期 `data-bind` 宣言（宣言がなければ空）へ戻す」により `{"keyword":"初期"}` へ
 * 戻り、`name="keyword"` を持つ入力欄へは双方向バインドでその値が書き戻されます。
 * 仕様「`data-{event}-reset`」が「復元されない」としているのは**リセット前の編集**であって、初期
 * 宣言の値ではありません。
 */
const SUPPLIES: readonly Operation[] = [
  {
    label: '外部からの data-bind 書き換え',
    value: '外部',
    start: ({form}) => {
      form.setAttribute('data-bind', JSON.stringify({keyword: '外部'}));
    },
  },
  {
    label: 'Core.setBindingData',
    value: '直接',
    start: ({form}) => {
      void Core.setBindingData(form, {keyword: '直接'});
    },
  },
  {
    label: 'data-click-reset',
    value: '初期',
    start: ({resetButton}) => {
      resetButton.click();
    },
  },
];

/** 利用者による編集の確定 */
const EDIT: Operation = {
  label: 'change による編集の確定',
  value: '編集',
  start: ({input}) => {
    input.value = '編集';
    input.dispatchEvent(new Event('change', {bubbles: true}));
  },
};

describe('値の供給と編集の割り込み', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(async () => {
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    await Observer.init();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
  });

  /**
   * 検証用のフォームを組み立てて初期描画を待ちます。
   *
   * @returns 組み立てた要素
   */
  const mount = async (): Promise<Context> => {
    container.innerHTML =
      `<form id="f" data-bind='${INITIAL_BIND}'>` +
      '<input id="q" name="keyword" type="text">' +
      '<b id="shown">{{keyword}}</b>' +
      '</form>' +
      '<button id="rst" type="button" data-click-reset="#f"></button>';
    await Core.scan(container);
    await waitForIdle();
    return {
      form: container.querySelector('#f') as HTMLFormElement,
      input: container.querySelector('#q') as HTMLInputElement,
      resetButton: container.querySelector('#rst') as HTMLButtonElement,
    };
  };

  /**
   * 2 つの操作を順に起こし、落ち着いた後の値を返します。
   *
   * @param context 対象の要素
   * @param first 先に起こす操作
   * @param second 後に起こす操作
   * @param settleBetween 間に待機を挟むか
   * @returns 入力欄の値・表示・バインドデータの値
   */
  const runPair = async (
    context: Context,
    first: Operation,
    second: Operation,
    settleBetween: boolean,
  ): Promise<{input: string; shown: string; bound: unknown}> => {
    first.start(context);
    if (settleBetween) {
      await waitForIdle();
    }
    second.start(context);
    // 最終状態を見るので、追従して積まれる処理まで含めて完全に落ち着かせる。固定
    // サイクル数の `waitForDomSettled()` では `Form.reset()` の 8 段が終わらず、
    // 「まだ処理中」を「仕様違反」と誤判定する。
    await waitForIdle();
    return {
      input: context.input.value,
      shown:
        (container.querySelector('#shown') as HTMLElement).textContent ?? '',
      bound: (Core.getBindingData(context.form) as Record<string, unknown>)
        ?.keyword,
    };
  };

  for (const settleBetween of [false, true]) {
    const suffix = settleBetween ? 'await あり' : 'await なし';

    describe(`供給 → 供給（後勝ち・仕様「反映待ちの間に起きた変化」）／${suffix}`, () => {
      for (const first of SUPPLIES) {
        for (const second of SUPPLIES) {
          if (first === second) {
            continue;
          }
          it(`${first.label} → ${second.label}：後から来た "${second.value}" が残る`, async () => {
            const context = await mount();
            const result = await runPair(context, first, second, settleBetween);
            expect(result.input).toBe(second.value);
            expect(result.bound ?? '').toBe(second.value);
            expect(result.shown).toBe(second.value);
          });
        }
      }
    });

    describe(`供給 → 編集（編集を保護・仕様「ユーザー編集と宣言バインドの権威」）／${suffix}`, () => {
      for (const supply of SUPPLIES) {
        it(`${supply.label} → ${EDIT.label}：編集した "${EDIT.value}" が残る`, async () => {
          const context = await mount();
          const result = await runPair(context, supply, EDIT, settleBetween);
          expect(result.input).toBe(EDIT.value);
          expect(result.bound ?? '').toBe(EDIT.value);
        });
      }
    });

    describe(`編集 → 供給（供給が権威・仕様「反映待ちの間に起きた変化」「\`data-bind\`」）／${suffix}`, () => {
      for (const supply of SUPPLIES) {
        it(`${EDIT.label} → ${supply.label}：供給した "${supply.value}" が残る`, async () => {
          const context = await mount();
          const result = await runPair(context, EDIT, supply, settleBetween);
          expect(result.input).toBe(supply.value);
          expect(result.bound ?? '').toBe(supply.value);
          expect(result.shown).toBe(supply.value);
        });
      }
    });
  }
});
