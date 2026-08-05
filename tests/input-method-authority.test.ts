/* @vitest-environment jsdom */
/**
 * @fileoverview 入力手段の軸を網羅した権威規則の検証。
 *
 * `tests/interleaving-authority.test.ts` は**供給手段**の軸を網羅していますが、
 * 入力側は `change` を伴う編集の 1 種類だけでした。報告 AA（スクリプトの代入）・
 * AG（外部ライブラリの代入と打鍵）・AJ（貼り付け・IME 確定）はいずれも
 * **値の入り方**が軸で、この網が無かったために別の入り方から同じ規則が破れました。
 *
 * **期待値はすべて仕様書（`docs/ja/specs.md`）から取っています。** 現在の実装の
 * 挙動を写したものではありません。落ちる組み合わせは実装側の不具合です。
 *
 * 根拠にした規定:
 *
 * - 仕様「ユーザー編集と宣言バインドの権威」の「印は打鍵ごと（`input`）に付きます。
 *   `data-input-*` を宣言していない入力欄も対象です」「**印を付けるだけで、内部値は
 *   同期しません**」
 * - 仕様「反映待ちの間に起きた変化」の「**利用者が入力を確定したら、待っていた
 *   書き込みは行いません**。反映を要求した時点より後の編集は…保護します（**要求より
 *   前の編集は、明示的な供給が権威なので上書きします**）」
 * - 同節の「保護の対象は**打鍵 1 文字ごと**です。`change` の発火（フォーカスを外す・
 *   選択の確定）を待ちません」
 * - 仕様「収集は DOM を真とする」の「**イベントを伴わない値の変更にも追随します。**」
 *   「値がバインドデータへ載るのは収集の契機（`change` による双方向コミット、
 *   `data-{event}-form` での送信など）を通じてであり、**代入した瞬間に反映される
 *   わけではありません**」
 * - 同節の「外部からの代入は**ユーザー編集としては扱いません**」
 *
 * 新しい入力手段（別のイベントの組み合わせ、別の代入経路）を扱えるようにしたら、
 * `INPUT_METHODS` へ 1 行足してください。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';

import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

/** 初期の `data-bind` 宣言（リセットの戻り先。仕様「`data-{event}-reset`」） */
const INITIAL_BIND = '{"keyword":"初期"}';

/** 検証用に組み立てた要素 */
interface Context {
  readonly form: HTMLFormElement;
  readonly input: HTMLInputElement;
  readonly resetButton: HTMLButtonElement;
}

/** 値を入れる手段、または値を供給する手段 */
interface Operation {
  /** 表示名 */
  readonly label: string;
  /** この操作が入れる（供給する）値 */
  readonly value: string;
  /** 操作を開始する（完了は待たない） */
  readonly start: (context: Context) => void;
}

/**
 * 入力手段の軸。
 *
 * `edits` は「利用者の編集として扱われるか」です。仕様「収集は DOM を真とする」は
 * 外部からの代入について「**ユーザー編集としては扱いません**（… 通し番号を発番
 * しません）」と定めるため、代入だけが false になります。
 *
 * `commits` は「値がバインドデータへ載るか」です。同節の「値がバインドデータへ載るのは
 * 収集の契機（`change` による双方向コミット…）を通じて」により、`change` を伴う手段
 * だけが true です。
 */
interface InputMethod extends Operation {
  /** 利用者の編集として扱われるか */
  readonly edits: boolean;
  /** バインドデータへ載るか */
  readonly commits: boolean;
}

const INPUT_METHODS: readonly InputMethod[] = [
  {
    label: 'change を伴う編集',
    value: '編集',
    edits: true,
    commits: true,
    start: ({input}) => {
      input.focus();
      input.value = '編集';
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
    },
  },
  {
    label: '打鍵（input を 1 文字ごと）',
    value: '打鍵',
    edits: true,
    commits: false,
    start: ({input}) => {
      input.focus();
      input.value = '';
      for (const character of '打鍵') {
        input.value += character;
        input.dispatchEvent(new Event('input', {bubbles: true}));
      }
    },
  },
  {
    label: '貼り付け・IME 確定（input を 1 回）',
    value: '貼付',
    edits: true,
    commits: false,
    start: ({input}) => {
      input.focus();
      input.value = '貼付';
      input.dispatchEvent(new Event('input', {bubbles: true}));
    },
  },
  {
    label: 'イベントを伴わない代入（外部ライブラリ）',
    value: '代入',
    edits: false,
    commits: false,
    start: ({input}) => {
      input.value = '代入';
    },
  },
];

/**
 * 明示的な値の供給にあたる操作（`tests/interleaving-authority.test.ts` と同じ 3 種）。
 *
 * `observed` は「要求した時点が、操作を起こした瞬間ではなく監視が観測した時点になる」
 * 供給です。仕様「`data-bind`」の「**要求した時点は、監視（`MutationObserver`）が
 * 変更を観測した時点です**」により、属性の書き換えだけが該当します。
 */
