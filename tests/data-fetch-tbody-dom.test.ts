/* @vitest-environment jsdom */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import Core from '../src/core';
import {waitForCondition} from './helpers/async';

const mockData = [
  {id: 1, name: 'りんご'},
  {id: 2, name: 'みかん'},
  {id: 3, name: 'バナナ'},
];

describe('data-fetch + data-each integration (tbody/tr)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('fetchで取得した配列がtbody内trとしてDOMに反映される', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        headers: {'Content-Type': 'application/json'},
      }),
    );

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
    await waitForCondition(
      () => (globalThis.fetch as any).mock.calls.length > 0,
      {description: 'fetch call'},
    );
    // tbodyのtr要素数のみをまず確認
    const tbody = container.querySelector('tbody');
    expect(tbody).not.toBeNull();
    await waitForCondition(
      () => tbody!.querySelectorAll('tr').length === 3,
      {description: 'tbody rows'},
    );
    const rows = tbody!.querySelectorAll('tr');
    expect(fetchSpy).toHaveBeenCalled();
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
    expect((rows as NodeListOf<HTMLTableRowElement>)[0].textContent).toContain(
      '1',
    );
    expect((rows as NodeListOf<HTMLTableRowElement>)[0].textContent).toContain(
      'りんご',
    );
    expect((rows as NodeListOf<HTMLTableRowElement>)[1].textContent).toContain(
      '2',
    );
    expect((rows as NodeListOf<HTMLTableRowElement>)[1].textContent).toContain(
      'みかん',
    );
    expect((rows as NodeListOf<HTMLTableRowElement>)[2].textContent).toContain(
      '3',
    );
    expect((rows as NodeListOf<HTMLTableRowElement>)[2].textContent).toContain(
      'バナナ',
    );
  });
});
