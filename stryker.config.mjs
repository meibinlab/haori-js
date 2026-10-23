// @ts-check
/**
 * ミューテーションテストの設定です（`npm run test:mutation`）。
 *
 * CSP モードの評価器（構文解析・評価・名前の規則）と、`*-run` 系の宣言を
 * `new Function` を使わずに呼ぶ部分（登録した関数・CSP モードでの `*-run`）の
 * コードを機械的に書き換え、テストが書き換えを見つけられるか（落ちるか）を調べます。落ちなかった
 * 書き換えは、テストが確かめていない振る舞いか、意味の無いコードです。
 *
 * テストは評価器のテストに絞ります（`vitest.mutation.config.ts`）。全テストを流すと
 * 書き換え 1 つあたりの時間が大きくなるためです。
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  testRunner: 'vitest',
  // Node 25 以降の Web Storage は jsdom の localStorage を上書きするため止める
  // （単体テストを `NODE_OPTIONS=--no-webstorage` で流すのと同じ）。
  testRunnerNodeArgs:
    Number(process.versions.node.split('.')[0]) >= 25 ? ['--no-webstorage'] : [],
  vitest: {
    configFile: 'vitest.mutation.config.ts',
    related: false,
  },
  mutate: [
    'src/expression_parser.ts',
    'src/expression_interpreter.ts',
    'src/expression_rules.ts',
    'src/handlers.ts',
    'src/run_attribute.ts',
  ],
  coverageAnalysis: 'perTest',
  // 最初の実行は書き換えの計測も兼ねるため、評価器のテスト全体で数分かかる。
  dryRunTimeoutMinutes: 30,
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: {fileName: 'reports/mutation/index.html'},
  jsonReporter: {fileName: 'reports/mutation/mutation.json'},
  thresholds: {high: 90, low: 80, break: null},
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};

export default config;
