/* @vitest-environment jsdom */
/**
 * `data-{event}-refetch` と自動の取得（マネージド `data-fetch`）が重ならないことのテスト
 *
 * 期待値の根拠は仕様「`data-{event}-refetch`」の「手続きがバインド（処理順序の 9）へ
 * 進んだ後に、対象の要素で、今の実行シグネチャの自動の取得が始まった場合は、取り直し
 * ません」。
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';
import {nextTask, waitForCondition, waitForDomSettled} from './helpers/async';

/** 取得の要求の URL を記録し、応答を返す偽の fetch を仕掛けます。 */
function installFetch(hold?: (url: string) => Promise<void> | null): string[] {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input instanceof Request ? input.url : input);
    urls.push(url);
    const gate = hold?.(url);
    if (gate) {
      await gate;
    }
    return new Response('{"rows":[1]}', {
      headers: {'Content-Type': 'application/json'},
    });
  });
  return urls;
}

/** ボタンを押し、その手続きが終わる（実行中の印が外れる）まで待ちます。 */
async function clickAndWait(button: HTMLElement): Promise<void> {
  button.click();
  // 実行中の印は click() の中で同期に付く。
  expect(button.hasAttribute('data-haori-click-lock')).toBe(true);
  await waitForCondition(() => !button.hasAttribute('data-haori-click-lock'), {
    description: 'click finished',
  });
  await Haori.waitForRenders();
}

/** 指定の文字列を含む URL の数を返します。 */
function count(urls: string[], part: string): number {
  return urls.filter(url => url.includes(part)).length;
}

