import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {Binding} from '../src/binding';
import {Dev} from '../src';
import '../src/observer';

describe('Observer', () => {
  let container: HTMLElement;

  beforeAll(() => {
    Dev.enable();
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(cb, 16);
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('属性変更時にBinding.updateAttributeが呼ばれる', async () => {
    container.innerHTML = '<div id="test" data-bind=\'{"x":1}\'></div>';
    const el = container.querySelector('#test')!;
    const spy = vi.spyOn(Binding, 'updateAttribute');
    // 監視対象ノードをMutationObserverが監視しているか確認
    // observer.tsはdocument.bodyを監視しているためcontainerはOK
    el.setAttribute('data-bind', '{"x":2}');
    // MutationObserverのコールバックは非同期で、テスト環境によっては複数回イベントループをまたぐ場合がある
    for (let i = 0; i < 5; i++) {
      if (spy.mock.calls.length > 0) break;
      await new Promise(r => setTimeout(r, 20));
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ノード追加時にBinding.bindが呼ばれる', async () => {
    const spy = vi.spyOn(Binding, 'bind');
    const child = document.createElement('span');
    const prevCallCount = spy.mock.calls.length;
    container.appendChild(child);
    for (let i = 0; i < 5; i++) {
      if (spy.mock.calls.length > prevCallCount) break;
      await new Promise(r => setTimeout(r, 20));
    }
    const newCalls = spy.mock.calls.slice(prevCallCount);
    const calledWithChild = newCalls.some(args => args[0] === child);
    expect(calledWithChild).toBe(true);
    spy.mockRestore();
  });

  it('ノード削除時にBinding.removeNodeが呼ばれる', async () => {
    const child = document.createElement('span');
    container.appendChild(child);
    const spy = vi.spyOn(Binding, 'removeNode');
    const prevCallCount = spy.mock.calls.length;
    container.removeChild(child);
    for (let i = 0; i < 5; i++) {
      if (spy.mock.calls.length > prevCallCount) break;
      await new Promise(r => setTimeout(r, 20));
    }
    const newCalls = spy.mock.calls.slice(prevCallCount);
    const calledWithChild = newCalls.some(args => args[0] === child);
    expect(calledWithChild).toBe(true);
    spy.mockRestore();
  });

  it('テキストノード変更時にBinding.updateTextContentが呼ばれる', async () => {
    const text = document.createTextNode('abc');
    container.appendChild(text);
    const spy = vi.spyOn(Binding, 'updateTextContent');
    text.textContent = 'def';
    for (let i = 0; i < 5; i++) {
      if (spy.mock.calls.length > 0) break;
      await new Promise(r => setTimeout(r, 20));
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
