/* @vitest-environment jsdom */
/**
 * @fileoverview 編集可能な行への copy / bind のテスト
 *
 * `data-each` と `data-form-list` を併用したコンテナの行では、入力欄の値は配列の
 * 要素データが権威です。行を指した `data-{event}-copy` / `data-{event}-bind` が
 * 行フラグメントではなく配列要素へ書き戻され、入力欄まで届くことを確認します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import Procedure from '../src/procedure';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('編集可能な行への copy / bind', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const mount = async (html: string): Promise<HTMLFormElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form')!;
  };

  const values = (form: HTMLElement, name: string): string[] =>
    Array.from(
      form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`),
    ).map(input => input.value);

  const click = async (element: HTMLElement): Promise<void> => {
    await new Procedure(getFrag(element), 'click').run();
    await waitForDomSettled();
  };

  /** 契約者住所を行へ複写する構成（行要素に id を振る） */
  const COPY_ROWS = (initial: string, eachAttrs = ''): string => `
    <form data-bind='${initial}'>
      <div id="owner" data-bind='{"zip":"1000001","city":"千代田区","note":"x"}'>
      </div>
      <div id="list" data-form-list="contracts" data-each="contracts"
           data-each-arg="c" data-each-index="i" ${eachAttrs}>
        <div id="addr-{{i}}">
          <input name="name">
          <input name="zip">
          <input name="city">
          <button type="button" class="copy"
                  data-click-copy="#addr-{{i}}"
                  data-click-copy-source="#owner"
                  data-click-copy-params="zip&city"></button>
        </div>
      </div>
    </form>`;

  describe('copy', () => {
    it('行を指すと、その行の入力欄だけへ値が流し込まれる', async () => {
      const form = await mount(
        COPY_ROWS('{"contracts":[{"name":"A"},{"name":"B"}]}'),
      );

      await click(form.querySelectorAll<HTMLElement>('.copy')[1]);

      expect(values(form, 'zip')).toEqual(['', '1000001']);
      expect(values(form, 'city')).toEqual(['', '千代田区']);
      // 他の行と、コピー対象外の入力欄は変わらない。
      expect(values(form, 'name')).toEqual(['A', 'B']);
    });

    it('配列へ書き戻されるため収集値と一致する', async () => {
      const form = await mount(
        COPY_ROWS('{"contracts":[{"name":"A"},{"name":"B"}]}'),
      );

      await click(form.querySelectorAll<HTMLElement>('.copy')[0]);

      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [
          {name: 'A', zip: '1000001', city: '千代田区'},
          {name: 'B'},
        ],
      });
    });

    it('copy-params で絞ったキーだけが入る', async () => {
      const form = await mount(
        COPY_ROWS('{"contracts":[{"name":"A"}]}'),
      );

      await click(form.querySelectorAll<HTMLElement>('.copy')[0]);

      const raw = getFrag(form).getRawBindingData() as Record<string, unknown>;
      const item = (raw.contracts as Record<string, unknown>[])[0];
      expect(Object.keys(item).sort()).toEqual(['city', 'name', 'zip']);
    });

    it('複数の行を同時に指しても互いの書き込みを消さない', async () => {
      const form = await mount(
        `<form data-bind='{"contracts":[{"name":"A"},{"name":"B"}]}'>
           <div id="owner" data-bind='{"zip":"1000001"}'></div>
           <div id="list" data-form-list="contracts" data-each="contracts"
                data-each-arg="c" data-each-index="i">
             <div class="row">
               <input name="name">
               <input name="zip">
             </div>
           </div>
           <button type="button" id="all" data-click-copy=".row"
                   data-click-copy-source="#owner"></button>
         </form>`,
      );

      await click(form.querySelector<HTMLElement>('#all')!);

      expect(values(form, 'zip')).toEqual(['1000001', '1000001']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [
          {name: 'A', zip: '1000001'},
          {name: 'B', zip: '1000001'},
        ],
      });
    });

    it('data-each-key 併用時は並べ替え後も同じレコードへ届く', async () => {
      const form = await mount(
        COPY_ROWS(
          '{"contracts":[{"id":"a","name":"A"},{"id":"b","name":"B"}]}',
          'data-each-key="id"',
        ),
      );

      // 配列を入れ替える（data-each-key があるため行は再利用され、順序だけが変わる）
      await Core.setBindingData(form, {
        contracts: [
          {id: 'b', name: 'B'},
          {id: 'a', name: 'A'},
        ],
      });
      await waitForDomSettled();
      expect(values(form, 'name')).toEqual(['B', 'A']);

      await click(form.querySelectorAll<HTMLElement>('.copy')[0]);

      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [
          {id: 'b', name: 'B', zip: '1000001', city: '千代田区'},
          {id: 'a', name: 'A'},
        ],
      });
    });

    it('行の内側の要素を指した場合は従来どおり自身のバインドデータを更新する',
      async () => {
        const form = await mount(
          `<form data-bind='{"contracts":[{"name":"A"},{"name":"B"}]}'>
             <div id="owner" data-bind='{"zip":"1000001"}'></div>
             <div id="list" data-form-list="contracts" data-each="contracts"
                  data-each-arg="c" data-each-index="i">
               <div>
                 <input name="name">
                 <div id="panel-{{i}}"><span>{{zip}}</span></div>
                 <button type="button" class="copy"
                         data-click-copy="#panel-{{i}}"
                         data-click-copy-source="#owner"></button>
               </div>
             </div>
           </form>`,
        );

        await click(form.querySelectorAll<HTMLElement>('.copy')[1]);

        const panels = form.querySelectorAll<HTMLElement>('[id^="panel-"]');
        expect(panels[1].textContent).toBe('1000001');
        expect(panels[0].textContent).toBe('');
        // 配列は変わらない（行データへの書き込みではない）
        expect(getFrag(form).getRawBindingData()).toEqual({
          contracts: [{name: 'A'}, {name: 'B'}],
        });
      });

    it('data-form-list が無い data-each の行は従来どおり', async () => {
      const form = await mount(
        `<form data-bind='{"rows":[{"name":"A"}]}'>
           <div id="owner" data-bind='{"zip":"1000001"}'></div>
           <div data-each="rows" data-each-index="i">
             <div id="row-{{i}}">
               <span>{{zip}}</span>
               <button type="button" class="copy" data-click-copy="#row-{{i}}"
                       data-click-copy-source="#owner"></button>
             </div>
           </div>
         </form>`,
      );

      await click(form.querySelectorAll<HTMLElement>('.copy')[0]);

      expect(form.querySelector('#row-0 span')!.textContent).toBe('1000001');
      expect(getFrag(form).getRawBindingData()).toEqual({
        rows: [{name: 'A'}],
      });
    });

    it('コピー先へ祖先のキーが焼き付かない', async () => {
      const form = await mount(
        `<form data-bind='{"items":[1,2],"title":"T"}'>
           <div id="owner" data-bind='{"zip":"1000001"}'></div>
           <div id="panel"></div>
           <button type="button" id="go" data-click-copy="#panel"
                   data-click-copy-source="#owner"></button>
         </form>`,
      );

      await click(form.querySelector<HTMLElement>('#go')!);

      // 祖先の items / title がコピー先の生データへ複製されていないこと。
      expect(getFrag(form.querySelector<HTMLElement>('#panel')!)
        .getRawBindingData()).toEqual({zip: '1000001'});
    });
  });

  describe('bind', () => {
    /** 応答をバインドする構成 */
    const BIND_ROWS = (initial: string, bindAttrs = ''): string => `
      <form data-bind='${initial}'>
        <div id="list" data-form-list="contracts" data-each="contracts"
             data-each-arg="c" data-each-index="i">
          <div id="addr-{{i}}">
            <input name="name">
            <input name="zip">
            <input name="city">
            <button type="button" class="lookup"
                    data-click-fetch="/api/zip"
                    data-click-bind="#addr-{{i}}" ${bindAttrs}></button>
          </div>
        </div>
      </form>`;

    const stubFetch = (body: unknown): void => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(JSON.stringify(body), {
            headers: {'Content-Type': 'application/json'},
          }),
        ),
      );
    };

    it('既定は全置換で、応答に無いキーの入力欄は空になる', async () => {
      stubFetch({zip: '1000001', city: '千代田区'});
      const form = await mount(
        BIND_ROWS('{"contracts":[{"name":"A"},{"name":"B"}]}'),
      );

      await click(form.querySelectorAll<HTMLElement>('.lookup')[0]);

      expect(values(form, 'zip')).toEqual(['1000001', '']);
      expect(values(form, 'name')).toEqual(['', 'B']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{zip: '1000001', city: '千代田区'}, {name: 'B'}],
      });
    });

    it('bind-merge では応答に無いキーの値が保たれる', async () => {
      stubFetch({zip: '1000001', city: '千代田区'});
      const form = await mount(
        BIND_ROWS(
          '{"contracts":[{"name":"A"},{"name":"B"}]}',
          'data-click-bind-merge',
        ),
      );

      await click(form.querySelectorAll<HTMLElement>('.lookup')[0]);

      expect(values(form, 'name')).toEqual(['A', 'B']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [
          {name: 'A', zip: '1000001', city: '千代田区'},
          {name: 'B'},
        ],
      });
    });

    it('bind-arg は要素データのキー配下へ入る', async () => {
      stubFetch({zip: '1000001', city: '千代田区'});
      const form = await mount(
        `<form data-bind='{"contracts":[{"name":"A"}]}'>
           <div id="list" data-form-list="contracts" data-each="contracts"
                data-each-arg="c" data-each-index="i">
             <div id="addr-{{i}}">
               <input name="name">
               <div data-form-object="addr">
                 <input name="zip">
                 <input name="city">
               </div>
               <button type="button" class="lookup" data-click-fetch="/api/zip"
                       data-click-bind="#addr-{{i}}"
                       data-click-bind-arg="addr"></button>
             </div>
           </div>
         </form>`,
      );

      await click(form.querySelectorAll<HTMLElement>('.lookup')[0]);

      expect(values(form, 'zip')).toEqual(['1000001']);
      expect(values(form, 'name')).toEqual(['A']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [
          {name: 'A', addr: {zip: '1000001', city: '千代田区'}},
        ],
      });
    });

    it('送信後に行った行の編集は応答で消えない', async () => {
      let form: HTMLFormElement | null = null;
      // 送信時点の基準は fetch 呼び出しの直前に記録されるため、編集は fetch の中で
      // 行う（テスト側で同期的に編集すると基準より前の編集として扱われる）。
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const name =
            form!.querySelector<HTMLInputElement>('input[name="name"]')!;
          name.value = '編集済み';
          getFrag(name).syncValue();
          getFrag(name).markUserEdit();
          return new Response(
            JSON.stringify({name: 'サーバ値', zip: '1000001'}),
            {headers: {'Content-Type': 'application/json'}},
          );
        }),
      );
      form = await mount(
        BIND_ROWS('{"contracts":[{"name":"A"}]}', 'data-click-bind-merge'),
      );

      await click(form.querySelectorAll<HTMLElement>('.lookup')[0]);

      expect(values(form, 'name')).toEqual(['編集済み']);
      expect(values(form, 'zip')).toEqual(['1000001']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: '編集済み', zip: '1000001'}],
      });
    });
  });

  describe('非イベントの data-fetch-bind', () => {
    it('行ごとの data-fetch が各行の配列要素へ書き戻される', async () => {
      let count = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          count += 1;
          return new Response(JSON.stringify({zip: `100000${count}`}), {
            headers: {'Content-Type': 'application/json'},
          });
        }),
      );
      const form = await mount(
        `<form data-bind='{"contracts":[{"name":"A"},{"name":"B"}]}'>
           <div id="list" data-form-list="contracts" data-each="contracts"
                data-each-arg="c" data-each-index="i">
             <div id="addr-{{i}}">
               <input name="name">
               <input name="zip">
               <span data-fetch="/api/zip" data-fetch-bind="#addr-{{i}}"
                     data-fetch-bind-merge></span>
             </div>
           </div>
         </form>`,
      );
      await waitForDomSettled();

      // 行ごとに別の手続きが同じ配列へ書き込むが、互いの結果を消さない。
      const raw = getFrag(form).getRawBindingData() as Record<string, unknown>;
      const items = raw.contracts as Record<string, unknown>[];
      expect(items.map(item => item.name)).toEqual(['A', 'B']);
      expect(items.every(item => typeof item.zip === 'string')).toBe(true);
      expect(new Set(items.map(item => item.zip)).size).toBe(2);
      expect(values(form, 'zip').filter(value => value !== '')).toHaveLength(2);
    });
  });

  describe('祖先が data-form-arg のキーを所有する構成', () => {
    /**
     * 祖先がレコードを所有し、`data-form-arg` のフォームがそれを編集する構成。
     * 配列の所有者は祖先になるため、書き戻しは祖先へ行われる。
     */
    const ANCESTOR_OWNED = `
      <div id="outer" data-bind='{"draft":{"contracts":[
          {"name":"A","zip":""},{"name":"B","zip":""}]}}'>
        <div id="owner" data-bind='{"zip":"1000001"}'></div>
        <form data-form-arg="draft">
          <div id="list" data-form-list="contracts" data-each="draft.contracts"
               data-each-arg="c" data-each-index="i">
            <div id="row-{{i}}">
              <input name="name">
              <input name="zip">
              <button type="button" class="copy" data-click-copy="#row-{{i}}"
                      data-click-copy-source="#owner"></button>
              <button type="button" class="lookup" data-click-fetch="/api/zip"
                      data-click-bind="#row-{{i}}"></button>
            </div>
          </div>
        </form>
      </div>`;

    const mountOuter = async (): Promise<HTMLElement> => {
      container.innerHTML = ANCESTOR_OWNED;
      await Core.scan(container);
      await waitForDomSettled();
      return container.querySelector<HTMLElement>('#outer')!;
    };

    it('copy が祖先所有の配列へ書き戻され、対象行の入力欄へ届く', async () => {
      const outer = await mountOuter();

      await click(container.querySelectorAll<HTMLElement>('.copy')[0]);

      expect(values(outer, 'zip')).toEqual(['1000001', '']);
      expect(values(outer, 'name')).toEqual(['A', 'B']);
      expect(getFrag(outer).getRawBindingData()).toEqual({
        draft: {
          contracts: [
            {name: 'A', zip: '1000001'},
            {name: 'B', zip: ''},
          ],
        },
      });
    });

    it('bind の全置換でも未指定キーの入力欄が空になる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify({zip: '5300001'}), {
              headers: {'Content-Type': 'application/json'},
            }),
        ),
      );
      const outer = await mountOuter();

      await click(container.querySelectorAll<HTMLElement>('.lookup')[1]);

      // 行データ経由の反映（clearMissing）が働くため、構成によらず全置換になる。
      expect(values(outer, 'name')).toEqual(['A', '']);
      expect(values(outer, 'zip')).toEqual(['', '5300001']);
      expect(getFrag(outer).getRawBindingData()).toEqual({
        draft: {
          contracts: [{name: 'A', zip: ''}, {zip: '5300001'}],
        },
      });
    });
  });

  describe('解決できない場合', () => {
    it('data-each が識別子パスでなければ警告してスキップする', async () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => {});
      const form = await mount(
        `<form data-bind='{"contracts":[{"name":"A"}]}'>
           <div id="owner" data-bind='{"zip":"1000001"}'></div>
           <div id="list" data-form-list="contracts"
                data-each="contracts.filter(c => c)" data-each-arg="c"
                data-each-index="i">
             <div id="addr-{{i}}">
               <input name="name">
               <input name="zip">
               <button type="button" class="copy" data-click-copy="#addr-{{i}}"
                       data-click-copy-source="#owner"></button>
             </div>
           </div>
         </form>`,
      );

      await click(form.querySelectorAll<HTMLElement>('.copy')[0]);

      expect(values(form, 'zip')).toEqual(['']);
      expect(
        error.mock.calls.some(call =>
          String(call[1]).includes('plain identifier path'),
        ),
      ).toBe(true);
    });

    it('data-each-before の固定要素を指すと警告してスキップする', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => {});
      const form = await mount(
        `<form data-bind='{"contracts":[{"name":"A"}]}'>
           <div id="owner" data-bind='{"zip":"1000001"}'></div>
           <div id="list" data-form-list="contracts" data-each="contracts"
                data-each-arg="c">
             <div id="header" data-each-before><span>見出し</span></div>
             <div><input name="name"><input name="zip"></div>
           </div>
           <button type="button" id="go" data-click-copy="#header"
                   data-click-copy-source="#owner"></button>
         </form>`,
      );

      await click(form.querySelector<HTMLElement>('#go')!);

      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: 'A'}],
      });
      expect(
        warn.mock.calls.some(call => String(call[1]).includes('not a row')),
      ).toBe(true);
    });

    it('プリミティブ配列の行は警告してスキップする', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => {});
      const form = await mount(
        `<form data-bind='{"tags":["a","b"]}'>
           <div id="owner" data-bind='{"zip":"1000001"}'></div>
           <div id="list" data-form-list="tags" data-each="tags"
                data-each-arg="t" data-each-index="i">
             <div id="tag-{{i}}"><span>{{t}}</span></div>
           </div>
           <button type="button" id="go" data-click-copy="#tag-0"
                   data-click-copy-source="#owner"></button>
         </form>`,
      );

      await click(form.querySelector<HTMLElement>('#go')!);

      expect(getFrag(form).getRawBindingData()).toEqual({tags: ['a', 'b']});
      expect(
        warn.mock.calls.some(call =>
          String(call[1]).includes('Row data is not an object'),
        ),
      ).toBe(true);
    });

    it('応答が返る前に行が削除された場合は警告してスキップする', async () => {
      let release: (() => void) | null = null;
      const pending = new Promise<void>(resolve => {
        release = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          await pending;
          return new Response(JSON.stringify({zip: '1000001'}), {
            headers: {'Content-Type': 'application/json'},
          });
        }),
      );
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => {});
      const form = await mount(
        `<form data-bind='{"contracts":[{"name":"A"},{"name":"B"}]}'>
           <div id="list" data-form-list="contracts" data-each="contracts"
                data-each-arg="c" data-each-index="i">
             <div id="addr-{{i}}">
               <input name="name">
               <input name="zip">
               <button type="button" class="lookup" data-click-fetch="/api/zip"
                       data-click-bind="#addr-{{i}}"
                       data-click-bind-merge></button>
               <button type="button" class="del" data-click-row-remove>
               </button>
             </div>
           </div>
         </form>`,
      );

      const procedure = new Procedure(
        getFrag(form.querySelectorAll<HTMLElement>('.lookup')[1]),
        'click',
      ).run();

      // 応答を待つ間に対象行を削除する。
      await click(form.querySelectorAll<HTMLElement>('.del')[1]);

      release!();
      await procedure;
      await waitForDomSettled();

      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: 'A'}],
      });
      expect(
        warn.mock.calls.some(call =>
          String(call[1]).includes('no longer in the'),
        ),
      ).toBe(true);
    });
  });
});
