/* @vitest-environment jsdom */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import PollObserver from '../src/poll';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/**
 * 実時間で待機します。
 *
 * ポーリングのテストは実タイマーで行います。フェイクタイマーを使うと、Queue が
 * requestAnimationFrame でバッチ処理する DOM 反映も同時に止まり、タイマー進行と
 * レンダリング完了の順序を手動で合わせ込む必要が出て、検証の対象がぼやけるためです。
 * 間隔を下限（100ms）付近まで詰めることで実時間でも短時間で完了します。
 *
 * @param ms 待機ミリ秒
 * @returns 待機完了の Promise
 */
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * 要素の `_poll` 状態を取得します。
 *
 * @param element 対象要素
 * @returns `_poll` 状態。未注入の場合は undefined
 */
const getPollState = (
  element: HTMLElement,
): Record<string, unknown> | undefined => {
  const fragment = Fragment.get(element) as ElementFragment | null;
  return fragment?.getRawBindingData()?._poll as
    | Record<string, unknown>
    | undefined;
};

/**
 * JSON 応答を返す Response を生成します。
 *
 * @param body 応答本文
 * @param status HTTP ステータス
 * @returns Response
 */
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });

describe('data-poll-*', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    PollObserver.disconnectAll();
    document.body.innerHTML = '';
    Dev.disable();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * HTML をマウントし、ポーリングの監視を開始します。
   *
   * @param html マウントする HTML
   * @returns 監視対象要素
   */
  const mount = async (html: string): Promise<HTMLElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    PollObserver.syncTree(container);
    return container.querySelector<HTMLElement>('[data-poll-fetch]')!;
  };

  describe('取得間隔と多重実行', () => {
    it('初回を即時実行し、以降は指定間隔で繰り返す', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"></div>`,
      );

      await waitForCondition(() => fetchSpy.mock.calls.length >= 3, {
        description: 'poll fetch repetition',
        maxAttempts: 20,
        delayMs: 40,
      });
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('応答が間隔より遅い場合もリクエストが多重化しない', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(180);
        inFlight -= 1;
        return jsonResponse({});
      });

      await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"></div>`,
      );

      await sleep(700);
      expect(maxInFlight).toBe(1);
    });

    it('設定用属性だけの要素は監視対象にならない', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      container.innerHTML = `<div data-poll-interval="100"
        data-poll-timeout="1000"></div>`;
      await Core.scan(container);
      await waitForDomSettled();
      PollObserver.syncTree(container);

      await sleep(350);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('下限を下回る間隔は下限へ切り上げ、警告を出す', async () => {
      Dev.enable();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(jsonResponse({})),
      );

      await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="0"></div>`,
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(
        warnSpy.mock.calls.some(call =>
          String(call[1]).includes('data-poll-interval の下限'),
        ),
      ).toBe(true);
    });
  });

  describe('data-poll-until', () => {
    it('条件が成立した時点で恒久停止し、_poll へ反映される', async () => {
      let confirmed = false;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        const current = confirmed;
        confirmed = true;
        return Promise.resolve(jsonResponse({confirmed: current}));
      });

      const target = await mount(
        `<div id="state" data-bind='{"approval":{}}'>
           <div data-poll-fetch="https://example.com/status"
                data-poll-interval="100"
                data-poll-until="{{approval.confirmed}}"
                data-poll-bind="#state"
                data-poll-bind-arg="approval"
                data-poll-bind-merge
                data-poll-state></div>
         </div>`,
      );

      await waitForCondition(() => getPollState(target)?.stopped === true, {
        description: 'poll stop by until',
        maxAttempts: 20,
        delayMs: 40,
      });

      const state = getPollState(target);
      expect(state?.stopReason).toBe('until');
      expect(state?.running).toBe(false);
      expect(state?.timedOut).toBe(false);

      const callsAtStop = fetchSpy.mock.calls.length;
      await sleep(300);
      expect(fetchSpy.mock.calls.length).toBe(callsAtStop);
    });

    it('初期状態で条件が成立していれば一度も取得しない', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      const target = await mount(
        `<div id="state" data-bind='{"approval":{"confirmed":true}}'>
           <div data-poll-fetch="https://example.com/status"
                data-poll-interval="100"
                data-poll-until="{{approval.confirmed}}"
                data-poll-state></div>
         </div>`,
      );

      await sleep(300);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(getPollState(target)?.stopReason).toBe('until');
    });

    it('未解決参照では停止せず、取得を継続する', async () => {
      Dev.enable();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"
              data-poll-until="{{missing.flag}}"></div>`,
      );

      await waitForCondition(() => fetchSpy.mock.calls.length >= 3, {
        description: 'poll continues on unresolved until',
        maxAttempts: 20,
        delayMs: 40,
      });
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('data-poll-timeout', () => {
    it('打ち切り時間に到達したら停止し、polltimeout と pollstop を発火する', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(jsonResponse({})),
      );
      const timeoutEvents: CustomEvent[] = [];
      const stopEvents: CustomEvent[] = [];
      document.addEventListener('haori:polltimeout', event => {
        timeoutEvents.push(event as CustomEvent);
      });
      document.addEventListener('haori:pollstop', event => {
        stopEvents.push(event as CustomEvent);
      });

      const target = await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"
              data-poll-timeout="250"
              data-poll-state></div>`,
      );

      await waitForCondition(() => getPollState(target)?.stopped === true, {
        description: 'poll stop by timeout',
        maxAttempts: 20,
        delayMs: 40,
      });

      const state = getPollState(target);
      expect(state?.timedOut).toBe(true);
      expect(state?.stopReason).toBe('timeout');
      expect(state?.running).toBe(false);
      expect(timeoutEvents).toHaveLength(1);
      expect(stopEvents).toHaveLength(1);
      expect(stopEvents[0].detail.reason).toBe('timeout');
      expect(timeoutEvents[0].detail.count).toBeGreaterThanOrEqual(1);
    });

    it('until の評価値が変化しても打ち切り時間に到達する', async () => {
      // 回帰テスト: 登録の同一性判定に評価値を使うと、data-poll-until や
      // data-poll-data の評価値が変わるたびに登録が張り直され、打ち切りタイマーの
      // 起点がリセットされて data-poll-timeout へ永久に到達しなくなる。
      let tick = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        tick += 1;
        // confirmed は成立させないが、seq を毎回変えて評価値を変化させる。
        return Promise.resolve(
          jsonResponse({confirmed: false, seq: `s${tick}`}),
        );
      });

      const target = await mount(
        `<div id="state" data-bind='{"approval":{"seq":"s0"}}'>
           <div data-poll-fetch="https://example.com/status?seq={{approval.seq}}"
                data-poll-interval="100"
                data-poll-timeout="350"
                data-poll-until="{{approval.confirmed}}"
                data-poll-bind="#state"
                data-poll-bind-arg="approval"
                data-poll-bind-merge
                data-poll-state></div>
         </div>`,
      );

      // 評価値の変化を契機に syncElement が呼ばれる状況を再現する
      // （実運用では属性変更の MutationObserver 経路から呼ばれる）。
      const resync = setInterval(() => {
        PollObserver.syncElement(target);
      }, 60);

      try {
        await waitForCondition(() => getPollState(target)?.stopped === true, {
          description: 'poll timeout despite until re-evaluation',
          maxAttempts: 25,
          delayMs: 40,
        });
      } finally {
        clearInterval(resync);
      }

      expect(getPollState(target)?.stopReason).toBe('timeout');
    });
  });

  describe('一時停止（data-if / data-poll-disabled）', () => {
    it('祖先の data-if が非表示になると停止し、再表示で再開する', async () => {
      // 回帰テスト: data-if の非表示は祖先要素へ data-if-false が付与されるため、
      // 対象要素自身の属性変更では検知できない。祖先方向を確認していないと
      // 非表示中も取得が続く。
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      const target = await mount(
        `<div id="gate" data-bind='{"visible":true}'>
           <div data-if="visible">
             <div data-poll-fetch="https://example.com/status"
                  data-poll-interval="100"
                  data-poll-state></div>
           </div>
         </div>`,
      );

      await waitForCondition(() => fetchSpy.mock.calls.length >= 2, {
        description: 'poll running before hide',
        maxAttempts: 20,
        delayMs: 40,
      });

      const gate = container.querySelector<HTMLElement>('#gate')!;
      await Core.setBindingData(gate, {visible: false});
      await waitForDomSettled();

      await waitForCondition(() => getPollState(target)?.paused === true, {
        description: 'poll paused while hidden',
        maxAttempts: 20,
        delayMs: 40,
      });

      // 一時停止であり恒久停止ではない
      expect(getPollState(target)?.stopped).toBe(false);
      const callsWhilePaused = fetchSpy.mock.calls.length;
      await sleep(350);
      expect(fetchSpy.mock.calls.length).toBe(callsWhilePaused);

      // 再表示で再開する
      await Core.setBindingData(gate, {visible: true});
      await waitForDomSettled();
      await waitForCondition(
        () => fetchSpy.mock.calls.length > callsWhilePaused,
        {
          description: 'poll resumed after show',
          maxAttempts: 20,
          delayMs: 40,
        },
      );
      expect(getPollState(target)?.paused).toBe(false);
    });

    it('data-poll-disabled が真の間は実行せず、偽に戻ると再開する', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      const target = await mount(
        `<div id="gate" data-bind='{"busy":true}'>
           <div data-poll-fetch="https://example.com/status"
                data-poll-interval="100"
                data-poll-disabled="{{busy}}"
                data-poll-state></div>
         </div>`,
      );

      await sleep(300);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(getPollState(target)?.paused).toBe(true);
      expect(getPollState(target)?.stopped).toBe(false);

      const gate = container.querySelector<HTMLElement>('#gate')!;
      await Core.setBindingData(gate, {busy: false});
      await waitForDomSettled();

      await waitForCondition(() => fetchSpy.mock.calls.length >= 1, {
        description: 'poll resumed after disabled cleared',
        maxAttempts: 20,
        delayMs: 40,
      });
    });
  });

  describe('DOM からの除去', () => {
    it('要素が DOM から外れると恒久停止する', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      const target = await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"></div>`,
      );

      await waitForCondition(() => fetchSpy.mock.calls.length >= 1, {
        description: 'poll started',
        maxAttempts: 20,
        delayMs: 40,
      });

      PollObserver.cleanupTree(target);
      target.remove();

      const callsAtRemoval = fetchSpy.mock.calls.length;
      await sleep(350);
      expect(fetchSpy.mock.calls.length).toBe(callsAtRemoval);
    });
  });

  describe('エラー時の継続方針', () => {
    it('既定ではエラー応答でも取得を継続する', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({message: 'error'}, 500)),
        );

      await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"></div>`,
      );

      await waitForCondition(() => fetchSpy.mock.calls.length >= 3, {
        description: 'poll continues on error',
        maxAttempts: 20,
        delayMs: 40,
      });
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('data-poll-error-limit に達すると停止する', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({message: 'error'}, 500)),
        );

      const target = await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"
              data-poll-error-limit="2"
              data-poll-state></div>`,
      );

      await waitForCondition(() => getPollState(target)?.stopped === true, {
        description: 'poll stop by error limit',
        maxAttempts: 20,
        delayMs: 40,
      });

      expect(getPollState(target)?.stopReason).toBe('error');
      expect(fetchSpy.mock.calls.length).toBe(2);

      await sleep(300);
      expect(fetchSpy.mock.calls.length).toBe(2);
    });

    it('成功が挟まると連続失敗回数がリセットされる', async () => {
      let call = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        call += 1;
        // 失敗・成功・失敗・失敗… の順。上限3なので途中では停止しない。
        const ok = call === 2;
        return Promise.resolve(
          ok ? jsonResponse({}) : jsonResponse({message: 'error'}, 500),
        );
      });

      const target = await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"
              data-poll-error-limit="3"
              data-poll-state></div>`,
      );

      await waitForCondition(() => fetchSpy.mock.calls.length >= 4, {
        description: 'poll continues after error reset',
        maxAttempts: 25,
        delayMs: 40,
      });
      // 4回目の時点で連続失敗は 2 回（3・4回目）なので、まだ停止していない。
      expect(getPollState(target)?.stopped).toBe(false);
    });
  });

  describe('設定値の解釈', () => {
    /**
     * ポーリングを 1 回だけ動かし、間隔タイマーが張られる前に停止させます。
     *
     * @param html マウントする HTML
     * @returns 監視対象要素
     */
    const mountOnce = async (html: string): Promise<HTMLElement> => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(jsonResponse({})),
      );
      return mount(html);
    };

    it('数値でない間隔は既定値（5000ms）へ落として警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

      const target = await mountOnce(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="abc" data-poll-state></div>`,
      );
      await waitForCondition(() => getPollState(target) !== undefined, {
        description: 'poll state injected',
        maxAttempts: 20,
        delayMs: 20,
      });

      expect(warn).toHaveBeenCalled();
      // 既定値まで次の取得は来ない（間隔が 0 に落ちて暴走しない）。
      expect(getPollState(target)?.stopped).toBe(false);
    });

    it('正でない打ち切り時間は無制限として扱い、警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

      const target = await mountOnce(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100" data-poll-timeout="0"
              data-poll-state></div>`,
      );
      await waitForCondition(() => getPollState(target) !== undefined, {
        description: 'poll state injected',
        maxAttempts: 20,
        delayMs: 20,
      });
      await sleep(150);

      expect(warn).toHaveBeenCalled();
      // 打ち切られていない（無制限扱い）。
      expect(getPollState(target)?.stopped).toBe(false);
    });

    it('1 未満の連続失敗上限は無制限として扱い、警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(jsonResponse({message: 'error'}, 500)),
      );

      const target = await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100" data-poll-error-limit="0"
              data-poll-state></div>`,
      );
      await waitForCondition(
        () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
          .length >= 3,
        {
          description: 'poll errors accumulated',
          maxAttempts: 25,
          delayMs: 40,
        },
      );

      expect(warn).toHaveBeenCalled();
      // 上限が無効なので、失敗が続いても止まらない。
      expect(getPollState(target)?.stopped).toBe(false);
    });

    it('data-poll-until の文字列 "false" / "0" は成立扱いにしない', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100" data-poll-until="false"></div>`,
      );

      await waitForCondition(() => fetchSpy.mock.calls.length >= 2, {
        description: 'poll keeps running with string false',
        maxAttempts: 20,
        delayMs: 40,
      });
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('監視の解除', () => {
    it('cleanupTree で配下のポーリングを止める', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="100"></div>`,
      );
      await waitForCondition(() => fetchSpy.mock.calls.length >= 1, {
        description: 'first poll fetch',
        maxAttempts: 20,
        delayMs: 20,
      });

      PollObserver.cleanupTree(container);
      const countAtCleanup = fetchSpy.mock.calls.length;
      await sleep(300);

      expect(fetchSpy.mock.calls.length).toBe(countAtCleanup);
    });

    it('同じ設定での再同期ではポーリングを作り直さない', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(jsonResponse({})));

      const target = await mount(
        `<div data-poll-fetch="https://example.com/status"
              data-poll-interval="200"></div>`,
      );
      await waitForCondition(() => fetchSpy.mock.calls.length >= 1, {
        description: 'first poll fetch',
        maxAttempts: 20,
        delayMs: 20,
      });

      // 再同期しても初回取得が走り直さない（設定が同じなら登録を維持する）。
      const before = fetchSpy.mock.calls.length;
      PollObserver.syncElement(target);
      await sleep(50);

      expect(fetchSpy.mock.calls.length).toBe(before);
    });
  });
});
