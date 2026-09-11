/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, URL, window, document, Event */
// data-external の配下で外部ライブラリが生成した DOM が、登録の置き場所・要素の
// 移動・付け直しによらずフォーム値の収集に載らないこと、書いた入力は収集され続ける
// ことの実ブラウザ確認（課題 #42・#43）。単体の `tests/enhance-register-before-scan.test.ts`
// と `tests/external-subtree-lifecycle.test.ts` と同じ観点を、実物の初期表示（初期化の
// 最後の全要素の走査を含む）で確かめる（`docs/ja/外部管理サブツリーの設計書.md` の
// テスト計画 P1〜P3）。
//
// 修正前（0.48.0）に落ちるのは 19 件のうち 11 件: P1 の <body>、P2 の「destroy で DOM を
// 戻す連携」の同じタスク内の移動 4 件と「destroy の無い連携」の data-external の要素の
// 移動・付け直し 4 件、P3 の <head>、P6。残る 8 件は、同じ規則を破りうる入口を網にする
// ための見張りで、修正前も通る（回帰テストの件数には数えない）。P4・P5 は、初期スキャン中
// の取り込みを絞る前の途中の実装で落ちることを確認した見張り。
//
// 期待値の根拠は仕様「`data-external`」「`data-enhance`」「`haori:ready`」。
const {test, expect} = require('@playwright/test');

/**
 * ページを開き、送信を捕まえる準備をします。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {Record<string, string>} params クエリ（reg: head|body、destroy: restore|none、compact: 0|1）
 * @returns {Promise<{requests: string[]}>} 受け取った送信の URL の収集先
 */
