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
    delete (window as { location?: Location }).location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  describe('readParams', () => {
    it('単一のパラメータを取得する', () => {
      window.location = {
        ...originalLocation,
        search: '?name=tanaka',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({name: 'tanaka'});
    });

    it('複数のパラメータを取得する', () => {
      window.location = {
        ...originalLocation,
        search: '?name=tanaka&age=30&city=tokyo',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({
        name: 'tanaka',
        age: '30',
        city: 'tokyo',
      });
    });

    it('パラメータがない場合は空オブジェクトを返す', () => {
      window.location = {
        ...originalLocation,
        search: '',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({});
    });

    it('?のみの場合は空オブジェクトを返す', () => {
      window.location = {
        ...originalLocation,
        search: '?',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({});
    });

    it('URLエンコードされた値をデコードする', () => {
      window.location = {
        ...originalLocation,
        search: '?name=%E7%94%B0%E4%B8%AD&message=hello%20world',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({
        name: '田中',
        message: 'hello world',
      });
    });

    it('空の値を持つパラメータを処理する', () => {
      window.location = {
        ...originalLocation,
        search: '?name=&age=30',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({
        name: '',
        age: '30',
      });
    });

    it('値なしのパラメータを処理する', () => {
      window.location = {
        ...originalLocation,
        search: '?flag&name=tanaka',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({
        flag: '',
        name: 'tanaka',
      });
    });

    it('同じキーの複数パラメータは後の値が優先される', () => {
      window.location = {
        ...originalLocation,
        search: '?name=tanaka&name=suzuki',
      } as Location;

      const params = Url.readParams();

      // URLSearchParams.forEachは同じキーを複数回呼ぶが、
      // 最後の値で上書きされる
      expect(params.name).toBe('suzuki');
    });

    it('特殊文字を含むパラメータを処理する', () => {
      window.location = {
        ...originalLocation,
        search: '?query=a%2Bb%3Dc&path=%2Fhome%2Fuser',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({
        query: 'a+b=c',
        path: '/home/user',
      });
    });

    it('日本語のキーと値を処理する', () => {
      window.location = {
        ...originalLocation,
        search: '?%E5%90%8D%E5%89%8D=%E5%A4%AA%E9%83%8E',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({
        名前: '太郎',
      });
    });

    it('数値として解釈される値も文字列として返す', () => {
      window.location = {
        ...originalLocation,
        search: '?count=123&price=45.67',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({
        count: '123',
        price: '45.67',
      });
      expect(typeof params.count).toBe('string');
      expect(typeof params.price).toBe('string');
    });

    it('真偽値として解釈される値も文字列として返す', () => {
      window.location = {
        ...originalLocation,
        search: '?enabled=true&disabled=false',
      } as Location;

      const params = Url.readParams();

      expect(params).toEqual({
        enabled: 'true',
        disabled: 'false',
      });
      expect(typeof params.enabled).toBe('string');
    });
  });
});
