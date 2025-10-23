import {describe, it, expect} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';

describe.skip('data-each-arg の適用（プリミティブ配列のバインディング）', () => {
  const markMounted = (f: ElementFragment) => {
    f.setMounted(true);
    f.getChildElementFragments().forEach(child => markMounted(child));
  };

  it('プリミティブ配列 + each-arg で {{item}} が展開される', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const each = document.createElement('div');
    each.setAttribute('data-haori-each', '["A","B"]');
    each.setAttribute('data-haori-each-arg', 'item');
    const child = document.createElement('span');
    child.textContent = '{{item}}';
    each.appendChild(child);
    container.appendChild(each);

    const frag = Fragment.get(each) as ElementFragment;
    markMounted(frag);

  await Core.evaluateAll(frag);
  // 非同期挿入の完了待ち
  await new Promise(resolve => setTimeout(resolve, 10));

    const spans = Array.from(
      each.querySelectorAll('span'),
    ) as HTMLSpanElement[];
    // 2つのクローン（テンプレート以外）が存在し、テキストが A, B に評価される
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe('A');
    expect(spans[1].textContent).toBe('B');

    container.remove();
  });
});
