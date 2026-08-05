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
 *
 * 期待値の根拠は仕様「スコープ診断（開発モード）」。
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

  it('アロー関数の引数は警告しない（式の中で束縛される名前）', async () => {
    // 兄弟要素が同じ名前を data-each-arg に使っている状況を作る（供給あり）。
    Expression.evaluateDetailed('p.planName', {p: {planName: 'A'}});
    // アロー関数の引数として `p` を使う式。値は正しく求まる。
    const result = Expression.evaluateDetailed(
      '(planCandidates.content ?? []).find(p => p.id * 1 === c.planId * 1)' +
        '?.planName ?? \'\'',
      {
        planCandidates: {content: [{id: '2', planName: '標準'}]},
        c: {planId: 2},
      },
    );
    await Queue.waitForIdle();

    expect(result.value).toBe('標準');
    expect(
      crossScopeWarnings(warn),
      'アロー関数の引数が誤って警告されている',
    ).toEqual([]);
  });

  it('括弧付き・分割代入の引数も警告しない', async () => {
    Expression.evaluateDetailed('row.id', {row: {id: 1}});
    Expression.evaluateDetailed('total.value', {total: {value: 1}});
    Expression.evaluateDetailed(
      '(list ?? []).map((row, total) => row * total)',
      {list: [1, 2]},
    );
    Expression.evaluateDetailed('(list ?? []).map(({row}) => row)', {
      list: [{row: 1}],
    });
    await Queue.waitForIdle();

    expect(crossScopeWarnings(warn)).toEqual([]);
  });

  it('アロー関数があっても引数以外のキーは警告する', async () => {
    Expression.evaluateDetailed('siblingPlans.content', {
      siblingPlans: {content: [{id: 1}]},
    });
    const expression = '(siblingPlans.content ?? []).filter(q => q.id).length';
    Expression.evaluateDetailed(expression, {});
    await Queue.waitForIdle();

    const messages = crossScopeWarnings(warn);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('siblingPlans');
    expect(messages[0]).not.toContain(' q,');
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

  describe('束縛識別子のキャッシュ', () => {
    /**
     * 束縛識別子のキャッシュを取り出します。
     *
     * 私有の静的メンバーですが、常駐量（本番で増えないこと）と混線の有無は
     * 外からの挙動では確かめられないため、テストからのみ直接参照します。
     *
     * @returns 束縛識別子のキャッシュ
     */
    const boundCache = (): Map<string, ReadonlySet<string>> =>
      (
        Expression as unknown as {
          BOUND_IDENTIFIER_CACHE: Map<string, ReadonlySet<string>>;
        }
      ).BOUND_IDENTIFIER_CACHE;

    it('本番（開発モード無効）ではキャッシュを作らない', () => {
      Dev.disable();
      const before = boundCache().size;
      // 開発モードでしか使わない診断のためのキャッシュなので、本番では
      // 常駐量が増えない（式の種類だけ増え続けることを避ける）。
      Expression.evaluateDetailed(
        '(cacheProbeList ?? []).map(cacheProbeArg => cacheProbeArg.id)',
        {cacheProbeList: [{id: 1}]},
      );
      expect(boundCache().size).toBe(before);
    });

    it('同じ式を繰り返し評価してもキャッシュは 1 件しか増えない', () => {
      Dev.enable();
      const expression = '(reuseList ?? []).map(reuseArg => reuseArg.id)';
      const before = boundCache().size;
      Expression.evaluateDetailed(expression, {reuseList: [{id: 1}]});
      const afterFirst = boundCache().size;
      Expression.evaluateDetailed(expression, {reuseList: [{id: 2}]});
      Expression.evaluateDetailed(expression, {reuseList: [{id: 3}]});

      expect(afterFirst).toBe(before + 1);
      expect(boundCache().size).toBe(afterFirst);
    });

    it('同じ名前でも式ごとに束縛かどうかを判定する（キャッシュが混線しない）', async () => {
      Dev.enable();
      // 別スコープで供給されている名前を作る。
      Expression.evaluateDetailed('mixedName.id', {mixedName: {id: 1}});
      // 同じ名前をアロー関数の引数として使う式（警告しない）。
      Expression.evaluateDetailed(
        '(mixedList ?? []).map(mixedName => mixedName.id)',
        {mixedList: [{id: 1}]},
      );
      // 同じ名前を自由識別子として使う式（警告する）。
      const freeExpression = '(mixedName.id ?? 0) + 1';
      Expression.evaluateDetailed(freeExpression, {});
      await Queue.waitForIdle();

      const messages = crossScopeWarnings(warn);
      expect(messages.length, `出力: ${messages.join(' / ')}`).toBe(1);
      expect(messages[0]).toContain('mixedName');
      expect(messages[0]).toContain(freeExpression);
    });
  });
});
