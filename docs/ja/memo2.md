data-bind: データをバインディングする。JSONもしくはリクエストパラメータ形式。先祖エレメントのバインドデータと結合する。

data-if: バインドデータのパラメータや比較式を指定する。評価値がfalseもしくはnullになった場合は当該エレメントは非表示とし、子ノードはDOMから除去される。

data-if-false: data-ifで非表示になった際に付与される。手動で変更しないこと。

data-each: バインドデータのリストパラメータを指定する。中身を複製し表示する。複製された要素には子要素のデータをバインドする。子要素はは一つに限る。

data-each-before: 複製の対象外とし、複製の前に表示する。

data-each-after: 複製の対象外とし、複製の後に表示する。

data-each-arg: 複製された各要素のパラメータ名。

data-each-index: 複製された各要素に追加するインデックスのパラメータ名。インデックス番号が付与される。

data-each-key: 複製の比較用のキーパラメータ名。子要素を一意に識別できるものを指定する。キーが存在しない場合はランダムなUUIDが生成される。

data-row: 複製された行に追加される。属性値は比較用の値とする。手動では変更しないこと。data-each-keyで指定されたキー値が設定される。

data-fetch: 属性値をURLとし、レスポンスを当該エレメントのdata-bind属性に設定する。

data-fetch-method: HTTPメソッド。省略時はGETとする。

data-fetch-content-type: Content-Typeヘッダに指定する値。省略時はメソッドがGET、OPTIONS、HEADの場合はapplication/x-www-form-urlencoded、それ以外の場合はapplication/jsonとする。

data-fetch-headers: リクエストヘッダに設定する値。JSONもしくはリクエストパラメータ形式とする。

data-fetch-data: フェッチパラメータ。フェッチURLが指定されていない場合はレスポンスデータとして利用する。

data-fetch-form: フェッチパラメータを取得するフォームのセレクタ。属性値が省略されている場合は当該エレメントもしくは先祖エレメントのformエレメントを対象とする。フェッチURLが指定されていない場合はレスポンスデータとして利用する。

data-fetch-bind: レスポンスデータをバインドするセレクタ。

data-fetch-arg: レスポンスを設定するパラメータ名。

data-message: フェッチでエラーメッセージが返ってきた場合に対象入力エレメントの親エレメント、もしくはフォームエレメントの属性として追加される。

data-form-arg: フォームの設定値をバインドするパラメータ名。

data-form-object: フォームデータをオブジェクトで入れ子にする場合のパラメータ名。

data-form-list: フォオームデータをリストで入れ子にする場合のパラメータ名。入力エレメントに付与された場合は入力値のリストとし、それ以外の場合はオブジェクトのリストとする。

data-form-detach: フォームのバインドデータを反映させないようにするために指定する。

data-url-param: URLのパラメータをバインドする。

data-url-arg: URLパラメータをバインドするパラメータ名。

## 以下、???の部分には、click、change、loadが入り、それぞれにイベント発生時に動作する。

data-???-validate: フォームバリデーションを行う。バリデーションに成功した場合のみ処理を継続する

data-???-confirm: 確認ダイアログを表示し、OKの場合のみ処理を続行する。

data-???-adjust: CSSセレクタで指定したエレメントのvalue値を変更する。

data-???-adjust-value: value値の増減量。

data-???-row-add: 対象のエレメントが属している行の後ろに新しい行を追加する。

data-???-row-remove: 対象のエレメントが属している行を削除する。

data-???-row-prev: 対象のエレメントが属している行と前の行を入れ替える。

data-???-row-next: 対象のエレメントが属している行と次の行を入れ替える。

data-???-data: フェッチパラメータ。フェッチURLが指定されていない場合はレスポンスデータとして利用する。

data-???-form: フェッチパラメータを取得するフォームのセレクタ。属性値が省略されている場合は当該エレメントもしくは先祖エレメントのformエレメントを対象とする。フェッチURLが指定されていない場合はレスポンスデータとして利用する。

