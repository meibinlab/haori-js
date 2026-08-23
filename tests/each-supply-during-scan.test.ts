/* @vitest-environment jsdom */
/**
 * @fileoverview scan の進行より先に値が供給された `data-each` の描画のテスト。
 *
 * 期待値の根拠は仕様「`data-each`」。
 *
 * `scan` は属性を 1 つずつ非同期に初期化するため、コンテナの初期化が始まる前に
 * 値が供給されると（フェッチ応答や `Core.setBindingData()` が scan と同じタスクで
 * 走る場合）、差分更新の呼び出しがコンテナの内部マウント状態より先に届く。
 * **この状態は実ブラウザで観測済みです**（Chromium で同じ画面を 12 回読み込むと
 * 3 回、`data-each` が一度も描画されないまま残った）。jsdom では初期化の刻みが
 * 粗く同じ間隙を作れないため、観測した状態（文書の中にあるがフラグメントの
 * マウント状態が false）を直接作って検証します。読み込みを繰り返して自然な間隙を
 * 突く検証は `playwright/each-supply-race.spec.cjs` が行います。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForIdle} from './helpers/async';

describe('scan の進行より先に届いた供給', () => {
  let container: HTMLElement;

  beforeEach(() => {
    Dev.enable();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    Dev.disable();
    document.body.removeChild(container);
  });

  // 仕様「`data-each`」の「その**最初の子要素がテンプレート**として配列の要素数ぶん複製されます」
  it('マウント状態が初期化に追いついていなくても行を描画する', async () => {
    container.innerHTML = `
      <form data-form id="editor" data-bind='{"rules":[]}'>
        <div class="list" data-each="rules" data-each-arg="r"
          data-each-index="i" data-each-key="id">
          <div class="rule" data-row>
            <span class="nm">{{r.name}}</span>
            <span data-if="r.amount > 100">大</span>
            <span data-attr-title="{{r.name}}">t</span>
            <button type="button" data-click-row-next>↓</button>
          </div>
        </div>
      </form>
    `;

    const editor = container.querySelector('#editor') as HTMLElement;
    const list = container.querySelector('.list') as HTMLElement;
    await Core.scan(container);
    await waitForIdle();

    // 実ブラウザで観測した状態を作る: 文書の中にあるが、コンテナのフラグメントの
    // マウント状態が false（scan の初期化がまだそこへ届いていない）。
    const listFragment = Fragment.get(list) as ElementFragment;
    listFragment.setMounted(false);

    await Core.setBindingData(editor, {
      rules: [
        {id: 1, name: '規則1', amount: 1000},
        {id: 2, name: '規則2', amount: 50},
        {id: 3, name: '規則3', amount: 300},
      ],
    });
    await waitForIdle();

    const names = Array.from(container.querySelectorAll('.rule .nm')).map(
      element => element.textContent,
    );
    expect(names).toEqual(['規則1', '規則2', '規則3']);
    expect(list.hasAttribute('data-each-done')).toBe(true);
  });

  // 一度取りこぼすと呼び直す経路が無いことの確認。追加の供給でも復帰しない
  // （＝取りこぼした時点で一覧は空のまま残る）ため、取りこぼしてはいけない。
  it('取りこぼした後の再供給では復帰しないので、取りこぼさない', async () => {
    container.innerHTML = `
      <form data-form id="editor" data-bind='{"rules":[]}'>
        <div class="list" data-each="rules" data-each-arg="r"
          data-each-key="id">
          <div class="rule" data-row><span class="nm">{{r.name}}</span></div>
        </div>
      </form>
    `;

    const editor = container.querySelector('#editor') as HTMLElement;
    const list = container.querySelector('.list') as HTMLElement;
    await Core.scan(container);
    await waitForIdle();

    const listFragment = Fragment.get(list) as ElementFragment;
    listFragment.setMounted(false);

    const rules = [{id: 1, name: '規則1'}];
    await Core.setBindingData(editor, {rules});
    await waitForIdle();
    // 同じ値をもう一度供給しても、描画済みと判定されるだけで描き直されない。
    await Core.setBindingData(editor, {rules});
    await waitForIdle();

    const names = Array.from(container.querySelectorAll('.rule .nm')).map(
      element => element.textContent,
    );
    expect(names).toEqual(['規則1']);
  });

  // 文書へ入れていない部分木は従来どおり描画しない。マウントされていない
  // フラグメントを描画対象にしないための判定を残す。
  it('文書へ入れていない部分木は描画しない', async () => {
    const detached = document.createElement('div');
    detached.innerHTML = `
      <form data-form id="detached" data-bind='{"rules":[]}'>
        <div class="list" data-each="rules" data-each-arg="r"
          data-each-key="id">
          <div class="rule" data-row><span class="nm">{{r.name}}</span></div>
        </div>
      </form>
    `;

    const editor = detached.querySelector('#detached') as HTMLElement;
    await Core.scan(detached);
    await Core.setBindingData(editor, {rules: [{id: 1, name: '規則1'}]});
    await waitForIdle();

    expect(
      detached.querySelector('.list')?.hasAttribute('data-each-done'),
    ).toBe(false);
  });
});
