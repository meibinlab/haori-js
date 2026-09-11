/* @vitest-environment jsdom */
/**
 * @fileoverview 初期スキャンより前に登録した連携を呼び出す時点の検証（課題 #42）。
 *
 * `<body>` 内のスクリプトで `Haori.enhancers.register()` を呼ぶと、Haori が要素を
 * 走査する前に登録が済みます。このとき `init` が走査の前に走ると、連携が生成した
 * DOM が走査でフラグメント木へ載り（`data-external` の配下でも収集に載る）、
 * `data-each` では行の雛形に焼き込まれて行ごとに二重に初期化されます。
 *
 * 本物の読み込みと同じ順（マークアップ → 登録 → 走査）で再現します。ライブ監視
 * （`src/observer.ts`）は読み込みません（明示の `Core.scan()` と競合させないため）。
 *
 * 期待値の根拠は仕様「`data-enhance`」と仕様「`data-external`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Haori from '../src/haori';
import {waitForIdle} from './helpers/async';

/** 連携の名前の通番（登録は取り消せないため、試験ごとに別の名前を使う） */
let sequence = 0;

/**
 * 試験ごとに一意な連携の名前を返します。
 *
 * @param label 名前の接頭辞
 * @returns 連携の名前
 */
function nextName(label: string): string {
  sequence += 1;
  return `${label}-${sequence}`;
}

/** `init` の呼び出しの記録 */
interface InitRecord {
  /** 呼ばれた時点で走査（`Core.scan()`）を始めていたか */
  afterScanStarted: boolean;
  /** 呼ばれた時点で対象要素が生成コンテナに包まれていたか */
  alreadyWrapped: boolean;
}

describe('初期スキャンより前に登録した連携', () => {
  let container: HTMLElement;
  let scanStarted: boolean;
  let records: InitRecord[];

  beforeEach(() => {
    vi.restoreAllMocks();
    scanStarted = false;
    records = [];
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  /**
   * Choices.js と同じ形で DOM を生成する連携を登録します。
   *
   * 元の要素を生成コンテナの内側へ移し、名前付きの絞り込み入力を足します。
   * 呼び出しの時点の状態を `records` へ控えます。
   *
   * @param name 連携の名前
   * @returns 戻り値はありません。
   */
  const registerChoicesLike = (name: string): void => {
    Haori.enhancers.register(name, {
      init(element) {
        records.push({
          afterScanStarted: scanStarted,
          alreadyWrapped: element.closest('.choices') !== null,
        });
        const outer = document.createElement('div');
        outer.className = 'choices';
        const inner = document.createElement('div');
        inner.className = 'choices__inner';
        element.parentNode!.insertBefore(outer, element);
        outer.appendChild(inner);
        inner.appendChild(element);
        const search = document.createElement('input');
        search.type = 'search';
        search.name = 'search_terms';
        inner.appendChild(search);
        return {};
      },
    });
  };

  /**
   * 走査を始め、追従して積まれる処理まで落ち着かせます。
   *
   * @returns 待機完了の Promise
   */
  const scan = async (): Promise<void> => {
    scanStarted = true;
    await Core.scan(container);
    await waitForIdle();
  };

  it('data-external の配下で init が生成した入力は収集されず、書いた入力は収集される', async () => {
    const name = nextName('choices-like');
    container.innerHTML = `
      <form>
        <input name="keep" value="1">
        <div data-external>
          <select name="plan" data-enhance="${name}"><option value="p1" selected>p1</option></select>
        </div>
      </form>`;
    registerChoicesLike(name);
    await scan();

    const form = container.querySelector('form')!;
    // 仕様「`data-external`」の「配下で、Haori が走査した時点に無かった DOM（外部
    // ライブラリが生成・追加した要素）は、フォーム値の収集を含め Haori の管理に入らない」
    // 「この扱いは、`Haori.enhancers.register()` を置く場所 … では変わらない」。
    expect(Form.getValues(Fragment.get(form) as ElementFragment)).toEqual({
      keep: '1',
      plan: 'p1',
    });
    // 仕様「`data-enhance`」の「Haori がまだ走査していない要素 … には `register()` の
    // 時点では適用せず、走査の最後に適用します」。
    expect(records.map(record => record.afterScanStarted)).toEqual([true]);
  });

  it('data-each の各行で init は 1 回ずつで、行の雛形に生成 DOM が焼き込まれない', async () => {
    const name = nextName('choices-like');
    container.innerHTML = `
      <form data-bind='{"rows":[{"id":1},{"id":2}]}'>
        <div data-each="rows" data-each-key="id" data-each-arg="r">
          <div class="row" data-external>
            <select name="rowplan" data-enhance="${name}"><option value="x" selected>x</option></select>
          </div>
        </div>
      </form>`;
    registerChoicesLike(name);
    await scan();

    const rows = Array.from(container.querySelectorAll<HTMLElement>('.row'));
    expect(rows).toHaveLength(2);
    // 仕様「`data-enhance`」の「適用は**要素ごと・名前ごとに一度だけ**です」。行ごとに
    // 1 回だけ呼ばれ、その時点の要素はまだ包まれていない（雛形へ焼き込まれた生成 DOM
    // ごと複製した行に、もう一度 init を呼んでいない）。
    expect(records.map(record => record.alreadyWrapped)).toEqual([
      false,
      false,
    ]);
    expect(rows.map(row => row.querySelectorAll('.choices').length)).toEqual([
      1, 1,
    ]);
  });

  /**
   * `init` の時点の選択肢の数と値を控える連携を登録します。
   *
   * @param name 連携の名前
   * @param seen 控える先
   * @returns 戻り値はありません。
   */
  const registerSelectRecorder = (
    name: string,
    seen: Array<{options: number; value: string}>,
  ): void => {
    Haori.enhancers.register(name, {
      init(element) {
        const select = element as HTMLSelectElement;
        seen.push({options: select.options.length, value: select.value});
        return {};
      },
    });
  };

  it('init の時点で、フォームの初期値が反映済みになっている', async () => {
    const name = nextName('recorder');
    const seen: Array<{options: number; value: string}> = [];
    container.innerHTML = `
      <form data-bind='{"plan":"b"}'>
        <select name="plan" data-enhance="${name}">
          <option value="a">a</option>
          <option value="b">b</option>
        </select>
      </form>`;
    registerSelectRecorder(name, seen);
    await scan();

    // 仕様「`data-enhance`」の「`init` は、置き場所によらず描画と初期値の反映の後に
    // 呼ばれます」。初期 data-bind の値が選ばれている。
    expect(seen).toEqual([{options: 2, value: 'b'}]);
  });

  it('init の時点で、data-each が描画する選択肢は描画済みになっている', async () => {
    const name = nextName('recorder');
    const seen: Array<{options: number; value: string}> = [];
    container.innerHTML = `
      <form data-bind='{"plans":["a","b"],"plan":"b"}'>
        <select name="plan" data-enhance="${name}" data-each="plans" data-each-arg="p">
          <option value="{{p}}">{{p}}</option>
        </select>
      </form>`;
    registerSelectRecorder(name, seen);
    await scan();

    // 仕様「`data-enhance`」の「`init` は、置き場所によらず描画 … の後に呼ばれます」。
    // 選択肢は data-each で 2 つ描画されている。フォームの初期値は、同じ節の「`data-each`
    // で選択肢を描画する `<select>` では、フォームの初期値が `init` の後に反映される
    // ことがあります」のとおり、ここでは確かめない。
    expect(seen.map(entry => entry.options)).toEqual([2]);
  });
});
