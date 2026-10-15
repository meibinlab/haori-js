/* @vitest-environment jsdom */
/**
 * @fileoverview 外部のスクリプトが DOM に追加したノードを、監視の取り込みが DOM から
 * 外さないことのテスト。
 *
 * 期待値は仕様「監視対象」の「**外部のスクリプトが DOM に追加したノードは、追加された
 * 位置のまま取り込み、DOM から外して付け直すことはしません。**」から取っている。
 * popover・モーダル・フォーカスが保たれることは jsdom で確かめられないため、
 * playwright/observed-add-keeps-state.spec.cjs で確かめる。ここでは DOM から外されて
 * いないことを、別に置いた MutationObserver の記録で確かめる。
 *
 * 修正前は、取り込みのたびに要素を DOM から外して同じ位置へ付け直していた。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Env from '../src/env';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('外部のスクリプトが追加したノード', () => {
  let removed: Node[];
  let watcher: MutationObserver;

  beforeEach(async () => {
    Env.setRuntime('embedded');
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    await Observer.init();
    const host = document.createElement('div');
    host.innerHTML =
      '<form id="root" data-bind=\'{"s": "hello"}\'>' +
      '<p id="first">a</p><p id="last">b</p></form>';
    document.body.appendChild(host);
    await waitForIdle();
    removed = [];
    watcher = new MutationObserver(records => {
      records.forEach(record => removed.push(...record.removedNodes));
    });
    watcher.observe(document.body, {childList: true, subtree: true});
  });

  afterEach(() => {
    watcher.disconnect();
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
  });

  /**
   * 指定したセレクタの要素を返します。
   *
   * @param selector セレクタ
   * @returns 要素
   */
  function $(selector: string): HTMLElement {
    return document.querySelector(selector) as HTMLElement;
  }

  /**
   * 別に置いた MutationObserver が受け取った記録を取り出します。
   */
  function flush(): void {
    removed.push(...watcher.takeRecords().flatMap(r => [...r.removedNodes]));
  }

  it('追加した要素を DOM から外さない（回帰）', async () => {
    const added = document.createElement('p');
    added.textContent = '{{s}}';
    $('#root').insertBefore(added, $('#last'));
    await waitForIdle();
    flush();

    expect(removed).not.toContain(added);
    expect(added.textContent).toBe('hello');
  });

  it('追加したテキストを DOM から外さない（回帰）', async () => {
    const text = document.createTextNode('{{s}}');
    $('#first').appendChild(text);
    await waitForIdle();
    flush();

    expect(removed).not.toContain(text);
    expect($('#first').textContent).toBe('ahello');
  });

  it('同じタスクで別の親へ移した要素を、元の親へ戻さない（対照）', async () => {
    const added = document.createElement('p');
    added.id = 'moved';
    $('#first').appendChild(added);
    $('#last').appendChild(added);
    await waitForIdle();

    expect(added.parentElement).toBe($('#last'));
  });

  it('追加した入力欄を、追加した位置の順で収集する（対照）', async () => {
    const input = document.createElement('input');
    input.name = 'name';
    input.value = 'taro';
    $('#root').insertBefore(input, $('#last'));
    await waitForIdle();

    const root = Fragment.get($('#root')) as ElementFragment;
    expect(Form.getValues(root)).toEqual({name: 'taro'});
    expect(root.getChildElementFragments().map(f => f.getTarget())).toEqual([
      $('#first'),
      input,
      $('#last'),
    ]);
  });
});
