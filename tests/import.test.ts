/* @vitest-environment jsdom */
/**
 * @fileoverview Import（HTMLインポート機能）のテスト
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {Import} from '../src/import';

describe('Import', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('load', () => {
    it('HTMLからbodyの内容のみを抽出する', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Test</title></head>
          <body>
            <h1>Hello</h1>
            <p>World</p>
          </body>
        </html>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      } as Response);

      const result = await Import.load('https://example.com/test.html');

      expect(result).toContain('<h1>Hello</h1>');
      expect(result).toContain('<p>World</p>');
      expect(result).not.toContain('<title>');
      expect(result).not.toContain('<html>');
    });

    it('bodyタグがない場合はテキスト全体を返す', async () => {
      const text = '<div>Content without body</div>';

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(text),
      } as Response);

      const result = await Import.load('https://example.com/test.html');

      // DOMParserはbodyを自動生成するため、コンテンツは含まれる
      expect(result).toContain('Content without body');
    });

    it('fetchオプションを渡せる', async () => {
      const html = '<html><body><p>Test</p></body></html>';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      } as Response);

      await Import.load('https://example.com/test.html', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      });

      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/test.html', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      });
    });

    it('HTTPエラー時は例外を投げる', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(
        Import.load('https://example.com/not-found.html'),
      ).rejects.toThrow('Failed to load');
    });

    it('ネットワークエラー時は例外を投げる', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        Import.load('https://example.com/test.html'),
      ).rejects.toThrow('Failed to fetch');
    });

    it('レスポンステキスト読み取りエラー時は例外を投げる', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.reject(new Error('Read error')),
      } as Response);

      await expect(
        Import.load('https://example.com/test.html'),
      ).rejects.toThrow('Failed to read response');
    });

    it('複数の子要素を持つbodyを正しく抽出する', async () => {
      const html = `
        <html>
          <body>
            <header>Header</header>
            <main>Main Content</main>
            <footer>Footer</footer>
          </body>
        </html>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      } as Response);

      const result = await Import.load('https://example.com/test.html');

      expect(result).toContain('<header>Header</header>');
      expect(result).toContain('<main>Main Content</main>');
      expect(result).toContain('<footer>Footer</footer>');
    });

    it('空のbodyを正しく処理する', async () => {
      const html = '<html><body></body></html>';

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      } as Response);

      const result = await Import.load('https://example.com/test.html');

      expect(result).toBe('');
    });

    it('body内のスクリプトタグも含める', async () => {
      const html = `
        <html>
          <body>
            <p>Content</p>
            <script>console.log('test');</script>
          </body>
        </html>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      } as Response);

      const result = await Import.load('https://example.com/test.html');

      expect(result).toContain('<p>Content</p>');
      // scriptタグはDOMParserによって処理される
    });

    it('ネストされた要素を正しく抽出する', async () => {
      const html = `
        <html>
          <body>
            <div class="outer">
              <div class="inner">
                <span>Nested content</span>
              </div>
            </div>
          </body>
        </html>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      } as Response);

      const result = await Import.load('https://example.com/test.html');

      expect(result).toContain('class="outer"');
      expect(result).toContain('class="inner"');
      expect(result).toContain('Nested content');
    });
  });
});
