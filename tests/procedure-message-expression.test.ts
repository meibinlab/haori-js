/* @vitest-environment jsdom */
/**
 * @fileoverview 表示メッセージの属性にテンプレート式を書いた場合のテスト。
 *
 * 対象は `data-{event}-confirm` / `-dialog` / `-toast` です。期待値の根拠は仕様
 * 「`data-{event}-confirm`」の「単体プレースホルダの評価結果が `null` /
 * `undefined` / `false` / 空文字 / `0`、または未解決参照になった場合は、確認を
 * 出さずに手続きを続けます」「それ以外の評価結果は**文字列にしてメッセージに
 * します**」と、仕様「`data-{event}-dialog`」の「評価結果が falsy（`null` /
 * `undefined` / `false` / 空文字 / `0`）または未解決参照のときは**表示しません**。
 * それ以外は文字列にして表示します」です。
 *
 * 0.46.1 までは confirm が評価値を文字列と決めつけて `.replace()` を呼んでいたため、
 * `null` に評価されると `TypeError` で手続き全体（バインド・行操作・遷移）が
 * 止まりました。dialog / toast は文字列以外をそのまま表示 API へ渡していたため、
 * 差し替え実装（`haori-bootstrap` は改行の復元で `String.prototype.replace` を
 * 呼びます）では数値のメッセージが例外になりました。
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Haori from '../src/haori';
import {waitForIdle} from './helpers/async';

describe('表示メッセージのテンプレート式', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let confirmSpy: MockInstance<typeof Haori.confirm>;
  let dialogSpy: MockInstance<typeof Haori.dialog>;
  let toastSpy: MockInstance<typeof Haori.toast>;
  let errors: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(argument => String(argument)).join(' '));
    });
    confirmSpy = vi.spyOn(Haori, 'confirm').mockResolvedValue(true);
    dialogSpy = vi.spyOn(Haori, 'dialog').mockResolvedValue(undefined);
    toastSpy = vi.spyOn(Haori, 'toast').mockResolvedValue(undefined);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    vi.restoreAllMocks();
  });

  /**
   * 指定した宣言を持つボタンを押し、手続きが進んだかどうかを返します。
   *
   * `data-click-data` と `data-click-bind` だけの手続きにしているのは、確認の後に
   * 続くアクションが実行されたかを、フェッチを介さずに画面の表示で見るためです。
   *
   * @param declaration ボタンへ付けるメッセージ属性の宣言
   * @returns 押した後の表示（手続きが進めば `n=1`）
   */
  const clickWith = async (declaration: string): Promise<string> => {
    container.innerHTML = `
      <div id="state" data-bind='{"n":0}'>
        <p id="out">n={{n}}</p>
        <button id="btn" ${declaration} data-click-data='{"n":1}'
          data-click-bind="#state" data-click-bind-merge>実行</button>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    (container.querySelector('#btn') as HTMLButtonElement).click();
    await waitForIdle();
    return (container.querySelector('#out') as HTMLElement).textContent ?? '';
  };

  // 「`null` …になった場合は、確認を出さずに手続きを続けます」
  it('null に評価されたら確認せずに手続きを続ける', async () => {
    const out = await clickWith(
      'data-click-confirm="{{n > 0 ? \'破棄しますか？\' : null}}"',
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 「`false` …になった場合は、確認を出さずに手続きを続けます」
  it('false に評価されたら確認せずに手続きを続ける', async () => {
    const out = await clickWith('data-click-confirm="{{n > 0}}"');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 「空文字 …になった場合は、確認を出さずに手続きを続けます」
  it('空文字に評価されたら確認せずに手続きを続ける', async () => {
    const out = await clickWith(
      "data-click-confirm=\"{{n > 0 ? '破棄しますか？' : ''}}\"",
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 「`0`、または未解決参照になった場合は、確認を出さずに手続きを続けます」
  it('0 に評価されたら確認せずに手続きを続ける', async () => {
    const out = await clickWith('data-click-confirm="{{n}}"');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 「または未解決参照になった場合は、確認を出さずに手続きを続けます」
  it('未解決参照なら確認せずに手続きを続ける', async () => {
    const out = await clickWith('data-click-confirm="{{missing.msg}}"');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 「それ以外の評価結果は**文字列にしてメッセージにします**」
  it('数値に評価されたら文字列にして確認する', async () => {
    const out = await clickWith('data-click-confirm="{{n + 5}}"');
    expect(confirmSpy).toHaveBeenCalledWith('5');
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 「確認ダイアログを表示します。キャンセル時は処理を中断します。」
  it('文字列に評価されたら確認し、キャンセルで手続きを中断する', async () => {
    confirmSpy.mockResolvedValue(false);
    const out = await clickWith(
      'data-click-confirm="{{n >= 0 ? \'破棄しますか？\' : null}}"',
    );
    expect(confirmSpy).toHaveBeenCalledWith('破棄しますか？');
    expect(out).toBe('n=0');
    expect(errors).toEqual([]);
  });

  // 仕様「`data-{event}-dialog`」の「それ以外は文字列にして表示します」。
  // 表示 API の差し替え実装は引数を文字列として扱うため、型まで固定する。
  it('dialog が数値に評価されたら文字列にして表示する', async () => {
    // dialog は表示直前に評価するため、バインド後の `n`（1）で 6 になる
    // （仕様「バインド後に実行するアクションの評価タイミング」）。
    const out = await clickWith('data-click-dialog="{{n + 5}}"');
    expect(dialogSpy).toHaveBeenCalledWith('6');
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 仕様「`data-{event}-toast`」の「それ以外は文字列にして表示します」（文字列化の
  // 扱いは dialog と同じで、`\n` 表記の復元だけが違う）。
  it('toast が数値に評価されたら文字列にして表示する', async () => {
    const out = await clickWith('data-click-toast="{{n + 5}}"');
    expect(toastSpy).toHaveBeenCalledWith('6', 'info');
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 同じ節の「それ以外は文字列にして表示します」。手続きの途中で参照が消えた場合は
  // 仕様「バインド後に実行するアクションの評価タイミング」により手続き開始時の値を
  // 使うため、その経路でも文字列にして渡すことを固定する。
  it('dialog の参照が途中で消えたら開始時の値を文字列にして表示する', async () => {
    container.innerHTML = `
      <div id="state" data-bind='{"n":0}'>
        <button id="btn" data-click-dialog="{{n + 5}}"
          data-click-data='{"other":1}' data-click-bind="#state">実行</button>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    (container.querySelector('#btn') as HTMLButtonElement).click();
    await waitForIdle();

    expect(dialogSpy).toHaveBeenCalledWith('5');
    expect(errors).toEqual([]);
  });

  // 仕様「`data-{event}-toast`」の「ただし `\n` 表記は改行へ復元しません
  // （復元するのは `data-{event}-dialog` と `data-{event}-confirm` です）」。修正前も
  // 同じ挙動のため回帰テストではなく、仕様に書いた dialog との差異を固定するもの。
  it('toast は \\n 表記を復元せず、dialog は復元する', async () => {
    const out = await clickWith(
      'data-click-toast="A\\nB" data-click-dialog="A\\nB"',
    );
    expect(toastSpy).toHaveBeenCalledWith('A\\nB', 'info');
    expect(dialogSpy).toHaveBeenCalledWith('A\nB');
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });

  // 同じ節の「評価結果が falsy …または未解決参照のときは**表示しません**」。
  // 修正前も表示しなかったため回帰テストではなく、仕様の記述を固定するもの。
  it('dialog と toast が未解決参照なら表示しない', async () => {
    const out = await clickWith(
      'data-click-dialog="{{missing.msg}}" data-click-toast="{{missing.msg}}"',
    );
    expect(dialogSpy).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalled();
    expect(out).toBe('n=1');
    expect(errors).toEqual([]);
  });
});
