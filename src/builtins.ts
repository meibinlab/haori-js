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
 * 年月日時分秒の整数から date() のフォーマット用トークンを生成します。
 *
 * @param year 年（西暦）
 * @param month 月（1〜12）
 * @param day 日（1〜31）
 * @param hour 時（0〜23）
 * @param minute 分（0〜59）
 * @param second 秒（0〜59）
 * @returns トークン名から置換文字列へのマップ
 */
function buildDateTokens(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Record<string, string> {
  return {
    yyyy: String(year).padStart(4, '0'),
    yy: pad2(year % 100),
    MM: pad2(month),
    M: String(month),
    dd: pad2(day),
    d: String(day),
    HH: pad2(hour),
    H: String(hour),
    mm: pad2(minute),
    ss: pad2(second),
  };
}

/**
 * 指定タイムゾーンでの年月日時分秒を求め、date() 用トークンを生成します。
 *
 * `Intl.DateTimeFormat` の `formatToParts` で対象タイムゾーンの各要素を取り出し、
 * 24 時間表記（`h23`）で整形します。タイムゾーン名が不正で `Intl.DateTimeFormat`
 * が例外を投げる場合や、要素を取得できない場合は null を返します。
 *
 * @param parsed 対象の日時
 * @param timeZone IANA タイムゾーン名（例 `Asia/Tokyo`）
 * @returns date() 用トークン。整形できない場合は null
 */
function resolveZonedTokens(
  parsed: Date,
  timeZone: string,
): Record<string, string> | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    parts = formatter.formatToParts(parsed);
  } catch {
    // 不正なタイムゾーン名（RangeError）など。
    return null;
  }
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }
  return buildDateTokens(year, month, day, hour, minute, second);
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
 * 解釈は既定でブラウザのローカルタイムゾーンで行います。`timeZone` を指定した場合は
 * その IANA タイムゾーン（例 `Asia/Tokyo`）での時刻として整形します。空・null・
 * 不正な日時は空文字を返します。`timeZone` が不正な名前の場合も空文字を返します。
 * 利用できるトークン: `yyyy`（4桁年）`yy`（2桁年）`MM`/`M`（月）`dd`/`d`（日）
 * `HH`/`H`（時・24時間）`mm`（分）`ss`（秒）。`/ : - ` や日本語など、これらの
 * トークンに該当しない文字はそのまま出力されます。`y M d H m s` などトークンに使う
 * 英字をそのまま出したい場合はシングルクォートで囲みます（例 `'T'`）。`''`（連続する
 * シングルクォート2つ）はリテラルのシングルクォート1文字になります（例 `HH'h'mm`
 * → `09h05`）。
 *
 * @param value 整形対象の日時（ISO 文字列・エポックミリ秒・Date）
 * @param format フォーマット文字列（省略時は `yyyy/MM/dd HH:mm`）
 * @param timeZone IANA タイムゾーン名（例 `Asia/Tokyo`）。省略時はローカルタイムゾーン
 * @returns 整形済み文字列。整形できない場合は空文字
 */
export function date(
  value: string | number | Date | null | undefined,
  format: string = DEFAULT_DATE_FORMAT,
  timeZone?: string,
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  let tokens: Record<string, string> | null;
  if (typeof timeZone === 'string' && timeZone.trim() !== '') {
    tokens = resolveZonedTokens(parsed, timeZone.trim());
    if (tokens === null) {
      // 不正なタイムゾーン名は整形不能として空文字を返す。
      return '';
    }
  } else {
    tokens = buildDateTokens(
      parsed.getFullYear(),
      parsed.getMonth() + 1,
      parsed.getDate(),
      parsed.getHours(),
      parsed.getMinutes(),
      parsed.getSeconds(),
    );
  }
  const resolvedTokens = tokens;
  // 先頭の `'...'` はリテラルとして取り出し、トークン置換から除外する（`''` は ' 1文字）。
  // 長いトークンを先に並べ、`yyyy` が `yy` より、`MM` が `M` より優先されるようにする。
  return format.replace(
    /'([^']*)'|yyyy|yy|MM|dd|HH|mm|ss|M|d|H/g,
    (matched, literal: string | undefined) => {
      if (literal !== undefined) {
        return literal === '' ? '\'' : literal;
      }
      return resolvedTokens[matched];
    },
  );
}

