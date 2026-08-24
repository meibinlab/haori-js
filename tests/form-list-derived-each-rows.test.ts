/* @vitest-environment jsdom */
/**
 * @fileoverview 派生配列を描く `data-each` と `data-form-list` を併用したときの
 * 収集値のテスト。
 *
 * 収集は集められた行だけを集めます。収集した行だけで配列を組み立て直すと、絞り込みで
 * 除かれた要素が丸ごと失われ（保存すると消えます）、画面の並びが配列の並びと違う場合は
 * 配列の並びまで画面に合わせて動きます。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「双方向バインディングの自動更新」「**同じことが配列の要素にも当てはまります。**
 *   収集は**集められた行だけ**を集めるため、収集した行だけで配列を組み立て直すと、
 *   収集の対象にならなかった要素が失われます」
 * - 仕様「行の対応付けと `data-each-key`」の「**収集した行に対応しない配列要素**:
 *   元の位置に元の値のまま残します。**収集が配列を行数へ切り詰めることは
 *   ありません**」
 * - 同節「並びも土台の配列に従うため、配列を先に入れ替えて画面を描き直す前に収集が
 *   走っても（`data-{event}-row-prev` の直後など）並びは巻き戻りません」
 * - 同節の「`data-each-key` なし」「**絞り込んだ一覧（派生配列）では、この対応は行と
 *   配列要素を取り違えます**」「宣言が無い場合は開発モードで、`data-each` の式ごとに
 *   一度だけ警告します」
 * - 同節の「`data-each-key` あり」「配列に無いキーの行は「配列から消えた行が画面に
 *   残っているもの」として取り込みません」（非派生の対照。こちらの振る舞いは変わらない）
 * - 仕様「`data-if-false` 分岐とフォーム送信」「**`data-form-list` の行そのものを
 *   `data-if` で隠した場合、落ちるのはその行の入力欄の値（上書きしないこと）だけで、
 *   配列の要素は残ります**」
 * - 仕様「派生配列の書き戻し先（`data-each-array`）」「**ただし送信データ
 *   （`data-{event}-form` が集める payload）には画面にある行だけが入ります。**」
 * - 同節「`data-{event}-data` はフォームの収集値より**後**に重なるため、同じキーを
 *   上書きできます」
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import EventDispatcher from '../src/event_dispatcher';

import {waitForIdle} from './helpers/async';

/** 3 件のうち 2 件だけが `active` な行リスト */
const RULES =
  '[{"id":1,"name":"A","active":true},' +
  '{"id":2,"name":"B","active":false},' +
  '{"id":3,"name":"C","active":true}]';

