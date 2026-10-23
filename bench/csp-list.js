/* global Haori */
/**
 * @fileoverview 300 行の一覧で、従来の方式と CSP モードの描画の時間を測るページの処理
 *
 * `bench/run.mjs` から `window.runBench(回数)` を呼びます。計る操作は次の 3 つです。
 *
 * - 開く: 空の一覧へ 300 行を流し込み、描き終えるまで
 * - 変える: 全行が参照する値（題）を 1 つ変え、描き終えるまで
 * - 足す: 行を 1 件足し、描き終えるまで
 *
 * それぞれを、スコープのキーが少ない場合（狭い）と、行と関係の無いキーを 40 個
 * 足した場合（広い）で計ります。
 */

const ROW_COUNT = 300;

const LIST =
  '<div id="root"><table><tbody data-each="rows" data-each-arg="r" data-each-key="id">' +
  `<tr data-attr-class="{{r.status === 'done' ? 'table-success' : ''}}">` +
  '<td>{{r.id}}</td><td>{{r.name}}</td><td>{{r.price.toLocaleString()}}円</td>' +
  '<td data-if="r.stock > 0">{{r.stock}}</td><td>{{r.tags.join(\'、\')}}</td>' +
  '<td>{{title}}</td></tr></tbody></table></div>';

/**
 * 行のデータを作ります。
 *
 * @param {number} count 行の数
 * @returns {object[]} 行
 */
function makeRows(count) {
  return Array.from({length: count}, (_, i) => ({
    id: i + 1,
    name: `商品${i + 1}`,
    price: 1000 + i * 37,
    stock: i % 4,
    status: i % 3 === 0 ? 'done' : 'open',
    tags: ['在庫', `棚${i % 10}`],
  }));
}

/**
 * 行と関係の無いキーを作ります（広い場合だけ）。
 *
 * @param {boolean} wide 広い場合は true
 * @returns {object} キー
 */
function extraKeys(wide) {
  const keys = {};
  if (wide) {
    for (let i = 0; i < 40; i++) {
      keys[`k${i}`] = {v: i, list: [i, i + 1]};
    }
  }
  return keys;
}

/**
 * 1 回分を計ります。
 *
 * @param {boolean} csp CSP モードで計る場合は true
 * @param {boolean} wide 広い場合は true
 * @returns {Promise<number[]>} 開く・変える・足すの時間（ミリ秒）
 */
async function measureOnce(csp, wide) {
  Haori.setCsp(csp);
  const host = document.getElementById('host');
  host.innerHTML = LIST;
  await Haori.Core.scan(host);
  await Haori.waitForRenders();
  const root = document.getElementById('root');
  const steps = [
    {rows: makeRows(ROW_COUNT), title: '一覧'},
    {rows: makeRows(ROW_COUNT), title: '変えた題'},
    {rows: makeRows(ROW_COUNT + 1), title: '変えた題'},
  ];
  const times = [];
  for (const step of steps) {
    const start = performance.now();
    await Haori.Core.setBindingData(root, {...step, ...extraKeys(wide)});
    await Haori.waitForRenders();
    times.push(performance.now() - start);
  }
  return times;
}

/**
 * 中央値を返します。
 *
 * @param {number[]} values 値
 * @returns {number} 中央値
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * 2 つの方式を交互に計り、操作ごとの中央値を返します（1 回目は捨てます）。
 *
 * @param {number} rounds 回数
 * @returns {Promise<object>} 方式 → 広さ → [開く, 変える, 足す] の中央値（ミリ秒）
 */
window.runBench = async rounds => {
  const modes = {legacy: false, csp: true};
  const samples = {};
  for (const mode of Object.keys(modes)) {
    samples[mode] = {narrow: [[], [], []], wide: [[], [], []]};
  }
  for (let round = 0; round < rounds; round++) {
    for (const mode of Object.keys(modes)) {
      for (const width of ['narrow', 'wide']) {
        const times = await measureOnce(modes[mode], width === 'wide');
        if (round > 0) {
          times.forEach((time, index) =>
            samples[mode][width][index].push(time),
          );
        }
      }
    }
  }
  const result = {};
  for (const mode of Object.keys(samples)) {
    result[mode] = {};
    for (const width of ['narrow', 'wide']) {
      result[mode][width] = samples[mode][width].map(values =>
        Math.round(median(values)),
      );
    }
  }
  return result;
};
