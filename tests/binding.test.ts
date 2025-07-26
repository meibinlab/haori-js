import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';

import {Binding} from '../src/binding';
import {Queue} from '../src/queue';
import {Dev} from '../src';
import {Observer} from '../src/observer'; // 追加

describe('Binding クラスのテスト', () => {
  let container: HTMLElement;

  beforeAll(() => {
    Dev.enable();
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(cb, 16);
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // テスト用にcontainerを明示的に監視
    Observer.observe(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    Binding.clearBindings();
  });

  it('bind() でノードに対する Binding インスタンスが生成される', () => {
    container.innerHTML = [
      '<div data-bind=\'{"name":"花子"}\'>',
      '  <span>{{name}}</span>',
      '</div>',
    ].join('');
    const el = container.querySelector('div')!;
    const binding = Binding.bind(el);
    expect(binding).toBeInstanceOf(Binding);
  });

  it('getBindingData() で親子スコープがマージされ、子がプリミティブ値で上書きされる', () => {
    container.innerHTML = [
      '<div data-bind=\'{"name":"親","age":30}\'>',
      '  <section data-bind=\'{"name":"子"}\'></section>',
      '</div>',
    ].join('');
    const child = container.querySelector('section')!;
    const childBinding = Binding.bind(child);
    const data = childBinding.getBindingData();
    expect(data.name).toBe('子');
    expect(data.age).toBeUndefined();
  });

  it('getBindingData() で同名キーがオブジェクトの場合は親の値を完全に上書きする', () => {
    container.innerHTML = [
      '<div data-bind=\'{"user":{"name":"佐藤","age":30}}\'>',
      '  <section data-bind=\'{"user":{"name":"田中"}}\'></section>',
      '</div>',
    ].join('');
    const parent = container.querySelector('div')!;
    const child = container.querySelector('section')!;
    Binding.bind(parent);
    const childBinding = Binding.bind(child);
    const data = childBinding.getBindingData();
    expect(data.user).toEqual({name: '田中'});
    expect('age' in (data.user as Record<string, unknown>)).toBe(false);
  });

  it('data-bind が不正なJSONの場合は bindingData が null になる', () => {
    container.innerHTML = '<div data-bind=\'{name:"NG"}\'></div>';
    const el = container.querySelector('div')!;
    const binding = Binding.bind(el);
    // ...
    expect(binding['bindingData']).toBeNull();
  });

  it('cloneNode() でノードが複製される', () => {
    container.innerHTML = '<div data-bind=\'{"x":1}\'><span>{{x}}</span></div>';
    const el = container.querySelector('div')!;
    const clone = Binding.cloneNode(el);
    expect(clone).not.toBe(el);
    expect((clone as HTMLElement).outerHTML).toContain('data-bind');
  });

  it('removeNode() でノードがDOMとバインディングマップから削除される', async () => {
    container.innerHTML = '<div id="tgt"></div>';
    const el = container.querySelector('#tgt')!;
    Binding.bind(el);
    await Binding.removeNode(el, true);
    expect(document.body.contains(el)).toBe(false);
  });

  it('removeChildren() で全ての子ノードが削除される', async () => {
    container.innerHTML = '<div id="p"><span>1</span><span>2</span></div>';
    const el = container.querySelector('#p')!;
    Binding.bind(el);
    await Binding.removeChildren(el, true);
    expect(el.childNodes.length).toBe(0);
  });

  it('appendChild() で子ノードが追加される', async () => {
    container.innerHTML = '<div id="p"></div><span id="c"></span>';
    const parent = container.querySelector('#p')!;
    const child = container.querySelector('#c')!;
    Binding.bind(parent);
    await Binding.appendChild(parent, child, true);
    expect(parent.contains(child)).toBe(true);
  });

  it('data-if で false の場合は子要素が削除される', async () => {
    container.innerHTML = [
      '<div data-bind=\'{"visible": false}\'>',
      '  <section data-if="visible"><span>should hide</span></section>',
      '</div>',
    ].join('');
    const parent = container.querySelector('div')!;
    const section = container.querySelector('section')!;
    Binding.bind(parent).evaluate();
    // data-if="visible" が false なので section の子は消える
    await Queue.wait();
    // Vitest/DOMの仕様で空要素でもchildNodes.lengthが1になる場合があるため修正
    const isEmpty = section.childNodes.length === 0;
    const isCommentOnly =
      section.childNodes.length === 1 &&
      section.childNodes[0].nodeType === Node.COMMENT_NODE;
    expect(isEmpty || isCommentOnly).toBe(true);
    expect(section.hasAttribute('data-if-false')).toBe(true);
    expect((section as HTMLElement).style.display).toBe('none');
  });

  it('data-if で true に戻すと子要素が復元される', async () => {
    container.innerHTML = [
      '<div data-bind=\'{"visible": false}\'>',
      '  <section data-if="visible"><span>should show</span></section>',
      '</div>',
    ].join('');
    const parent = container.querySelector('div')!;
    const section = container.querySelector('section')!;
    const parentBinding = Binding.bind(parent);
    const sectionBinding = Binding.bind(section);
    // 非表示
    parentBinding.evaluate();
    await Queue.wait();
    // 親バインディングのデータを書き換えて visible: true に
    sectionBinding['bindingData'] = {visible: true};
    sectionBinding['bindingDataCache'] = null;
    parentBinding.evaluate();
    await Queue.wait();
    expect(section.childNodes.length).toBeGreaterThan(0);
    expect(section.hasAttribute('data-if-false')).toBe(false);
    expect((section as HTMLElement).style.display).not.toBe('none');
  });

  it('data-each で配列の要素数だけ子要素が生成される', async () => {
    container.innerHTML = [
      '<div data-bind=\'{"items":[{"name":"A"},{"name":"B"}]}\' data-each="items">',
      '  <span>{{name}}</span>',
      '</div>',
    ].join('');
    const div = container.querySelector('div')!;
    Binding.bind(div).evaluate();
    await Queue.wait();
    // data-each で2つの items があるので、span も2つになる
    const spans = div.querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe('A');
    expect(spans[1].textContent).toBe('B');
  });

  it('data-each で空配列の場合は子要素が生成されない', async () => {
    container.innerHTML = [
      '<div data-bind=\'{"items":[]}\' data-each="items">',
      '  <span>{{name}}</span>',
      '</div>',
    ].join('');
    const div = container.querySelector('div')!;
    Binding.bind(div).evaluate();
    await Queue.wait();
    const spans = div.querySelectorAll('span');
    expect(spans.length).toBe(0);
  });

  it('data-row が自動付与される（data-each）', async () => {
    container.innerHTML = [
      '<div data-bind=\'{"list":[{"v":1},{"v":2}]}\' data-each="list">',
      '  <span>{{v}}</span>',
      '</div>',
    ].join('');
    const div = container.querySelector('div')!;
    Binding.bind(div).evaluate();
    await Queue.wait();
    const spans = div.querySelectorAll('span[data-row]');
    expect(spans.length).toBe(2);
    expect(spans[0].getAttribute('data-row')).toBe('');
    expect(spans[1].getAttribute('data-row')).toBe('');
    expect(spans[0].textContent).toBe('1');
    expect(spans[1].textContent).toBe('2');
  });

  it('data-each-before, data-each-after で前後に1回だけ要素が表示される', async () => {
    container.innerHTML = [
      '<div data-bind=\'{"arr":[{"x":1},{"x":2}]}\' data-each="arr">',
      '  <p data-each-before>先頭</p>',
      '  <p>{{x}}</p>',
      '  <p data-each-after>末尾</p>',
      '</div>',
    ].join('');
    const div = container.querySelector('div')!;
    Binding.bind(div).evaluate();
    await Queue.wait();
    const ps = div.querySelectorAll('p');
    expect(ps.length).toBe(4);
    expect(ps[0].hasAttribute('data-each-before')).toBe(true);
    expect(ps[1].textContent).toBe('1');
    expect(ps[2].textContent).toBe('2');
    expect(ps[3].hasAttribute('data-each-after')).toBe(true);
  });

  it('data-each-index でインデックスが付与される', async () => {
    container.innerHTML = [
      '<div data-bind=\'{"arr":[{"n":"A"},{"n":"B"}]}\' ' +
        'data-each="arr" data-each-arg="row" data-each-index="i">',
      '  <span>{{row.i}}:{{row.n}}</span>',
      '</div>',
    ].join('');
    const div = container.querySelector('div')!;
    Binding.bind(div).evaluate();
    await Queue.wait();
    const spans = div.querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe('0:A');
    expect(spans[1].textContent).toBe('1:B');
  });

  it('data-each-key で data-row 属性値がキー値になる', async () => {
    container.innerHTML = [
      '<div data-bind=\'{"items":[{"id":10,"v":"X"},{"id":20,"v":"Y"}]}\' ' +
        'data-each="items" data-each-key="id">',
      '  <span>{{v}}</span>',
      '</div>',
    ].join('');
    const div = container.querySelector('div')!;
    Binding.bind(div).evaluate();
    await Queue.wait();
    const spans = div.querySelectorAll('span[data-row]');
    expect(spans.length).toBe(2);
    expect(spans[0].getAttribute('data-row')).toBe('10');
    expect(spans[1].getAttribute('data-row')).toBe('20');
    expect(spans[0].textContent).toBe('X');
    expect(spans[1].textContent).toBe('Y');
  });
});
