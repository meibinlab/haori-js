/* @vitest-environment jsdom */
/**
 * @fileoverview 書き戻し先の配列がグループごとに連続していない場合の
 * `data-each-array` の行操作のテスト。
 *
 * 期待値の根拠は仕様「派生配列の書き戻し先（`data-each-array`）」と
 * 仕様「`data-each`」です。
 */
import {beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import {waitForIdle} from './helpers/async';

describe('data-each-array（グループが配列上で入れ違い）', () => {
  let container: HTMLElement;

  beforeEach(() => {
    Dev.enable();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  /**
   * グループ見出しと、そのグループに表示されている行のラベルを返します。
   *
   * @returns `見出し:[ラベル ラベル]` の配列
   */
  const groups = (): string[] =>
    Array.from(container.querySelectorAll('.group')).map(
      group =>
        (group.querySelector('.cat') as HTMLElement).textContent +
        ':[' +
        Array.from(group.querySelectorAll('.lbl'))
          .map(item => item.textContent)
          .join(' ') +
        ']',
    );

  /**
   * 書き戻し先の配列の並びを返します。
   *
   * @returns `id` の並び
   */
  const array = (): number[] => {
    const data = Core.getBindingData(
      container.querySelector('#host') as HTMLElement,
    ) as {rules: {id: number}[]};
    return data.rules.map(rule => rule.id);
  };

  beforeEach(async () => {
    // `rules` の並びは X, Y, X, X。X グループは配列の上で連続していない。
    container.innerHTML = `
      <div id="host" data-bind='{"rules":[
        {"id":1,"c":"X","n":"x1"},
        {"id":2,"c":"Y","n":"y1"},
        {"id":3,"c":"X","n":"x2"},
        {"id":4,"c":"X","n":"x3"}]}'>
        <div data-derive="rules.map(rule => rule.c)
          .filter((c, i, all) => all.indexOf(c) === i)"
          data-derive-name="cats">
          <div data-each="cats" data-each-arg="g">
            <div class="group">
              <span class="cat">{{g}}</span>
              <div class="list" data-each="rules.filter(rule => rule.c === g)"
                data-each-arg="r" data-each-key="id" data-each-array="rules">
                <div class="row">
                  <span class="lbl">{{r.id}}:{{r.n}}</span>
                  <button type="button" class="dn" data-click-row-next>
                    dn
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    await Core.scan(container);
    const dispatcher = new EventDispatcher(document);
    dispatcher.start();
    await waitForIdle();
  });

  // 仕様「派生配列の書き戻し先（`data-each-array`）」の「対象の行を**表示上の
  // 前後の行が居る位置**へ移します」
  //
  // 移動でグループの初出順が変わるため、`data-derive` のグループ見出しは
  // X, Y から Y, X へ入れ替わる（仕様「`data-derive` / `data-derive-name`」）。
  it('表示の並びが書き戻し先の配列から導かれる並びと一致する', async () => {
    expect(groups()).toEqual(['X:[1:x1 3:x2 4:x3]', 'Y:[2:y1]']);
    expect(array()).toEqual([1, 2, 3, 4]);

    // X グループの 1 行目（1:x1）を 1 つ下へ。表示上の次の行は 3:x2 なので、
    // 配列では 3 が居た位置（index 2）へ移る。
    (
      container.querySelectorAll('.group')[0].querySelector('.dn') as
        HTMLElement
    ).click();
    await waitForIdle();

    expect(array()).toEqual([2, 3, 1, 4]);
    // 配列の並びから導かれる表示。見出しは初出順で Y, X。
    expect(groups()).toEqual(['Y:[2:y1]', 'X:[3:x2 1:x1 4:x3]']);
  });

  // 食い違いが起きると以降の行操作が効かなくなるため、2 回目も動くことを見る。
  it('続けて操作しても表示と配列が一致し続ける', async () => {
    const pressFirstOfX = async () => {
      const target = Array.from(container.querySelectorAll('.group')).find(
        group =>
          (group.querySelector('.cat') as HTMLElement).textContent === 'X',
      );
      (target?.querySelector('.dn') as HTMLElement).click();
      await waitForIdle();
    };

    await pressFirstOfX();
    expect(array()).toEqual([2, 3, 1, 4]);
    expect(groups()).toEqual(['Y:[2:y1]', 'X:[3:x2 1:x1 4:x3]']);

    // X グループの 1 行目は 3:x2。表示上の次は 1:x1 なので、1 が居た位置へ移る。
    await pressFirstOfX();
    expect(array()).toEqual([2, 1, 3, 4]);
    expect(groups()).toEqual(['Y:[2:y1]', 'X:[1:x1 3:x2 4:x3]']);
  });
});

describe('data-each-array（キーの重複）', () => {
  let container: HTMLElement;

  beforeEach(() => {
    Dev.enable();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  // 仕様「派生配列の書き戻し先（`data-each-array`）」の「キーの値が重複していても
  // 動作します」「同一キーの中の**出現順**で行と要素を対応付けます」
  //
  // 未保存の行が `id: null` のまま複数並ぶ構成の確認。修正前も通るため回帰テスト
  // ではなく、重複キーでも行操作が使えるという保証を固定するためのテスト。
  it('キーが重複していても出現順で対応付けて移動する', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"rules":[
        {"id":1,"c":"X","n":"saved"},
        {"id":null,"c":"X","n":"new1"},
        {"id":null,"c":"X","n":"new2"}]}'>
        <div class="list" data-each="rules.filter(rule => rule.c === 'X')"
          data-each-arg="r" data-each-key="id" data-each-array="rules">
          <div class="row">
            <span class="lbl">{{r.n}}</span>
            <button type="button" class="dn" data-click-row-next>dn</button>
          </div>
        </div>
      </div>
    `;
    await Core.scan(container);
    const dispatcher = new EventDispatcher(document);
    dispatcher.start();
    await waitForIdle();

    const show = () =>
      Array.from(container.querySelectorAll('.lbl')).map(
        item => item.textContent,
      );
    const stored = () =>
      (
        Core.getBindingData(container.querySelector('#host') as HTMLElement) as {
          rules: {n: string}[];
        }
      ).rules.map(rule => rule.n);

    expect(show()).toEqual(['saved', 'new1', 'new2']);

    // 2 行目（new1）を 1 つ下へ。同じキー（null）が 2 つあるが、出現順で
    // 対応付くため new1 と new2 が入れ替わる。
    (
      container.querySelectorAll('.row')[1].querySelector('.dn') as HTMLElement
    ).click();
    await waitForIdle();
    expect(stored()).toEqual(['saved', 'new2', 'new1']);
    expect(show()).toEqual(['saved', 'new2', 'new1']);
  });
});

describe('data-each-array（再利用行の再評価の範囲）', () => {
  let container: HTMLElement;

  beforeEach(() => {
    Dev.enable();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  // 仕様「data-each の差分更新アルゴリズム」の「省略できるのは行スコープの名前だけを
  // 参照しているテンプレートに限ります」
  //
  // 行操作の宣言（`data-{event}-row-*`）は値が空またはセレクタで、描画のたびに
  // 評価する式ではない。これを「行の外を参照している」と扱うと、行操作のボタンを
  // 置いただけで並べ替えのたびに全行を再評価してしまう。
  it('行操作のボタンがあっても、要素データが同値の行は再評価しない', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"rules":[]}'>
        <div class="list" data-each="rules" data-each-arg="r"
          data-each-key="id">
          <div class="row">
            <span class="lbl">{{r.name}}</span>
            <button type="button" class="dn" data-click-row-next>dn</button>
          </div>
        </div>
      </div>
    `;
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(container);
    const dispatcher = new EventDispatcher(document);
    dispatcher.start();
    await Core.setBindingData(host, {
      rules: [1, 2, 3, 4, 5, 6].map(id => ({id, name: `row${id}`})),
    });
    await waitForIdle();
    expect(container.querySelectorAll('.row')).toHaveLength(6);

    const profile = (globalThis as Record<string, unknown>)
      .__HAORI_EVALUATION_PROFILE__ as
      | {
          start: () => void;
          stop: () => void;
          reset: () => void;
          report: (limit?: number) => {
            top: Array<{template: string; calls: number}>;
          };
        }
      | undefined;
    profile!.reset();
    profile!.start();

    // 1 行目を 1 つ下へ。キーも要素データも変わらないので全行が再利用される。
    (
      container.querySelectorAll('.row')[0].querySelector('.dn') as HTMLElement
    ).click();
    await waitForIdle();
    profile!.stop();

    const labels = Array.from(container.querySelectorAll('.lbl')).map(
      item => item.textContent,
    );
    expect(labels).toEqual([
      'row2',
      'row1',
      'row3',
      'row4',
      'row5',
      'row6',
    ]);

    // 要素データが同値の行は再評価しない（並べ替えでは 1 件も評価が起きない）。
    const rowLabel = profile!
      .report(1000)
      .top.filter(entry => entry.template === '{{r.name}}');
    const calls = rowLabel.reduce((total, entry) => total + entry.calls, 0);
    expect(calls).toBe(0);
  });
});
