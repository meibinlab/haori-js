/* @vitest-environment jsdom */
/**
 * @fileoverview 「別スコープで供給されているキー」の診断の検証。
 *
 * バインド先を兄弟要素にしてしまった宣言（バインドは対象要素とその子孫にしか
 * 見えません）は、`??` などで既定値を書いていると値のある式として評価が通るため、
 * 未解決参照の診断では検出できません。開発モードでその取り違えを名指しします。
 * 1. 別スコープで供給されたキーを参照する式を警告する
 * 2. 同じ式・同じキーは一度だけ警告する
 * 3. どこにも供給されていないキーは従来の集約警告に任せる
 * 4. 同じ式が後で解決した場合は警告しない（行ごと取得の一時的なスコープ外）
 * 5. 本番（開発モード無効）では出力しない
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Dev from '../src/dev';
import Env from '../src/env';
import Expression from '../src/expression';
import Queue from '../src/queue';

/** 警告メッセージのうち、この診断だけを抜き出します。 */
const crossScopeWarnings = (warn: ReturnType<typeof vi.spyOn>): string[] =>
  (warn.mock.calls as unknown[][])
    .map(args => args.map(arg => String(arg)).join(' '))
    .filter(message => message.includes('missing from this scope'));

describe('別スコープで供給されているキーの診断', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setStrictBind(false);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Env.setStrictBind(false);
    Dev.enable();
  });

  it('別スコープで供給されたキーを参照する式を警告する', async () => {
    // 応答を受けた要素のスコープ（供給あり）。
    Expression.evaluateDetailed('scopedPlanCandidates.content', {
      scopedPlanCandidates: {content: [{id: 'p1'}]},
    });
    // 兄弟要素のスコープ（供給なし）。`?? []` があるため値は求まる。
    const result = Expression.evaluateDetailed(
      '(scopedPlanCandidates.content ?? []).length',
      {},
    );
    await Queue.waitForIdle();

    expect(result.value).toBe(0);
    const messages = crossScopeWarnings(warn);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('scopedPlanCandidates');
    expect(messages[0]).toContain('(scopedPlanCandidates.content ?? []).length');
  });

  it('同じ式・同じキーは一度だけ警告する', async () => {
    Expression.evaluateDetailed('oncePlan.name', {oncePlan: {name: 'A'}});
    Expression.evaluateDetailed('(oncePlan.name ?? "")', {});
    await Queue.waitForIdle();
    Expression.evaluateDetailed('(oncePlan.name ?? "")', {});
    await Queue.waitForIdle();

    expect(crossScopeWarnings(warn).length).toBe(1);
  });

  it('どこにも供給されていないキーは警告しない（従来の集約警告に任せる）', async () => {
    Expression.evaluateDetailed('(neverProvidedKey.name ?? "")', {});
    await Queue.waitForIdle();

    expect(crossScopeWarnings(warn)).toEqual([]);
  });

  it('同じ式が後で解決したら警告しない', async () => {
    Expression.evaluateDetailed('laterPlan.name', {laterPlan: {name: 'A'}});
    // 行ごとに応答を取得する構成では、別の行が先に解決している間だけスコープ外。
    Expression.evaluateDetailed('(laterPlan.name ?? "")', {});
    Expression.evaluateDetailed('(laterPlan.name ?? "")', {
      laterPlan: {name: 'B'},
    });
    await Queue.waitForIdle();

    expect(crossScopeWarnings(warn)).toEqual([]);
  });

  it('本番（開発モード無効）では出力しない', async () => {
    Dev.disable();
    Expression.evaluateDetailed('productionPlan.name', {
      productionPlan: {name: 'A'},
    });
    Expression.evaluateDetailed('(productionPlan.name ?? "")', {});
    await Queue.waitForIdle();

    expect(crossScopeWarnings(warn)).toEqual([]);
  });
});
