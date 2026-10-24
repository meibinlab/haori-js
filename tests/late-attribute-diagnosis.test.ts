/* @vitest-environment jsdom */
/**
 * @fileoverview 使用する直前に評価し直す属性（`data-{event}-error-toast` など）を、
 * 描画のときと手続きの開始時には未解決参照の診断の対象にしないことの検証。
 *
 * 背景: `data-click-error-toast="{{_fetch.responseMessage ?? '…'}}"` を自要素の
 * `data-click-fetch-state` と組み合わせたボタンが 2 つあり、片方を押した後にもう片方が
 * 描き直されると、まだ `_fetch` が注入されていない描画のときの評価が「別のスコープでは
 * 供給されているキー」として警告されていた。失敗の後に評価する属性では、描画のときに
 * `_fetch` が無いのが正常である。
 *
 * 未解決参照の診断は、モジュールの中で共有する状態から描画が落ち着いた時点に出ます。
 * 同じ式とキーの組は一度だけ報告されるため、テストごとに別の文言・名前を使います。
 *
 * 期待値の根拠は仕様「未解決参照の診断」と仕様「バインド後に実行するアクションの
 * 評価タイミング」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Haori from '../src/haori';
import {waitForCondition, waitForIdle} from './helpers/async';

/** 返す応答 */
type Reply = {status: number; body: string};

