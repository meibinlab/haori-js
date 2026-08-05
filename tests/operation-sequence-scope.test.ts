/* @vitest-environment jsdom */
/**
 * @fileoverview 操作の通番を発番するときに、保留中の外部 DOM 変更を引き取る範囲。
 *
 * `MutationObserver` は非同期にしか通知しないため、他スクリプトが `data-bind` を
 * 書き換えた直後に利用者が操作すると、先に起きた外部の書き換えが後の通番を得て
 * 権威が逆転します。そこで **DOM イベントを起点とする手続き**は、通番の発番の直前に
 * 保留中の変更を同期的に引き取ります（`docs/ja/値の供給と権威解決の設計書.md`
 * 「段構成の訂正」）。
 *
 * 引き取りは `Core.setAttribute()` → `Core.setBindingData()` を同期的に呼ぶため、
 * **バインドワークの内部から生成される手続き**（`Core.executeManagedFetch()` の
 * マネージド `data-fetch`、シグネチャ算出）で行うと、実行中のワークへ再入します。
 * 順序の逆転が問題になるのは「外部が書き換えた直後に利用者が操作した」場合だけなので、
 * 引き取りの対象をそこへ絞っていることを確認します。
 *
 * 期待値の根拠は仕様「反映待ちの間に起きた変化」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import Procedure from '../src/procedure';

import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('操作の通番と保留中の外部 DOM 変更の引き取り', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(async () => {
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    await Observer.init();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
  });

  /**
   * フォームのバインドデータが持つ `keyword` の値を返します。
   *
   * @param form 対象のフォーム
   * @returns `keyword` の値（未設定なら undefined）
   */
  const boundKeyword = (form: HTMLElement): unknown =>
    (Core.getBindingData(form) as Record<string, unknown> | null)?.keyword;

  /**
   * 監視下のフォームを組み立て、バインドデータが確定するまで待ちます。
   *
   * @returns 組み立てたフォームとそのフラグメント
   */
  const mount = async (): Promise<{
    form: HTMLFormElement;
    fragment: ElementFragment;
  }> => {
    container.innerHTML =
      `<form id="f" data-bind='{"keyword":"初期"}'>` +
      '<input id="q" name="keyword" type="text">' +
      '</form>' +
      '<button id="rst" type="button" data-click-reset="#f"></button>';
    await Core.scan(container);
    await waitForIdle();
    const form = container.querySelector('#f') as HTMLFormElement;
    return {form, fragment: Fragment.get(form) as ElementFragment};
  };

  it('イベント起点でない手続きの生成では、保留中の書き換えを同期で取り込まない（回帰）', async () => {
    const {form, fragment} = await mount();

    form.setAttribute('data-bind', JSON.stringify({keyword: '外部'}));
    // 通知は非同期なので、この時点ではまだ取り込まれていない。
    expect(boundKeyword(form)).toBe('初期');

    // 非イベント `data-fetch` の自動再評価と同じ経路。バインドワークの内部から
    // 呼ばれるため、ここで引き取ると実行中のワークへ再入する。
    Procedure.resolveAutoFetchSignature(fragment);

    expect(boundKeyword(form)).toBe('初期');

    // 引き取らないだけで、取り込み自体は従来どおり非同期に行われる。
    await waitForIdle();
    expect(boundKeyword(form)).toBe('外部');
  });

  it('バインドワークの実行中は、通番を省略した setBindingData でも同期で取り込まない（回帰）', async () => {
    const {form} = await mount();
    const other = document.createElement('div');
    other.setAttribute('data-bind', '{"v":0}');
    container.appendChild(other);
    const target = document.createElement('div');
    target.setAttribute('data-bind', '{"w":0}');
    container.appendChild(target);
    await Core.scan(container);
    await waitForIdle();

    // バインドワークを 1 つ走らせ、実行中（await をまたぐ期間）にする。
    const inFlight = Core.setBindingData(other, {v: 1});
    // `enqueueBindingWork()` はマイクロタスクで work を始めるため、1 つ進めれば
    // 実行中になる。
    await Promise.resolve();

    form.setAttribute('data-bind', JSON.stringify({keyword: '外部'}));
    expect(boundKeyword(form)).toBe('初期');

    // 通番を省略した呼び出し（公開 API の直接呼び出し向けの既定）。取り込みは
    // `Core.setAttribute()` → `Core.setBindingData()` を同期的に呼ぶため、ワークの
    // 内部で行うと実行中のワークへ再入する。実行中は取り込まない。
    const supplied = Core.setBindingData(target, {w: 1});

    expect(boundKeyword(form)).toBe('初期');

    // 取り込まないだけで、取り込み自体は従来どおり非同期に行われる。
    await Promise.all([inFlight, supplied]);
    await waitForIdle();
    expect(boundKeyword(form)).toBe('外部');
  });

  it('DOM イベント起点の手続きでは、保留中の書き換えを同期で取り込む', async () => {
    const {form} = await mount();
    const button = container.querySelector('#rst') as HTMLButtonElement;

    form.setAttribute('data-bind', JSON.stringify({keyword: '外部'}));
    expect(boundKeyword(form)).toBe('初期');

    // クリックのハンドラは同期的に走る。ここで引き取らないと、先に起きた外部の
    // 書き換えがこのクリックより後の通番を得る。
    button.click();

    expect(boundKeyword(form)).toBe('外部');

    // 後続の初期化を残したまま次のテストへ進まないよう落ち着かせる。
    await waitForIdle();
  });
});
