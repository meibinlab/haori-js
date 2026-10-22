/* @vitest-environment jsdom */
/**
 * @fileoverview CSP モードの評価器と従来の方式の速さの比較
 *
 * `npx vitest bench --run tests/bench/expression-interpreter.bench.ts` で実行します
 * （`vitest run` の対象ではありません）。
 *
 * 比べるのは次の 3 段です。
 *
 * - **評価関数**: 方式によらない層を通さず、組み立て済みの評価関数（従来の方式は
 *   `new Function` で作った関数、CSP モードは変換済みの構文木）を呼ぶ時間
 * - **入口**: 方式によらない層を含めた `evaluateDetailed()` の時間（CSP モードは
 *   `tests/helpers/csp-evaluate.ts` の形）
 * - **一覧**: 300 行の一覧を描く・状態を 1 つ変える・行を 1 件足す時間（jsdom）
 *
 * 式は、管理画面の一覧でよく書く形（値の表示・数値の整形・条件・クラスの切り替え・
 * 行の外の値の参照）にしています。
 *
 * 一覧の計測は jsdom で 6 分ほどかかります（開く 1 回が 40 秒前後）。入口と一覧の
 * CSP モードは、未解決参照の集約やブロック識別子の警告など、方式によらない層の
 * 一部を通らない形（`csp-evaluate.ts`）なので、組み合わせた後の値の目安です。開発
 * モードは外して比べます。
 */

import {bench, describe} from 'vitest';

import Core from '../../src/core';
import Dev from '../../src/dev';
import Expression, {ExpressionEvaluationDetail} from '../../src/expression';
import ExpressionInterpreter from '../../src/expression_interpreter';
import {waitForIdle} from '../helpers/async';
import {cspEvaluateDetailed} from '../helpers/csp-evaluate';

/** 一覧の行の数 */
const ROW_COUNT = 300;

/** 1 行の要素データ */
interface Row {
  id: number;
  name: string;
  price: number;
  stock: number;
  status: string;
  tags: string[];
}

/**
 * 一覧の行を作ります。
 *
 * @param count 行の数
 * @returns 行の配列
 */
function makeRows(count: number): Row[] {
  return Array.from({length: count}, (_, i) => ({
    id: i + 1,
    name: `商品${i + 1}`,
    price: 1000 + i * 37,
    stock: i % 4,
    status: i % 3 === 0 ? 'done' : 'open',
    tags: ['在庫', `棚${i % 10}`],
  }));
}

/** 行の中で評価する式（一覧のテンプレートと同じもの） */
const ROW_EXPRESSIONS = [
  "r.status === 'done' ? 'table-success' : ''",
  'r.id',
  'r.name',
  'r.price.toLocaleString()',
  'r.stock > 0',
  'r.stock',
  "r.tags.join('、')",
  'title',
];

/** 一覧のテンプレート */
const LIST =
  '<div id="root"><table><tbody data-each="rows" data-each-arg="r" data-each-key="id">' +
  `<tr data-attr-class="${ROW_EXPRESSIONS[0]}">` +
  '<td>{{r.id}}</td><td>{{r.name}}</td><td>{{r.price.toLocaleString()}}円</td>' +
  '<td data-if="r.stock > 0">{{r.stock}}</td><td>{{r.tags.join(\'、\')}}</td><td>{{title}}</td>' +
  '</tr></tbody></table></div>';

// 開発モードの診断（警告の組み立て）は従来の方式の入口だけが行うため、外して比べる。
Dev.disable();

const rows = makeRows(ROW_COUNT);
const scopes = rows.map(r => ({r, rows, title: '一覧'}));

/** `Expression` の非公開の関数（評価関数の取り出しに使う） */
interface ExpressionInternals {
  prepareEvaluator(
    expression: string,
    bindings: Record<string, unknown>,
  ): {bindKeys: string[]; evaluator: ((...args: unknown[]) => unknown) | null};
  BUILTIN_HOLDER: object;
}
const internals = Expression as unknown as ExpressionInternals;

describe('評価関数（300 行 × 8 式）', () => {
  const legacy = ROW_EXPRESSIONS.map(expression =>
    internals.prepareEvaluator(expression, scopes[0]),
  );
  const csp = ROW_EXPRESSIONS.map(expression =>
    ExpressionInterpreter.compile(expression),
  );

  bench('従来の方式（new Function）', () => {
    for (const scope of scopes) {
      for (const setup of legacy) {
        setup.evaluator!.call(
          internals.BUILTIN_HOLDER,
          ...setup.bindKeys.map(key => (scope as never)[key]),
        );
      }
    }
  });

  bench('CSP モード（評価器）', () => {
    for (const scope of scopes) {
      for (const compiled of csp) {
        ExpressionInterpreter.run(compiled, scope);
      }
    }
  });
});

