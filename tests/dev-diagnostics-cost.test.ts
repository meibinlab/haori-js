/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 開発モードの診断が再描画のコストを押し上げないことを検証する。
 *
 * 期待値の根拠は仕様「スコープ診断（開発モード）」の「非表示へ切り替わった時点だけ
 * 出力します」と、仕様「パフォーマンス測定」の「集計は明示的に開始するまで行いません」。
 * 開発モードは仕様「環境検出」によりローカルホストで自動的に有効になるため、診断が
 * 再描画のたびに走るとそのまま利用者の待ち時間になる。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import Log from '../src/log';
import {waitForIdle} from './helpers/async';

type ProfileAccessor = {
  start: () => void;
  stop: () => void;
  reset: () => void;
  snapshot: () => Array<{elementId: string}>;
};

/**
 * 評価プロファイルの窓口を返します。
 *
 * @returns 窓口。未公開なら undefined
 */
const profile = (): ProfileAccessor | undefined =>
  (globalThis as Record<string, unknown>).__HAORI_EVALUATION_PROFILE__ as
    | ProfileAccessor
    | undefined;

describe('開発モードの診断コスト', () => {
  let container: HTMLElement;

  beforeEach(() => {
    Dev.enable();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    profile()?.stop();
    profile()?.reset();
    Dev.disable();
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it('falsy な data-if の報告は非表示のまま再描画しても増えない', async () => {
    const info = vi.spyOn(Log, 'info').mockImplementation(() => undefined);
    container.innerHTML = `
      <div id="host" data-bind='{"shown": false, "n": 1}'>
        <div id="branch" data-if="shown">本文</div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    const falsyReports = (): number =>
      info.mock.calls.filter(args =>
        args.some(
          arg =>
            typeof arg === 'string' &&
            arg.includes('data-if is falsy (hidden)'),
        ),
      ).length;
    expect(falsyReports()).toBe(1);

    // 同じ条件のまま何度再描画しても報告は増えない。
    const host = container.querySelector('#host') as HTMLElement;
    for (let i = 0; i < 3; i += 1) {
      await Core.setBindingData(host, {shown: false, n: i + 2});
      await waitForIdle();
    }
    expect(falsyReports()).toBe(1);
  });

  it('表示へ戻ってまた非表示になったら再度報告する', async () => {
    // 出力の契機は非表示への切り替わりなので、状態が変わったときは報告される
    // （仕様「スコープ診断（開発モード）」）。
    const info = vi.spyOn(Log, 'info').mockImplementation(() => undefined);
    container.innerHTML = `
      <div id="host" data-bind='{"shown": false}'>
        <div data-if="shown">本文</div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    const falsyReports = (): number =>
      info.mock.calls.filter(args =>
        args.some(
          arg =>
            typeof arg === 'string' &&
            arg.includes('data-if is falsy (hidden)'),
        ),
      ).length;
    expect(falsyReports()).toBe(1);

    const host = container.querySelector('#host') as HTMLElement;
    await Core.setBindingData(host, {shown: true});
    await waitForIdle();
    await Core.setBindingData(host, {shown: false});
    await waitForIdle();

    expect(falsyReports()).toBe(2);
  });

  it('falsy な data-if の報告でスコープの内訳を二重に出さない', async () => {
    const info = vi.spyOn(Log, 'info').mockImplementation(() => undefined);
    container.innerHTML = `
      <div data-bind='{"shown": false}'>
        <div data-if="shown">本文</div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    // `Core.dumpScope()` を手で呼んだときだけ出す出力（仕様「スコープ診断（開発モード）」）。
    const dumps = info.mock.calls.filter(args =>
      args.some(
        arg => typeof arg === 'string' && arg.includes('scope dump for'),
      ),
    );
    expect(dumps).toHaveLength(0);
  });

  it('Core.dumpScope を直接呼べばスコープの内訳を出す', async () => {
    const info = vi.spyOn(Log, 'info').mockImplementation(() => undefined);
    container.innerHTML = '<div id="host" data-bind=\'{"a": 1}\'></div>';
    await Core.scan(container);
    await waitForIdle();

    const dumped = Core.dumpScope(
      container.querySelector('#host') as HTMLElement,
    );
    expect(dumped.resolved.a).toBe(1);
    expect(
      info.mock.calls.filter(args =>
        args.some(
          arg => typeof arg === 'string' && arg.includes('scope dump for'),
        ),
      ),
    ).toHaveLength(1);
  });

  it('評価プロファイルは開始するまで集計しない', async () => {
    container.innerHTML = '<div data-bind=\'{"a": 1}\'><span>{{a}}</span></div>';
    await Core.scan(container);
    await waitForIdle();

    expect(profile()?.snapshot()).toEqual([]);

    profile()?.start();
    const host = container.querySelector('div') as HTMLElement;
    await Core.setBindingData(host, {a: 2});
    await waitForIdle();

    expect((profile()?.snapshot() ?? []).length).toBeGreaterThan(0);
  });

  it('集計していないあいだは所要時間を読み取らない', async () => {
    container.innerHTML = `
      <div data-bind='{"a": 1}'>
        <span>{{a}}</span><span>{{a}}</span><span>{{a}}</span>
      </div>`;
    await Core.scan(container);
    await waitForIdle();

    const now = vi.spyOn(globalThis.performance, 'now');
    const host = container.querySelector('div') as HTMLElement;
    await Core.setBindingData(host, {a: 2});
    await waitForIdle();
    const withoutCollecting = now.mock.calls.length;

    now.mockClear();
    profile()?.start();
    await Core.setBindingData(host, {a: 3});
    await waitForIdle();
    const withCollecting = now.mock.calls.length;

    // 式ごとに 2 回読むため、集計中は明確に増える。
    expect(withCollecting).toBeGreaterThan(withoutCollecting);
  });

  it('data-dev="false" でローカルホストでも開発モードを切れる', () => {
    // 仕様「環境検出」のローカルホスト判定は既定で開発モードを有効にする。
    expect(window.location.hostname).toBe('localhost');
    const script = document.createElement('script');
    script.setAttribute('src', 'https://example.test/haori.js');
    script.setAttribute(`${Env.prefix}dev`, 'false');
    document.head.appendChild(script);
    try {
      Env.detect();
      expect(Dev.isEnabled()).toBe(false);

      script.setAttribute(`${Env.prefix}dev`, '');
      Env.detect();
      expect(Dev.isEnabled()).toBe(true);
    } finally {
      document.head.removeChild(script);
    }
  });
});