data-???-before-run: スクリプトを実行する。戻り値がfalseの場合は以後の処理を停止する。

data-???-fetch: 属性値をURLとし、レスポンスを当該エレメントのdata-bind属性に設定する。フェッチに成功した場合のみ処理を継続する。

data-???-fetch-method: HTTPメソッド。省略時はGETとする。

data-???-fetch-headers: リクエストヘッダに設定する値。JSONもしくはリクエストパラメータ形式とする。

data-???-fetch-content-type: Content-Typeヘッダに指定する値。省略時はメソッドがGET、OPTIONS、HEADの場合はapplication/x-www-form-urlencoded、それ以外の場合はapplication/jsonとする。

data-???-bind: データをバインドするセレクタ。

data-???-bind-arg: データを設定するパラメータ名。

data-???-bind-params: データのバインド対象となるパラメータ名を&区切りで指定する。

data-???-after-run: 処理が成功した場合にスクリプトを実行する。戻り値がfalseの場合は以後の処理を停止する。

data-???-dialog: 処理が成功した場合にダイアログメッセージを表示する。

data-???-toast: 処理が成功した場合にトースト等のメッセージを表示する。

data-???-reset: CSSセレクタを指定する。対象および含まれるエレメントをリセットする。値の初期化、data-eachによる複製の削除。メッセージの除去。

data-???-click: 処理が成功した場合にクリックされるエレメントのセレクタ。

data-???-refetch: 処理が成功した場合に対象エレメントのdata-fetchを実行する。

data-???-open: 対象のダイアログを成功するとCSSセレクタで指定する。処理が成功した場合にダイアログを開く。

data-???-close: 対象のダイアログを成功するとCSSセレクタで指定する。処理が成功した場合にダイアログを閉じる。

data-???-redirect: 処理が成功した場合に属性値のURLにリダイレクトします。data-???-dialogが存在する場合はダイアログが閉じられてから動作します。

## イベント属性の処理順序

1. data-???-validate: バリデーション実行
2. data-???-confirm: 確認ダイアログ表示
3. data-???-data / data-???-form: データ取得
4. data-???-before-run: フェッチ前スクリプト実行
5. data-???-fetch: HTTP通信実行
6. data-???-after-run: フェッチ後スクリプト実行
7. data-???-bind: データバインド実行
8. data-???-adjust: 値調整実行
9. data-???-row-add / data-???-row-remove / data-???-row-prev / data-???-row-next: 行データの変更
10. data-???-reset: リセット処理実行
11. data-???-refetch: 再フェッチ実行
12. data-???-click: クリック実行
13. data-???-open / data-???-close: ダイアログ操作
14. data-???-dialog / data-???-toast: メッセージ表示
15. data-???-redirect: リダイレクト実行（最後に実行）

## 付録: 実装補足と差分（2025-10-23）

本仕様に基づく実装で、実用上の明確化・堅牢化のために以下の補足と差分を加えています。

- フェッチのペイロード合成（data-???-data / data-???-form）
	- イベント/非イベントともに、フォーム値と `data-*-data` を統合して送信します。
	- HTTP メソッドと Content-Type に応じた組み立て:
		- GET/HEAD/OPTIONS: クエリ文字列に付与（配列は複数付与、オブジェクトは JSON 文字列化）。
		- multipart/form-data: FormData を構築（Content-Type ヘッダは削除しブラウザに委譲）。
		- application/x-www-form-urlencoded: URLSearchParams を構築。
		- 上記以外: application/json を既定とし JSON 文字列化して送信。
	- フェッチ URL が未指定の場合は、統合したデータをそのままレスポンス相当としてバインドに渡します。