describe('入口（300 行 × 8 式、方式によらない層を含む）', () => {
  bench('従来の方式', () => {
    for (const scope of scopes) {
      for (const expression of ROW_EXPRESSIONS) {
        Expression.evaluateDetailed(expression, scope);
      }
    }
  });

  bench('CSP モード', () => {
    for (const scope of scopes) {
      for (const expression of ROW_EXPRESSIONS) {
        cspEvaluateDetailed(expression, scope);
      }
    }
  });
});

/** 従来の方式の入口 */
const legacyEvaluateDetailed = Expression.evaluateDetailed.bind(Expression);

/**
 * 式の評価の方式を切り替えます。
 *
 * @param mode 方式
 */
function useMode(mode: 'legacy' | 'csp'): void {
  (
    Expression as unknown as {
      evaluateDetailed: (
        e: string,
        b?: Record<string, unknown>,
      ) => ExpressionEvaluationDetail;
    }
  ).evaluateDetailed =
    mode === 'legacy' ? legacyEvaluateDetailed : cspEvaluateDetailed;
}

/**
 * 一覧を描く準備をします（テンプレートの走査まで）。
 *
 * @returns 一覧の根の要素
 */
async function prepareList(): Promise<HTMLElement> {
  await import('../../src/observer');
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.innerHTML = LIST;
  document.body.appendChild(container);
  await Core.scan(container);
  await waitForIdle();
  return container.querySelector('#root') as HTMLElement;
}

/** 一覧の計測を繰り返す回数（最初の 1 回は慣らしとして捨てる） */
const ROUNDS = 4;

/**
 * 処理にかかった時間を測ります。
 *
 * @param action 処理
 * @returns 時間（ミリ秒）
 */
async function measure(action: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await action();
  return performance.now() - start;
}

/**
 * 中央値を返します。
 *
 * @param values 値
 * @returns 中央値
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

describe(`一覧（${ROW_COUNT} 行）`, () => {
  // tinybench の beforeEach は vitest から渡らないため、準備と計測を 1 回の実行の中で
  // 分け、方式を交互に入れ替えながら測って中央値を出力する。
  bench(
    '従来の方式と CSP モードを交互に測る',
    async () => {
      type Scenario = 'open' | 'change' | 'add';
      const results = {
        legacy: {
          open: [] as number[],
          change: [] as number[],
          add: [] as number[],
        },
        csp: {
          open: [] as number[],
          change: [] as number[],
          add: [] as number[],
        },
      };
      for (let round = 0; round < ROUNDS; round += 1) {
        for (const mode of ['legacy', 'csp'] as const) {
          useMode(mode);
          const record = (scenario: Scenario, time: number) => {
            if (round > 0) {
              results[mode][scenario].push(time);
            }
          };
          const root = await prepareList();
          record(
            'open',
            await measure(async () => {
              await Core.setBindingData(root, {
                rows: makeRows(ROW_COUNT),
                title: '一覧',
              });
              await waitForIdle();
            }),
          );
          record(
            'change',
            await measure(async () => {
              await Core.setBindingData(root, {
                rows: makeRows(ROW_COUNT),
                title: '変えた題',
              });
              await waitForIdle();
            }),
          );
          // 開くのは jsdom で 1 回 20 秒を超えるため、同じ一覧へ続けて足す。
          record(
            'add',
            await measure(async () => {
              await Core.setBindingData(root, {
                rows: makeRows(ROW_COUNT + 1),
                title: '変えた題',
              });
              await waitForIdle();
            }),
          );
        }
      }
      useMode('legacy');
      const lines = (['open', 'change', 'add'] as const).map(scenario => {
        const legacy = median(results.legacy[scenario]);
        const csp = median(results.csp[scenario]);
        const name = {
          open: '開く',
          change: '状態を 1 つ変える',
          add: '行を 1 件足す',
        }[scenario];
        return `${name}: 従来の方式 ${legacy.toFixed(0)} ms / CSP モード ${csp.toFixed(0)} ms（${(csp / legacy).toFixed(2)} 倍）`;
      });
      const heading = `一覧（${ROW_COUNT} 行、中央値、${ROUNDS - 1} 回）`;
      process.stdout.write(['', heading, ...lines, ''].join('\n'));
    },
    {iterations: 1, time: 0, warmupIterations: 0, warmupTime: 0},
  );
});
