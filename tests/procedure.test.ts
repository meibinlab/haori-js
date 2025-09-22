import {describe, it, beforeEach, expect, vi} from 'vitest';
import Procedure from '../src/procedure';
import Core from '../src/core';
import Haori from '../src/haori';
import type {ElementFragment} from '../src/fragment';

vi.mock('../src/core');
vi.mock('../src/haori');

class MockFragment {
  private value: string = '';
  private target: HTMLElement = document.createElement('div');
  getTarget: () => HTMLElement = () => this.target;
  getChildElementFragments: () => ElementFragment[] = vi.fn(() => []);
  getValue: () => string = vi.fn(() => this.value);
  setValue: (v: string) => Promise<void> = vi.fn(async (v: string) => {
    this.value = v;
  });
  getBindingData: () => Record<string, unknown> = vi.fn(() => ({}));
  setTarget(target: HTMLElement) {
    this.target = target;
  }
}

describe('Procedureクラス', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('バリデーションに失敗した場合は即resolveされる', async () => {
    const fragment = new MockFragment();
    const input = document.createElement('input') as HTMLInputElement;
    vi.spyOn(input, 'reportValidity').mockReturnValue(false);
    vi.spyOn(input, 'focus').mockImplementation(() => {});
    fragment.setTarget(input);
    const proc = new Procedure({
      formFragment: fragment as unknown as ElementFragment,
      valid: true,
    });
    await expect(proc.run()).resolves.toBeUndefined();
    expect(input.focus).toHaveBeenCalled();
  });

  it('confirmがfalseの場合は即resolveされる', async () => {
    vi.spyOn(Haori, 'confirm').mockResolvedValue(false);
    const proc = new Procedure({confirmMessage: 'Are you sure?'});
    await expect(proc.run()).resolves.toBeUndefined();
    expect(Haori.confirm).toHaveBeenCalledWith('Are you sure?');
  });

  it('beforeCallbackでstopが返った場合は停止する', async () => {
    const beforeCallback = vi.fn(() => ({stop: true}));
    const proc = new Procedure({beforeCallback});
    await expect(proc.run()).resolves.toBeUndefined();
    expect(beforeCallback).toHaveBeenCalled();
  });

  it('afterCallbackでstopが返った場合は停止する', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as typeof fetch;
    const afterCallback = vi.fn(() => ({stop: true}));
    const proc = new Procedure({
      fetchUrl: 'http://test',
      afterCallback,
    });
    await expect(proc.run()).resolves.toBeUndefined();
    expect(afterCallback).toHaveBeenCalled();
  });

  it('bindFragmentsにバインドされる', async () => {
    vi.spyOn(Core, 'setBindingData').mockResolvedValue(undefined as void);
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({foo: 'bar'}), {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as typeof fetch;
    const fragment = new MockFragment();
    const proc = new Procedure({
      fetchUrl: 'http://test',
      bindFragments: [fragment as unknown as ElementFragment],
    });
    await expect(proc.run()).resolves.toBeUndefined();
    expect(Core.setBindingData).toHaveBeenCalled();
  });

  it('adjustFragmentsで値が増減される', async () => {
    const fragment = new MockFragment();
    fragment.getValue = vi.fn(() => '10');
    fragment.setValue = vi.fn(() => Promise.resolve());
    const proc = new Procedure({
      adjustFragments: [fragment as unknown as ElementFragment],
      adjustValue: 5,
    });
    await expect(proc.run()).resolves.toBeUndefined();
    expect(fragment.setValue).toHaveBeenCalledWith('15');
  });

  it('validateOneは非input要素でtrueを返す', () => {
    const fragment = new MockFragment();
    fragment.setTarget(document.createElement('div'));
    const proc = new Procedure();
    expect(proc['validateOne'](fragment as unknown as ElementFragment)).toBe(
      true,
    );
  });

  it('confirmはメッセージがなければtrueを返す', async () => {
    const proc = new Procedure({});
    await expect(proc['confirm']()).resolves.toBe(true);
  });
});
