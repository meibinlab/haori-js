/* @vitest-environment jsdom */
/**
 * @fileoverview 値の往復に関する不変条件を、入力種別 × 供給経路の組み合わせで
 * 横断的に検証します。
 *
 * これまでの回帰は、いずれも「画面に見えている値」「収集値（送信・保存される値）」
 * 「バインドデータ」の三者が食い違うという同じ形で現れました。個別の再現テストは
 * それぞれの構成でしか守れないため、ここでは組み合わせを一覧にして、どの入力種別を
 * どの経路で供給しても三者が一致することを固定します。
 *
 * 検証する経路は次の 4 つです。
 *
 * 1. 初期 `data-bind` からの復元（初期スキャン）
 * 2. `Core.setBindingData()` による後からの供給
 * 3. 利用者の操作（`change` による双方向コミット）
 * 4. リセット（初期 `data-bind` の内容へ戻る）
 *
 * 期待値の根拠は仕様「収集は DOM を真とする」と仕様「ユーザー編集と宣言バインドの権威」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: Element): ElementFragment =>
  Fragment.get(element) as ElementFragment;

/** 入力種別ごとの検証条件 */
interface Kind {
  /** 表示名（テスト名に使う） */
  name: string;
  /** フォーム内へ置くマークアップ */
  html: string;
  /** 初期 `data-bind` に載せる値 */
  initial: unknown;
  /** 後から供給する値 */
  supplied: unknown;
  /** 利用者が操作した後に期待する値 */
  edited: unknown;
  /** 画面の状態を、収集値と同じ形で読み取る */
  read: (form: HTMLFormElement) => unknown;
  /** 利用者の操作を再現する（`change` の発火は呼び出し側が行う） */
  edit: (form: HTMLFormElement) => HTMLElement;
  /** 候補が `data-each` で後から描かれる構成かどうか */
  lateOptions?: boolean;
}

/**
 * `<select multiple>` の選択値を読み取ります。
 *
 * @param select 対象の `<select>`
 * @returns 選択済み option の値の配列
 */
const selectedValues = (select: HTMLSelectElement): string[] =>
  Array.from(select.selectedOptions).map(option => option.value);

const KINDS: Kind[] = [
  {
    name: 'text',
    html: '<input name="v" type="text">',
    initial: 'あ',
    supplied: 'い',
    edited: 'う',
    read: form => (form.querySelector('[name="v"]') as HTMLInputElement).value,
    edit: form => {
      const input = form.querySelector('[name="v"]') as HTMLInputElement;
      input.value = 'う';
      return input;
    },
  },
  {
    name: 'number',
    html: '<input name="v" type="number">',
    // `type="number"` は数値型で収集・バインドされる。
    initial: 1,
    supplied: 2,
    edited: 3,
    read: form =>
      Number((form.querySelector('[name="v"]') as HTMLInputElement).value),
    edit: form => {
      const input = form.querySelector('[name="v"]') as HTMLInputElement;
      input.value = '3';
      return input;
    },
  },
  {
    name: 'textarea',
    html: '<textarea name="v"></textarea>',
    initial: 'あ',
    supplied: 'い',
    edited: 'う',
    read: form =>
      (form.querySelector('[name="v"]') as HTMLTextAreaElement).value,
    edit: form => {
      const area = form.querySelector('[name="v"]') as HTMLTextAreaElement;
      area.value = 'う';
      return area;
    },
  },
  {
    name: 'hidden',
    html: '<input name="v" type="hidden">',
    initial: 'あ',
    supplied: 'い',
    edited: 'う',
    read: form => (form.querySelector('[name="v"]') as HTMLInputElement).value,
    edit: form => {
      const input = form.querySelector('[name="v"]') as HTMLInputElement;
      input.value = 'う';
      return input;
    },
  },
  {
    name: 'checkbox（boolean）',
    html: '<input name="v" type="checkbox" value="true">',
    initial: true,
    supplied: false,
    edited: true,
    read: form =>
      (form.querySelector('[name="v"]') as HTMLInputElement).checked,
    edit: form => {
      const input = form.querySelector('[name="v"]') as HTMLInputElement;
      input.checked = true;
      return input;
    },
  },
  {
    // 収集値の形が配列になるよう、常に 2 つ以上をチェックした状態で比べる
    // （1 つだけのときはスカラで収集する。`checkbox-group-collection.test.ts` を参照）。
    name: 'checkbox グループ',
    html:
      '<input name="v" type="checkbox" value="a">' +
      '<input name="v" type="checkbox" value="b">' +
      '<input name="v" type="checkbox" value="c">',
    initial: ['a', 'b'],
    supplied: ['b', 'c'],
    edited: ['a', 'b', 'c'],
    read: form =>
      Array.from(
        form.querySelectorAll<HTMLInputElement>('[name="v"]:checked'),
      ).map(input => input.value),
    edit: form => {
      const inputs = Array.from(
        form.querySelectorAll<HTMLInputElement>('[name="v"]'),
      );
      inputs.forEach(input => {
        input.checked = true;
      });
      return inputs[0];
    },
  },
  {
    name: 'checkbox グループ（data-attr-value）',
    // 送信値を宣言バインドで与える構成（`data-each` の行ごとに値が変わる画面と同じ）。
    html:
      '<input name="v" type="checkbox" data-attr-value="{{opts[0]}}">' +
      '<input name="v" type="checkbox" data-attr-value="{{opts[1]}}">' +
      '<input name="v" type="checkbox" data-attr-value="{{opts[2]}}">',
    initial: ['11', '12'],
    supplied: ['12', '13'],
    edited: ['11', '12', '13'],
    read: form =>
      Array.from(
        form.querySelectorAll<HTMLInputElement>('[name="v"]:checked'),
      ).map(input => input.value),
    edit: form => {
      const inputs = Array.from(
        form.querySelectorAll<HTMLInputElement>('[name="v"]'),
      );
      inputs.forEach(input => {
        input.checked = true;
      });
      return inputs[0];
    },
  },
  {
    name: 'radio グループ',
    html:
      '<input name="v" type="radio" value="a">' +
      '<input name="v" type="radio" value="b">',
    initial: 'a',
    supplied: 'b',
    edited: 'a',
    read: form => {
      const checked = form.querySelector<HTMLInputElement>(
        '[name="v"]:checked',
      );
      return checked ? checked.value : null;
    },
    edit: form => {
      const inputs = Array.from(
        form.querySelectorAll<HTMLInputElement>('[name="v"]'),
      );
      inputs[0].checked = true;
      inputs[1].checked = false;
      return inputs[0];
    },
  },
  {
    name: 'select（単一）',
    html:
      '<select name="v">' +
      '<option value="a">A</option><option value="b">B</option>' +
      '</select>',
    initial: 'a',
    supplied: 'b',
    edited: 'a',
    read: form => (form.querySelector('[name="v"]') as HTMLSelectElement).value,
    edit: form => {
      const select = form.querySelector('[name="v"]') as HTMLSelectElement;
      select.value = 'a';
      return select;
    },
  },
  {
    name: 'select（複数）',
    html:
      '<select name="v" multiple>' +
      '<option value="a">A</option><option value="b">B</option>' +
      '<option value="c">C</option>' +
      '</select>',
    initial: ['a'],
    supplied: ['b', 'c'],
    edited: ['a', 'c'],
    read: form =>
      selectedValues(form.querySelector('[name="v"]') as HTMLSelectElement),
    edit: form => {
      const select = form.querySelector('[name="v"]') as HTMLSelectElement;
      Array.from(select.options).forEach(option => {
        option.selected = option.value === 'a' || option.value === 'c';
      });
      return select;
    },
  },
  {
    name: 'select（候補を data-each で流し込む）',
    html:
      '<select name="v" data-each="opts" data-each-arg="o">' +
      '<option value="{{o}}">{{o}}</option>' +
      '</select>',
    initial: 'a',
    supplied: 'b',
    edited: 'a',
    lateOptions: true,
    read: form => (form.querySelector('[name="v"]') as HTMLSelectElement).value,
    edit: form => {
      const select = form.querySelector('[name="v"]') as HTMLSelectElement;
      select.value = 'a';
      return select;
    },
  },
];

