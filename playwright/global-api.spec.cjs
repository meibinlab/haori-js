/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// iife 配布物（haori.iife.js）を読み込んだときのグローバル window.Haori の形を検証する。
const {test, expect} = require('@playwright/test');

test.describe('ブラウザのグローバル window.Haori', () => {
  test('グローバルがクラス本体で、静的 API を直接呼べる', async ({page}) => {
    await page.goto('/demo/bind/data-bind-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    const shape = await page.evaluate(() => {
      const api = window.Haori;
      return {
        typeofGlobal: typeof api,
        // クラス API が 1 段で取り出せること。
        hasAddMessage: typeof api.addMessage === 'function',
        hasAddErrorMessage: typeof api.addErrorMessage === 'function',
        hasClearMessages: typeof api.clearMessages === 'function',
        hasConfirm: typeof api.confirm === 'function',
        hasDialog: typeof api.dialog === 'function',
        hasSetRuntime: typeof api.setRuntime === 'function',
        hasToast: typeof api.toast === 'function',
        hasWaitForRenders: typeof api.waitForRenders === 'function',
        // 名前空間側のエクスポートも同じグローバルから参照できること。
        hasCore: typeof api.Core === 'function',
        hasEnv: typeof api.Env === 'function',
        hasEnhancers: typeof api.enhancers === 'object',
        version: api.version,
        runtime: api.runtime,
        // 従来の 2 段の書き方も動くこと。
        selfReference: api.Haori === api && api.default === api,
      };
    });

    expect(shape.typeofGlobal).toBe('function');
    expect(shape.hasAddMessage).toBe(true);
    expect(shape.hasAddErrorMessage).toBe(true);
    expect(shape.hasClearMessages).toBe(true);
    expect(shape.hasConfirm).toBe(true);
    expect(shape.hasDialog).toBe(true);
    expect(shape.hasSetRuntime).toBe(true);
    expect(shape.hasToast).toBe(true);
    expect(shape.hasWaitForRenders).toBe(true);
    expect(shape.hasCore).toBe(true);
    expect(shape.hasEnv).toBe(true);
    expect(shape.hasEnhancers).toBe(true);
    expect(shape.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(shape.runtime).toBe('embedded');
    expect(shape.selfReference).toBe(true);
  });

  test('waitForRenders は無限再帰せずに解決する', async ({page}) => {
    await page.goto('/demo/bind/data-bind-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    // 名前空間側の薄い包みでクラスの静的メソッドを上書きすると自分自身を呼ぶ
    // 無限再帰になるため、実ブラウザでも解決することを確かめる。
    const resolved = await page.evaluate(async () => {
      await window.Haori.waitForRenders();
      return true;
    });
    expect(resolved).toBe(true);
  });
});