describe('data-click-refetch と自動の取得', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    (window as Window & typeof globalThis & {Haori?: unknown}).Haori = Haori;
    await import('../src/observer');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('バインドで条件が変わって自動の取得が走った要素は、取り直さない', async () => {
    // 仕様「`data-{event}-refetch`」の「今の実行シグネチャの自動の取得が始まった場合は、
    // 取り直しません」
    const urls = installFetch();
    document.body.innerHTML = `
<form id="f"><input name="from" value="b"></form>
<button id="btn" data-click-form="#f" data-click-bind="#state"
  data-click-bind-merge data-click-refetch="#state">表示</button>
<div id="state" data-bind='{"from":"a"}'
  data-fetch="http://api.test/s?from={{from}}" data-fetch-arg="summary"></div>`;
    await waitForDomSettled();
    await Haori.waitForRenders();
    urls.length = 0;

    await clickAndWait(document.getElementById('btn')!);

    expect(urls).toEqual(['http://api.test/s?from=b']);
  });

  it('条件が変わらず自動の取得が走らなかった要素は、取り直す', async () => {
    // 仕様「`data-{event}-refetch`」の「対象要素の `data-fetch` を再実行します」
    const urls = installFetch();
    document.body.innerHTML = `
<form id="f"><input name="from" value="a"></form>
<button id="btn" data-click-form="#f" data-click-bind="#state"
  data-click-bind-merge data-click-refetch="#state">表示</button>
<div id="state" data-bind='{"from":"a"}'
  data-fetch="http://api.test/s?from={{from}}" data-fetch-arg="summary"></div>`;
    await waitForDomSettled();
    await Haori.waitForRenders();
    urls.length = 0;

    await clickAndWait(document.getElementById('btn')!);

    expect(urls).toEqual(['http://api.test/s?from=a']);
  });

  it('バインドより前（保存の応答を待つ間）に始まった自動の取得では、取り直しを省かない', async () => {
    // 仕様「`data-{event}-refetch`」の「バインドより前に始まった取得は数えません。保存の
    // 応答より前の内容を取っている場合があるためです」
    let releaseSave: () => void = () => {};
    const saveGate = new Promise<void>(resolve => {
      releaseSave = resolve;
    });
    const urls = installFetch(url => (url.includes('/save') ? saveGate : null));
    document.body.innerHTML = `
<button id="btn" data-click-fetch="http://api.test/save"
  data-click-refetch="#state">保存</button>
<div id="state" data-bind='{"from":"a"}'
  data-fetch="http://api.test/s?from={{from}}" data-fetch-arg="summary"></div>`;
    await waitForDomSettled();
    await Haori.waitForRenders();
    urls.length = 0;
    const button = document.getElementById('btn')!;
    const state = document.getElementById('state')!;

    button.click();
    await waitForCondition(() => count(urls, '/save') === 1, {
      description: 'save requested',
    });
    // 保存の応答を待つ間に、条件を変えて自動の取得を走らせる。
    await Core.setBindingData(state, {from: 'b'});
    await Haori.waitForRenders();
    expect(count(urls, 's?from=b')).toBe(1);
    releaseSave();
    await waitForCondition(
      () => !button.hasAttribute('data-haori-click-lock'),
      {
        description: 'click finished',
      },
    );
    await Haori.waitForRenders();

    expect(count(urls, 's?from=b')).toBe(2);
  });

  it('自動の取得が実行中なら、その完了を待ち、走った取得で済ませる', async () => {
    // 仕様「`data-{event}-refetch`」の「自動の取得が実行中なら、その完了を待ってから
    // 判断します」
    let releaseB: () => void = () => {};
    const gateB = new Promise<void>(resolve => {
      releaseB = resolve;
    });
    const urls = installFetch(url => (url.includes('from=b') ? gateB : null));
    // 祖先のバインドで取得を走らせる。`#state` 自身のバインドの待ち行列は空のため、
    // 手続きのバインドは実行中の取得を待たずに終わる。
    document.body.innerHTML = `
<form id="f"><input name="from" value="c"></form>
<button id="btn" data-click-form="#f" data-click-bind="#state"
  data-click-bind-merge data-click-refetch="#state">表示</button>
<div id="outer" data-bind='{"from":"a"}'>
  <div id="state"
    data-fetch="http://api.test/s?from={{from}}" data-fetch-arg="summary"></div>
</div>`;
    await waitForDomSettled();
    await Haori.waitForRenders();
    urls.length = 0;
    const button = document.getElementById('btn')!;
    const outer = document.getElementById('outer')!;

    // 条件 b の自動の取得を走らせ、応答を止めておく。
    void Core.setBindingData(outer, {from: 'b'});
    await waitForCondition(() => count(urls, 'from=b') === 1, {
      description: 'auto fetch b started',
    });
    button.click();
    // 応答を止めている間の状態を見るため、タスク境界だけを越える（`nextTask()` の説明）。
    for (let index = 0; index < 5; index += 1) {
      await nextTask();
    }
    // b の応答を待つ間は、取り直しを始めない。
    expect(count(urls, 'from=c')).toBe(0);
    expect(button.hasAttribute('data-haori-click-lock')).toBe(true);
    releaseB();
    await waitForCondition(
      () => !button.hasAttribute('data-haori-click-lock'),
      {
        description: 'click finished',
      },
    );
    await Haori.waitForRenders();

    // 実行中に変わった条件 c の取得が 1 回だけ走り、取り直しはしない。
    expect(count(urls, 'from=c')).toBe(1);
  });

  it('コピー（処理順序の 13）で条件が変わって自動の取得が走った要素も、取り直さない', async () => {
    // 仕様「`data-{event}-refetch`」の「手続きがバインド（処理順序の 9）へ進んだ後に」。
    // バインドの後の手順で走った取得も数える。
    const urls = installFetch();
    document.body.innerHTML = `
<form id="f"><input name="from" value="b"></form>
<button id="btn" data-click-form="#f" data-click-copy="#state"
  data-click-refetch="#state">表示</button>
<div id="state" data-bind='{"from":"a"}'
  data-fetch="http://api.test/s?from={{from}}" data-fetch-arg="summary"></div>`;
    await waitForDomSettled();
    await Haori.waitForRenders();
    urls.length = 0;

    await clickAndWait(document.getElementById('btn')!);

    expect(urls).toEqual(['http://api.test/s?from=b']);
  });
  it('取り直した条件を覚え、取り直しの結果のバインドで同じ条件の取得を繰り返さない', async () => {
    // 仕様「`data-{event}-refetch`」の「取り直した実行シグネチャは、自動の取得の
    // 比較にも使います」
    const urls = installFetch();
    document.body.innerHTML = `
<form id="q"><input name="q" value="a"></form>
<button id="btn" data-click-refetch="#list">再読み込み</button>
<div id="list" data-fetch="http://api.test/l" data-fetch-form="#q"
  data-fetch-arg="summary"></div>`;
    await waitForDomSettled();
    await Haori.waitForRenders();
    urls.length = 0;
    // 入力欄の値を変えても、`#list` のバインドは変わらないため自動の取得は走らない。
    document.querySelector('input')!.value = 'b';

    await clickAndWait(document.getElementById('btn')!);

    expect(urls).toEqual(['http://api.test/l?q=b']);
  });
  it('自動の取得の後に条件が変わった（取得に収集するフォームをリセットした）要素は、取り直す', async () => {
    // 仕様「`data-{event}-refetch`」の「今の実行シグネチャの自動の取得が始まった場合は」。
    // 始まった取得の条件が今の条件と違えば、取り直す。
    const urls = installFetch();
    document.body.innerHTML = `
<form id="q"><input name="q" value="a"></form>
<button id="btn" data-click-data='{"p":"2"}' data-click-bind="#list"
  data-click-bind-merge data-click-reset="#q"
  data-click-refetch="#list">表示</button>
<div id="list" data-bind='{"p":"1"}' data-fetch="http://api.test/l?p={{p}}"
  data-fetch-form="#q" data-fetch-arg="summary"></div>`;
    await waitForDomSettled();
    await Haori.waitForRenders();
    urls.length = 0;
    // 入力欄の値を変えても、`#list` のバインドは変わらないため自動の取得は走らない。
    document.querySelector('input')!.value = 'b';

    await clickAndWait(document.getElementById('btn')!);

    // バインドで p が変わって走った取得（q=b）の後に、リセットで q が a へ戻る。
    expect(urls).toEqual([
      'http://api.test/l?p=2&q=b',
      'http://api.test/l?p=2&q=a',
    ]);
  });
});
