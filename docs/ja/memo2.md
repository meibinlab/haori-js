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

## 以下、???の部分には、click、change、load、scrollが入り、それぞれにイベント発生時に動作する。

data-???-validate: フォームバリデーションを行う。バリデーションに成功した場合のみ処理を継続する

data-???-confirm: 確認ダイアログを表示し、OKの場合のみ処理を続行する。

data-???-adjust: CSSセレクタで指定したエレメントのvalue値を変更する。

data-???-adjust-vaelu: value値の増減量。

data-???-data: フェッチパラメータ。フェッチURLが指定されていない場合はレスポンスデータとして利用する。

data-???-form: フェッチパラメータを取得するフォームのセレクタ。属性値が省略されている場合は当該エレメントもしくは先祖エレメントのformエレメントを対象とする。フェッチURLが指定されていない場合はレスポンスデータとして利用する。

data-???-fetch: 属性値をURLとし、レスポンスを当該エレメントのdata-bind属性に設定する。フェッチに成功した場合のみ処理を継続する。

data-???-fetch-method: HTTPメソッド。省略時はGETとする。

data-???-fetch-content-type: Content-Typeヘッダに指定する値。省略時はメソッドがGET、OPTIONS、HEADの場合はapplication/x-www-form-urlencoded、それ以外の場合はapplication/jsonとする。

data-???-fetch-headers: リクエストヘッダに設定する値。JSONもしくはリクエストパラメータ形式とする。

data-???-bind: データをバインドするセレクタ。

data-???-bind-arg: データを設定するパラメータ名。

data-???-bind-params: データのバインド対象となるパラメータ名を&区切りで指定する。

data-???-alert: 処理が成功した場合にアラートメッセージを表示する。

data-???-message: 処理が成功した場合にトースト等のメッセージを表示する。

data-???-reset: CSSセレクタを指定する。対象および含まれるエレメントをリセットする。値の初期化、data-eachによる複製の削除。メッセージの除去。

data-???-reset-params: リセット対象のパラメータを&区切りで指定する。

data-???-click: 処理が成功した場合にクリックされるエレメントのセレクタ。

data-???-refetch: 処理が成功した場合に対象エレメントのdata-fetchを実行する。

data-???-open: 対象のダイアログを成功するとCSSセレクタで指定する。処理が成功した場合にダイアログを開く。

data-???-close: 対象のダイアログを成功するとCSSセレクタで指定する。処理が成功した場合にダイアログを閉じる。

data-???-redirect: 処理が成功した場合に属性値のURLにリダイレクトします。data-???-alertが存在する場合はアラートが閉じられてから動作します。

## イベント属性の処理順序

1. data-???-validate: バリデーション実行
2. data-???-confirm: 確認ダイアログ表示
3. data-???-data / data-???-form: データ取得
4. data-???-fetch: HTTP通信実行
5. data-???-bind: データバインド実行
6. data-???-adjust: 値調整実行
7. data-???-reset: リセット処理実行
8. data-???-refetch: 再フェッチ実行
9. data-???-click: クリック実行
10. data-???-open / data-???-close: ダイアログ操作
11. data-???-alert / data-???-message: メッセージ表示
12. data-???-redirect: リダイレクト実行（最後に実行）
