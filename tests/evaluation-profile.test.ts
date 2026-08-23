/* @vitest-environment jsdom */
/**
 * @fileoverview 式評価の計測（`evaluation profile`）のテスト。
 *
 * 期待値の根拠は仕様「パフォーマンス測定」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

type EvaluationProfileReport = {
  totalDurationMs: number;
  totalCalls: number;
  entryCount: number;
  top: Array<{
    where: string;
    template: string;
    elements: number;
    calls: number;
    totalDurationMs: number;
    maxDurationMs: number;
    sharePercent: number;
  }>;
};

type EvaluationProfileAccessor = {
  start: () => void;
  stop: () => void;
  reset: () => void;
  report: (limit?: number) => EvaluationProfileReport;
  snapshot: () => Array<{
    elementId: string;
    attributes: Array<{
      name: string;
      template: string;
      calls: number;
      totalDurationMs: number;
      maxDurationMs: number;
      placeholders: Array<{
        expression: string;
        calls: number;
        totalDurationMs: number;
        maxDurationMs: number;
      }>;
    }>;
    texts: Array<{
      childIndex: number;
      template: string;
      calls: number;
      totalDurationMs: number;
      maxDurationMs: number;
      placeholders: Array<{
        expression: string;
        calls: number;
        totalDurationMs: number;
        maxDurationMs: number;
      }>;
    }>;
  }>;
};

describe('evaluation profile', () => {
  let container: HTMLElement;

  beforeEach(() => {
    Dev.enable();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const profile = (globalThis as Record<string, unknown>).__HAORI_EVALUATION_PROFILE__ as
      | EvaluationProfileAccessor
      | undefined;
    profile?.stop();
    profile?.reset();
    Dev.disable();
    document.body.removeChild(container);
  });

  it('属性とテキストの評価回数を要素ごとに集計する', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"name":"Alice","status":"active"}'>
        <section id="host" title="{{name}}">
          <span>{{name}}</span>
          <span>{{status}}</span>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const profile = (globalThis as Record<string, unknown>).__HAORI_EVALUATION_PROFILE__ as
      | EvaluationProfileAccessor
      | undefined;
    expect(profile).toBeDefined();
    profile!.reset();
    // 集計は明示的に開始するまで行わない（仕様「パフォーマンス測定」）。
    profile!.start();

    await Core.evaluateAll(Fragment.get(host) as ElementFragment);
    await waitForDomSettled();

    const snapshot = profile!.snapshot();
    const hostEntry = snapshot.find(entry => entry.elementId === 'section#host');
    expect(hostEntry).toBeDefined();
    expect(hostEntry?.attributes).toEqual([
      expect.objectContaining({
        name: 'title',
        template: '{{name}}',
        calls: 1,
        placeholders: [
          expect.objectContaining({
            expression: 'name',
            calls: 1,
          }),
        ],
      }),
    ]);
    expect(hostEntry?.attributes[0]?.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(hostEntry?.attributes[0]?.maxDurationMs).toBeGreaterThanOrEqual(0);
    expect(
      hostEntry?.attributes[0]?.placeholders[0]?.totalDurationMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      hostEntry?.attributes[0]?.placeholders[0]?.maxDurationMs,
    ).toBeGreaterThanOrEqual(0);

    const firstTextEntry = snapshot.find(
      entry => entry.elementId === 'section#host > span:nth-child(1)',
    );
    expect(firstTextEntry?.texts).toEqual([
      expect.objectContaining({
        childIndex: 0,
        template: '{{name}}',
        calls: 1,
        placeholders: [
          expect.objectContaining({
            expression: 'name',
            calls: 1,
          }),
        ],
      }),
    ]);
    expect(firstTextEntry?.texts[0]?.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(firstTextEntry?.texts[0]?.maxDurationMs).toBeGreaterThanOrEqual(0);

    const secondTextEntry = snapshot.find(
      entry => entry.elementId === 'section#host > span:nth-child(2)',
    );
    expect(secondTextEntry?.texts).toEqual([
      expect.objectContaining({
        childIndex: 0,
        template: '{{status}}',
        calls: 1,
        placeholders: [
          expect.objectContaining({
            expression: 'status',
            calls: 1,
          }),
        ],
      }),
    ]);
    expect(secondTextEntry?.texts[0]?.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(secondTextEntry?.texts[0]?.maxDurationMs).toBeGreaterThanOrEqual(0);
  });

  // 仕様「重い宣言の一覧（`report`）」の「所要時間の合計が大きい宣言から順に
  // 並べた要約を返し」
  it('宣言を所要時間の合計が大きい順に並べて要約する', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"items":[{"id":1,"n":"a"},{"id":2,"n":"b"}]}'>
        <section id="host" title="{{items.length}}">
          <p>{{items.length}} 件</p>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const profile = (globalThis as Record<string, unknown>)
      .__HAORI_EVALUATION_PROFILE__ as EvaluationProfileAccessor | undefined;
    expect(profile).toBeDefined();
    profile!.reset();
    profile!.start();

    await Core.evaluateAll(Fragment.get(host) as ElementFragment);
    await waitForDomSettled();

    const report = profile!.report();
    // 集計した宣言の数・回数・所要時間の合計を返す。
    expect(report.entryCount).toBeGreaterThan(0);
    expect(report.totalCalls).toBeGreaterThan(0);
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.top.length).toBe(Math.min(report.entryCount, 20));

    // 宣言の位置は属性が `@属性名`、テキストが `#子の位置`（仕様「重い宣言の
    // 一覧（`report`）」の「属性は `要素識別子 @属性名`、テキストは
    // `要素識別子 #子の位置`」）。
    const wheres = report.top.map(entry => entry.where);
    expect(wheres).toContain('section#host @title');
    expect(wheres).toContain('section#host > p:nth-child(1) #0');

    // 所要時間の合計の降順で並ぶ。
    const durations = report.top.map(entry => entry.totalDurationMs);
    const sorted = [...durations].sort((left, right) => right - left);
    expect(durations).toEqual(sorted);

    // 各行は元テンプレートと回数・割合を持つ。
    const titleEntry = report.top.find(
      entry => entry.where === 'section#host @title',
    );
    expect(titleEntry?.template).toBe('{{items.length}}');
    expect(titleEntry?.calls).toBe(1);
    expect(titleEntry?.maxDurationMs).toBeGreaterThanOrEqual(0);
    // 割合は所要時間の合計に対する比（仕様「重い宣言の一覧（`report`）」の
    // 「`totalDurationMs` が全体に占める割合」）。
    expect(
      report.top.reduce((total, entry) => total + entry.sharePercent, 0),
    ).toBeCloseTo(100, 0);

    // 合計は各行の合計と一致する（`limit` で切る前の全件）。
    const all = profile!.report(1000);
    const sum = all.top.reduce((total, entry) => total + entry.calls, 0);
    expect(sum).toBe(all.totalCalls);
  });

  // 仕様「重い宣言の一覧（`report`）」の「`limit` は出力する宣言の数で、既定は
  // 20 です」
  it('limit で出力する宣言の数を絞る', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"a":1,"b":2,"c":3}'>
        <section id="host" title="{{a}}" lang="{{b}}" dir="{{c}}"></section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const profile = (globalThis as Record<string, unknown>)
      .__HAORI_EVALUATION_PROFILE__ as EvaluationProfileAccessor | undefined;
    profile!.reset();
    profile!.start();

    await Core.evaluateAll(Fragment.get(host) as ElementFragment);
    await waitForDomSettled();

    expect(profile!.report(1000).entryCount).toBeGreaterThanOrEqual(3);
    expect(profile!.report(2).top.length).toBe(2);
    // 絞っても合計は全件のまま返す。
    expect(profile!.report(2).totalCalls).toBe(
      profile!.report(1000).totalCalls,
    );
  });

  // 仕様「重い宣言の一覧（`report`）」の「集計の単位は「宣言」であり、要素では
  // ありません」「`data-each` の行テンプレートに書いた 1 つの宣言は行の数だけ要素に
  // 現れますが、`report()` はそれらを 1 行にまとめます」
  it('行テンプレートの宣言を行ごとに分けず 1 つにまとめる', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"items":[
        {"id":1,"n":"a"},{"id":2,"n":"b"},{"id":3,"n":"c"}]}'>
        <ul id="list" data-each="items" data-each-arg="r" data-each-key="id">
          <li title="{{r.n}}">{{r.n}}</li>
        </ul>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const profile = (globalThis as Record<string, unknown>)
      .__HAORI_EVALUATION_PROFILE__ as EvaluationProfileAccessor | undefined;
    profile!.reset();
    profile!.start();

    // 行の値を変えて 3 行すべてを再評価させる。
    await Core.setBindingData(root, {
      items: [
        {id: 1, n: 'A'},
        {id: 2, n: 'B'},
        {id: 3, n: 'C'},
      ],
    });
    await waitForDomSettled();

    const report = profile!.report(1000);
    const titles = report.top.filter(
      entry => entry.template === '{{r.n}}' && entry.where.includes('@title'),
    );
    // 3 行あっても 1 行にまとまる。
    expect(titles).toHaveLength(1);
    expect(titles[0]?.elements).toBe(3);
    expect(titles[0]?.calls).toBe(3);

    const texts = report.top.filter(
      entry => entry.template === '{{r.n}}' && entry.where.includes('#0'),
    );
    expect(texts).toHaveLength(1);
    expect(texts[0]?.elements).toBe(3);
    expect(texts[0]?.calls).toBe(3);

    // 属性とテキストは別の宣言として数える。
    expect(report.entryCount).toBeGreaterThanOrEqual(2);
    // 合計はまとめる前の全要素分。
    expect(report.totalCalls).toBeGreaterThanOrEqual(6);
  });

  // 仕様「重い宣言の一覧（`report`）」の「まとまりの代表として、所要時間の合計が
  // 最も大きい要素の位置を載せる」「`totalDurationMs` 所要時間の合計」
  // 「`maxDurationMs` 1 回の最大所要時間」
  //
  // 行ごとの所要時間に差が出るよう、同じテンプレートで扱う配列の長さだけを変える
  // （1 行目は軽く、2 行目は重い）。差が無いと、合計・最大・代表のどれを取っても
  // 同じ値になり、まとめ方の違いを観測できない。
  it('まとまりの合計・最大・代表を要素をまたいで求める', async () => {
    const light = [1];
    const heavy = Array.from({length: 60000}, (_value, index) => index);
    container.innerHTML = `
      <div id="root">
        <ul id="list" data-each="items" data-each-arg="r" data-each-key="id">
          <li>{{r.list.filter(x => x >= 0).length}}</li>
        </ul>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    await Core.setBindingData(root, {
      items: [
        {id: 1, list: light},
        {id: 2, list: heavy},
      ],
    });
    await Core.scan(root);
    await waitForDomSettled();

    const profile = (globalThis as Record<string, unknown>)
      .__HAORI_EVALUATION_PROFILE__ as EvaluationProfileAccessor | undefined;
    profile!.reset();
    profile!.start();

    await Core.setBindingData(root, {
      items: [
        {id: 1, list: [...light, 2]},
        {id: 2, list: [...heavy, 1]},
      ],
    });
    await waitForDomSettled();

    const template = '{{r.list.filter(x => x >= 0).length}}';
    const report = profile!.report(1000);
    const entry = report.top.find(item => item.template === template);
    expect(entry).toBeDefined();
    expect(entry?.elements).toBe(2);

    const perElement = profile!
      .snapshot()
      .map(element => ({
        where: `${element.elementId} #0`,
        texts: element.texts.filter(text => text.template === template),
      }))
      .filter(element => element.texts.length > 0)
      .map(element => ({
        where: element.where,
        totalDurationMs: element.texts.reduce(
          (total, text) => total + text.totalDurationMs,
          0,
        ),
        maxDurationMs: Math.max(
          ...element.texts.map(text => text.maxDurationMs),
        ),
      }));
    expect(perElement).toHaveLength(2);
    // 2 行目のほうが重い（まとめ方の違いが観測できる前提の確認）。
    const heaviest = [...perElement].sort(
      (left, right) => right.totalDurationMs - left.totalDurationMs,
    )[0];
    expect(heaviest.totalDurationMs).toBeGreaterThan(0);

    // 合計は 2 行分の和。
    expect(entry?.totalDurationMs).toBeCloseTo(
      perElement.reduce((total, item) => total + item.totalDurationMs, 0),
      6,
    );
    // 最大は 2 行のうちの最大。
    expect(entry?.maxDurationMs).toBe(
      Math.max(...perElement.map(item => item.maxDurationMs)),
    );
    // 代表は最も時間を使った要素。
    expect(entry?.where).toBe(heaviest.where);
  });

  // 仕様「重い宣言の一覧（`report`）」の「同じ内容を表形式でコンソールへ出力します」
  it('要約を表形式でコンソールへ出力する', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"a":1}'>
        <section id="host" title="{{a}}"></section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const profile = (globalThis as Record<string, unknown>)
      .__HAORI_EVALUATION_PROFILE__ as EvaluationProfileAccessor | undefined;
    profile!.reset();
    profile!.start();

    await Core.evaluateAll(Fragment.get(host) as ElementFragment);
    await waitForDomSettled();

    const logged: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logged.push(args.map(item => String(item)).join(' '));
    };
    try {
      profile!.report();
    } finally {
      console.log = original;
    }

    const output = logged.join('\n');
    expect(output).toContain('[Haori][evaluation-profile]');
    expect(output).toContain('declarations=1');
    expect(output).toContain('section#host @title');
    expect(output).toContain('{{a}}');
  });
});
