/* @vitest-environment jsdom */
/**
 * @fileoverview 実行時に付与した副作用属性が発火することのテスト。
 *
 * 仕様「`data-fetch`」「`data-fetch-bind` や `data-{event}-copy` の対象セレクタは
 * `document.body` 配下のみを探索するため、これらで `<head>` 内の要素（`<title>` 等）を
 * 対象にすることはできません。**`<head>` への実行時バインドは「対象要素自身への直接
 * 付与」で行ってください**」。仕様はこの手段を案内しているため、実行時に
 * `data-fetch` を付与したら取得が走らなければなりません。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {Observer} from '../src/observer';

import {waitForCondition, waitForDomSettled} from './helpers/async';

/** テストから初期化状態を戻すための内部プロパティ */
type ObserverPrivate = {_initialized: boolean};

describe('実行時に付与した副作用属性', () => {
  let dispatcher: EventDispatcher;

  beforeEach(async () => {
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    document.body.innerHTML = '';
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    await Observer.init();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.innerHTML = '';
    (Observer as unknown as ObserverPrivate)._initialized = false;
    document.body.removeAttribute('data-haori-ready');
    vi.restoreAllMocks();
  });

  it('後から付与した data-fetch が取得を実行し、応答を自要素へバインドする', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({name: 'ひなた'}), {
        headers: {'Content-Type': 'application/json'},
      }),
    );

    document.body.innerHTML = '<div id="host"></div>';
    await Core.scan(document.body);
    await waitForDomSettled();
    expect(fetchSpy).not.toHaveBeenCalled();

    const host = document.getElementById('host') as HTMLElement;
    host.setAttribute('data-fetch', '/api/user');

    await waitForCondition(() => fetchSpy.mock.calls.length > 0, {
      description: '実行時に付与した data-fetch の実行',
    });
    await waitForDomSettled();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(Core.getBindingData(host)).toMatchObject({name: 'ひなた'});
  });

  it('後から付与した data-import が取得を実行し、内容を挿入する', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<span id="loaded">読み込み済み</span>', {
        headers: {'Content-Type': 'text/html'},
      }),
    );

    document.body.innerHTML = '<div id="host"></div>';
    await Core.scan(document.body);
    await waitForDomSettled();
    expect(fetchSpy).not.toHaveBeenCalled();

    const host = document.getElementById('host') as HTMLElement;
    host.setAttribute('data-import', '/partial.html');

    await waitForCondition(() => document.getElementById('loaded') !== null, {
      description: '実行時に付与した data-import の実行',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('#loaded')?.textContent).toBe('読み込み済み');
  });
});
