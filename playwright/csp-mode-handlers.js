/* global Haori */
// CSP モードの E2E で、run 系の宣言から呼ぶ関数を登録する。インラインの
// <script> は CSP（script-src 'self'）で止まるため、別のファイルに置く。
Haori.handlers.register('pick', function (event, id, name) {
  document.getElementById('picked').textContent = `${id}:${name}`;
});
Haori.handlers.register('record', function (value) {
  document.getElementById('recorded').textContent = value;
});
