/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Core from '../src/core';
import Queue from '../src/queue';

// fetchをモック
const mockData = [
  { id: 1, name: 'りんご' },
  { id: 2, name: 'みかん' },
  { id: 3, name: 'バナナ' }
];

globalThis.fetch = vi.fn(async () => ({
  ok: true,
  json: async () => mockData,
  headers: {
    get: (name: string) => name === 'Content-Type' ? 'application/json' : undefined,
  },
})) as any;

describe('data-fetch + data-each integration (tbody/tr)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  it('fetchで取得した配列がtbody内trとしてDOMに反映される', async () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-fetch="/api/data" data-fetch-arg="items" data-fetch-bind="#result"></div>
      <div id="result" data-bind='{"items":[]}' >
        <table>
          <tbody data-each="items" data-each-key="id">
            <tr>
              <td>{{id}}</td>
              <td>{{name}}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(root);
    await Core.scan(root);
    await Queue.wait();
    // マイクロタスク解放＋再Queue.waitでDOM反映遅延を吸収
    await new Promise(r => setTimeout(r, 0));
    await Queue.wait();
    // fetchが呼ばれたか確認
    expect((globalThis.fetch as any).mock.calls.length).toBeGreaterThan(0);
    // tbodyのtr要素数のみをまず確認
    const tbody = container.querySelector('tbody');
    expect(tbody).not.toBeNull();
    let rows;
    let ok = false;
    for (let i = 0; i < 50; i++) {
      rows = tbody!.querySelectorAll('tr');
      if (rows.length === 3) {
        ok = true;
        break;
      }
      await new Promise(r => setTimeout(r, 10));
    }
    expect(ok).toBe(true);
    // trのFragmentからバインドデータを直接確認
    const Fragment = (await import('../src/fragment')).default;
    const tr0 = (rows as NodeListOf<HTMLTableRowElement>)[0];
    const tr1 = (rows as NodeListOf<HTMLTableRowElement>)[1];
    const tr2 = (rows as NodeListOf<HTMLTableRowElement>)[2];
    const frag0 = Fragment.get(tr0);
    const frag1 = Fragment.get(tr1);
    const frag2 = Fragment.get(tr2);
    expect(frag0.getBindingData().id).toBe(1);
    expect(frag0.getBindingData().name).toBe('りんご');
    expect(frag1.getBindingData().id).toBe(2);
    expect(frag1.getBindingData().name).toBe('みかん');
    expect(frag2.getBindingData().id).toBe(3);
    expect(frag2.getBindingData().name).toBe('バナナ');
    // textContentも全trでassert
    expect(tr0.textContent).toContain('1');
    expect(tr0.textContent).toContain('りんご');
    expect(tr1.textContent).toContain('2');
    expect(tr1.textContent).toContain('みかん');
    expect(tr2.textContent).toContain('3');
    expect(tr2.textContent).toContain('バナナ');
    expect(frag1.getBindingData().id).toBe(2);
    expect(frag1.getBindingData().name).toBe('みかん');
    expect(frag2.getBindingData().id).toBe(3);
    expect(frag2.getBindingData().name).toBe('バナナ');

    // textContentも全trでassert
    expect((rows as NodeListOf<HTMLTableRowElement>)[0].textContent).toContain('1');
    expect((rows as NodeListOf<HTMLTableRowElement>)[0].textContent).toContain('りんご');
    expect((rows as NodeListOf<HTMLTableRowElement>)[1].textContent).toContain('2');
    expect((rows as NodeListOf<HTMLTableRowElement>)[1].textContent).toContain('みかん');
    expect((rows as NodeListOf<HTMLTableRowElement>)[2].textContent).toContain('3');
    expect((rows as NodeListOf<HTMLTableRowElement>)[2].textContent).toContain('バナナ');
  });
});
