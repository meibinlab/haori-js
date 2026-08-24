/* @vitest-environment jsdom */
/**
 * @fileoverview `data-each` コンテナの構成に対する診断のテスト。
 *
 * 期待値の根拠は仕様「`data-each`」の配置ルールと、仕様
 * 「行操作の共通仕様（`data-{event}-row-*`）」です。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import {setInvariantMode, waitForIdle} from './helpers/async';

describe('data-each コンテナの診断', () => {
  let container: HTMLElement;
  let warnings: string[];
  let errors: string[];

  beforeEach(() => {
    Dev.enable();
    warnings = [];
    errors = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(arg => String(arg)).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(arg => String(arg)).join(' '));
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  // 仕様「`data-each`」の「誤り: 要素の子を 2 つ以上並べる」の
  // 「この形を検出すると、開発モードでコンテナごとに一度だけ警告します」
  it('要素の子が 2 つ以上あると開発モードで警告する', async () => {
    container.innerHTML = `
      <div data-bind='{"rows":[{"id":1,"label":"あ"}]}'>
        <div data-each="rows" data-each-arg="r" data-each-key="id">
          <input name="name">
          <span>{{r.label}}</span>
        </div>
      </div>
    `;
    await Core.scan(container);
    await waitForIdle();

    const matched = warnings.filter(message =>
      message.includes('要素の子が 2 つ以上あります'),
    );
    expect(matched).toHaveLength(1);
    expect(matched[0]).toContain('data-each="rows"');
    // 無視される子の数と種類を名指しする（何を動かせばよいか分かるように）。
    expect(matched[0]).toContain('残り 1 個');
    expect(matched[0]).toContain('span');
  });

  // 「コンテナごとに一度だけ警告します」
  it('同じコンテナでは再描画しても一度だけ警告する', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"rows":[{"id":1,"label":"あ"}]}'>
        <div data-each="rows" data-each-arg="r" data-each-key="id">
          <input name="name">
          <span>{{r.label}}</span>
        </div>
      </div>
    `;
    await Core.scan(container);
    await waitForIdle();
    await Core.setBindingData(container.querySelector('#host') as HTMLElement, {
      rows: [
        {id: 1, label: 'あ'},
        {id: 2, label: 'い'},
      ],
    });
    await waitForIdle();

    expect(
      warnings.filter(message =>
        message.includes('要素の子が 2 つ以上あります'),
      ),
    ).toHaveLength(1);
  });

  // 「コンテナごとに一度だけ」は、DOM の出し入れでテンプレート化を通り直しても
  // 保たれる必要がある（通り直す経路が増えたときに警告が増えないことを固定する）。
  it('data-if の出し入れを繰り返しても一度だけ警告する', async () => {
    container.innerHTML = `
      <div id="host" data-bind='{"show":true,"rows":[{"id":1,"label":"あ"}]}'>
        <div data-if="show">
          <div data-each="rows" data-each-arg="r" data-each-key="id">
            <input name="name">
            <span>{{r.label}}</span>
          </div>
        </div>
      </div>
    `;
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(container);
    await waitForIdle();
    for (const show of [false, true, false, true]) {
      await Core.setBindingData(host, {show, rows: [{id: 1, label: 'あ'}]});
      await waitForIdle();
    }

    expect(
      warnings.filter(message =>
        message.includes('要素の子が 2 つ以上あります'),
      ),
    ).toHaveLength(1);
  });

  // 配置ルールどおりの構成には出さない（出すと本来の書き方が疑わしく見える）。
  it('要素の子が 1 つだけなら警告しない', async () => {
    container.innerHTML = `
      <div data-bind='{"rows":[{"id":1,"label":"あ"}]}'>
        <div data-each="rows" data-each-arg="r" data-each-key="id">
          <div>
            <input name="name">
            <span>{{r.label}}</span>
          </div>
        </div>
      </div>
    `;
    await Core.scan(container);
    await waitForIdle();

    expect(
      warnings.filter(message =>
        message.includes('要素の子が 2 つ以上あります'),
      ),
    ).toHaveLength(0);
  });

  // 仕様「環境検出」。診断は開発モードのものなので、本番では出さない。
  it('開発モードが無効なら警告しない', async () => {
    Dev.disable();
    container.innerHTML = `
      <div data-bind='{"rows":[{"id":1,"label":"あ"}]}'>
        <div data-each="rows" data-each-arg="r" data-each-key="id">
          <input name="name">
          <span>{{r.label}}</span>
        </div>
      </div>
    `;
    await Core.scan(container);
    await waitForIdle();

    expect(
      warnings.filter(message =>
        message.includes('要素の子が 2 つ以上あります'),
      ),
    ).toHaveLength(0);
  });

  // 「`data-each-before` / `data-each-after` を付けた子は固定要素なので数えません」
  it('data-each-before / data-each-after は数えない', async () => {
    container.innerHTML = `
      <div data-bind='{"rows":[{"id":1}]}'>
        <div data-each="rows" data-each-arg="r" data-each-key="id">
          <span data-each-before>見出し</span>
          <div>{{r.id}}</div>
          <span data-each-after>脚注</span>
        </div>
      </div>
    `;
    await Core.scan(container);
    await waitForIdle();

    expect(
      warnings.filter(message =>
        message.includes('要素の子が 2 つ以上あります'),
      ),
    ).toHaveLength(0);
  });

  // 仕様「`data-each`」の「値を省略した行操作（`data-{event}-row-*`）のボタンは
  // 行に属さないため `Row fragment not found.` で失敗します」と、その例外
  // 「セレクタでコンテナを指定した `data-{event}-row-add` は行の外から使う宣言
  // なので、この位置でも末尾への追加として働きます」。
  it('行に入らない子の行操作は、値の省略で失敗しセレクタ指定で働く', async () => {
    container.innerHTML = `
      <form id="host" data-bind='{"rows":[{"id":1,"title":"a"}]}'>
        <div id="list" data-form-list="rows" data-each="rows" data-each-arg="r"
          data-each-key="id">
          <input name="title">
          <button type="button" class="rm" data-click-row-remove>-</button>
          <button type="button" class="add" data-click-row-add="#list">+</button>
        </div>
      </form>
    `;
    await Core.scan(container);
    new EventDispatcher(document).start();
    await waitForIdle();

    const rows = () =>
      container.querySelectorAll('input[name="title"]').length;
    expect(rows()).toBe(1);

    // 値を省略した削除は、対象の行が決まらないため失敗する。
    (container.querySelector('.rm') as HTMLElement).click();
    await waitForIdle();
    expect(
      errors.filter(message => message.includes('Row fragment not found.')),
    ).toHaveLength(1);
    expect(rows()).toBe(1);

    // セレクタ指定の追加は、行の外から使う宣言なので働く。
    (container.querySelector('.add') as HTMLElement).click();
    await waitForIdle();
    expect(rows()).toBe(2);
  });

  // 仕様「行操作の共通仕様（`data-{event}-row-*`）」の「外側が派生配列で
  // 書き戻せない場合は何もしない」。何もしない理由が読めるように、原因と
  // 回避策を 1 本のログで報告する。
  it('外側が派生配列のときは原因と回避策を 1 本のログで報告する', async () => {
    container.innerHTML = `
      <div data-bind='{"rules":[{"id":1,"c":"X","n":"a"}]}'>
        <div data-each="haori.groupBy(rules, 'c')" data-each-arg="g">
          <div>
            <div data-each="g.items" data-each-arg="r" data-each-key="id">
              <div class="row">
                <button type="button" class="dn" data-click-row-next>dn</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    await Core.scan(container);
    new EventDispatcher(document).start();
    await waitForIdle();

    (container.querySelector('.dn') as HTMLElement).click();
    await waitForIdle();

    // 祖先の事情だけを述べたログを重ねない（どちらの `data-each` の話か
    // 読み取れなくなる）。
    expect(
      errors.filter(message =>
        message.includes('Binding data owner not found'),
      ),
    ).toHaveLength(0);
    expect(
      errors.filter(message =>
        message.includes('Row operations require a plain identifier path'),
      ),
    ).toHaveLength(0);

    const matched = errors.filter(message =>
      message.includes('cannot resolve the write-back array'),
    );
    expect(matched).toHaveLength(1);
    // 対象の宣言、行スコープ名の出どころ、回避策を含める。
    expect(matched[0]).toContain('data-each="g.items"');
    expect(matched[0]).toContain("haori.groupBy(rules, 'c')");
    expect(matched[0]).toContain('data-derive');
    expect(matched[0]).toContain('data-each-array');
  });

  // 外側が解決できない理由は 1 つではない。理由が変わっても報告は 1 本に保つ
  // （理由ごとにログの本数が変わると、読む側が構成の違いと取り違える）。
  it('外側が data-each-key の無い data-each-array でも報告は 1 本', async () => {
    container.innerHTML = `
      <div data-bind='{"groups":[{"id":1,"items":[{"id":9}]}]}'>
        <div data-each="groups.filter(group => group.id > 0)" data-each-arg="g"
          data-each-array="groups">
          <div>
            <div data-each="g.items" data-each-arg="r" data-each-key="id">
              <div class="row">
                <button type="button" class="dn" data-click-row-next>dn</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    await Core.scan(container);
    new EventDispatcher(document).start();
    await waitForIdle();

    (container.querySelector('.dn') as HTMLElement).click();
    await waitForIdle();

    expect(
      errors.filter(message =>
        message.includes('requires data-each-key'),
      ),
    ).toHaveLength(0);
    expect(
      errors.filter(message =>
        message.includes('cannot resolve the write-back array'),
      ),
    ).toHaveLength(1);
  });

  // 仕様「`data-each`」の配置ルール。テンプレートが取れないのはコンテナの
  // 構成が原因なので、どのコンテナかが分からないと直せない。
  it('テンプレートが無いときは対象と式を名指しする', async () => {
    // テンプレートが取れない構成では行が 1 件も作れないため、不変条件 I2
    // （行数 == 配列長）は必ず破れる。ここで見るのは破れたときの診断なので、
    // 検査は報告だけにして落とさない。
    const previous = setInvariantMode('report');
    try {
      container.innerHTML = `
        <div id="host" data-bind='{"rows":[]}'>
          <div data-each="rows" data-each-arg="r">テキストだけ</div>
        </div>
      `;
      await Core.scan(container);
      await waitForIdle();
      await Core.setBindingData(
        container.querySelector('#host') as HTMLElement,
        {rows: [{id: 1}]},
      );
      await waitForIdle();

      const matched = errors.filter(message =>
        message.includes('Template is not set'),
      );
      expect(matched.length).toBeGreaterThan(0);
      expect(matched[0]).toContain('data-each="rows"');
    } finally {
      setInvariantMode(previous);
    }
  });
});
