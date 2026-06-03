/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 開発モードで data-if が falsy（非表示）になったとき、式と参照スコープの由来を
 * コンソールに出力することを検証する（改修依頼3.3 のデバッグ補助）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

describe('data-if 開発モード診断（依頼3.3）', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    Dev.disable();
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it('開発モードで falsy data-if の式と参照スコープを出力する', async () => {
    const info = vi.spyOn(Log, 'info').mockImplementation(() => undefined);
    Dev.enable();
    // id は外側 #state の値（truthy）に解決され、!(... || id) は falsy → 非表示
    container.innerHTML = `
      <div id="state" data-bind='{"id":"CUST-1"}'>
        <button data-if="!id">新規</button>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();

    const logged = info.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('data-if is falsy')),
    );
    expect(logged).toBe(true);
    // 参照スコープに id の由来（#state）が含まれること
    const hasScope = info.mock.calls.some(args =>
      args.some(
        a =>
          a !== null &&
          typeof a === 'object' &&
          'id' in (a as Record<string, unknown>),
      ),
    );
    expect(hasScope).toBe(true);
  });

  it('開発モード無効時は出力しない', async () => {
    const info = vi.spyOn(Log, 'info').mockImplementation(() => undefined);
    Dev.disable();
    container.innerHTML = `
      <div id="state2" data-bind='{"id":"CUST-1"}'>
        <button data-if="!id">新規</button>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    const logged = info.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('data-if is falsy')),
    );
    expect(logged).toBe(false);
  });
});