/** `data-attr-value` で送信値を与えるチェックボックス群の候補 */
const OPTS = ['11', '12', '13'];

/** 候補を `data-each` で流し込む構成で使う選択肢 */
const SELECT_OPTS = ['a', 'b'];

describe('値の往復（画面・収集値・バインドデータの一致）', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    document.body.innerHTML = '';
  });

  /**
   * 入力種別ごとの初期バインドデータを作ります。
   *
   * @param kind 入力種別
   * @param value `v` に載せる値
   * @returns バインドデータ
   */
  const bindingFor = (kind: Kind, value: unknown): Record<string, unknown> => {
    const data: Record<string, unknown> = {v: value};
    if (kind.name.includes('data-attr-value')) {
      data.opts = [...OPTS];
    }
    if (kind.lateOptions) {
      data.opts = [...SELECT_OPTS];
    }
    return data;
  };

  /**
   * 入力種別のフォームをマウントします。
   *
   * @param kind 入力種別
   * @returns 生成した form 要素
   */
  const mount = async (kind: Kind): Promise<HTMLFormElement> => {
    const initial = JSON.stringify(bindingFor(kind, kind.initial));
    container.innerHTML = `<form data-bind='${initial}'>${kind.html}</form>`;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form') as HTMLFormElement;
  };

  /**
   * 画面・収集値・バインドデータの三者が一致することを確かめます。
   *
   * @param kind 入力種別
   * @param form 対象フォーム
   * @param expected 期待する値
   */
  const expectConsistent = (
    kind: Kind,
    form: HTMLFormElement,
    expected: unknown,
  ): void => {
    // 画面に見えている値
    expect(kind.read(form)).toEqual(expected);
    // 送信・保存される収集値
    expect(Form.getValues(getFrag(form)).v).toEqual(expected);
    // 式が参照するバインドデータ
    expect((Core.getBindingData(form) as Record<string, unknown>).v).toEqual(
      expected,
    );
  };

  for (const kind of KINDS) {
    describe(kind.name, () => {
      it('初期 data-bind の値が画面・収集値・バインドで一致する', async () => {
        const form = await mount(kind);
        expectConsistent(kind, form, kind.initial);
      });

      it('後から供給した値が画面・収集値・バインドで一致する', async () => {
        const form = await mount(kind);

        await Core.setBindingData(form, bindingFor(kind, kind.supplied));
        await waitForDomSettled();

        expectConsistent(kind, form, kind.supplied);
      });

      it('利用者が操作した値が収集値とバインドへ載る', async () => {
        const form = await mount(kind);

        const target = kind.edit(form);
        target.dispatchEvent(new Event('change', {bubbles: true}));
        await waitForDomSettled();

        expectConsistent(kind, form, kind.edited);
      });

      it('リセットで初期 data-bind の値へ戻る', async () => {
        const form = await mount(kind);

        const target = kind.edit(form);
        target.dispatchEvent(new Event('change', {bubbles: true}));
        await waitForDomSettled();

        await Form.reset(getFrag(form));
        await waitForDomSettled();

        expectConsistent(kind, form, kind.initial);
      });
    });
  }
});