interface Supply extends Operation {
  /** 要求時点が監視の観測時点になるか */
  readonly observed?: boolean;
}

const SUPPLIES: readonly Supply[] = [
  {
    label: '外部からの data-bind 書き換え',
    value: '外部',
    observed: true,
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

describe('入力手段と供給の権威', () => {
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
   * 収集値の `keyword` を返します。
   *
   * @param context 対象の要素
   * @returns 収集値
   */
  const collected = (context: Context): unknown =>
    (
      Form.getValues(Fragment.get(context.form) as ElementFragment) as Record<
        string,
        unknown
      >
    ).keyword;

  /**
   * バインドデータの `keyword` を返します。
   *
   * @param context 対象の要素
   * @returns バインドデータの値
   */
  const bound = (context: Context): unknown =>
    (Core.getBindingData(context.form) as Record<string, unknown>)?.keyword;

  for (const method of INPUT_METHODS) {
    describe(`${method.label}（供給なし）`, () => {
      it('収集値に載る（仕様「収集は DOM を真とする」）', async () => {
        const context = await mount();
        method.start(context);
        await waitForIdle();

        expect(context.input.value).toBe(method.value);
        expect(collected(context)).toBe(method.value);
      });

      it(`バインドデータへ載る${method.commits ? '' : 'ことはない'}`, async () => {
        const context = await mount();
        method.start(context);
        await waitForIdle();

        // 仕様「収集は DOM を真とする」の「値がバインドデータへ載るのは収集の契機
        // （`change` による双方向コミット…）を通じて」。`change` を伴わない手段では
        // 初期宣言の値のままである。
        expect(bound(context)).toBe(method.commits ? method.value : '初期');
      });

      it('同じ内容のバインドデータを流し込んでも消えない', async () => {
        // 報告 AJ の規則。バインドデータは入力前の値のままなので、逆方向同期が走っても
        // 入力欄の値は変わらない（仕様「収集は DOM を真とする」の「収集は読み取りに
        // 徹し、内部値は書き換えません」）。内部値を DOM から先に進めていると、この
        // 流し込みが「不一致」と判定されて入力欄を上書きする。
        const context = await mount();
        method.start(context);
        await waitForIdle();

        const current = bound(context);
        await Core.setBindingData(context.form, {keyword: current});
        await waitForIdle();

        expect(context.input.value).toBe(method.value);
        expect(collected(context)).toBe(method.value);
      });
    });
  }

  for (const settleBetween of [false, true]) {
    const suffix = settleBetween ? 'await あり' : 'await なし';

    describe(`供給 → 入力（要求より後の入力を保護・仕様「反映待ちの間に起きた変化」）／${suffix}`, () => {
      for (const method of INPUT_METHODS) {
        if (!method.edits) {
          // 外部からの代入は編集として扱わないため（仕様「収集は DOM を真とする」の
          // 「外部からの代入は**ユーザー編集としては扱いません**」）、供給と代入の
          // どちらが残るかを仕様は一意に定めていない（「応答の書き戻しで上書きされる
          // ことがあります」）。期待値を決められないので検証しない。
          continue;
        }
        for (const supply of SUPPLIES) {
          it(`${supply.label} → ${method.label}："${method.value}" が残る`, async () => {
            const context = await mount();
            supply.start(context);
            if (supply.observed) {
              // 属性の書き換えは、監視が観測した時点が要求時点である（仕様
              // 「`data-bind`」）。観測はマイクロタスクで届くため、ここで 1 つ譲って
              // 「要求より後の入力」にする。譲らないと、同じマイクロタスクの中の入力は
              // 仕様上「要求より前の編集」になり、供給が権威になる。利用者の打鍵は
              // 必ず別のタスクで起きるため、この待ちは実際の操作と同じ条件を作る。
              await Promise.resolve();
            }
            if (settleBetween) {
              await waitForIdle();
            }
            method.start(context);
            await waitForIdle();

            expect(context.input.value).toBe(method.value);
            expect(collected(context)).toBe(method.value);
          });
        }
      }
    });

    describe(`入力 → 供給（供給が権威・仕様「反映待ちの間に起きた変化」）／${suffix}`, () => {
      for (const method of INPUT_METHODS) {
        for (const supply of SUPPLIES) {
          it(`${method.label} → ${supply.label}："${supply.value}" が残る`, async () => {
            const context = await mount();
            method.start(context);
            if (settleBetween) {
              await waitForIdle();
            }
            supply.start(context);
            await waitForIdle();

            expect(context.input.value).toBe(supply.value);
            expect(collected(context)).toBe(supply.value);
            expect(bound(context)).toBe(supply.value);
          });
        }
      }
    });
  }
});