async function open(page, params) {
  const requests = [];
  await page.route('**/api/*.json**', async route => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
  await page.goto(
    '/playwright/external-subtree-repro.html?' + new URLSearchParams(params),
  );
  await page.waitForSelector('body[data-haori-ready]');
  return {requests};
}

/**
 * 送信ボタンを押し、送られたクエリを返します。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {string[]} requests 送信の URL の収集先
 * @param {string} button 押すボタンのセレクタ
 * @returns {Promise<URLSearchParams>} 送られたクエリ
 */
async function send(page, requests, button) {
  const before = requests.length;
  await page.click(button);
  await expect.poll(() => requests.length).toBe(before + 1);
  return new URL(requests[requests.length - 1]).searchParams;
}

/** 移動の操作。いずれも利用側スクリプトが実際に行える DOM 操作で起こす。 */
const MOVES = [
  {
    label: 'data-external の要素を同じタスク内で移動する',
    run: () => {
      document
        .getElementById('slot')
        .appendChild(document.getElementById('ext'));
    },
  },
  {
    label: 'フォーム全体を同じタスク内で移動する',
    run: () => {
      document
        .getElementById('park')
        .appendChild(document.getElementById('f1'));
    },
  },
  {
    label: 'data-external の要素を外し、別のタスクで付け直す',
    run: () =>
      new Promise(resolve => {
        const ext = document.getElementById('ext');
        const parent = ext.parentNode;
        ext.remove();
        setTimeout(() => {
          parent.appendChild(ext);
          resolve();
        }, 80);
      }),
  },
];

test.describe('data-external の配下の生成 DOM（実ブラウザ）', () => {
  for (const reg of ['body', 'head']) {
    test(`P1 <${reg}> 内で登録しても生成した入力は収集されず、行は 1 回ずつ初期化される`, async ({
      page,
    }) => {
      const {requests} = await open(page, {reg, destroy: 'restore'});

      // 仕様「`data-external`」の「配下で、Haori が走査した時点に無かった DOM … は、
      // フォーム値の収集を含め Haori の管理に入らない」「この扱いは、
      // `Haori.enhancers.register()` を置く場所 … では変わらない」。
      const query1 = await send(page, requests, '#send1');
      expect(query1.get('keep')).toBe('1');
      expect(query1.get('plan')).toBe('p1');
      expect(query1.has('search_terms')).toBe(false);

      const query2 = await send(page, requests, '#send2');
      expect(query2.get('rowplan')).toBe('x');
      expect(query2.has('search_terms')).toBe(false);

      // 仕様「`data-enhance`」の「適用は**要素ごと・名前ごとに一度だけ**です」。
      // 行ごとに生成コンテナが 1 つだけ（雛形に焼き込まれて二重に包まれない）。
      const wrappersPerRow = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#rows > .row')).map(
          row => row.querySelectorAll('.choices').length,
        ),
      );
      expect(wrappersPerRow).toEqual([1, 1]);
    });
  }

  for (const restores of [true, false]) {
    for (const compact of [false, true]) {
      for (const move of MOVES) {
        const variant =
          `${restores ? 'destroy で DOM を戻す連携' : 'destroy の無い連携'}・` +
          `${compact ? '空白ノードなし' : '空白ノードあり'}`;
        test(`P2 ${variant}: ${move.label}と、書いた入力は収集され生成した入力は載らない`, async ({
          page,
        }) => {
          const {requests} = await open(page, {
            reg: 'head',
            destroy: restores ? 'restore' : 'none',
            compact: compact ? '1' : '0',
          });
          const eventsBefore = await page.evaluate(
            () => window.__events.length,
          );

          await page.evaluate(move.run);

          // 仕様「`data-enhance`」の契機の表（DOM から外れたときは destroy、後から
          // 追加されたノードは init）と「`data-external` の要素ごと移動した場合も、
          // … `destroy` の後に `init` が呼ばれます」。destroy の無い連携では init だけ。
          const expectedEvents = restores ? ['destroy', 'init'] : ['init'];
          await expect
            .poll(() =>
              page.evaluate(
                count => window.__events.slice(count),
                eventsBefore,
              ),
            )
            .toEqual(expectedEvents);

          // 仕様「`data-external`」の「`data-external` の要素ごと移動しても、配下の
          // 書いた要素は移動の後も収集する」「付け直した場合も、配下は走査した時点の
          // 構成のまま扱う」。
          const query = await send(page, requests, '#send1');
          expect(query.get('keep')).toBe('1');
          expect(query.get('plan')).toBe('p1');
          expect(query.has('search_terms')).toBe(false);
        });
      }
    }
  }

  for (const reg of ['body', 'head']) {
    test(`P3 <${reg}> 内で登録した連携が init で生成した宣言は、初期化の完了時点で処理済み`, async ({
      page,
    }) => {
      await open(page, {reg, destroy: 'restore'});

      // 仕様「`data-enhance`」の「連携の呼び出し … が `data-external` の外で起こした
      // DOM の変更 … は、初期スキャンの途中でも、後から追加されたノードと同じく
      // 取り込みます。取り込んだ宣言の処理は、初期化の完了 … より前に終わります」。
      // 仕様「`haori:ready`」の発火の時点で控えた値を見る。
      const atReady = await page.evaluate(() => window.__declAtReady);
      expect(atReady).toBe('2');
    });
  }

  test('P4 data-external なしで要素を動かすライブラリでも、初期表示で書いた要素は DOM に残る', async ({
    page,
  }) => {
    await page.goto('/playwright/external-subtree-mover-repro.html');
    await page.waitForSelector('body[data-haori-ready]', {state: 'attached'});

    // 仕様「`data-enhance`」の「ただし、既にある要素の取り外しと、既にある要素を
    // 生成した要素で包むことは、初期スキャンの途中では取り込みません（DOM を動かす
    // ライブラリを `data-external` なしで使った場合でも、初期表示で要素を失ったり値を二重に
    // 収集したりしないため）」。
    await expect(page.locator('select[name="plan"]')).toHaveCount(1);
    const counts = await page.evaluate(() => window.__counts);
    expect(counts).toEqual({init: 1, destroy: 0});
  });

  test('P5 data-external なしで既存の入力欄を包む連携でも、初期表示で data-form-list の値は一度だけ送信される', async ({
    page,
  }) => {
    const requests = [];
    await page.route('**/api/*.json**', async route => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.goto('/playwright/external-subtree-wrap-repro.html');
    await page.waitForSelector('body[data-haori-ready]', {state: 'attached'});

    // 仕様「`data-enhance`」の「ただし、既にある要素の取り外しと、既にある要素を
    // 生成した要素で包むことは、初期スキャンの途中では取り込みません」と、
    // 仕様「`data-form-list`」の「入力要素に付与した場合は値の配列になります」。
    const query = await send(page, requests, '#send');
    expect(query.getAll('tags')).toEqual(['x', 'y']);
  });

  test('P6 data-external の中で data-each が選択肢を描く select を移動しても、選択した値は送信され、選択肢は配列に追随する', async ({
    page,
  }) => {
    const requests = [];
    await page.route('**/api/*.json**', async route => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.goto('/playwright/external-subtree-each-repro.html');
    await page.waitForSelector('body[data-haori-ready]', {state: 'attached'});

    await page.evaluate(() => {
      const select = document.querySelector('select[name="plan"]');
      select.options[1].selected = true;
      select.dispatchEvent(new Event('change', {bubbles: true}));
    });
    await page.evaluate(() => {
      document
        .getElementById('slot')
        .appendChild(document.getElementById('ext'));
    });
    // 仕様「`data-enhance`」の「`data-external` の要素ごと移動した場合も、… `destroy`
    // の後に `init` が呼ばれます」。
    await expect
      .poll(() => page.evaluate(() => window.__events.join(',')))
      .toBe('init,destroy,init');

    // 仕様「`data-external`」の「選択結果は `<select multiple>` の配列値としてフォーム
    // 送信値（`data-click-form` 等）に反映されます」と、同じ節の「`data-external` の
    // 要素ごと移動しても、配下の書いた要素は移動の後も収集する」。
    const query = await send(page, requests, '#send');
    expect(query.getAll('plan')).toEqual(['b']);
    expect(query.has('search_terms')).toBe(false);

    await page.evaluate(() => {
      document.getElementById('f1').setAttribute(
        'data-bind',
        JSON.stringify({
          plans: [
            {id: 'a', name: 'A'},
            {id: 'b', name: 'B'},
            {id: 'c', name: 'C'},
          ],
        }),
      );
    });
    // 仕様「`data-each`」の「最初の子要素がテンプレートとして配列の要素数ぶん複製
    // されます」。移動の後も、選択肢は配列に追随する。
    await expect(page.locator('select[name="plan"] option')).toHaveCount(3);
  });
});
