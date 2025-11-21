/* @vitest-environment jsdom */
/**
 * @fileoverview URL（URLパラメータ取得）のテスト
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Url from '../src/url';

describe('Url', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // window.locationをモック
    Object.defineProperty(window, 'location', {
      value: {...originalLocation, search: ''},
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  describe('readParams', () => {
    it('単一のパラメータを取得する', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?name=tanaka'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({name: 'tanaka'});
    });

    it('複数のパラメータを取得する', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?name=tanaka&age=30&city=tokyo'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({
        name: 'tanaka',
        age: '30',
        city: 'tokyo',
      });
    });

    it('パラメータがない場合は空オブジェクトを返す', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: ''},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({});
    });

    it('?のみの場合は空オブジェクトを返す', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({});
    });

    it('URLエンコードされた値をデコードする', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?name=%E7%94%B0%E4%B8%AD&message=hello%20world'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({
        name: '田中',
        message: 'hello world',
      });
    });

    it('空の値を持つパラメータを処理する', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?name=&age=30'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({
        name: '',
        age: '30',
      });
    });

    it('値なしのパラメータを処理する', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?flag&name=tanaka'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({
        flag: '',
        name: 'tanaka',
      });
    });

    it('同じキーの複数パラメータは後の値が優先される', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?name=tanaka&name=suzuki'},
        writable: true,
      });

      const params = Url.readParams();

      // URLSearchParams.forEachは同じキーを複数回呼ぶが、
      // 最後の値で上書きされる
      expect(params.name).toBe('suzuki');
    });

    it('特殊文字を含むパラメータを処理する', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?query=a%2Bb%3Dc&path=%2Fhome%2Fuser'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({
        query: 'a+b=c',
        path: '/home/user',
      });
    });

    it('日本語のキーと値を処理する', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?%E5%90%8D%E5%89%8D=%E5%A4%AA%E9%83%8E'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({
        名前: '太郎',
      });
    });

    it('数値として解釈される値も文字列として返す', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?count=123&price=45.67'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({
        count: '123',
        price: '45.67',
      });
      expect(typeof params.count).toBe('string');
      expect(typeof params.price).toBe('string');
    });

    it('真偽値として解釈される値も文字列として返す', () => {
      Object.defineProperty(window, 'location', {
        value: {...originalLocation, search: '?enabled=true&disabled=false'},
        writable: true,
      });

      const params = Url.readParams();

      expect(params).toEqual({
        enabled: 'true',
        disabled: 'false',
      });
      expect(typeof params.enabled).toBe('string');
    });
  });
});
