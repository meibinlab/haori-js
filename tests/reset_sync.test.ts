import {describe, it, beforeEach, afterEach, expect, vi} from 'vitest';
import Fragment, {ElementFragment} from '../src/fragment';
import Form from '../src/form';
import Core from '../src/core';
import Haori from '../src/haori';

/**
 * Form.reset 後の値再同期の回帰テスト。
 *
 * リセット前に変更された値が双方向バインディングへ書き込まれている場合、
 * リセット後に内部値とバインドデータが DOM の既定値（HTML 属性）へ
 * 再同期されることを検証する。再同期されないと、画面上は既定値に
 * 戻っているのに古い値が送信される不具合が発生する。
 */
describe('Form.reset 後の値再同期', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.spyOn(Core, 'evaluateAll').mockResolvedValue();
    vi.spyOn(Core, 'setBindingData').mockResolvedValue();
    vi.spyOn(Haori, 'clearMessages').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  const getFrag = (el: HTMLElement): ElementFragment => {
    const f = Fragment.get(el);
    return f as ElementFragment;
  };

  const markMounted = (f: ElementFragment) => {
    f.setMounted(true);
    f.getChildElementFragments().forEach(child => markMounted(child));
  };

  it('セレクトボックスの内部値が HTML 既定値（selected 属性）へ戻る', async () => {
    const form = document.createElement('form');
    const select = document.createElement('select');
    select.name = 'status';
    const opt1 = document.createElement('option');
    opt1.value = '未対応';
    opt1.setAttribute('selected', '');
    const opt2 = document.createElement('option');
    opt2.value = '対応済み';
    select.append(opt1, opt2);
    form.appendChild(select);
    container.appendChild(form);

    const formFrag = getFrag(form);
    const selectFrag = getFrag(select);
    markMounted(formFrag);

    // 変更イベント相当: DOM 値を変更して内部値とバインドデータへ同期
    select.value = '対応済み';
    selectFrag.syncValue();
    formFrag.setBindingData({status: '対応済み'});
    expect(selectFrag.getValue()).toBe('対応済み');

    await expect(Form.reset(formFrag)).resolves.toBeUndefined();

    // DOM・内部値とも既定値へ戻る
    expect(select.value).toBe('未対応');
    expect(selectFrag.getValue()).toBe('未対応');

    // バインドデータもリセット後の値で更新される
    expect(Core.setBindingData).toHaveBeenCalledWith(
      form,
      expect.objectContaining({status: '未対応'}),
    );
  });

  it('テキスト入力の内部値が空の既定値へ戻る', async () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'keyword';
    form.appendChild(input);
    container.appendChild(form);

    const formFrag = getFrag(form);
    const inputFrag = getFrag(input);
    markMounted(formFrag);

    input.value = 'zzz';
    inputFrag.syncValue();
    formFrag.setBindingData({keyword: 'zzz'});
    expect(inputFrag.getValue()).toBe('zzz');

    await expect(Form.reset(formFrag)).resolves.toBeUndefined();

    expect(input.value).toBe('');
    expect(inputFrag.getValue()).toBe('');
    expect(Core.setBindingData).toHaveBeenCalledWith(
      form,
      expect.objectContaining({keyword: ''}),
    );
  });

  it('コンテナのリセットで配下フォームの値とバインドデータも初期化される', async () => {
    const wrapper = document.createElement('div');
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'code';
    form.appendChild(input);
    wrapper.appendChild(form);
    container.appendChild(wrapper);

    const wrapperFrag = getFrag(wrapper);
    const formFrag = getFrag(form);
    const inputFrag = getFrag(input);
    markMounted(wrapperFrag);

    input.value = 'stale';
    inputFrag.syncValue();
    formFrag.setBindingData({code: 'stale'});

    await expect(Form.reset(wrapperFrag)).resolves.toBeUndefined();

    // 入れ子フォーム内の入力もネイティブリセットされ、内部値も同期される
    expect(input.value).toBe('');
    expect(inputFrag.getValue()).toBe('');
    expect(Core.setBindingData).toHaveBeenCalledWith(
      form,
      expect.objectContaining({code: ''}),
    );
  });

  it('data-form-arg 付きフォームは arg キー配下のバインドデータを更新する', async () => {
    const form = document.createElement('form');
    form.setAttribute('data-form-arg', 'cond');
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'name';
    form.appendChild(input);
    container.appendChild(form);

    const formFrag = getFrag(form);
    const inputFrag = getFrag(input);
    markMounted(formFrag);

    input.value = 'stale';
    inputFrag.syncValue();
    formFrag.setBindingData({cond: {name: 'stale'}});

    await expect(Form.reset(formFrag)).resolves.toBeUndefined();

    expect(Core.setBindingData).toHaveBeenCalledWith(
      form,
      expect.objectContaining({cond: expect.objectContaining({name: ''})}),
    );
  });

  it('バインドデータを持たないフォームはリセット時にバインドデータを作らない', async () => {
    // 祖先バインドを参照する hidden コンテキストフォームのシャドーイング防止
    const form = document.createElement('form');
    form.setAttribute('data-form-arg', 'detail');
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'id';
    form.appendChild(input);
    container.appendChild(form);

    const formFrag = getFrag(form);
    markMounted(formFrag);

    await expect(Form.reset(formFrag)).resolves.toBeUndefined();

    expect(Core.setBindingData).not.toHaveBeenCalled();
  });
});

describe('同名チェックボックスグループの値収集と反映', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  const getFrag = (el: HTMLElement): ElementFragment => {
    const f = Fragment.get(el);
    return f as ElementFragment;
  };

  const buildGroup = () => {
    const form = document.createElement('form');
    const labels = ['北海道', '東北', '東京'];
    const inputs = labels.map(label => {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'areas';
      input.value = label;
      form.appendChild(input);
      return input;
    });
    container.appendChild(form);
    return {form, inputs};
  };

  it('チェック済みの値が未チェック（null）で上書きされない', () => {
    const {form, inputs} = buildGroup();
    inputs[0].checked = true;
    getFrag(inputs[0]).syncValue();
    getFrag(inputs[1]).syncValue();
    getFrag(inputs[2]).syncValue();

    const values = Form.getValues(getFrag(form));
    expect(values.areas).toBe('北海道');
  });

  it('複数チェック時は配列として収集される', () => {
    const {form, inputs} = buildGroup();
    inputs[0].checked = true;
    inputs[2].checked = true;
    inputs.forEach(input => getFrag(input).syncValue());

    const values = Form.getValues(getFrag(form));
    expect(values.areas).toEqual(['北海道', '東京']);
  });

  it('全て未チェックの場合は null になる', () => {
    const {form, inputs} = buildGroup();
    inputs.forEach(input => getFrag(input).syncValue());

    const values = Form.getValues(getFrag(form));
    expect(values.areas).toBeNull();
  });

  it('配列値の反映で自身の値が含まれるチェックボックスだけがチェックされる', async () => {
    const {form, inputs} = buildGroup();

    await Form.syncValues(getFrag(form), {areas: ['北海道', '東京']});

    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);
    expect(inputs[2].checked).toBe(true);
  });

  it('boolean チェックボックス（value="true"）は単一値のまま扱われる', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'acceptingOnly';
    input.value = 'true';
    input.checked = true;
    form.appendChild(input);
    container.appendChild(form);
    getFrag(input).syncValue();

    const values = Form.getValues(getFrag(form));
    expect(values.acceptingOnly).toBe(true);
  });
});
