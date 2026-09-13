/* @vitest-environment jsdom */
/**
 * @fileoverview マークアップの `selected` / `checked` と、供給された値の優先を検証します。
 *
 * マークアップの既定は、走査の途中で供給された値の**後から**適用されていました。
 * その間に値を収集すると、画面は供給された値なのに送信内容は既定値になります
 * （課題 50）。
 *
 * 期待値の根拠は仕様「初期 `data-bind` からの入力欄復元」の「マークアップに書いた
 * `selected` / `checked` は既定値であり、供給された値を打ち消しません」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

describe('マークアップの既定と供給された値', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  const originalLocation = window.location;

  /**
   * `window.location.search` を差し替えます。
   *
   * @param search 差し替えるクエリ文字列
   * @returns 戻り値はありません。
   */
  const setSearch = (search: string): void => {
    Object.defineProperty(window, 'location', {
      value: {...originalLocation, search},
      writable: true,
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  /**
   * 走査のあいだ、観測関数の値を 1 ミリ秒ごとに記録します。
   *
   * @param html 走査する HTML
   * @param observe 観測する値を返す関数
   * @returns 記録した値の並び
   */
  const traceDuringScan = async (
    html: string,
    observe: () => string,
  ): Promise<string[]> => {
    container.innerHTML = html;
    const scanning = Core.scan(container);
    const trace: string[] = [];
    for (let index = 0; index < 40; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 1));
      trace.push(observe());
    }
    await scanning;
    await waitForDomSettled();
    trace.push(observe());
    return trace;
  };

  it('供給された選択が、マークアップの既定に打ち消されない', async () => {
    setSearch('?msel=Q');

    const trace = await traceDuringScan(
      `<form id="f" data-url-param>
        <select name="msel" multiple>
          <option value="P" selected>P</option>
          <option value="Q">Q</option>
        </select>
      </form>`,
      () => {
        const select = container.querySelector('select') as HTMLSelectElement;
        return (
          Array.from(select.selectedOptions)
            .map(option => option.value)
            .join(',') || '-'
        );
      },
    );

    // 供給された値が載った後は、マークアップの既定（P）が戻らない。
    const supplied = trace.indexOf('Q');
    expect(supplied).toBeGreaterThanOrEqual(0);
    expect(trace.slice(supplied).every(state => state === 'Q')).toBe(true);
    expect(trace.at(-1)).toBe('Q');
  });

  it('供給されたチェック状態が、マークアップの既定に打ち消されない', async () => {
    setSearch('?chk=other');

    const trace = await traceDuringScan(
      `<form id="f" data-url-param>
        <input type="checkbox" name="chk" value="on" checked>
      </form>`,
      () => {
        const input = container.querySelector('input') as HTMLInputElement;
        return input.checked ? 'checked' : 'unchecked';
      },
    );

    // 供給された値（`other`）は送信値 `on` と一致しないのでチェックは外れる。
    const supplied = trace.indexOf('unchecked');
    expect(supplied).toBeGreaterThanOrEqual(0);
    expect(trace.slice(supplied).every(state => state === 'unchecked')).toBe(
      true,
    );
  });

  it('供給が無ければ、マークアップの既定がそのまま初期選択になる（対照）', async () => {
    setSearch('');

    container.innerHTML = `
      <form id="f" data-url-param>
        <select name="msel" multiple>
          <option value="P" selected>P</option>
          <option value="Q">Q</option>
        </select>
        <input type="checkbox" name="chk" value="on" checked>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();

    const select = container.querySelector('select') as HTMLSelectElement;
    const input = container.querySelector('input') as HTMLInputElement;
    expect(
      Array.from(select.selectedOptions).map(option => option.value),
    ).toEqual(['P']);
    expect(input.checked).toBe(true);
  });

  it('式で書いた選択の宣言は、従来どおり選択を決める（対照）', async () => {
    setSearch('');

    container.innerHTML = `
      <form id="f" data-bind='{"kind":"Q"}'>
        <select name="kind">
          <option value="P" data-attr-selected="{{kind === 'P' ? 'selected' : null}}">P</option>
          <option value="Q" data-attr-selected="{{kind === 'Q' ? 'selected' : null}}">Q</option>
        </select>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('Q');
  });
});
