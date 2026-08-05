/* @vitest-environment jsdom */
/**
 * @fileoverview 走査より後に `data-form-detach` を付け外ししたときの値収集の検証。
 *
 * 期待値の根拠は仕様「`data-form-detach`」の「バインディングから除外します」
 * 「`getValues()` で取得されない」。除外は属性の有無だけで決まるため、走査より後に
 * 付けても効き、外せば戻る。
 *
 * 動的な属性変更は監視（`MutationObserver`）が拾うため、この試験では
 * `Observer.init()` を起動します。`src/observer.ts` は読み込み時に
 * `DOMContentLoaded` へ初期化を登録するので、他の試験へ影響させないよう
 * 初期化状態を試験ごとに戻すこの独立したファイルに置いています。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

/** 監視の初期化状態を戻すための内部型 */
type ObserverPrivate = {_initialized: boolean};

describe('走査後の data-form-detach の付け外し', () => {
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

  it('付けると収集から外れ、外すと再び収集される', async () => {
    container.innerHTML = `
      <form>
        <input name="attached" value="attached_value">
        <input name="detached" value="detached_value">
      </form>`;
    await Core.scan(container);
    await waitForIdle();
    const form = container.querySelector('form') as HTMLFormElement;
    const fragment = Fragment.get(form) as ElementFragment;
    const detached = form.querySelector(
      '[name="detached"]',
    ) as HTMLInputElement;

    // 付ける前は両方とも収集される。
    expect(Form.getValues(fragment)).toEqual({
      attached: 'attached_value',
      detached: 'detached_value',
    });

    detached.setAttribute('data-form-detach', '');
    await waitForIdle();

    expect(Form.getValues(fragment)).toEqual({attached: 'attached_value'});

    detached.removeAttribute('data-form-detach');
    await waitForIdle();

    expect(Form.getValues(fragment)).toEqual({
      attached: 'attached_value',
      detached: 'detached_value',
    });
  });
});
