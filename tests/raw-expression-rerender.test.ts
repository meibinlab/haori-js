/* @vitest-environment jsdom */
/**
 * @fileoverview `{{{ expression }}}` の描画と、バインドの更新への追従のテスト。
 *
 * 期待値は仕様「`{{{ expression }}}`」の次の記述から取っている。
 *
 * - 「評価結果の扱いは `{{ }}` と同じです（中略）。`null`、`undefined`、`false`、
 *   未解決参照は空になります」
 * - 「バインドの更新のたびに評価し直し、挿入した HTML を差し替えます。初期表示で偽の
 *   `data-if` の配下や、読み込みの後に差し込んだ要素の中でも同じです」
 * - 「挿入した HTML は走査の対象外です。中に書いた `{{ }}` や `data-*` は評価しません」
 *
 * 修正前は、DOM の監視が動いている間に初めて描画すると、`innerHTML` の書き換えを監視が
 * 取り込み、式を持つテキストの断片が木から外れていた。以降は式が評価されず、最初に
 * 描いた HTML のまま残っていた。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Env from '../src/env';
import Fragment from '../src/fragment';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('{{{ }}} の描画とバインドの更新への追従', () => {
  beforeEach(async () => {
    Env.setRuntime('embedded');
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    await Observer.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
  });

  /**
   * 読み込みの後に HTML を差し込み、監視が取り込むのを待ちます。
   *
   * @param html 差し込む HTML
   */
  async function insert(html: string): Promise<void> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await waitForIdle();
  }

  /**
   * 指定したデータを `#box` の `news` へバインドするボタンを押します。
   *
   * @param data バインドするデータ
   */
  async function bindNews(data: Record<string, unknown>): Promise<void> {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-click-data', JSON.stringify(data));
    button.setAttribute('data-click-bind', '#box');
    button.setAttribute('data-click-bind-arg', 'news');
    document.body.appendChild(button);
    await waitForIdle();
    button.click();
    await waitForIdle();
    button.remove();
    await waitForIdle();
  }

  /**
   * `.raw` の中身を返します。
   *
   * @returns `.raw` の innerHTML
   */
  function raw(): string {
    return document.querySelector('.raw')!.innerHTML;
  }

  /** 初期表示で偽の `data-if` の配下に `{{{ }}}` を置いた構成（要望の再現条件）。 */
  const HIDDEN_FIRST =
    '<div id="box" data-bind=\'{"news": {}}\'>' +
    '<section data-if="news.t"><h2>{{news.t}}</h2>' +
    '<div class="raw">{{{news.html}}}</div></section></div>';

  it('初期表示で偽の data-if の配下でも、表示した後の更新で挿入した HTML を差し替える（回帰）', async () => {
    await insert(HIDDEN_FIRST);

    await bindNews({html: '<p>B</p>', t: 'B'});
    expect(raw()).toBe('<p>B</p>');
    await bindNews({html: '<p>C</p>', t: 'C'});
    expect(document.querySelector('h2')!.textContent).toBe('C');
    expect(raw()).toBe('<p>C</p>');
  });

  it('data-if が偽へ戻り、再び真になった後の更新でも差し替える（回帰）', async () => {
    await insert(HIDDEN_FIRST);
    await bindNews({html: '<p>B</p>', t: 'B'});

    await bindNews({});
    await bindNews({html: '<p>C</p>', t: 'C'});
    expect(raw()).toBe('<p>C</p>');
    await bindNews({html: '<p>D</p>', t: 'D'});
    expect(raw()).toBe('<p>D</p>');
  });

  it('読み込みの後に差し込んだ要素の中でも、更新で挿入した HTML を差し替える（回帰）', async () => {
    await insert(
      '<div id="box" data-bind=\'{"news": {"html": "<p>A</p>"}}\'>' +
        '<div class="raw">{{{news.html}}}</div></div>',
    );
    expect(raw()).toBe('<p>A</p>');

    await bindNews({html: '<p>B</p>'});
    expect(raw()).toBe('<p>B</p>');
  });

  it('data-if の配下に無い {{{ }}} と、配下の {{ }} は更新に追従する（回帰）', async () => {
    await insert(
      '<div id="box" data-bind=\'{"news": {"html": "<p>A</p>", "t": "A"}}\'>' +
        '<div class="raw">{{{news.html}}}</div>' +
        '<section data-if="news.t"><h2>{{news.t}}</h2></section></div>',
    );

    await bindNews({html: '<p>B</p>', t: 'B'});
    expect(raw()).toBe('<p>B</p>');
    expect(document.querySelector('h2')!.textContent).toBe('B');
  });

  it('挿入した HTML の中の data-* は評価しない（回帰）', async () => {
    // `{{ }}` を含む HTML は、`data-click-data` の評価と `data-bind` 属性への反映で
    // テンプレートとして評価されてしまうため、ここでは `data-*` で確かめる。
    await insert(HIDDEN_FIRST);

    await bindNews({html: '<span data-if="false">x</span>', t: 'B'});
    const span = document.querySelector('.raw span') as HTMLElement;
    expect(span.hasAttribute('data-if-false')).toBe(false);
    expect(span.style.display).toBe('');
  });

  it('描画を終えた後は、外したノードと挿入したノードを監視の除外に残さない', async () => {
    // 仕様「`data-bind`」の「他のスクリプトやライブラリがこの属性を書き換えた場合も、
    // 監視（MutationObserver）経由で取り込み」。除外はエンジン自身の書き込みの間だけで、
    // 残すと、その後に他のスクリプトが加えた変更まで取り込まれなくなる。
    await insert(
      '<div id="box" data-bind=\'{"news": {"html": "<p>A</p>"}}\'>' +
        '<div class="raw">{{{news.html}}}</div></div>',
    );
    const box = document.querySelector('.raw') as HTMLElement;
    const removed = box.firstChild as Node;
    await bindNews({html: '<p>B</p>'});

    const inserted = box.firstChild as Node;
    expect(inserted).not.toBe(removed);
    expect(Fragment.get(box)!.isSkipMutationNode(removed)).toBe(false);
    expect(Fragment.get(box)!.isSkipMutationNode(inserted)).toBe(false);
  });

  it.each([
    ['undefined（未解決参照）', '{}', ''],
    ['false', '{"v": false}', ''],
  ])(
    '評価結果が %s のときは挿入先を空にする（回帰）',
    async (_label, bind, expected) => {
      await insert(
        `<div id="box" data-bind='${bind}'><div class="raw">{{{v}}}</div></div>`,
      );

      expect(raw()).toBe(expected);
    },
  );

  it('評価結果が null のときは挿入先を空にする（対照）', async () => {
    await insert(
      '<div id="box" data-bind=\'{"v": null}\'><div class="raw">{{{v}}}</div></div>',
    );

    expect(raw()).toBe('');
  });

  it('評価結果が 0 のときは 0 を表示する（対照）', async () => {
    // 仕様「プレースホルダ解決規則」の「テキストノード」で空にするのは `null`、
    // `undefined`、`false`、未解決参照だけである。
    await insert(
      '<div id="box" data-bind=\'{"v": 0}\'><div class="raw">{{{v}}}</div></div>',
    );

    expect(raw()).toBe('0');
  });

  it('data-each の行の {{{ }}} は、配列の更新で差し替える（回帰）', async () => {
    await insert(
      '<ul id="box" data-bind=\'{"rows": [{"h": "<b>1</b>"}]}\'' +
        ' data-each="rows"><li>{{{h}}}</li></ul>',
    );
    const button = document.createElement('button');
    button.setAttribute('data-click-data', '{"rows": [{"h": "<b>2</b>"}]}');
    button.setAttribute('data-click-bind', '#box');
    document.body.appendChild(button);
    await waitForIdle();

    button.click();
    await waitForIdle();

    expect(document.querySelector('#box li')!.innerHTML).toBe('<b>2</b>');
  });
});
