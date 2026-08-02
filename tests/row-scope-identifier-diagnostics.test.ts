/* @vitest-environment jsdom */
/**
 * @fileoverview 行スコープの名前が「別スコープで供給されているキー」として
 * 誤って警告されないことの回帰テスト。
 *
 * `data-each` は、コンテナが未マウント（または非表示）のあいだ差分更新をスキップ
 * します。このときテンプレートが切り出されないため、`Core.scan()` はそのまま行の
 * マークアップへ降りて、行の式を**コンテナのスコープ**で評価します。行スコープの
 * 名前（`data-each-arg` / `data-each-index`）はそこには無いため、行が描画されて
 * 供給された後になって「別のスコープでは供給されているキー」の診断条件を満たして
 * しまい、正常な構成に警告が出ていました。
 *
 * 1. 未マウント走査を経ても行スコープの名前（引数名・インデックス名）は警告しない
 * 2. 行の中の `data-fetch` は行が描画されれば正しく評価される（誤警告の対象が正常系）
 * 3. 接頭辞を変えたページ・引数名を式で書いた構成でも除外できる
 * 4. 応答のバインド先を取り違えた宣言は従来どおり警告する（診断が効いたままである）
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Expression from '../src/expression';
import Queue from '../src/queue';
import {waitForDomSettled} from './helpers/async';

/**
 * 読み込みスクリプトを差し替えて属性の接頭辞を設定します。
 *
 * @param prefix 設定する接頭辞（`null` なら `data-prefix` を付けない）
 * @return 戻り値はありません。
 */
function setScriptPrefix(prefix: string | null): void {
  document.querySelectorAll('script').forEach(script => script.remove());
  const script = document.createElement('script');
  script.src = 'haori.iife.js';
  if (prefix !== null) {
    script.setAttribute('data-prefix', prefix);
  }
  document.body.appendChild(script);
  Env.detect();
}

/** 警告メッセージのうち、この診断だけを抜き出します。 */
const crossScopeWarnings = (warn: ReturnType<typeof vi.spyOn>): string[] =>
  (warn.mock.calls as unknown[][])
    .map(args => args.map(arg => String(arg)).join(' '))
    .filter(message => message.includes('missing from this scope'));