describe('派生配列の data-each と data-form-list の併用', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let warnings: string[];
  let sent: RequestInit[];

  beforeEach(() => {
    Dev.set(false);
    Env.setRuntime('embedded');
    warnings = [];
    sent = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        sent.push(init ?? {});
        return Promise.resolve(new Response('{}'));
      },
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    Dev.set(false);
    vi.restoreAllMocks();
  });

  /**
   * 行リストを組み立てて走査します。
   *
   * @param each `data-each` の式
   * @param extra コンテナへ足す宣言
   * @param tail フォームの末尾へ足す markup（保存ボタンなど）
   * @returns フォーム要素
   */
  const build = async (
    each: string,
    extra = 'data-each-key="id"',
    tail = '',
  ): Promise<HTMLFormElement> => {
    container.innerHTML =
      `<form id="f" data-bind='{"rules":${RULES},"title":""}'>` +
      '<input name="title" id="title">' +
      `<div data-form-list="rules" data-each="${each}"` +
      ` data-each-arg="r" ${extra}>` +
      '<div class="line">' +
      '<input name="name" data-attr-value="{{r.name}}"' +
      ' data-attr-id="nm-{{r.id}}">' +
      `</div></div>${tail}</form>`;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();
    return form;
  };

  /** 保存ボタン（送信データはフォームの収集値） */
  const SAVE_BUTTON =
    '<button id="send" data-click-fetch="/api/save"' +
    ' data-click-fetch-method="POST" data-click-form="#f">保存</button>';

  /**
   * 収集先の配列を取り出します。
   *
   * @param form 対象のフォーム
   * @returns 収集先の配列
   */
  const rules = (form: HTMLFormElement): unknown =>
    (Core.getBindingData(form) ?? {}).rules;

  /**
   * 入力欄を編集して確定します。
   *
   * @param id 入力欄の id
   * @param value 入力する値
   * @returns 確定後の反映を待つ Promise
   */
  const edit = async (id: string, value: string): Promise<void> => {
    const input = document.getElementById(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();
  };

  it('絞り込みで除かれた要素が収集値に残る（回帰）', async () => {
    const form = await build('rules.filter(r => r.active)');
    expect(container.querySelectorAll('.line').length).toBe(2);

    await edit('nm-1', 'A2');

    // 収集した 2 行だけで組み立て直すと、画面に出ていない id:2 が丸ごと消える。
    expect(rules(form)).toEqual([
      {id: 1, name: 'A2', active: true},
      {id: 2, name: 'B', active: false},
      {id: 3, name: 'C', active: true},
    ]);
  });

  it('画面の行が 0 件でも配列を空にしない（回帰）', async () => {
    const form = await build('rules.filter(r => r.name === "Z")');
    expect(container.querySelectorAll('.line').length).toBe(0);

    // 一覧の外の入力欄の確定でも、フォーム全体の収集が走る。
    await edit('title', '件名');

    expect(rules(form)).toEqual(JSON.parse(RULES));
  });

  it('画面の並びが配列の並びと違っても配列の並びを動かさない（回帰）', async () => {
    const form = await build('rules.slice().reverse()');
    const lines = container.querySelectorAll('.line input');
    expect((lines[0] as HTMLInputElement).value).toBe('C');

    await edit('nm-3', 'C2');

    // 収集した行の順（画面の順）で組み立て直すと、配列そのものが逆順になる。
    expect(rules(form)).toEqual([
      {id: 1, name: 'A', active: true},
      {id: 2, name: 'B', active: false},
      {id: 3, name: 'C2', active: true},
    ]);
  });

  /**
   * `data-each-key` の警告だけを取り出します。
   *
   * @returns 該当する警告の配列
   */
  const keyWarnings = (): string[] =>
    warnings.filter(warning => warning.includes('each-key'));

  it('data-each-key の無い派生一覧を開発モードで警告する（回帰）', async () => {
    await build('rules.filter(r => r.active !== false)', '');

    // 開発モードでないあいだは報告しない。報告済みの印もこの時点では付けない
    // （付けると、後から開発モードにしたときに報告が出なくなる）。
    await edit('title', '件名');
    expect(keyWarnings()).toEqual([]);

    Dev.set(true);
    await edit('title', '件名 2');
    expect(keyWarnings().length).toBe(1);
    expect(keyWarnings()[0]).toContain('rules.filter(r => r.active !== false)');

    // 収集は入力のたびに走るため、同じ宣言を繰り返し報告しない。
    await edit('title', '件名 3');
    expect(keyWarnings().length).toBe(1);
  });

  it('素の経路の data-each は data-each-key が無くても警告しない', async () => {
    Dev.set(true);
    await build('rules', '');

    await edit('title', '件名');

    expect(keyWarnings()).toEqual([]);
  });

  it('data-each-key を宣言した派生一覧は警告しない', async () => {
    Dev.set(true);
    await build('rules.filter(r => r.active)');

    await edit('title', '件名');

    expect(keyWarnings()).toEqual([]);
  });

  it('行そのものを data-if で隠しても配列の要素が残る（回帰）', async () => {
    // 行の中身ではなく行自身を隠す。収集からは外れるが、配列の要素は減らない。
    container.innerHTML =
      `<form id="f" data-bind='{"rules":${RULES},"title":""}'>` +
      '<input name="title" id="title">' +
      '<div data-form-list="rules" data-each="rules" data-each-arg="r"' +
      ' data-each-key="id">' +
      '<div class="line" data-if="r.active">' +
      '<input name="name" data-attr-value="{{r.name}}"' +
      ' data-attr-id="nm-{{r.id}}">' +
      '</div></div></form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    await edit('title', '件名');

    expect(rules(form)).toEqual(JSON.parse(RULES));
  });

  it('送信データには画面にある行だけが入る', async () => {
    // バインドデータ（保存値）は全件残るが、送信データは収集の結果なので画面と一致
    // する。そのまま配列の置き換えに使うと、絞り込みで除かれた要素が消える。
    const form = await build(
      'rules.filter(r => r.active)',
      'data-each-key="id"',
      SAVE_BUTTON,
    );
    (form.querySelector('#send') as HTMLButtonElement).click();
    await waitForIdle();

    expect(JSON.parse(String(sent[0]?.body)).rules).toEqual([
      {name: 'A'},
      {name: 'C'},
    ]);
  });

  it('data-{event}-data でバインドデータを送れば全件になる', async () => {
    const form = await build(
      'rules.filter(r => r.active)',
      'data-each-key="id"',
      SAVE_BUTTON.replace(
        '>保存',
        ' data-click-data=\'{"rules": {{rules}}}\'>保存',
      ),
    );
    await edit('nm-1', 'A2');
    (form.querySelector('#send') as HTMLButtonElement).click();
    await waitForIdle();

    // 収集値より後に重なるため、絞り込む前の配列で置き換わる。編集も載っている。
    expect(JSON.parse(String(sent[0]?.body)).rules).toEqual([
      {id: 1, name: 'A2', active: true},
      {id: 2, name: 'B', active: false},
      {id: 3, name: 'C', active: true},
    ]);
  });

  it('配列から消えた行が画面に残っていても取り込まない', async () => {
    const form = await build('rules');
    expect(container.querySelectorAll('.line').length).toBe(3);

    // 画面を描き直す前に収集が走る状況を作る。配列を先に更新し、行の描画を待たずに
    // 一覧の外の入力欄を確定する。
    const bound = JSON.parse(RULES) as unknown[];
    bound.splice(1, 1);
    void Core.setBindingData(form, {rules: bound, title: ''});
    await edit('title', '件名');
    await waitForIdle();

    expect(rules(form)).toEqual([
      {id: 1, name: 'A', active: true},
      {id: 3, name: 'C', active: true},
    ]);
  });
});
