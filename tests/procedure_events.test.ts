import {describe, it, beforeEach, expect, vi, afterEach} from 'vitest';
import Procedure from '../src/procedure';
import Fragment, {ElementFragment} from '../src/fragment';
import Haori from '../src/haori';

describe('イベント属性: before-run / after-run', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // Reset global flag if used
    // 型安全のために Window 拡張を使用
    (window as Window & typeof globalThis).__afterRan = false;
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  const createFragmentWith = (
    attrs: Record<string, string>,
  ): ElementFragment => {
    const el = document.createElement('button');
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    container.appendChild(el);
    const frag = Fragment.get(el) as ElementFragment;
    return frag;
  };

  it('data-???-before-run が false を返すと以後の処理を停止する（dialog が呼ばれない）', async () => {
    const frag = createFragmentWith({
      'data-click-before-run': 'return false;',
      'data-click-dialog': 'OK',
    });
    const dialogSpy = vi.spyOn(Haori, 'dialog').mockResolvedValue();
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    expect(dialogSpy).not.toHaveBeenCalled();
  });

  it('data-???-after-run が false を返すと後続（dialog）が実行されない', async () => {
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/api',
      'data-click-after-run': 'return false;',
      'data-click-dialog': 'OK',
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch;
    const dialogSpy = vi.spyOn(Haori, 'dialog').mockResolvedValue();
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    expect(dialogSpy).not.toHaveBeenCalled();
  });

  it('フェッチエラー時は after-run が実行されない', async () => {
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/api',
      'data-click-after-run': 'window.__afterRan = true;',
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('bad', {status: 400}),
      ) as unknown as typeof fetch;
    vi.spyOn(Haori, 'addErrorMessage').mockResolvedValue();
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    expect((window as Window & typeof globalThis).__afterRan).toBe(false);
  });

  it('baseline: fetch が呼ばれる（URL は元の値）', async () => {
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/original',
      'data-click-after-run': 'return;',
    });
    const fetchMock = (global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch);
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    const calls = (fetchMock as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    expect(calls.length).toBe(1);
    expect(String(calls[0][0] as RequestInfo)).toBe(
      'https://example.com/original',
    );
  });

  it('before-run で fetchUrl を上書きできる', async () => {
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/original',
      'data-click-before-run':
        'return { fetchUrl: \'https://example.com/override\' };',
      'data-click-after-run': 'return;',
    });
    const fetchMock = (global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch);
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    const calls = (fetchMock as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    expect(calls.length).toBe(1);
    expect(String(calls[0][0] as RequestInfo)).toBe(
      'https://example.com/override',
    );
  });
});

declare global {
  interface Window {
    __afterRan: boolean;
  }
}