- エラーハンドリングと data-message 伝播
	- `response.ok === false` の場合、後続の成功系処理（bind/adjust/row/reset/refetch/click/open/close/dialog/toast/redirect）は実行せず、エラーメッセージを伝播します。
	- JSON 応答の代表的な形式をサポート:
		- `message: string` → 全体メッセージ。
		- `messages: string[]` → 全体メッセージ（複数）。
		- `errors: { [key]: string | string[] }` → キーに一致する入力へメッセージ。
		- その他 `{ key: string | string[] }` 形式にもフォールバックで対応。
	- テキスト応答はそのまま全体メッセージとして扱います。
	- 付与先のルール:
		- 入力項目に紐づくエラーは、該当入力エレメントの「親エレメント」に `data-message` を付与します（フォームグループ等のコンテナ想定）。
		- フォーム全体のメッセージ（`message`/`messages`）は「フォーム要素」自体に付与します（`data-???-form` 指定があればそれを優先）。
		- フォームが特定できない場合は、イベント対象エレメント（発火元）に付与します。

- イベント属性名の正規化
	- 余分なハイフンや名称ぶれを避けるため、内部で `data-???-xxx`/`data-fetch-xxx` の名前組み立てを統一しています。

- バインド先の既定
	- `data-???-fetch`（または `data-fetch`）指定時、`data-???-bind`（`data-fetch-bind`）が無い場合は自要素にバインドします。

- セレクタ省略時の既定対象
	- `data-???-form`・`data-???-reset`・`data-???-refetch`・`data-???-click`・`data-???-open`・`data-???-close` などで属性値が省略された場合、自要素（form は自要素または先祖の form）を対象とします。

- 実行順序の明確化
	- 仕様の順序に準拠: validate → confirm → data/form → before-run → fetch → after-run → bind → adjust → row 操作 → reset → refetch → click → open/close → dialog/toast → redirect（`dialog` がある場合、その完了後に `redirect`）。

- 行操作の安全化
	- `data-???-row-*` 実行時に対象行が特定できない場合はログ出力のうえ安全に中断します。

- if 文の波括弧強制
	- プロジェクトの ESLint 設定を `curly: ['error','all']` に変更し、if/else/for/while など全てで `{}` を必須化しています。

- 既知事項（reset と each の複製）
	- `data-???-reset` 実行時の `data-each` 複製除去は、`Core.evaluateAll` による再評価で原則元の状態に戻る想定です。要件により不足がある場合は、明示的な複製除去処理の追加を検討してください。

- 互換性に関する注記
	- `ProcedureOptions.targetFragment` は、非行操作のユースを考慮して任意化しています（行操作時は内部で存在チェックを行います）。

- 品質ゲートの結果
	- TypeScript 型チェック: PASS / Lint: PASS / テスト: PASS（現時点 45 tests）。

— 追加補足（before-run / after-run の戻り値と停止条件）

- before-run / after-run の戻り値の扱い
	- `false` または `{ stop: true }` を返した場合、以後の処理（フェッチや成功系フロー）を直ちに停止します。
	- before-run は `{ fetchUrl, fetchOptions }` を返すことでフェッチ設定を上書き可能です（例: URL の差し替え）。
	- after-run は `{ response }` を返すことで以降のバインド対象レスポンスを差し替え可能です。
	- フェッチがエラー（`response.ok === false`）の場合、after-run は実行されません（エラーメッセージ伝播のみ）。

— 追加補足（data-message の付与ルール）

- 目的
	- サーバー応答のエラーやメッセージを UI に一貫して表示するための配置規則を定義します。

- 宛先の決定
	- 入力項目エラー（`errors: { [key]: string | string[] }` など）
		- `key` と一致する入力エレメント（例: `name` 等）を探索し、その「親エレメント」に `data-message` を付与します。
	- フォーム全体のメッセージ（`message` / `messages`）
		- 対象フォーム（`data-???-form` 指定、または発火元の先祖の form）に `data-message` を付与します。
		- フォームが見つからない場合は、発火元エレメントに付与します。

- 値の扱い
	- 文字列はそのまま属性値として設定します。
	- 配列（`messages` や `errors[key]` が配列）の場合は、要素を連結して 1 つの属性値として保持します（表示方式は実装/スタイルで調整）。

