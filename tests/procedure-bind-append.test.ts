import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';

describe('bind-append', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('concatenates incoming arrays for configured append keys', async () => {
    const target = document.createElement('div');
    target.id = 'feed';
    target.setAttribute(
      'data-bind',
      JSON.stringify({
        items: [{id: 1}],
        cursor: 'a',
        hasMore: true,
      }),
    );

    const button = document.createElement('button');
    button.setAttribute('data-click-fetch', 'https://example.com/posts');
    button.setAttribute('data-click-bind', '#feed');
    button.setAttribute('data-click-bind-params', 'items&cursor&hasMore');
    button.setAttribute('data-click-bind-append', 'items');

    container.append(target, button);

    await Core.scan(target);
    await Core.scan(button);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{id: 2}],
          cursor: 'b',
          hasMore: false,
        }),
        {headers: {'Content-Type': 'application/json'}},
      ),
    );

    const proc = new Procedure(Fragment.get(button) as ElementFragment, 'click');
    await proc.run();

    const targetFragment = Fragment.get(target) as ElementFragment;
    expect(targetFragment.getRawBindingData()).toEqual({
      items: [{id: 1}, {id: 2}],
      cursor: 'b',
      hasMore: false,
    });
  });

  it('applies append keys even when bind-arg is used', async () => {
    const target = document.createElement('div');
    target.id = 'feed';
    target.setAttribute(
      'data-bind',
      JSON.stringify({
        user: {
          items: [{id: 1}],
          cursor: 'a',
          hasMore: true,
        },
      }),
    );

    const button = document.createElement('button');
    button.setAttribute('data-click-fetch', 'https://example.com/posts');
    button.setAttribute('data-click-bind', '#feed');
    button.setAttribute('data-click-bind-arg', 'user');
    button.setAttribute('data-click-bind-append', 'items');

    container.append(target, button);

    await Core.scan(target);
    await Core.scan(button);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{id: 2}],
          cursor: 'b',
          hasMore: false,
        }),
        {headers: {'Content-Type': 'application/json'}},
      ),
    );

    const proc = new Procedure(Fragment.get(button) as ElementFragment, 'click');
    await proc.run();

    const targetFragment = Fragment.get(target) as ElementFragment;
    expect(targetFragment.getRawBindingData()).toEqual({
      user: {
        items: [{id: 1}, {id: 2}],
        cursor: 'b',
        hasMore: false,
      },
    });
  });
});
