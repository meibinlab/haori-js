import {describe, it, beforeEach, afterEach, expect, vi} from 'vitest';
import Fragment, {ElementFragment} from '../src/fragment';
import Form from '../src/form';
import Core from '../src/core';
import Haori from '../src/haori';

describe('Form.reset と data-each 複製の境界ケース', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.spyOn(Core, 'evaluateAll').mockResolvedValue();
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

  it('data-each 配下で before/after を残し、それ以外の複製を削除する', async () => {
    const each = document.createElement('div');
    each.setAttribute('data-each', '[]');
    const before = document.createElement('div');
    before.setAttribute('data-each-before', '');
    const c1 = document.createElement('div');
    c1.className = 'clone1';
    const c2 = document.createElement('div');
    c2.className = 'clone2';
    const after = document.createElement('div');
    after.setAttribute('data-each-after', '');
    each.append(before, c1, c2, after);
    container.appendChild(each);

    const frag = getFrag(each);
    markMounted(frag);
    await expect(Form.reset(frag)).resolves.toBeUndefined();

    // before/after は残る
    expect(each.querySelector('[data-each-before]')).not.toBeNull();
    expect(each.querySelector('[data-each-after]')).not.toBeNull();
    // クローンは削除される
    expect(each.querySelector('.clone1')).toBeNull();
    expect(each.querySelector('.clone2')).toBeNull();

    expect(Core.evaluateAll).toHaveBeenCalledTimes(1);
    expect(Haori.clearMessages).toHaveBeenCalled();
  });

  it('ネスト: before 内の内側 each の複製も削除される（再帰）', async () => {
    const outer = document.createElement('section');
    outer.setAttribute('data-each', '[]');
    const before = document.createElement('div');
    before.setAttribute('data-each-before', '');
    const inner = document.createElement('div');
    inner.setAttribute('data-each', '[]');
    const ib = document.createElement('span');
    ib.setAttribute('data-each-before', '');
    const ic1 = document.createElement('span');
    ic1.className = 'inner-clone1';
    const ic2 = document.createElement('span');
    ic2.className = 'inner-clone2';
    const ia = document.createElement('span');
    ia.setAttribute('data-each-after', '');
    inner.append(ib, ic1, ic2, ia);
    before.appendChild(inner);
    const after = document.createElement('div');
    after.setAttribute('data-each-after', '');
    outer.append(before, after);
    container.appendChild(outer);

    const frag = getFrag(outer);
    markMounted(frag);
    await expect(Form.reset(frag)).resolves.toBeUndefined();

    // 外側 before/after は残る
    expect(outer.querySelector('[data-each-before]')).not.toBeNull();
    expect(outer.querySelector('[data-each-after]')).not.toBeNull();
    // 内側 each のクローンは削除される（before/after は残る）
    expect(inner.querySelector('.inner-clone1')).toBeNull();
    expect(inner.querySelector('.inner-clone2')).toBeNull();
    expect(inner.querySelector('[data-each-before]')).not.toBeNull();
    expect(inner.querySelector('[data-each-after]')).not.toBeNull();
  });

  it('大量の複製(100)でも全て削除され before/after のみ残る', async () => {
    const each = document.createElement('ul');
    each.setAttribute('data-each', '[]');
    const before = document.createElement('li');
    before.setAttribute('data-each-before', '');
    each.appendChild(before);
    for (let i = 0; i < 100; i++) {
      const li = document.createElement('li');
      li.className = `item-${i}`;
      each.appendChild(li);
    }
    const after = document.createElement('li');
    after.setAttribute('data-each-after', '');
    each.appendChild(after);
    container.appendChild(each);

    const frag = getFrag(each);
    markMounted(frag);
    await expect(Form.reset(frag)).resolves.toBeUndefined();

    // 100個のクローンが削除済み
    let found = false;
    for (let i = 0; i < 100; i++) {
      if (each.querySelector(`.item-${i}`)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(false);
    // before/after は残る
    expect(each.querySelector('[data-each-before]')).not.toBeNull();
    expect(each.querySelector('[data-each-after]')).not.toBeNull();
  });

  it('3段の深い入れ子でも各階層の複製が削除され before/after は保持される', async () => {
    // outer -> middle -> inner と3段の each
    const outer = document.createElement('div');
    outer.setAttribute('data-each', '[]');
    const ob = document.createElement('div');
    ob.setAttribute('data-each-before', '');
    const oa = document.createElement('div');
    oa.setAttribute('data-each-after', '');

    const middle = document.createElement('section');
    middle.setAttribute('data-each', '[]');
    const mb = document.createElement('div');
    mb.setAttribute('data-each-before', '');
    const mc1 = document.createElement('div');
    mc1.className = 'm-clone1';
    const mc2 = document.createElement('div');
    mc2.className = 'm-clone2';
    const ma = document.createElement('div');
    ma.setAttribute('data-each-after', '');

    const inner = document.createElement('article');
    inner.setAttribute('data-each', '[]');
    const ib = document.createElement('span');
    ib.setAttribute('data-each-before', '');
    const ic1 = document.createElement('span');
    ic1.className = 'i-clone1';
    const ic2 = document.createElement('span');
    ic2.className = 'i-clone2';
    const ia = document.createElement('span');
    ia.setAttribute('data-each-after', '');

    inner.append(ib, ic1, ic2, ia);
    middle.append(mb, mc1, mc2, inner, ma);
    // middle は outer の before 内に配置（outer の each で本体は保持される想定）
    ob.appendChild(middle);
    outer.append(ob, oa);
    container.appendChild(outer);

    const frag = getFrag(outer);
    markMounted(frag);
    await expect(Form.reset(frag)).resolves.toBeUndefined();

    // outer 層: before/after 残存
    expect(outer.querySelector('[data-each-before]')).not.toBeNull();
    expect(outer.querySelector('[data-each-after]')).not.toBeNull();
    // middle 層のクローンは削除（DOM 上からも消える）
    expect(outer.querySelector('.m-clone1')).toBeNull();
    expect(outer.querySelector('.m-clone2')).toBeNull();
    // inner 層は本体ごと削除され、クローンも DOM 上に存在しない
    expect(outer.querySelector('article[data-each]')).toBeNull();
    expect(outer.querySelector('.i-clone1')).toBeNull();
    expect(outer.querySelector('.i-clone2')).toBeNull();
  });

  it('複数フォーム混在時に selector 指定の reset で対象フォームのみ each 複製が削除される', async () => {
    // form1 と form2 を用意し、どちらにも each の複製を配置
    const form1 = document.createElement('form');
    form1.id = 'f1';
    const e1 = document.createElement('div');
    e1.setAttribute('data-each', '[]');
    const e1b = document.createElement('div');
    e1b.setAttribute('data-each-before', '');
    const e1c = document.createElement('div');
    e1c.className = 'f1-clone';
    const e1a = document.createElement('div');
    e1a.setAttribute('data-each-after', '');
    e1.append(e1b, e1c, e1a);
    form1.appendChild(e1);

    const form2 = document.createElement('form');
    form2.id = 'f2';
    const e2 = document.createElement('div');
    e2.setAttribute('data-each', '[]');
    const e2b = document.createElement('div');
    e2b.setAttribute('data-each-before', '');
    const e2c = document.createElement('div');
    e2c.className = 'f2-clone';
    const e2a = document.createElement('div');
    e2a.setAttribute('data-each-after', '');
    e2.append(e2b, e2c, e2a);
    form2.appendChild(e2);

    container.append(form1, form2);

    // reset を発火させるボタン
    const button = document.createElement('button');
    button.setAttribute('data-click-reset', '#f1');
    container.appendChild(button);

    const f1 = getFrag(form1);
    const f2 = getFrag(form2);
    const btnFrag = getFrag(button);
    // マウント状態にする（remove() が DOM から除去できるように）
    markMounted(f1);
    markMounted(f2);
    markMounted(btnFrag);

    // Procedure を実行（fetch 無し→成功系フローで reset 実行）
    const Procedure = (await import('../src/procedure')).default;
    const proc = new Procedure(btnFrag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();

    // form1 側の each 複製は削除され、before/after は残る
    expect(form1.querySelector('.f1-clone')).toBeNull();
    expect(form1.querySelector('[data-each-before]')).not.toBeNull();
    expect(form1.querySelector('[data-each-after]')).not.toBeNull();

    // form2 側は影響を受けない（クローンは残存）
    expect(form2.querySelector('.f2-clone')).not.toBeNull();
    expect(form2.querySelector('[data-each-before]')).not.toBeNull();
    expect(form2.querySelector('[data-each-after]')).not.toBeNull();
  });
});