/**
 * 数値を桁区切り・小数桁付きの文字列へ整形します。
 *
 * 桁区切りは常に有効で、`en-US` ロケール（カンマ区切り・ドット小数）で出力します。
 * `en-US` は区切り文字を決めるだけで小数桁は固定しません。数値文字列も受け付け（前後の
 * 空白は無視）、null・空文字・空白のみ・数値に変換できない値は空文字を返します。
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
  if (value === null || value === undefined) {
    return '';
  }
  let numeric: number;
  if (typeof value === 'number') {
    numeric = value;
  } else {
    // 文字列は前後の空白を無視する。空文字・空白のみは数値として扱わない
    const trimmed = String(value).trim();
    if (trimmed === '') {
      return '';
    }
    numeric = Number(trimmed);
  }
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
      if (index - previous === 2) {
        // 隠れるのが 1 ページだけなら、省略記号ではなくその番号を表示する
        const middle = previous + 1;
        items.push({
          page: middle,
          label: middle + 1,
          active: middle === currentPage,
          ellipsis: false,
        });
      } else {
        items.push({page: null, label: '…', active: false, ellipsis: true});
      }
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

/** `YYYY-MM` 形式の年月文字列を判定する正規表現 */
const MONTH_PATTERN = /^(\d{4})-(\d{1,2})$/;

/** monthRange() が一度に生成する要素数の上限（暴走防止・約100年分） */
const MONTH_RANGE_MAX_LENGTH = 1200;

/**
 * `monthRange()` が返す1要素分の情報です。
 */
export interface MonthItem {
  /** 年月（`YYYY-MM` 形式） */
  targetMonth: string;

  /** 表示用ラベル（`YYYY/MM` 形式） */
  label: string;
}

/**
 * `pageSummary()` が返すページ表示サマリーです。
 */
export interface PageSummary {
  /** 表示中の先頭要素の通し番号（1 始まり）。0 件のときは 0 */
  start: number;

  /** 表示中の末尾要素の通し番号（1 始まり）。0 件のときは 0 */
  end: number;

  /** 総件数 */
  total: number;

  /** 総件数が 0 のとき true */
  empty: boolean;
}

/**
 * 値を有限な整数へ変換します。変換できない場合は既定値を返します。
 *
 * @param value 変換対象の値
 * @param fallback 変換できない場合の既定値
 * @returns 変換後の整数または既定値
 */
function toFiniteInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

/**
 * `YYYY-MM` 形式の年月文字列に月数を加算して `YYYY-MM` 形式で返します。
 *
 * 日付オブジェクトを介さず整数演算で計算するため、タイムゾーンの影響を受けません。
 * `value` が `YYYY-MM` 形式でない・月が 1〜12 の範囲外の場合は空文字を返します。
 * `delta` が 0 のときは入力月を正規化（ゼロ埋め）して返します。
 *
 * @param value 基準となる年月（`YYYY-MM` 形式）
 * @param delta 加算する月数（負数で過去方向）
 * @returns 加算後の年月（`YYYY-MM` 形式）。不正な入力は空文字
 */
export function monthAdd(
  value: string | null | undefined,
  delta: number,
): string {
  if (typeof value !== 'string') {
    return '';
  }
  const matched = MONTH_PATTERN.exec(value.trim());
  if (!matched) {
    return '';
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (month < 1 || month > 12) {
    return '';
  }
  const offset = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  // 0 始まりの月インデックス（year*12 + month-1）で計算してから戻す
  const total = year * 12 + (month - 1) + offset;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12 + 1;
  return `${String(newYear).padStart(4, '0')}-${pad2(newMonth)}`;
}

/**
 * 基準月を `YYYY-MM` 形式で解決します。
 *
 * `base` が指定されていればそれを正規化し、省略時は現在月（ローカル時刻）を返します。
 *
 * @param base 基準月（`YYYY-MM` 形式、省略可）
 * @returns 正規化した基準月。`base` が不正なら空文字
 */
function resolveBaseMonth(base?: string): string {
  if (typeof base === 'string' && base.trim() !== '') {
    return monthAdd(base, 0);
  }
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, '0');
  return `${year}-${pad2(now.getMonth() + 1)}`;
}

/**
 * 基準月から過去方向へ `count + 1` 個の年月配列を降順（新しい月が先頭）で返します。
 *
 * 月セレクトや月次ナビゲーションの選択肢生成に利用できます。各要素は
 * `targetMonth`（`YYYY-MM`）と表示用 `label`（`YYYY/MM`）を持ちます。
 *
 * 注意: `base` を省略すると現在月に依存するため、同じ呼び出しでも月をまたぐと
 * 結果が変わります（他の組み込みヘルパーの冪等性とは異なります）。再評価で結果を
 * 固定したい場合は `base` を明示してください。
 *
 * @param count 基準月から遡る月数（戻り値の要素数は `count + 1`）
 * @param base 基準月（`YYYY-MM` 形式、省略時は現在月）
 * @returns 年月情報（{@link MonthItem}）の降順配列。不正な入力は空配列
 */
