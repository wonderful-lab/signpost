# Signpost

施設サイネージ向けのダッシュボード。Googleカレンダー（公開カレンダー）を
DAKboard と同じ方式で表示する: 取得はサーバー側（GitHub Actions）が担い、
表示ページは静的なビューアに徹する。

## 仕組み

1. GitHub Actions（`update-calendar.yml`）が1時間ごとにカレンダーの
   iCal フィードを取得し、`events.json` に変換してコミットする
2. GitHub Pages のページ（`index.html`）は `events.json` を読み、
   時計・天気（Open-Meteo、キー不要）と一緒に表示する
3. ページは5分ごとに `events.json` を取り直すので、サイネージ端末は
   ブラウザを開きっぱなしにするだけでよい

## セットアップ

1. `config.json` を編集する
   - `facilityName`: 施設名
   - `icalUrl`: Googleカレンダーの「iCal 形式の一般公開用アドレス」
     （カレンダー設定 → 「カレンダーの統合」）
   - `weather`: 天気を出す地点の緯度・経度とラベル
2. リポジトリの Settings → Pages で、公開元を `main` ブランチの
   ルートに設定する
3. Actions の `Update calendar data` を手動で一度実行すると、
   実データの `events.json` が生成される

## ローカルでのデータ生成

```bash
npm install
npm run fetch-calendar
```

## 今後の拡張アイデア

- お知らせ欄（Markdown/JSON を差し替えるだけ）
- 複数カレンダーの統合と色分け
- 時間帯による表示切替（開館中／閉館後）
- 画面ローテーション（複数画面の巡回表示）