describe('行スコープの名前の診断', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setStrictBind(false);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({content: [{id: 1, label: 'A'}]}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Env.setStrictBind(false);
    Dev.enable();
    document.body.innerHTML = '';
    // 既定の接頭辞へ戻す（他のテストへ影響させない）。
    setScriptPrefix('data-');
    document.body.innerHTML = '';
  });

  /**
   * 報告された構成（行の中で候補を取得する `data-fetch`）を組み立てます。
   *
   * `document` へ入れる前に走査することで、`data-each` が差分更新をスキップして
   * 行の描画より前にテンプレートが評価される状況を作ります。
   *
   * @returns 組み立てた要素
   */
  async function mountAfterScan(): Promise<HTMLElement> {
    // 同じ名前を `data-each-arg` に使う一覧を先に描画しておく。報告条件は
    // 「別のスコープで供給された実績がある」ことなので、行スコープの名前が
    // 一度でも供給されていないと診断そのものが動かない（実ページでは同じ
    // 引数名を使う別の一覧が先に描画されている状態に相当する）。
    const other = document.createElement('div');
    document.body.appendChild(other);
    other.innerHTML = `
      <div data-bind='{"others":[{"label":"A"}]}'>
        <ul data-each="others" data-each-arg="c" data-each-index="i">
          <li>{{i}}:{{c.label}}</li>
        </ul>
      </div>`;
    await Core.scan(other);
    await waitForDomSettled();
    await Queue.waitForIdle();

    const host = document.createElement('div');
    host.innerHTML = `
      <form id="owner" data-form
            data-bind='{"contracts":[{"optionsAgreed":false}]}'>
        <div data-form-list="contracts" data-each="contracts"
             data-each-arg="c" data-each-index="i">
          <div id="row-{{i}}">
            <input type="checkbox" name="optionsAgreed" value="true">
            <div data-fetch="{{c.optionsAgreed ? '/api/apply-options.json' : null}}"
                 data-fetch-arg="optionCandidates">
              <span class="count">{{(optionCandidates.content ?? []).length}}</span>
            </div>
          </div>
        </div>
      </form>`;
    // 未マウントのまま走査する（行の描画はここでは行われない）。
    await Core.scan(host);
    await waitForDomSettled();
    await Queue.waitForIdle();
    // 挿入して描画まで進める。
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForDomSettled();
    await Queue.waitForIdle();
    return host;
  }

  it('未マウント走査を経ても行スコープの名前は警告しない', async () => {
    await mountAfterScan();

    const messages = crossScopeWarnings(warn);
    expect(messages, `出力: ${messages.join(' / ')}`).toEqual([]);
  });

  it('行が描画されれば行の中の data-fetch は正しく評価される', async () => {
    const host = await mountAfterScan();

    // 行が描画され、行スコープの式が解決していることを確認する
    // （誤警告の対象が正常系であることの裏付け）。
    expect(host.querySelector('#row-0'), '行が描画されている').not.toBeNull();
    expect(host.querySelector('.count')?.textContent).toBe('0');
    expect(
      (globalThis.fetch as unknown as {mock: {calls: unknown[][]}}).mock.calls
        .length,
      '未同意のあいだは取得しない',
    ).toBe(0);
  });

  it('引数名とインデックス名の両方を登録する', async () => {
    // 行のテンプレートには `id="row-{{i}}"` のようにインデックス名を参照する式も
    // あるため、引数名だけを外しても報告が残る。
    const registry = (
      Expression as unknown as {rowScopeIdentifiers: Set<string>}
    ).rowScopeIdentifiers;
    await mountAfterScan();

    expect(registry.has('c'), '引数名が登録されている').toBe(true);
    expect(registry.has('i'), 'インデックス名が登録されている').toBe(true);
  });

  it('接頭辞を変えたページでも報告しない', async () => {
    // 属性名は `Env.prefix` から組み立てるため、接頭辞を変えた読み込みでも
    // 行スコープの名前を拾えている必要がある（0.37.1 と同種の取りこぼし）。
    setScriptPrefix('haori-');
    expect(Env.prefix).toBe('haori-');

    // 別スコープで名前が供給された実績を作る。
    const other = document.createElement('div');
    document.body.appendChild(other);
    other.innerHTML = `
      <div haori-bind='{"others":[{"label":"A"}]}'>
        <ul haori-each="others" haori-each-arg="pfxArg"
            haori-each-index="pfxIndex">
          <li>{{pfxIndex}}: {{pfxArg.label}}</li>
        </ul>
      </div>`;
    await Core.scan(other);
    await waitForDomSettled();
    await Queue.waitForIdle();

    // 未マウントのまま走査する（行の描画より前にテンプレートが評価される）。
    const host = document.createElement('div');
    host.innerHTML = `
      <div haori-bind='{"rows":[{"label":"B"}]}'>
        <ul haori-each="rows" haori-each-arg="pfxArg"
            haori-each-index="pfxIndex">
          <li id="row-{{pfxIndex}}">{{pfxArg.label}}</li>
        </ul>
      </div>`;
    await Core.scan(host);
    await waitForDomSettled();
    await Queue.waitForIdle();

    const messages = crossScopeWarnings(warn);
    expect(messages, `出力: ${messages.join(' / ')}`).toEqual([]);
  });

  it('引数名を式で書いた構成でも登録される', async () => {
    // `data-each-arg` の値は評価後の文字列を使う（属性値に式を書ける仕様）。
    // 生値のまま登録すると `{{argName}}` という名前を覚えてしまい、外れない。
    const registry = (
      Expression as unknown as {rowScopeIdentifiers: Set<string>}
    ).rowScopeIdentifiers;
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = `
      <div data-bind='{"argName":"dynamicArg","rows":[{"label":"A"}]}'>
        <ul data-each="rows" data-each-arg="{{argName}}">
          <li class="dyn">{{dynamicArg.label}}</li>
        </ul>
      </div>`;
    await Core.scan(host);
    await waitForDomSettled();
    await Queue.waitForIdle();

    expect(host.querySelector('.dyn')?.textContent, '行が描画されている').toBe(
      'A',
    );
    expect(registry.has('dynamicArg')).toBe(true);
  });

  it('同じ名前を使う別の式も報告しない（名前単位で外す）', async () => {
    Expression.recordRowScopeIdentifiers(['sharedRowArg']);
    Expression.evaluateDetailed('sharedRowArg.label', {
      sharedRowArg: {label: 'A'},
    });
    // 行のテンプレートに複数の式がある場合を模す。
    Expression.evaluateDetailed('(sharedRowArg.label ?? "")', {});
    Expression.evaluateDetailed('sharedRowArg.id ? "y" : "n"', {});
    await Queue.waitForIdle();

    const messages = crossScopeWarnings(warn);
    expect(messages, `出力: ${messages.join(' / ')}`).toEqual([]);
  });

  it('応答のバインド先を取り違えた宣言は従来どおり警告する', async () => {
    // 行スコープの名前を登録済みにしても、別の名前の診断は効いたままである。
    Expression.recordRowScopeIdentifiers(['c', 'i']);
    Expression.evaluateDetailed('rowScopePlans.content', {
      rowScopePlans: {content: [{id: 1}]},
    });
    const expression = '(rowScopePlans.content ?? []).length';
    Expression.evaluateDetailed(expression, {});
    await Queue.waitForIdle();

    const messages = crossScopeWarnings(warn);
    expect(messages.length, `出力: ${messages.join(' / ')}`).toBe(1);
    expect(messages[0]).toContain('rowScopePlans');
    expect(messages[0]).toContain(expression);
  });

  it('登録した行スコープの名前は報告しない（単体）', async () => {
    Expression.recordRowScopeIdentifiers(['rowScopeArg']);
    // 別スコープで供給された実績を作る（行の描画に相当）。
    Expression.evaluateDetailed('rowScopeArg.label', {
      rowScopeArg: {label: 'A'},
    });
    // 行の描画より前のテンプレート評価に相当する（行スコープが無い）。
    Expression.evaluateDetailed('(rowScopeArg.label ?? "")', {});
    await Queue.waitForIdle();

    const messages = crossScopeWarnings(warn);
    expect(messages, `出力: ${messages.join(' / ')}`).toEqual([]);
  });

  it('本番（開発モード無効）では行スコープの名前を記録しない', () => {
    Dev.disable();
    const registry = (
      Expression as unknown as {rowScopeIdentifiers: Set<string>}
    ).rowScopeIdentifiers;
    const before = registry.size;
    // 診断を行わない本番では常駐量を増やさない。
    Expression.recordRowScopeIdentifiers(['productionRowScopeArg']);
    expect(registry.size).toBe(before);
  });
});
