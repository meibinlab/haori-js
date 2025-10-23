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
});
