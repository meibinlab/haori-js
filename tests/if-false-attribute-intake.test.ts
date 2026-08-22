/* @vitest-environment jsdom */
/**
 * @fileoverview
 * `data-if` の非表示化でエンジンが DOM へ直接書く `data-if-false` と `style` が、
 * フラグメントの属性マップへ取り込まれないことを検証する。
 *
 * 期待値の根拠は仕様「data-if の動作」の「判定の基準は内部状態であり、
 * `style.display` や `data-if-false` は追随結果として扱う」。追随結果を属性マップへ
 * 取り込むと、`Core.scan()` の属性再適用（同節の「未スキャンの子は `scan` で初期化する」）が
 * それを DOM へ書き戻し、表示へ戻した分岐を非表示へ引き戻す。
 *
 * 取り込みは `MutationObserver` 経由でのみ起きるため、`Observer.init()` を通す。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Env from '../src/env';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import {Observer} from '../src/observer';
import {waitForIdle} from './helpers/async';

type ObserverPrivate = {_initialized: boolean};

/**
 * Observer の初期化状態を戻します。
 *
 * @returns 戻り値はありません。
 */
function resetObserver(): void {
  (Observer as unknown as ObserverPrivate)._initialized = false;
  document.body.removeAttribute('data-haori-ready');
}

describe('data-if の追随結果を属性マップへ取り込まない', () => {
  let dispatcher: EventDispatcher;

  beforeEach(async () => {
    resetObserver();
    document.body.innerHTML = '';
    await Observer.init();
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    resetObserver();
  });

  /**
   * 内容を持つコンテナを文書へ追加し、描画が落ち着くまで待ちます。
   *
   * 追加と内容の設定を同じ同期ブロックで行います（分けると `MutationObserver` の
   * 取り込みが空のコンテナに対して先に走り、内容の初期化が別経路になる）。
   *
   * @param html コンテナの内容
   * @returns 追加したコンテナ
   */
  const mount = async (html: string): Promise<HTMLElement> => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await waitForIdle();
    return container;
  };

  /**
   * 指定要素のフラグメントが持つ属性名を返します。
   *
   * @param selector セレクタ
   * @returns 属性名のリスト
   */
  const attributeNames = (selector: string): string[] => {
    const element = document.querySelector(selector) as HTMLElement;
    const fragment = Fragment.get(element);
    if (!(fragment instanceof ElementFragment)) {
      throw new Error(`fragment not found: ${selector}`);
    }
    return fragment.getAttributeNames();
  };

  it('非表示化した要素の属性マップに data-if-false が入らない', async () => {
    await mount(`
      <div data-bind='{"shown": false}'>
        <div id="branch" data-if="shown">本文</div>
      </div>`);

    const branch = document.querySelector('#branch') as HTMLElement;
    // 追随結果は DOM には出る（仕様「data-if の動作」の「`data-if-false` 属性を付与」）
    expect(branch.hasAttribute(`${Env.prefix}if-false`)).toBe(true);
    // 属性マップは宣言だけを持つ
    expect(attributeNames('#branch')).not.toContain(`${Env.prefix}if-false`);
  });

  it('非表示化した要素の属性マップに style が入らない', async () => {
    await mount(`
      <div data-bind='{"shown": false}'>
        <div id="branch" data-if="shown">本文</div>
      </div>`);

    const branch = document.querySelector('#branch') as HTMLElement;
    expect(branch.style.getPropertyValue('display')).toBe('none');
    expect(attributeNames('#branch')).not.toContain('style');
  });

  it('宣言した style は属性マップに残る', async () => {
    await mount(`
      <div data-bind='{"shown": false}'>
        <div id="branch" data-if="shown" style="color: red">本文</div>
      </div>`);

    // 利用者が書いた `style` は宣言なので取り込む。非表示化の書き込みだけを外す。
    expect(attributeNames('#branch')).toContain('style');
  });

  it('reset-before の対象配下の data-if が同じ押下で再評価される', async () => {
    // 仕様「`data-{event}-reset-before`」のリセットは非表示分岐の中のフォームも
    // 評価するため、まだ表示されていない分岐の子へ追随結果が書かれる。同じ押下の
    // `data-{event}-bind` で外側が表示になると、仕様「data-if の動作」の
    // 「未スキャンの子は `scan` で初期化する」経路が属性を再適用する。
    await mount(`
      <div id="st" data-bind='{"item": null}'>
        <button type="button" id="btn"
          data-click-reset-before="#f1"
          data-click-data='{"id":30001,"editing":1}'
          data-click-bind="#st" data-click-bind-arg="item">編集</button>
        <div id="outer" data-if="item?.editing">
          <form id="f1">
            <div id="yes" data-if="item?.id">ID あり</div>
            <div id="no" data-if="!item?.id">ID なし</div>
          </form>
        </div>
      </div>`);

    (document.querySelector('#btn') as HTMLElement).click();
    await waitForIdle();

    const outer = document.querySelector('#outer') as HTMLElement;
    const yes = document.querySelector('#yes') as HTMLElement;
    const no = document.querySelector('#no') as HTMLElement;
    expect(outer.hasAttribute(`${Env.prefix}if-false`)).toBe(false);
    expect(yes.hasAttribute(`${Env.prefix}if-false`)).toBe(false);
    // 画面上も表示されていること（`data-if-false` だけを外しても、書き戻された
    // `display: none` が残れば利用者には非表示のままに見える）。
    expect(yes.style.getPropertyValue('display')).toBe('');
    expect(no.hasAttribute(`${Env.prefix}if-false`)).toBe(true);
  });
});
