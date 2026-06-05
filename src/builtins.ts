/**
 * @fileoverview テンプレート式から呼び出せる組み込みヘルパー
 *
 * 式中の予約名前空間 `haori` として注入される純粋関数群です。
 * 日時・数値の整形、整数レンジ、ページネーション補助を提供します。
 * いずれも副作用を持たず（DOM・通信・グローバル状態に触れない）、同じ入力に
 * 対して常に同じ結果を返す冪等な関数のため、式の再評価で安全に利用できます。
 */

/** date() の既定フォーマット */
const DEFAULT_DATE_FORMAT = 'yyyy/MM/dd HH:mm';

/** number() の桁区切り・小数表記に用いるロケール */
const NUMBER_LOCALE = 'en-US';

/** range() が一度に生成する要素数の上限（暴走防止） */
const RANGE_MAX_LENGTH = 10000;

/**
 * 2桁ゼロ埋めした文字列を返します。
 *
 * @param value 対象の数値
 * @returns 2桁ゼロ埋め文字列
 */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * ページネーション補助 `pages()` の動作を調整するオプションです。
 */
export interface PagesOptions {
  /** 現在ページの前後に表示するページ数（既定 2） */
  window?: number;

  /** 先頭・末尾に常に表示するページ数（既定 1） */
  boundary?: number;
}

/**
 * `pages()` が返す1要素分の情報です。
 */
export interface PageItem {
  /** 0 始まりのページ番号。省略記号のときは null */
  page: number | null;

  /** 表示用ラベル。ページ項目は 1 始まりの番号、省略記号は '…' */
  label: number | string;

  /** 現在ページであれば true */
  active: boolean;

  /** 省略記号（…）であれば true */
  ellipsis: boolean;
}

/**
 * ISO 文字列・エポックミリ秒・Date を指定フォーマットの文字列へ整形します。
 *
 * 解釈はブラウザのローカルタイムゾーンで行います。空・null・不正な日時は空文字を
 * 返します。利用できるトークン（いずれもローカル時刻）:
 * `yyyy`（4桁年）`yy`（2桁年）`MM`/`M`（月）`dd`/`d`（日）`HH`/`H`（時・24時間）
 * `mm`（分）`ss`（秒）。トークン以外の文字（区切りなど）はそのまま出力します。
 *
 * @param value 整形対象の日時（ISO 文字列・エポックミリ秒・Date）
 * @param format フォーマット文字列（省略時は `yyyy/MM/dd HH:mm`）
 * @returns 整形済み文字列。整形できない場合は空文字
 */
export function date(
  value: string | number | Date | null | undefined,
  format: string = DEFAULT_DATE_FORMAT,
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const tokens: Record<string, string> = {
    yyyy: String(parsed.getFullYear()).padStart(4, '0'),
    yy: pad2(parsed.getFullYear() % 100),
    MM: pad2(parsed.getMonth() + 1),
    M: String(parsed.getMonth() + 1),
    dd: pad2(parsed.getDate()),
    d: String(parsed.getDate()),
    HH: pad2(parsed.getHours()),
    H: String(parsed.getHours()),
    mm: pad2(parsed.getMinutes()),
    ss: pad2(parsed.getSeconds()),
  };
  // 長いトークンを先に並べ、`yyyy` が `yy` より、`MM` が `M` より優先されるようにする。
  return format.replace(
    /yyyy|yy|MM|dd|HH|mm|ss|M|d|H/g,
    matched => tokens[matched],
  );
}

/**
 * 数値を桁区切り・小数桁付きの文字列へ整形します。
 *
 * 桁区切りは常に有効で、`en-US` ロケール（カンマ区切り・ドット小数）で出力します。
 * `en-US` は区切り文字を決めるだけで小数桁は固定しません。数値文字列も受け付け、
 * 数値に変換できない値・null・空文字は空文字を返します。
 *
 * `decimals` を省略した場合は `Intl.NumberFormat` の既定に従い、末尾ゼロ埋めはせず、
 * 小数は最大 3 桁（`maximumFractionDigits = 3`）に丸められます（例 1234.56789 →
 * "1,234.568"）。4 桁以上をそのまま出したい場合は `decimals` を明示してください。
 *
 * @param value 整形対象（数値または数値文字列）
 * @param decimals 小数桁数。指定するとその桁で固定（末尾ゼロ埋め）。省略時は最大3桁
 * @returns 整形済み文字列。整形できない場合は空文字
 */