export function monthRange(count: number, base?: string): MonthItem[] {
  const total = Math.trunc(Number(count));
  if (!Number.isFinite(total) || total < 0) {
    return [];
  }
  const baseMonth = resolveBaseMonth(base);
  if (baseMonth === '') {
    return [];
  }
  const length = Math.min(total, MONTH_RANGE_MAX_LENGTH);
  const items: MonthItem[] = [];
  for (let i = 0; i <= length; i += 1) {
    const targetMonth = monthAdd(baseMonth, -i);
    items.push({targetMonth, label: targetMonth.replace(/-/g, '/')});
  }
  return items;
}

/**
 * ページレスポンスから表示用サマリー（`1 - 20 / 100 件` の算出元）を作ります。
 *
 * Spring Data の `Page` 相当（`number`・`size`・`totalElements`／`totalCount`）を
 * 受け取り、表示中の先頭・末尾の通し番号と総件数を計算します。`number` は 0 始まりの
 * ページ番号を想定します。末尾ページで端数になる場合の `end` 計算には、`visibleCount`
 * （指定時）→ `page.numberOfElements` → `size` の順で表示件数を採用します。
 *
 * @param page ページ情報（`number`・`size`・`totalElements`／`totalCount` 等）
 * @param visibleCount 現在表示している件数（省略可）
 * @returns 表示サマリー（{@link PageSummary}）
 */
export function pageSummary(
  page: Record<string, unknown> | null | undefined,
  visibleCount?: number,
): PageSummary {
  const emptyResult: PageSummary = {start: 0, end: 0, total: 0, empty: true};
  if (!page || typeof page !== 'object') {
    return emptyResult;
  }
  const source = page as Record<string, unknown>;
  const total = toFiniteInt(
    source.totalElements ?? source.totalCount,
    0,
  );
  if (total <= 0) {
    return emptyResult;
  }
  const number = Math.max(0, toFiniteInt(source.number, 0));
  const size = Math.max(0, toFiniteInt(source.size, 0));
  const offset = number * size;
  const start = Math.min(offset + 1, total);
  let visible: number;
  if (visibleCount !== undefined && Number.isFinite(visibleCount)) {
    visible = Math.max(0, Math.trunc(visibleCount));
  } else {
    const numberOfElements = toFiniteInt(source.numberOfElements, NaN);
    visible = Number.isFinite(numberOfElements)
      ? numberOfElements
      : Math.min(size, total - offset);
  }
  const end = Math.min(offset + visible, total);
  return {start, end: Math.max(end, start), total, empty: false};
}

/**
 * 配列から `item[key]` が指定値に一致する最初の要素を返します。
 *
 * 比較は文字列化して行うため、数値 ID と文字列 ID のような型差は吸収されます
 * （例 `findBy(items, 'id', 3)` は `id` が `'3'` の要素にも一致）。一致する要素が
 * 無い場合は `null` を返します。先頭要素をフォールバックにしたい場合は式側で
 * `haori.findBy(items, 'id', sel) ?? items[0]` のように書きます。
 *
 * @param array 検索対象の配列
 * @param key 比較に使うプロパティ名
 * @param value 一致させたい値（文字列化して比較）
 * @returns 一致した最初の要素。無ければ null（非配列・空配列も null）
 */
export function findBy(
  array: unknown,
  key: string,
  value: unknown,
): unknown {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  const target = String(value);
  const found = array.find(
    item =>
      item !== null &&
      item !== undefined &&
      String((item as Record<string, unknown>)[key]) === target,
  );
  return found === undefined ? null : found;
}

/**
 * 配列の数値合計を求めます。集計テーブルの合計行などを式で宣言的に書くための
 * ヘルパーです。
 *
 * `key` を省略すると要素自体を数値として合計し、`key` を指定すると各要素の
 * `item[key]` を合計します。数値に変換できない値（`null`・`undefined`・空文字・
 * 非数値文字列・`NaN`）は無視します。文字列の数値（例 `'12'`）は数値として扱います。
 * 非配列を渡した場合は `0` を返します。
 *
 * @param array 集計対象の配列
 * @param key 合計するプロパティ名（省略時は要素自体を合計）
 * @returns 数値の合計。対象が無ければ 0
 */
