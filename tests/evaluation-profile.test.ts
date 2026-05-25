/* @vitest-environment jsdom */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

type EvaluationProfileAccessor = {
  reset: () => void;
  snapshot: () => Array<{
    elementId: string;
    attributes: Array<{
      name: string;
      calls: number;
      totalDurationMs: number;
      maxDurationMs: number;
      placeholders: Array<{
        expression: string;
        calls: number;
        totalDurationMs: number;
        maxDurationMs: number;
      }>;
    }>;
    texts: Array<{
      childIndex: number;
      calls: number;
      totalDurationMs: number;
      maxDurationMs: number;
      placeholders: Array<{
        expression: string;
        calls: number;
        totalDurationMs: number;
        maxDurationMs: number;
      }>;
    }>;
  }>;
};

describe('evaluation profile', () => {
  let container: HTMLElement;

  beforeEach(() => {
    Dev.enable();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const profile = (globalThis as Record<string, unknown>).__HAORI_EVALUATION_PROFILE__ as
      | EvaluationProfileAccessor
      | undefined;
    profile?.reset();
    Dev.disable();
    document.body.removeChild(container);
  });

  it('属性とテキストの評価回数を要素ごとに集計する', async () => {
    container.innerHTML = `
      <div id="root" data-bind='{"name":"Alice","status":"active"}'>
        <section id="host" title="{{name}}">
          <span>{{name}}</span>
          <span>{{status}}</span>
        </section>
      </div>
    `;

    const root = container.querySelector('#root') as HTMLElement;
    const host = container.querySelector('#host') as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();

    const profile = (globalThis as Record<string, unknown>).__HAORI_EVALUATION_PROFILE__ as
      | EvaluationProfileAccessor
      | undefined;
    expect(profile).toBeDefined();
    profile!.reset();

    await Core.evaluateAll(Fragment.get(host) as ElementFragment);
    await waitForDomSettled();

    const snapshot = profile!.snapshot();
    const hostEntry = snapshot.find(entry => entry.elementId === 'section#host');
    expect(hostEntry).toBeDefined();
    expect(hostEntry?.attributes).toEqual([
      expect.objectContaining({
        name: 'title',
        template: '{{name}}',
        calls: 1,
        placeholders: [
          expect.objectContaining({
            expression: 'name',
            calls: 1,
          }),
        ],
      }),
    ]);
    expect(hostEntry?.attributes[0]?.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(hostEntry?.attributes[0]?.maxDurationMs).toBeGreaterThanOrEqual(0);
    expect(
      hostEntry?.attributes[0]?.placeholders[0]?.totalDurationMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      hostEntry?.attributes[0]?.placeholders[0]?.maxDurationMs,
    ).toBeGreaterThanOrEqual(0);

    const firstTextEntry = snapshot.find(
      entry => entry.elementId === 'section#host > span:nth-child(1)',
    );
    expect(firstTextEntry?.texts).toEqual([
      expect.objectContaining({
        childIndex: 0,
        template: '{{name}}',
        calls: 1,
        placeholders: [
          expect.objectContaining({
            expression: 'name',
            calls: 1,
          }),
        ],
      }),
    ]);
    expect(firstTextEntry?.texts[0]?.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(firstTextEntry?.texts[0]?.maxDurationMs).toBeGreaterThanOrEqual(0);

    const secondTextEntry = snapshot.find(
      entry => entry.elementId === 'section#host > span:nth-child(2)',
    );
    expect(secondTextEntry?.texts).toEqual([
      expect.objectContaining({
        childIndex: 0,
        template: '{{status}}',
        calls: 1,
        placeholders: [
          expect.objectContaining({
            expression: 'status',
            calls: 1,
          }),
        ],
      }),
    ]);
    expect(secondTextEntry?.texts[0]?.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(secondTextEntry?.texts[0]?.maxDurationMs).toBeGreaterThanOrEqual(0);
  });
});