export function number(
  value: number | string | null | undefined,
  decimals?: number,
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  const options: Intl.NumberFormatOptions = {};
  if (decimals !== undefined && Number.isFinite(decimals)) {
    const digits = Math.max(0, Math.trunc(decimals));
    options.minimumFractionDigits = digits;
    options.maximumFractionDigits = digits;
  }
  return new Intl.NumberFormat(NUMBER_LOCALE, options).format(numeric);
}

/**
 * 整数の配列を生成します。終端は排他です（`range(2, 5)` は `[2, 3, 4]`）。
 *
 * - `range(n)` … `[0, 1, …, n-1]`
 * - `range(start, end)` … `start` から `end` の手前まで（step は 1）
 * - `range(start, end, step)` … 指定刻み。負の step で降順も可
 *
 * 引数が有限数でない・step が 0 の場合は空配列を返します。要素数は安全のため
 * 上限（{@link RANGE_MAX_LENGTH}）で打ち切ります。
 *
 * @param start `end` 省略時は終端、指定時は開始値
 * @param end 終端（排他）
 * @param step 刻み幅（省略時は 1）
 * @returns 整数配列
 */
export function range(start: number, end?: number, step?: number): number[] {
  let from: number;
  let to: number;
  let by: number;
  if (end === undefined) {
    from = 0;
    to = start;
    by = 1;
  } else {
    from = start;
    to = end;
    by = step === undefined ? 1 : step;
  }
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    !Number.isFinite(by) ||
    by === 0
  ) {
    return [];
  }
  from = Math.trunc(from);
  to = Math.trunc(to);
  by = Math.trunc(by);
  const result: number[] = [];
  if (by > 0) {
    for (let i = from; i < to && result.length < RANGE_MAX_LENGTH; i += by) {
      result.push(i);
    }
  } else {
    for (let i = from; i > to && result.length < RANGE_MAX_LENGTH; i += by) {
      result.push(i);
    }
  }
  return result;
}

/**
 * 番号ページネーション用の表示要素列を生成します。
 *
 * 先頭・末尾の境界ページ、現在ページ周辺のページ、その間を埋める省略記号（…）を
 * 含む配列を表示順に返します。`data-each` で繰り返して番号リンクを構築できます。
 * `current` は 0 始まり（Spring の `Page.number` 等）を想定し、各要素の `label` は
 * 表示用に 1 始まりへ変換した値になります。
 *
 * @param totalPages 総ページ数
 * @param current 現在ページ（0 始まり）
 * @param options 表示調整オプション（window・boundary）
 * @returns 表示要素（{@link PageItem}）の配列
 */
export function pages(
  totalPages: number,
  current: number,
  options: PagesOptions = {},
): PageItem[] {
  const total = Math.trunc(Number(totalPages));
  if (!Number.isFinite(total) || total <= 0) {
    return [];
  }
  const currentPage = Math.min(
    Math.max(Math.trunc(Number(current)) || 0, 0),
    total - 1,
  );
  const windowSize = Math.max(0, Math.trunc(options.window ?? 2));
  const boundarySize = Math.max(0, Math.trunc(options.boundary ?? 1));

  const indices = new Set<number>();
  for (let i = 0; i < boundarySize && i < total; i += 1) {
    indices.add(i);
  }
  for (let i = Math.max(0, total - boundarySize); i < total; i += 1) {
    indices.add(i);
  }
  for (
    let i = Math.max(0, currentPage - windowSize);
    i <= Math.min(total - 1, currentPage + windowSize);
    i += 1
  ) {
    indices.add(i);
  }

  const sorted = Array.from(indices).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous: number | null = null;
  for (const index of sorted) {
    if (previous !== null && index - previous > 1) {
      items.push({page: null, label: '…', active: false, ellipsis: true});
    }
    items.push({
      page: index,
      label: index + 1,
      active: index === currentPage,
      ellipsis: false,
    });
    previous = index;
  }
  return items;
}

/**
 * 式中の予約名前空間 `haori` として公開する組み込みヘルパー集合です。
 */
const Builtins = Object.freeze({date, number, pages, range});

export default Builtins;
