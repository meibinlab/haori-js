/* @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import Fragment, {
  ElementFragment,
  TextFragment,
  CommentFragment,
} from '../src/fragment';

// ヘルパー: DOM子要素のタグ名配列を取得
const childTagNames = (el: Element) =>
  Array.from(el.children)
    .map(e => e.tagName.toLowerCase());

describe('Fragment.get の検証', () => {
  it('HTMLElement/Text/Comment から適切なフラグメントを返し、キャッシュされる', () => {
    const div = document.createElement('div');
    const text = document.createTextNode('hello');
    const comment = document.createComment('c');
    div.append(text, comment);

    const ef = Fragment.get(div);
    const tf = Fragment.get(text);
    const cf = Fragment.get(comment);

    expect(ef).toBeInstanceOf(ElementFragment);
    expect(tf).toBeInstanceOf(TextFragment);
    expect(cf).toBeInstanceOf(CommentFragment);

    // キャッシュ検証（同一インスタンスが返る）
    expect(Fragment.get(div)).toBe(ef);
    expect(Fragment.get(text)).toBe(tf);
    expect(Fragment.get(comment)).toBe(cf);

    // 子フラグメントが生成済み
    expect((ef as ElementFragment).getChildren().length).toBe(2);
  });
});

describe('ElementFragment の mount/unmount/hide/show', () => {
  it('子フラグメントの mount/unmount を正しく行う', async () => {
    const wrapper = document.createElement('div');
    const inner = document.createElement('span');
    wrapper.appendChild(inner);

    const wrapperFrag = new ElementFragment(wrapper);
    const childFrags = wrapperFrag.getChildElementFragments();
    expect(childFrags.length).toBe(1);
    const childFrag = childFrags[0];

    expect(childFrag.isMounted()).toBe(false);
    await childFrag.mount();
    expect(childFrag.isMounted()).toBe(true);

    await childFrag.unmount();
    expect(childFrag.isMounted()).toBe(false);
    expect(inner.parentNode).toBeNull();
  });

  it('hide/show でテキストノードを含む子要素が保持される', async () => {
    const wrapper = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = 'テストテキスト';
    wrapper.appendChild(p);

    const wrapperFrag = new ElementFragment(wrapper);

    // 初期状態: 子要素とテキストが存在
    expect(wrapper.children.length).toBe(1);
    expect(p.textContent).toBe('テストテキスト');

    // 1回目: hide → show
    await wrapperFrag.hide();
    expect(wrapper.style.display).toBe('none');
    expect(wrapper.getAttribute('data-if-false')).toBe('');
    expect(wrapper.children.length).toBe(1); // 子要素は残っている
    expect(p.textContent).toBe('テストテキスト'); // テキストも残っている

    await wrapperFrag.show();
    expect(wrapper.style.display).toBe('');
    expect(wrapper.hasAttribute('data-if-false')).toBe(false);
    expect(wrapper.children.length).toBe(1);
    expect(p.textContent).toBe('テストテキスト');

    // 2回目: hide → show（複数回のサイクルをテスト）
    await wrapperFrag.hide();
    expect(wrapper.style.display).toBe('none');
    expect(wrapper.children.length).toBe(1);
    expect(p.textContent).toBe('テストテキスト');

    await wrapperFrag.show();
    expect(wrapper.style.display).toBe('');
    expect(wrapper.children.length).toBe(1);
    expect(p.textContent).toBe('テストテキスト');

    // 3回目: hide → show（さらに繰り返し）
    await wrapperFrag.hide();
    expect(wrapper.children.length).toBe(1);
    expect(p.textContent).toBe('テストテキスト');

    await wrapperFrag.show();
    expect(wrapper.children.length).toBe(1);
    expect(p.textContent).toBe('テストテキスト'); // 何度でもテキストが保持される
  });
});

describe('ElementFragment の insertBefore/insertAfter', () => {
  it('insertBefore で参照ノードの前に挿入し、子配列とDOM順が一致する', async () => {
    const parent = document.createElement('div');
    const a = document.createElement('span'); a.id = 'a';
    const b = document.createElement('span'); b.id = 'b';
    parent.append(a, b);

    const pf = new ElementFragment(parent);
    const initial = pf.getChildElementFragments();
    const bf = initial[1];

    const c = document.createElement('span'); c.id = 'c';
    const cf = Fragment.get(c)!; // parentなし

    await pf.insertBefore(cf, bf);

    // DOM順
    expect(childTagNames(parent)).toEqual(['span', 'span', 'span']);
    const ids1 = Array.from(parent.children).map(
      e => (e as HTMLElement).id,
    );
    expect(ids1).toEqual(['a', 'c', 'b']);

    // 子配列順
    const elems = pf.getChildElementFragments();
    expect(elems.map(e => e.getTarget().id)).toEqual(['a', 'c', 'b']);

    // 親/マウント状態
    expect(cf.getParent()).toBe(pf);
    expect(cf.isMounted()).toBe(pf.isMounted());

    // insertAfter の確認（bの後ろ=末尾）
    const d = document.createElement('span'); d.id = 'd';
    const df = Fragment.get(d)!;
    await pf.insertAfter(df, pf.getChildElementFragments()[2]);
    const ids2 = Array.from(parent.children).map(
      e => (e as HTMLElement).id,
    );
    expect(ids2).toEqual(['a', 'c', 'b', 'd']);
  });
});

describe('ElementFragment の setValue', () => {
  it('text input に値を設定して同期される', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    const ef = new ElementFragment(input);

    await ef.setValue('hello');
    expect(input.value).toBe('hello');
    expect(ef.getValue()).toBe('hello');
  });

  it('checkbox に boolean を設定して checked が同期される', async () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('value', 'true');
    const ef = new ElementFragment(input);

    await ef.setValue(true);
    expect(input.checked).toBe(true);
    expect(ef.getValue()).toBe(true);

    await ef.setValue(false);
    expect(input.checked).toBe(false);
    expect(ef.getValue()).toBeNull();
  });
});

describe('ElementFragment の属性操作', () => {
  it('getAttribute/removeAttribute/setAttribute の基本動作', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-x', '123');
    const ef = new ElementFragment(el);

    expect(ef.getAttribute('data-x')).toBe('123');

    await ef.removeAttribute('data-x');
    expect(ef.getAttribute('data-x')).toBeNull();

    await ef.setAttribute('data-y', 'abc');
    expect(el.getAttribute('data-y')).toBe('abc');
  });
});

describe('TextFragment と CommentFragment', () => {
  it('TextFragment setContent/evaluate が textContent を更新する', async () => {
    const text = document.createTextNode('hello');
    const tf = new TextFragment(text);
    await tf.setContent('world');
    // 通常テキストのみ（プレースホルダなし）
    expect(text.textContent).toBe('world');
  });

  it('CommentFragment setContent が textContent を更新する', async () => {
    const c = document.createComment('a');
    const cf = new CommentFragment(c);
    await cf.setContent('b');
    expect(c.textContent).toBe('b');
  });
});
