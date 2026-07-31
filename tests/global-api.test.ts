/**
 * @fileoverview iife グローバル公開エントリー（`src/global.ts`）のテスト
 *
 * `<script src="haori.iife.js">` で読み込んだときの `window.Haori` の形を検証します。
 */

import {describe, expect, it} from 'vitest';

import globalApi from '../src/global';
import * as api from '../src/index';
import Haori from '../src/haori';

describe('iife グローバル公開エントリー', () => {
  it('グローバルは Haori クラス本体である', () => {
    expect(globalApi).toBe(Haori);
  });

  it('クラスの静的 API を直接呼べる', () => {
    // `Haori.Haori.addMessage()` ではなく `Haori.addMessage()` で使えること。
    expect(typeof globalApi.addMessage).toBe('function');
    expect(typeof globalApi.clearMessages).toBe('function');
    expect(typeof globalApi.confirm).toBe('function');
    expect(typeof globalApi.dialog).toBe('function');
    expect(typeof globalApi.setRuntime).toBe('function');
    expect(typeof globalApi.toast).toBe('function');
  });

  it('名前空間側のエクスポートも参照できる', () => {
    const members = globalApi as unknown as Record<string, unknown>;
    expect(members['Core']).toBe(api.Core);
    expect(members['Enhance']).toBe(api.Enhance);
    expect(members['Env']).toBe(api.Env);
    expect(members['Form']).toBe(api.Form);
    expect(members['Fragment']).toBe(api.Fragment);
    expect(members['Log']).toBe(api.Log);
    expect(members['Queue']).toBe(api.Queue);
    expect(members['version']).toBe(api.version);
  });

  it('名前空間のエクスポートがすべてグローバルから到達できる', () => {
    // 付け足しは「クラスに同名のメンバーが無いもの」だけを対象にするため、将来
    // 追加したエクスポート名がクラスや Function の既存プロパティ（name / length
    // など）と衝突すると、黙って到達できなくなる。ここで漏れを検知する。
    const members = globalApi as unknown as Record<string, unknown>;
    const namespace = api as unknown as Record<string, unknown>;
    const unreachable: string[] = [];
    for (const name of Object.keys(namespace)) {
      if (name === 'Haori' || name === 'default') {
        // 自己参照として付け替えるため値の一致は別のテストで確認する。
        continue;
      }
      if (name === 'waitForRenders' || name === 'enhancers') {
        // クラスの静的メンバーを使う（名前空間側は薄い包み）。
        continue;
      }
      if (members[name] !== namespace[name]) {
        unreachable.push(name);
      }
    }
    expect(
      unreachable,
      `グローバルから到達できないエクスポート:\n${unreachable.join('\n')}`,
    ).toEqual([]);
  });

  it('Haori.Haori と Haori.default は自己参照で従来の書き方も動く', () => {
    const members = globalApi as unknown as Record<string, unknown>;
    expect(members['Haori']).toBe(globalApi);
    expect(members['default']).toBe(globalApi);
  });

  it('waitForRenders と enhancers はクラスの静的メンバーを保つ', () => {
    // 名前空間側の薄い包みで上書きすると無限再帰になるため、上書きしないこと。
    expect(globalApi.waitForRenders).toBe(Haori.waitForRenders);
    expect(globalApi.enhancers).toBe(Haori.enhancers);
  });

  it('waitForRenders は無限再帰せずに解決する', async () => {
    await expect(globalApi.waitForRenders()).resolves.toBeUndefined();
  });
});
