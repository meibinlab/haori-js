/* @vitest-environment jsdom */
/**
 * @fileoverview 追随結果を宣言として取り込まないことの検証（走査・複製）。
 *
 * エンジンが判定の結果として DOM へ書く属性（`data-if-false`、非表示中の `style`、
 * `data-each-done`）は宣言ではないため、フラグメントを作る時点で落とします。
 * 落とさないと、Haori が出力した HTML を保存して再配信する構成や `innerHTML` で
 * コピーした断片で、描画前から完了を主張したり、表示へ戻せない要素が残ります。
 *
 * 裏返しに、**利用者が書いた宣言は落としてはいけません**。`style="display: none"`
 * を「初期状態で隠しておく」ために書いた要素が複製で見えてしまうと、行を描くたびに
 * 隠したはずのものが全行に出ます。
 *
 * 期待値の根拠は仕様「data-if の動作」の「追随結果を取り込まない範囲は、DOM の監視
 * だけでなく**要素の内部状態を作る時点**（走査・複製）にも及びます」と、仕様
 * 「`data-each`」の「**markup が持ち込んだ `data-each-done` は宣言として取り込み
 * ません。**」。
 *
 * `data-if-false` を持つ markup からの復帰は
 * [tests/if-false-markup-recovery.test.ts](./if-false-markup-recovery.test.ts) が
 * 固定しています。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import {waitForCondition, waitForIdle} from './helpers/async';

describe('追随結果の取り込み', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    await import('../src/observer');
  });

  afterEach(() => {
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * HTML をデタッチ状態のコンテナへ流し込みます（走査はしません）。
   *
   * @param html 流し込む HTML 文字列
   * @returns 作ったコンテナ要素
   */
  const build = (html: string): HTMLElement => {
    container = document.createElement('div');
    container.innerHTML = html;
    return container;
  };

  it('markup が持ち込んだ data-each-done は取り込まない', async () => {
    // 仕様「`data-each`」の「**markup が持ち込んだ `data-each-done` は宣言として
    // 取り込みません。**」「落とさないと、行を 1 つも描いていない状態で完了を
    // 示します」。Haori の出力を保存して再配信する構成が該当する。
    const host = build(
      '<div id="list" data-bind=\'{"rows":[{"a":1},{"a":2}]}\'' +
        ' data-each="rows" data-each-arg="row" data-each-done>' +
        '<div class="row">x</div></div>',
    );
    const list = host.querySelector('#list') as HTMLElement;
    // 接続前に走査する（`data-import` の取り込み前に相当する）。
    await Core.scan(host);
    await waitForIdle();
    // 行はまだ描いていないので、完了マーカーは付いていてはならない。
    expect(list.querySelectorAll('.row').length).toBe(1);
    expect(list.hasAttribute('data-each-done')).toBe(false);
  });

  it('描き終えたら data-each-done は付き直す', async () => {
    // 落とすのは取り込みの時点だけで、描画の完了そのものは従来どおり通知する。
    // 仕様「`data-each`」の `data-each-done` の「**発火保証**」。
    const host = build(
      '<div id="list" data-bind=\'{"rows":[{"a":1},{"a":2}]}\'' +
        ' data-each="rows" data-each-arg="row" data-each-done>' +
        '<div class="row">x</div></div>',
    );
    document.body.appendChild(host);
    const list = host.querySelector('#list') as HTMLElement;
    await Core.scan(host);
    await waitForCondition(
      () =>
        list.hasAttribute('data-each-done') &&
        list.querySelectorAll('.row').length === 2,
    );
    expect(list.querySelectorAll('.row').length).toBe(2);
    expect(list.hasAttribute('data-each-done')).toBe(true);
  });

  it('利用者が書いた style="display: none" は複製で落とさない', async () => {
    // 仕様「data-if の動作」は落とす対象を追随結果（`data-if-false` /
    // `display: none` / `data-haori-if-disabled`）に限っており、同節は
    // 「`data-if-false` は手動で書く属性ではありません」と述べている。つまり
    // 判定の手がかりは `data-if-false` の有無で、`display: none` だけを根拠に
    // すると利用者の宣言を取り違える。
    //
    // 観測点は**あとから増えた行**。初期描画の行は宣言が保たれるため、行を増やす
    // 前に判定すると差が見えない。増えた行だけ見えると、同じ一覧の中で隠れている
    // 行と見えている行が混在する。
    const host = build(
      '<div id="list" data-bind=\'{"rows":[{"a":1}]}\'' +
        ' data-each="rows" data-each-arg="row">' +
        '<div class="row"><span style="display: none">x</span></div></div>',
    );
    document.body.appendChild(host);
    const list = host.querySelector('#list') as HTMLElement;
    await Core.scan(host);
    await waitForIdle();
    await Core.setBindingData(list, {rows: [{a: 1}, {a: 2}, {a: 3}]});
    await waitForIdle();
    const spans = Array.from(
      host.querySelectorAll('#list .row span'),
    ) as HTMLElement[];
    expect(spans.length).toBe(3);
    spans.forEach(span => {
      expect(span.style.display).toBe('none');
    });
  });

  it('markup が持ち込んだ data-importing は取り込まない', async () => {
    // 仕様「`data-import`」の「**markup が持ち込んだ `data-importing` は宣言として
    // 取り込みません。**」「落とさないと…読み込み中の見た目のまま恒久的に固定され
    // ます」。仕様は同節で `[data-importing] { visibility: hidden; }` を案内して
    // いるため、残ると要素が二度と見えない。
    const host = build(
      '<div id="root" data-bind=\'{"a":1}\'>' +
        '<div id="imp" data-importing>{{a}}</div></div>',
    );
    document.body.appendChild(host);
    await Core.scan(host.querySelector('#root') as HTMLElement);
    await waitForIdle();
    const imported = host.querySelector('#imp') as HTMLElement;
    expect(imported.hasAttribute('data-importing')).toBe(false);
    expect(imported.textContent).toBe('1');
  });

  it('利用者が書いた disabled は落とさない', async () => {
    // 追随結果の除去が広がりすぎないための境界。印（`data-haori-if-disabled`）を
    // 伴わない `disabled` は利用者の宣言なので触らない。落とすと、意図して無効に
    // していた入力欄が操作できるようになる。修正前も通るため回帰テストではなく、
    // 除去の対象を広げる変更が入ったときに落ちるガードとして置く。
    const host = build(
      '<div id="root" data-bind=\'{"show":true}\'>' +
        '<div data-if="show"><input id="in" disabled /></div></div>',
    );
    document.body.appendChild(host);
    await Core.scan(host.querySelector('#root') as HTMLElement);
    await waitForIdle();
    expect(
      (host.querySelector('#in') as HTMLInputElement).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('data-if で隠した要素の追随結果は複製で落とす', async () => {
    // 対照。`data-if` が偽で `hide()` が書いた `data-if-false` と `display: none`
    // は追随結果なので、行テンプレートへ焼き付いてはならない（仕様「data-if の
    // 動作」の「落とさないと…その要素は二度と表示されません」）。行ごとに条件を
    // 判定し直し、真の行では見えることを確かめる。
    const host = build(
      '<div id="list" data-bind=\'{"rows":[{"ok":false},{"ok":true}]}\'' +
        ' data-each="rows" data-each-arg="row">' +
        '<div class="row"><span data-if="row.ok">x</span></div></div>',
    );
    document.body.appendChild(host);
    await Core.scan(host);
    await waitForIdle();
    const spans = Array.from(
      host.querySelectorAll('#list .row span'),
    ) as HTMLElement[];
    expect(spans.length).toBe(2);
    expect(spans[0]?.hasAttribute('data-if-false')).toBe(true);
    expect(spans[1]?.hasAttribute('data-if-false')).toBe(false);
    expect(spans[1]?.style.display).not.toBe('none');
  });
});
