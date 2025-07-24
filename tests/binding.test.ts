import {describe, it, expect, beforeEach} from 'vitest';
import {Binding} from '../src/binding';

describe('Binding クラスのテスト', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('bind() でノードに対する Binding インスタンスが生成される', async () => {
    container.innerHTML = `<div data-bind='{"name":"花子"}'><span>{{name}}</span></div>`;
    const el = container.querySelector('div')!;
    const binding = await Binding.bind(el);
    expect(binding).toBeInstanceOf(Binding);
  });

  it('getBindingData() で親子スコープがマージされ、子がプリミティブ値で上書きされる', async () => {
    container.innerHTML = `
      <div data-bind='{"name":"親","age":30}'>
        <section data-bind='{"name":"子"}'></section>
      </div>
    `;
    const child = container.querySelector('section')!;
    const childBinding = await Binding.bind(child);
    // @ts-ignore: privateメソッドのため
    const data = childBinding['getBindingData']();
    expect(data.name).toBe('子');
    // 子スコープで同名キーがプリミティブ値の場合、親の値は上書きされ、親のageは継承されない
    expect(data.age).toBeUndefined();
  });

  it('getBindingData() で同名キーがオブジェクトの場合は親の値を完全に上書きせず、親のプロパティが残る（Haori仕様に準拠）', async () => {
    container.innerHTML = `
      <div data-bind='{"user":{"name":"佐藤","age":30}}'>
        <section data-bind='{"user":{"name":"田中"}}'></section>
      </div>
    `;
    const parent = container.querySelector('div')!;
    const child = container.querySelector('section')!;
    await Binding.bind(parent);
    const childBinding = await Binding.bind(child);
    // @ts-ignore: privateメソッドのため
    const data = childBinding['getBindingData']();
    // Haori仕様: オブジェクトの場合は親の値を完全に上書きする（マージしない）
    expect(data.user).toEqual({name: '田中'});
    // ageは残らない
    expect('age' in (data.user as Record<string, string | boolean>)).toBe(
      false,
    );
  });

  it('data-bind が不正なJSONの場合は bindingData が null になる', async () => {
    container.innerHTML = `<div data-bind='{name:"NG"}'></div>`;
    const el = container.querySelector('div')!;
    const binding = await Binding.bind(el);
    // @ts-ignore: privateプロパティのため
    expect(binding['bindingData']).toBeNull();
  });

  it('cloneNode() でノードが複製される', async () => {
    container.innerHTML = `<div data-bind='{"x":1}'><span>{{x}}</span></div>`;
    const el = container.querySelector('div')!;
    const clone = await Binding.cloneNode(el);
    expect(clone).not.toBe(el);
    expect((clone as HTMLElement).outerHTML).toContain('data-bind');
  });

  it('removeNode() でノードがDOMとバインディングマップから削除される', async () => {
    container.innerHTML = `<div id="tgt"></div>`;
    const el = container.querySelector('#tgt')!;
    await Binding.bind(el);
    await Binding.removeNode(el);
    expect(document.body.contains(el)).toBe(false);
  });

  it('removeChildren() で全ての子ノードが削除される', async () => {
    container.innerHTML = `<div id="p"><span>1</span><span>2</span></div>`;
    const el = container.querySelector('#p')!;
    await Binding.bind(el);
    await Binding.removeChildren(el);
    expect(el.childNodes.length).toBe(0);
  });

  it('appendChild() で子ノードが追加される', async () => {
    container.innerHTML = `<div id="p"></div><span id="c"></span>`;
    const parent = container.querySelector('#p')!;
    const child = container.querySelector('#c')!;
    await Binding.bind(parent);
    await Binding.appendChild(parent, child);
    expect(parent.contains(child)).toBe(true);
  });
});