describe('使用する直前に評価し直す属性の診断', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  /** 表示したトースト（`レベル:文言`） */
  let toasts: string[] = [];

  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setStrictBind(false);
    Env.setRuntime('embedded');
    toasts = [];
    await import('../src/observer');
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Haori, 'toast').mockImplementation(async (message, level) => {
      toasts.push(`${level}:${message}`);
    });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    Dev.enable();
  });

  /**
   * 呼ばれた順に応答を返すフェッチのスパイを設定します。
   *
   * @param replies 返す応答。最後の応答は以後の呼び出しでも返す
   * @returns 戻り値はありません。
   */
  const stubFetch = (...replies: Reply[]): void => {
    let index = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return new Response(reply.body, {
        status: reply.status,
        headers: {'Content-Type': 'application/json'},
      });
    });
  };

  /**
   * 出力された警告の文言を返します。
   *
   * @returns 警告の文言
   */
  const warnings = (): string[] =>
    (warn.mock.calls as unknown[][]).map(args =>
      args.map(arg => String(arg)).join(' '),
    );

  /**
   * 「別のスコープでは供給されている」と報告された式のうち、文言を含むものを返します。
   *
   * @param text 式に含まれる文言
   * @returns 該当する警告
   */
  const scopeMissingWarnings = (text: string): string[] =>
    warnings().filter(
      message =>
        message.includes('provided in another scope') && message.includes(text),
    );

  /**
   * 描画して落ち着くまで待ちます。
   *
   * @param html 描画する HTML
   * @returns 落ち着いたら解決する Promise
   */
  const render = async (html: string): Promise<void> => {
    // 走査は呼び出しごとに新しい要素から始める（走査済みの `body` の中身を
    // 差し替えても、フラグメントは作り直されない）。
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    await Core.scan(root);
    await waitForIdle();
  };

  /**
   * 要素をクリックして落ち着くまで待ちます。
   *
   * @param id 要素の id
   * @returns 落ち着いたら解決する Promise
   */
  const click = async (id: string): Promise<void> => {
    (document.getElementById(id) as HTMLElement).click();
    await waitForIdle();
    await waitForIdle();
  };

  it('別のボタンの取得の後に描き直したボタンの -error-toast を、描画のときには報告しない', async () => {
    // 仕様「未解決参照の診断」の「`data-click-error-toast="{{_fetch.responseMessage ?? '…'}}"`
    // は描画のときには報告せず」
    stubFetch({status: 200, body: '{"ok":true}'});
    await render(`
<button id="b1" type="button" data-click-fetch="x.json" data-click-fetch-state
  data-click-bind="#detail" data-click-bind-arg="detail"
  data-click-error-toast="{{_fetch.responseMessage ?? '取得できませんでした（1）'}}">b1</button>
<section id="detail" data-bind='{"detail": {}}'>
  <button id="b2" type="button" data-if="detail.ok" data-click-fetch="x.json" data-click-fetch-state
    data-click-error-toast="{{_fetch.responseMessage ?? '保存できませんでした（1）'}}">b2</button>
</section>`);
    await click('b1');
    await waitForCondition(
      () => !(document.getElementById('b2') as HTMLElement).hidden,
    );
    await waitForIdle();
    expect(scopeMissingWarnings('保存できませんでした（1）')).toEqual([]);
  });

  it('まだ押していないボタンを押して成功しても、手続きの開始時の評価を報告しない', async () => {
    // 仕様「未解決参照の診断」の「描画のときと手続きの開始時は、応答をまだバインド
    // しておらず、`_fetch` もまだ注入されていないのが正常だからです」
    stubFetch({status: 200, body: '{}'});
    await render(`
<button id="c1" type="button" data-click-fetch="x.json" data-click-fetch-state
  data-click-error-toast="{{_fetch.responseMessage ?? '取得できませんでした（2）'}}">c1</button>
<button id="c2" type="button" data-click-fetch="x.json" data-click-fetch-state
  data-click-error-toast="{{_fetch.responseMessage ?? '保存できませんでした（2）'}}">c2</button>`);
    await click('c1');
    await click('c2');
    expect(scopeMissingWarnings('保存できませんでした（2）')).toEqual([]);
  });

  it('失敗したとき、-error-toast は応答本文の文言を表示し、報告しない', async () => {
    // 仕様「バインド後に実行するアクションの評価タイミング」の表の
    // 「`data-{event}-error-toast` / `data-{event}-error-toast-level`」「取得の失敗の後」
    // 「表示直前」
    stubFetch(
      {status: 200, body: '{}'},
      {status: 409, body: '{"message":"受け付けられませんでした"}'},
    );
    await render(`
<button id="d1" type="button" data-click-fetch="x.json" data-click-fetch-state
  data-click-error-toast="{{_fetch.responseMessage ?? '取得できませんでした（3）'}}">d1</button>
<button id="d2" type="button" data-click-fetch="x.json" data-click-fetch-state
  data-click-error-toast="{{_fetch.responseMessage ?? '保存できませんでした（3）'}}">d2</button>`);
    await click('d1');
    await click('d2');
    // レベルはこのテストの対象ではないため、文言だけを比べる。
    expect(toasts.map(toast => toast.replace(/^[^:]*:/, ''))).toContain(
      '受け付けられませんでした',
    );
    expect(scopeMissingWarnings('保存できませんでした（3）')).toEqual([]);
  });

  it('注入先を兄弟要素にした -error-toast は、失敗の後の評価で報告する', async () => {
    // 仕様「未解決参照の診断」の「失敗の後の評価で `_fetch` が無い場合（注入先を
    // 兄弟要素にした取り違え）に報告します」
    stubFetch({status: 500, body: '{}'});
    await render(`
<div>
  <button id="e1" type="button" data-click-fetch="x.json" data-click-fetch-state="#e-state"
    data-click-error-toast="{{_fetch.responseMessage ?? '保存できませんでした（4）'}}">e1</button>
  <div id="e-state"></div>
</div>`);
    await click('e1');
    expect(scopeMissingWarnings('保存できませんでした（4）')).toHaveLength(1);
  });

  it('表示に使う式は、注入先を兄弟要素にした取り違えを従来どおり報告する', async () => {
    // 仕様「未解決参照の診断」の「値を求める式（`{{_fetch.responseMessage ?? '…'}}`）は
    // 従来どおり報告します」
    stubFetch({status: 200, body: '{}'});
    await render(`
<div>
  <button id="f1" type="button" data-click-fetch="x.json" data-click-fetch-state="#f-state">f1</button>
  <div id="f-state"></div>
  <p>{{_fetch.responseMessage ?? '表示の文言（5）'}}</p>
</div>`);
    await click('f1');
    expect(scopeMissingWarnings('表示の文言（5）')).toHaveLength(1);
  });

  it.each([
    ['dialog'],
    ['toast'],
    ['toast-level'],
    ['error-toast'],
    ['error-toast-level'],
    ['error-404-toast'],
    ['error-404-toast-level'],
    ['history'],
    ['scroll'],
    ['redirect'],
    ['redirect-replace'],
    ['redirect-return-param'],
  ])(
    'data-click-%s の応答のキーを、押す前に一度も供給されなかったと報告しない',
    async suffix => {
      // 仕様「未解決参照の診断」の「`data-click-redirect="{{nextAction === 'pay' ?
      // redirectUrl : '/complete.html'}}"` も、押す前に「一度も供給されなかった」とは
      // 報告しません」。対象は仕様「バインド後に実行するアクションの評価タイミング」の
      // 表の属性
      const key = `late_${suffix.replace(/-/g, '_')}`;
      await render(`
<div id="state">
  <button type="button" data-click-fetch="x.json" data-click-bind="#state"
    data-click-${suffix}="{{${key}}}">g</button>
</div>`);
      await waitForIdle();
      expect(
        warnings().filter(
          message =>
            message.includes('were never provided') && message.includes(key),
        ),
      ).toEqual([]);
    },
  );

  it.each([
    ['title', 'late_title'],
    // 接頭辞（`data-`）の無い属性は、後ろが同じ形でも対象ではない
    ['x-click-toast', 'late_unprefixed'],
  ])(
    '使用する直前に評価し直す属性でない %s は、押す前でも一度も供給されなかったと報告する',
    async (name, key) => {
      // 仕様「未解決参照の診断」の「その時点までに `data-fetch` や `data-bind` の更新で
      // **一度でも供給されたキーは報告しません**」の裏（供給されていないキーは報告する）
      await render(`
<div id="state">
  <button type="button" data-click-fetch="x.json" data-click-bind="#state"
    ${name}="{{${key}}}">h</button>
</div>`);
      await waitForIdle();
      expect(
        warnings().filter(
          message =>
            message.includes('were never provided') && message.includes(key),
        ),
      ).toHaveLength(1);
    },
  );

  it('data-strict-bind でも、使用する直前に評価し直す属性の描画のときの評価に error を出さない', async () => {
    // 仕様「未解決参照の診断」の「`data-strict-bind` の `error` も出しません」
    // 「描画のときと手続きの開始時の評価」
    Env.setStrictBind(true);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await render(`
<div id="state">
  <button type="button" data-click-fetch="x.json" data-click-bind="#state"
    data-click-redirect="{{late_strict}}">s</button>
</div>`);
    } finally {
      Env.setStrictBind(false);
    }
    const messages = (error.mock.calls as unknown[][]).map(args =>
      args.map(arg => String(arg)).join(' '),
    );
    expect(
      messages.filter(message =>
        message.includes('not in the binding data: late_strict.'),
      ),
    ).toEqual([]);
  });
});