export function sum(array: unknown, key?: string): number {
  if (!Array.isArray(array)) {
    return 0;
  }
  let total = 0;
  for (const item of array) {
    const raw =
      key === undefined || key === null
        ? item
        : item === null || item === undefined
          ? undefined
          : (item as Record<string, unknown>)[key];
    if (raw === null || raw === undefined || raw === '') {
      continue;
    }
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isNaN(numeric)) {
      total += numeric;
    }
  }
  return total;
}

/**
 * 要素から重複排除・グルーピングに用いる比較キー文字列を求めます。
 *
 * `key` 省略時は要素自体を、指定時は `item[key]` を文字列化します。`findBy`・`sum`
 * と同様に文字列化して比較するため、数値と数値文字列（例 `3` と `'3'`）の差を
 * 吸収します。要素が `null`・`undefined` の場合はそれ自体を文字列化します。
 *
 * @param item 対象要素
 * @param key 比較に使うプロパティ名（省略時は要素自体）
 * @returns 比較キー文字列
 */
function toGroupingKey(item: unknown, key?: string): string {
  if (key === undefined || key === null) {
    return String(item);
  }
  if (item === null || item === undefined) {
    return String(item);
  }
  return String((item as Record<string, unknown>)[key]);
}

/**
 * 配列から重複を取り除いた新しい配列を返します。
 *
 * `key` 省略時は要素自体で、指定時は `item[key]` で重複を判定します。比較は
 * `findBy`・`sum` と同様に**文字列化**して行うため、数値 ID と文字列 ID の差を
 * 吸収します（例 `1` と `'1'` は同一とみなす）。同じキーの要素は**最初に出現した
 * ものだけ**を残し、元の順序を保ちます。非配列を渡した場合は空配列を返します。
 *
 * 明細単位のレスポンスを「1 件 = 1 行」にまとめる用途を想定しています
 * （例 `data-each="haori.distinct(rows, 'orderId')"`）。
 *
 * @param array 対象の配列
 * @param key 重複判定に使うプロパティ名（省略時は要素自体）
 * @returns 重複排除後の新しい配列。非配列は空配列
 */
export function distinct(array: unknown, key?: string): unknown[] {
  if (!Array.isArray(array)) {
    return [];
  }
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of array) {
    const groupingKey = toGroupingKey(item, key);
    if (seen.has(groupingKey)) {
      continue;
    }
    seen.add(groupingKey);
    result.push(item);
  }
  return result;
}

/**
 * `groupBy()` が返す 1 グループ分の情報です。
 */
export interface GroupItem {
  /** グループのキー（最初に出現した要素の `item[key]` の生値） */
  key: unknown;

  /** そのグループに属する要素（元の順序を保つ） */
  items: unknown[];
}

/**
 * 配列を `item[key]` ごとのグループへ分けて返します。
 *
 * 戻り値は `{key, items}` の配列で、`data-each` で繰り返してグループ見出しと
 * 明細を宣言的に描画できます（例 外側 `data-each="haori.groupBy(rows, 'date')"`、
 * 内側 `data-each="items"`）。グループは**最初に出現した順序**で並び、各
 * グループ内の要素も元の順序を保ちます。グループの判定は `findBy`・`sum` と同様に
 * **文字列化**して行いますが、`key` には最初に出現した要素の**生値**を格納します。
 * 非配列を渡した場合は空配列を返します。
 *
 * @param array 対象の配列
 * @param key グループ分けに使うプロパティ名
 * @returns グループ情報（{@link GroupItem}）の配列。非配列は空配列
 */
export function groupBy(array: unknown, key: string): GroupItem[] {
  if (!Array.isArray(array)) {
    return [];
  }
  const indexByKey = new Map<string, number>();
  const groups: GroupItem[] = [];
  for (const item of array) {
    const groupingKey = toGroupingKey(item, key);
    const existingIndex = indexByKey.get(groupingKey);
    if (existingIndex === undefined) {
      const rawKey =
        item === null || item === undefined
          ? item
          : (item as Record<string, unknown>)[key];
      indexByKey.set(groupingKey, groups.length);
      groups.push({key: rawKey, items: [item]});
    } else {
      groups[existingIndex].items.push(item);
    }
  }
  return groups;
}

/**
 * 式中の予約名前空間 `haori` として公開する組み込みヘルパー集合です。
 */
const Builtins = Object.freeze({
  date,
  number,
  pages,
  range,
  monthAdd,
  monthRange,
  pageSummary,
  findBy,
  sum,
  distinct,
  groupBy,
});

export default Builtins;
