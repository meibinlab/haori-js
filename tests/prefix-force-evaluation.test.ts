/* @vitest-environment jsdom */
/**
 * @fileoverview `data-prefix` で接頭辞を変えたときの式評価の検証。
 *
 * `data-if` / `data-each` / `data-derive` は値に `{{}}` を書かずに式を渡すため、
 * 「プレースホルダが無くても評価する属性」として名前で判定しています。この判定が
 * 既定の接頭辞で固定されていると、接頭辞を変えたページで式が文字列として扱われ、
 * `data-each` が「Invalid each attribute」で失敗し、`data-if` は常に真になります。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Env from '../src/env';
import {waitForDomSettled} from './helpers/async';

/** 既定の接頭辞へ戻すためのスクリプト差し替え用ヘルパー。 */
function setScriptPrefix(prefix: string | null): void {
  document.querySelectorAll('script').forEach(script => script.remove());
  const script = document.createElement('script');
  script.src = 'haori.iife.js';
  if (prefix !== null) {
    script.setAttribute('data-prefix', prefix);
  }
  document.body.appendChild(script);
  Env.detect();
}

describe('data-prefix と式を値に取る属性', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    // 既定の接頭辞へ戻す（他のテストへ影響させない）。
    setScriptPrefix('data-');
    vi.restoreAllMocks();
  });

  it('接頭辞を変えても data-each が配列として評価される', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setScriptPrefix('haori-');
    expect(Env.prefix).toBe('haori-');

    container.innerHTML = `
      <div haori-bind='{"items":["A","B","C"]}'>
        <ul haori-each="items" haori-each-arg="item"><li>{{item}}</li></ul>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled(8);

    expect(container.querySelectorAll('li').length).toBe(3);
    expect(container.querySelectorAll('li')[0].textContent).toBe('A');
    expect(error).not.toHaveBeenCalled();
  });

  it('接頭辞を変えても data-if が条件として評価される', async () => {
    setScriptPrefix('haori-');

    container.innerHTML = `
      <div haori-bind='{"show":false}'>
        <p id="target" haori-if="show">表示</p>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled(8);

    const target = container.querySelector('#target') as HTMLElement;
    expect(target.hasAttribute('haori-if-false')).toBe(true);
  });

  it('既定の接頭辞では従来どおり評価される', async () => {
    setScriptPrefix('data-');

    container.innerHTML = `
      <div data-bind='{"items":["A","B"]}'>
        <ul data-each="items" data-each-arg="item"><li>{{item}}</li></ul>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled(8);

    expect(container.querySelectorAll('li').length).toBe(2);
  });
});
