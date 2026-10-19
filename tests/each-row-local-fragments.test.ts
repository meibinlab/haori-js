/* @vitest-environment jsdom */
/**
 * @fileoverview 行の外を参照するテンプレートで、行スコープの名前だけを参照する部分を
 * 評価し直さないこと。
 *
 * 期待値は仕様「data-each の差分更新アルゴリズム」の次の記述から取っている。
 *
 * - 「**行の外を参照するテンプレートでも、行スコープの名前だけを参照する部分は評価し
 *   直しません。** 要素データが同値の行を再評価するとき、行スコープの名前だけを参照
 *   する要素（配下を含む）とテキストは評価を省きます」
 * - 「`data-if` と `data-row`（差分更新が行の根へ付けるリストキー）以外の `data-*`
 *   属性を持つ要素（`data-bind`・`data-derive`・`data-each`・手続きなど）の配下。
 *   配下へ公開する名前を変え得るためです」
 * - 「表示へ切り替わった `data-if` の配下。非表示のあいだは評価していないためです」
 * - 「差分更新で再利用した行も、要素データとインデックスが同値なら同じ規則で省きます」
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Expression from '../src/expression';
import {waitForIdle} from './helpers/async';

describe('行スコープの名前だけを参照する部分の再評価', () => {
  let container: HTMLElement;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await import('../src/observer');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  /**
   * HTML を走査します。
   *
   * @param html 走査する HTML
   * @returns データを載せる要素
   */
  async function mount(html: string): Promise<HTMLElement> {
    container.innerHTML = `<div id="root">${html}</div>`;
    await Core.scan(container);
    await waitForIdle();
    return container.querySelector('#root') as HTMLElement;
  }

  /**
   * バインドデータを設定し、その間に評価した式を数えます。
   *
   * @param root データを載せる要素
   * @param data 設定するデータ
   * @returns 式ごとの評価の回数
   */
  async function countEvaluations(
    root: HTMLElement,
    data: Record<string, unknown>,
  ): Promise<Record<string, number>> {
    const spy = vi.spyOn(Expression, 'evaluateDetailed');
    await Core.setBindingData(root, data);
    await waitForIdle();
    const counts: Record<string, number> = {};
    for (const call of spy.mock.calls) {
      const expression = String(call[0]).trim();
      counts[expression] = (counts[expression] ?? 0) + 1;
    }
    spy.mockRestore();
    return counts;
  }

  /**
   * ノードの一覧を作ります。
   *
   * @param count ノードの数
   * @returns ノードの配列
   */
  function nodes(count: number): Array<Record<string, unknown>> {
    return Array.from({length: count}, (_, i) => ({
      id: `n${i}`,
      label: `ノード${i}`,
      kind: '質問',
      memo: `メモ${i}`,
      choices: [0, 1].map(j => ({id: `c${i}-${j}`, label: `選択肢${i}-${j}`})),
    }));
  }

  /** 状態 `editingForm` を参照するノードの一覧（仕様の例を元にした構成）。 */
  const LIST =
    '<div id="list" data-each="nodes" data-each-arg="n" data-each-key="id">' +
    '<section>' +
    '<p class="label">{{n.label}}</p>' +
    '<p class="kind" title="{{title}}">{{n.kind}}<b>{{title}}</b></p>' +
    '<div class="memo" data-if="editingForm !== n.id">{{n.memo}}<span>{{n.id}}</span></div>' +
    '<div class="editing" data-if="editingForm === n.id">編集中</div>' +
    '<ul data-each="n.choices" data-each-arg="c"><li>{{c.label}}' +
    '<span class="choice-editing" data-if="editingForm === c.id">選択肢を編集中</span>' +
    '</li></ul>' +
    '</section></div>';

  it('状態の 1 つのキーだけを変えると、行スコープの名前だけを参照する式は評価し直さない', async () => {
    const root = await mount(LIST);
    const data = {nodes: nodes(4), editingForm: null, title: '題'};
    await Core.setBindingData(root, data);
    await waitForIdle();

    const counts = await countEvaluations(root, {...data, editingForm: 'n2'});

    expect(counts['n.label'] ?? 0).toBe(0);
    expect(counts['n.kind'] ?? 0).toBe(0);
    expect(counts['n.memo'] ?? 0).toBe(0);
    expect(counts['n.id'] ?? 0).toBe(0);
    expect(counts['c.label'] ?? 0).toBe(0);
    expect(counts['editingForm === n.id']).toBe(4);
    expect(counts['editingForm === c.id']).toBe(8);
    // 描画の内容は変わらない。
    const sections = Array.from(container.querySelectorAll('section'));
    expect(sections.map(s => s.querySelector('.label')?.textContent)).toEqual([
      'ノード0',
      'ノード1',
      'ノード2',
      'ノード3',
    ]);
    expect(
      (sections[2].querySelector('.editing') as HTMLElement).style.display,
    ).not.toBe('none');
    expect(
      (sections[2].querySelector('.memo') as HTMLElement).style.display,
    ).toBe('none');
    expect(
      (sections[1].querySelector('.memo') as HTMLElement).textContent,
    ).toBe('メモ1n1');
  });

  it('行の外を参照する部分は、今までどおり評価し直す', async () => {
    const root = await mount(LIST);
    const data = {nodes: nodes(2), editingForm: null, title: '題'};
    await Core.setBindingData(root, data);
    await waitForIdle();

    await Core.setBindingData(root, {...data, title: '新しい題'});
    await waitForIdle();

    expect(
      Array.from(container.querySelectorAll('.kind')).map(p =>
        p.getAttribute('title'),
      ),
    ).toEqual(['新しい題', '新しい題']);
    expect(
      Array.from(container.querySelectorAll('.kind b')).map(b => b.textContent),
    ).toEqual(['新しい題', '新しい題']);
  });

  it('名前を差し替える要素（data-derive）の配下は、行スコープの名前だけを参照していても評価し直す', async () => {
    // `data-derive-name` が配下の `n` を差し替えるため、`{{n.label}}` は行の要素データ
    // ではなく `mode` で決まる。
    const root = await mount(
      '<div data-each="nodes" data-each-arg="n" data-each-key="id">' +
        '<section><div data-derive="({label: mode})" data-derive-name="n">' +
        '<span class="shadowed">{{n.label}}</span></div></section></div>',
    );
    const data = {nodes: nodes(2), mode: '表示'};
    await Core.setBindingData(root, data);
    await waitForIdle();
    expect(
      Array.from(container.querySelectorAll('.shadowed')).map(
        span => span.textContent,
      ),
    ).toEqual(['表示', '表示']);

    await Core.setBindingData(root, {...data, mode: '編集'});
    await waitForIdle();

    expect(
      Array.from(container.querySelectorAll('.shadowed')).map(
        span => span.textContent,
      ),
    ).toEqual(['編集', '編集']);
  });

  it('非表示から表示へ切り替わった data-if の配下は、評価し直す', async () => {
    const root = await mount(
      '<div data-each="nodes" data-each-arg="n" data-each-key="id">' +
        '<section><p class="shown" data-if="open === n.id">{{n.label}}</p>' +
        '</section></div>',
    );
    const shown = (): string | null | undefined =>
      container.querySelector('.shown')?.textContent;
    await Core.setBindingData(root, {
      nodes: [{id: 'a', label: '前'}],
      open: 'a',
    });
    await waitForIdle();
    expect(shown()).toBe('前');
    // 非表示のあいだに要素データが変わる（非表示の配下は評価しない）。
    await Core.setBindingData(root, {
      nodes: [{id: 'a', label: '前'}],
      open: null,
    });
    await waitForIdle();
    await Core.setBindingData(root, {
      nodes: [{id: 'a', label: '後'}],
      open: null,
    });
    await waitForIdle();

    // 要素データは同値のまま、表示へ切り替える。
    await Core.setBindingData(root, {
      nodes: [{id: 'a', label: '後'}],
      open: 'a',
    });
    await waitForIdle();

    expect(shown()).toBe('後');
  });

  it('差分更新で再利用した行は、要素データとインデックスが同値なら評価し直さない', async () => {
    const root = await mount(LIST);
    const data = {nodes: nodes(3), editingForm: null, title: '題'};
    await Core.setBindingData(root, data);
    await waitForIdle();

    const counts = await countEvaluations(root, {
      ...data,
      nodes: nodes(4),
    });

    // 足した 1 行だけを評価する。
    expect(counts['n.label']).toBe(1);
    expect(
      Array.from(container.querySelectorAll('.label')).map(p => p.textContent),
    ).toEqual(['ノード0', 'ノード1', 'ノード2', 'ノード3']);
  });

  it('差分更新で要素データが変わった行は、評価し直す', async () => {
    const root = await mount(LIST);
    const data = {nodes: nodes(3), editingForm: null, title: '題'};
    await Core.setBindingData(root, data);
    await waitForIdle();
    const next = nodes(4);
    next[1].label = '変えた名前';

    await Core.setBindingData(root, {...data, nodes: next});
    await waitForIdle();

    expect(
      Array.from(container.querySelectorAll('.label')).map(p => p.textContent),
    ).toEqual(['ノード0', '変えた名前', 'ノード2', 'ノード3']);
  });
});
