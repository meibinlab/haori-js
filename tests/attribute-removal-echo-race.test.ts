/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 属性削除の遅延書き込みが、後から挿入された属性値を消してしまう競合のテスト。
 *
 * MutationObserver は「DOM から属性が消えた」状態を観測すると
 * `Core.setAttribute(element, name, null, true)` を呼び、フラグメントは
 * キューの末尾へ DOM 削除タスクを積む。一方 `Haori.addMessage` などの
 * 直接書き込みはキューの先頭へ積まれるため、削除タスクが残っている間に
 * メッセージを付与すると、付与のあとに削除が走って値が消える。
 * 削除は「DOM に属性が無ければ書き込み不要」として短絡させることで防ぐ。
 *
 * 期待値の根拠は仕様「DOM 書き込みの判定時点と優先実行の関係」。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';
import Haori from '../src/haori';
import Queue from '../src/queue';
import {waitForDomSettled} from './helpers/async';

describe('属性削除の遅延書き込みと後続の書き込みの競合', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('DOM から消えた属性の観測反映が、後から付与した値を消さない', async () => {
    container.innerHTML =
      '<div id="wrap"><input id="i" type="text" name="name"></div>';
    await Core.scan(container);
    await waitForDomSettled();
    const input = container.querySelector('#i') as HTMLInputElement;
    const wrap = container.querySelector('#wrap') as HTMLElement;

    // 1回目のメッセージを表示する（入力要素の場合は親要素へ付与される）。
    await Haori.addMessage(input, '名前は必須です', 'error');
    await waitForDomSettled();
    expect(wrap.getAttribute('data-message')).toBe('名前は必須です');

    // フェッチエラー処理のクリア相当（DOM から直接削除）。
    wrap.removeAttribute('data-message');
    wrap.removeAttribute('data-message-level');

    // MutationObserver が削除を観測したときの反映と同じ呼び出し。
    // キューの末尾へ積まれるため、この時点ではまだ実行されていない。
    const removalEcho = Core.setAttribute(wrap, 'data-message', null, true);
    // クリア直後に最新応答のメッセージを付与する（キューの先頭へ積まれる）。
    const added = Haori.addMessage(input, '名前は必須です', 'error');

    await Promise.all([removalEcho, added]);
    await waitForDomSettled();

    // 付与したメッセージが遅延削除に消されていないこと。
    expect(wrap.getAttribute('data-message')).toBe('名前は必須です');
    expect(wrap.getAttribute('data-message-level')).toBe('error');
  });

  it('DOM に残っている属性の削除は従来どおり反映される', async () => {
    container.innerHTML =
      '<div id="wrap"><input id="i" type="text" name="name"></div>';
    await Core.scan(container);
    await waitForDomSettled();
    const input = container.querySelector('#i') as HTMLInputElement;
    const wrap = container.querySelector('#wrap') as HTMLElement;

    await Haori.addMessage(input, '入力してください', 'error');
    await waitForDomSettled();
    expect(wrap.getAttribute('data-message')).toBe('入力してください');

    // DOM に属性が残っている状態での削除は短絡せず、DOM からも消える。
    await Core.setAttribute(wrap, 'data-message', null);
    await waitForDomSettled();
    expect(wrap.hasAttribute('data-message')).toBe(false);
  });

  it('別名属性（data-attr-*）の削除も DOM に無ければ後続を消さない', async () => {
    container.innerHTML =
      '<div id="wrap"><input id="i" type="text" name="name"' +
      ' data-attr-title="{{label}}"></div>';
    await Core.scan(container);
    await waitForDomSettled();
    const input = container.querySelector('#i') as HTMLInputElement;

    // 生属性・反映先属性のいずれも DOM に無い状態を作る（クリア相当）。
    input.removeAttribute('data-attr-title');
    input.removeAttribute('title');

    // 観測反映（削除）はキュー末尾、直接書き込みはキュー先頭へ積まれる。
    const removalEcho = Core.setAttribute(input, 'data-attr-title', null, true);
    const written = Queue.enqueue(() => {
      input.setAttribute('title', 'ラベル');
    }, true);
    await Promise.all([removalEcho, written]);
    await waitForDomSettled();

    expect(input.getAttribute('title')).toBe('ラベル');
  });
});
