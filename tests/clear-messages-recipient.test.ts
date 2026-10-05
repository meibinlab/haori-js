/* @vitest-environment jsdom */
/**
 * @fileoverview `Haori.clearMessages()` が、`Haori.addMessage()` が付けた親要素の
 * 表示も消すこと。
 *
 * 背景: `Haori.addMessage()` はフォーム以外の要素を渡すと親要素へ表示を付けるが、
 * `Haori.clearMessages()` は渡した要素とその子孫だけを消していた。そのため
 * haori 単体では、フォームの外の要素（一覧の行のボタンや、`data-fetch` の
 * 状態ホスト）への失敗の表示が、次の取得で表示を止めても残っていた（要望 BM の
 * 受け入れ条件 5）。
 *
 * 期待値の根拠は仕様「`data-message` / `data-message-level`」と、仕様「失敗時の
 * アクション」の「前回の失敗の表示は、今までどおり消します」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Fragment from '../src/fragment';
import Haori from '../src/haori';
import {waitForCondition, waitForIdle} from './helpers/async';

/** 返す応答 */
type Reply = {status: number; body: string};

describe('Haori.clearMessages() と親要素の表示', () => {
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    await import('../src/observer');
  });

  afterEach(() => {
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * 呼ばれた順に応答を返すフェッチのスパイを設定します。
   *
   * @param replies 返す応答。最後の応答は以後の呼び出しでも返す
   * @returns フェッチのスパイ
   */
  const stubFetch = (...replies: Reply[]) => {
    let index = 0;
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return new Response(reply.body, {
        status: reply.status,
        headers: {'Content-Type': 'text/plain'},
      });
    });
  };

  /**
   * HTML をマウントして走査し、落ち着くまで待ちます。
   *
   * @param html マウントする HTML 文字列
   * @returns 待ち合わせの Promise
   */
  const mount = async (html: string): Promise<void> => {
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
    await waitForIdle();
  };

  /**
   * 表示された失敗のメッセージ（`data-message` 属性の値）を返します。
   *
   * @returns 表示された文言
   */
  const shownMessages = (): string[] =>
    Array.from(container!.querySelectorAll('[data-message]')).map(
      element => element.getAttribute('data-message') ?? '',
    );

  describe('Haori.clearMessages()', () => {
    it('フォーム以外の要素を渡すと、親要素に付いた表示も消す', async () => {
      // 仕様「`data-message` / `data-message-level`」の「渡した要素とその子孫の
      // 表示に加えて、`Haori.addMessage()` が付ける位置（入力要素を渡した場合は
      // 親要素）の表示も消します」。
      await mount('<div id="p"><input id="i"></div>');
      const input = container!.querySelector('#i') as HTMLElement;
      await Haori.addErrorMessage(input, '不正です');
      expect(shownMessages()).toEqual(['不正です']);

      await Haori.clearMessages(input);

      expect(shownMessages()).toEqual([]);
      expect(
        container!.querySelector('#p')!.hasAttribute('data-message-level'),
      ).toBe(false);
    });

    it('親要素の無い要素を渡しても失敗しない', async () => {
      // 仕様「`data-message` / `data-message-level`」。付ける位置が無ければ、
      // 渡した要素とその子孫だけを消す。
      const detached = document.createElement('span');
      detached.setAttribute('data-message', '残り');

      await Haori.clearMessages(detached);

      expect(detached.hasAttribute('data-message')).toBe(false);
    });

    it('フォームを渡した場合は、親要素の表示を消さない', async () => {
      // 仕様「`data-message` / `data-message-level`」の「フォーム要素を渡した
      // 場合はその要素自身」。フォームへの表示は親要素へ付かないため、親要素は
      // 消す範囲に入らない。
      await mount('<div id="p"><form id="f"></form></div>');
      const parent = container!.querySelector('#p') as HTMLElement;
      parent.setAttribute('data-message', '外側の表示');
      const form = container!.querySelector('#f') as HTMLElement;
      await Haori.addErrorMessage(form, '送信できません');

      await Haori.clearMessages(form);

      expect(shownMessages()).toEqual(['外側の表示']);
    });
  });

  describe('取得の失敗の表示', () => {
    it('フォームの外のボタンで、表示を止めた失敗のときに前回の表示を消す', async () => {
      // 仕様「失敗時のアクション」の「前回の失敗の表示は、今までどおり消します」。
      stubFetch({status: 500, body: '障害'}, {status: 409, body: '対象外'});
      await mount(
        '<div><button id="b" data-click-fetch="/api/x"' +
          ' data-click-error-status="409" data-click-error-no-message>' +
          '</button></div>',
      );
      const button = container!.querySelector('#b') as HTMLElement;

      button.click();
      await waitForIdle();
      expect(shownMessages()).toEqual(['障害']);
      button.click();
      await waitForIdle();

      expect(shownMessages()).toEqual([]);
    });

    it('フォームの外の data-fetch を取り直して表示を止めたときに、前回の表示を消す', async () => {
      // 仕様「失敗時のアクション」の「前回の失敗の表示は、今までどおり消します」。
      stubFetch(
        {status: 500, body: '障害'},
        {status: 404, body: '見つかりません'},
      );
      await mount(
        '<div><div id="state" data-fetch="/api/start.json" data-fetch-state' +
          ' data-fetch-error-no-message data-fetch-error-status="404">' +
          '</div></div><button id="retry" data-click-refetch="#state"></button>',
      );
      expect(shownMessages()).toEqual(['障害']);

      (container!.querySelector('#retry') as HTMLElement).click();
      await waitForCondition(
        () =>
          (
            Fragment.get(
              container!.querySelector('#state') as HTMLElement,
            ).getBindingData() as {_fetch?: {statusCode: number}}
          )._fetch?.statusCode === 404,
        {description: '取り直しの 404'},
      );
      await waitForIdle();

      expect(shownMessages()).toEqual([]);
    });
  });
});