- クリアのタイミング
	- `data-???-reset` 実行時に、対象および配下の `data-message` を除去します（値初期化や `data-each` 複製削除と同時に実行）。
	- 新たなエラー伝播時は、同一箇所の既存メッセージを置き換えます。
	- フェッチが成功しても自動ではクリアしません。必要に応じて `data-???-reset` を併用してください。

- 推奨（スタイル/アクセシビリティ）
	- 親エレメントに `data-message` が付与された際に表示されるエラースタイルを用意してください。
	- ライブ領域（`aria-live`）や関連付け（`aria-describedby` など）の採用を検討してください。

— 追加補足（fetch のバインド引数）

- 非イベントの `data-fetch-arg`
	- 非イベント属性（`data-fetch`）で取得したレスポンスをバインドする際、`data-fetch-arg` が指定されていれば、`{ [arg]: response }` の形にラップしてバインドします。
	- 例: `data-fetch-arg="result"` の場合、`{ result: <レスポンス> }` がバインド対象になります。
	- ミニ例:
		```
		<div data-fetch="/api/user" data-fetch-arg="user">
		  名前: {{user.name}}
		</div>
		```
		レスポンスが `{ "name": "Taro" }` の場合、テキストは「名前: Taro」と表示されます。

- イベント属性側の `data-???-bind-arg`
	- イベント版（`data-???-fetch` と組み合わせ）では `data-???-bind-arg` を使用します。意味は上記と同じで、レスポンスを `{ [arg]: response }` に整形してからバインドします。
	- ミニ例:
		```
		<button
		  data-click-fetch="/api/user"
		  data-click-bind="#userView"
		  data-click-bind-arg="user"
		>
		  取得
		</button>
		<div id="userView">
		  {{user.name}}
		</div>
		```
		クリック後、レスポンスが `{ "name": "Taro" }` なら `#userView` に「Taro」が表示されます。

— 追加補足（each の引数・キー・インデックス）

- data-each-arg（各アイテムのバインド名）
	- `data-each-arg` は「複製された各要素のパラメータ名」です。
	- each のリストがプリミティブ値（文字列/数値など）の場合、`data-each-arg` は必須です。未指定の場合はエラーとなります。
	- each のリストがオブジェクトの場合は、オブジェクトのキーがそのままバインドされます（`data-each-arg` を指定した場合は `{ [arg]: オブジェクト }` の形に入れ子化）。
	- ミニ例（プリミティブ配列）:
		```
		<div data-each='["A","B"]' data-each-arg="item">
		  <span>{{item}}</span>
		</div>
		```
		→ `<span>A</span><span>B</span>` を生成。

- data-each-key（差分・一意性のためのキー）
	- `data-each-key` は差分更新やノード再利用のための比較キーです。バインド名には影響しません。
	- 指定されたキーが無い/未定義の場合はランダムな UUID が生成されます。
	- ミニ例（オブジェクト配列 + 安定キー）:
		```
		<ul data-each='[{"id":1,"name":"A"},{"id":2,"name":"B"}]' data-each-key="id">
		  <li>{{name}}</li>
		</ul>
		```

- data-each-index（インデックスのキー名）
	- `data-each-index` を指定すると、各要素のバインドデータへインデックス番号がそのキー名で付与されます。
	- ミニ例（インデックス付与）:
		```
		<ul data-each='[{"name":"A"},{"name":"B"}]' data-each-index="i">
		  <li>{{i}}: {{name}}</li>
		</ul>
		```
		→ `<li>0: A</li><li>1: B</li>` を生成。

— 実装注記（each の挿入順の安定化）

- `data-each` による複製挿入は、DOM 反映を逐次的に行うことで順序と一貫性を保証しています（オブザーバーの無限ループ回避フラグと協調するため）。API/仕様の変更はありませんが、描画が大きい場合でも順序は決定的です。

