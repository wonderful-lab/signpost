# Signpost

施設サイネージ向けのダッシュボード。Googleカレンダー（公開カレンダー）を
DAKboard と同じ方式で表示する: 取得はサーバー側（GitHub Actions）が担い、
表示ページは静的なビューアに徹する。施設ごとに変える設定はすべて
`config.json` に集約されている。

## 仕組み

1. GitHub Actions（`update-calendar.yml`）が毎時7分（cron: `7 * * * *`）に
   起動し、カレンダーの iCal フィードを取得して `events.json` に変換、
   変更があればコミットする。
   ただし GitHub のスケジュール実行はベストエフォートで、数十分の遅延や
   欠落が起こりうる。「正確に1時間ごと」を保証するものではない。
2. 天気（Open-Meteo、キー不要）と AI 一言コメントも、ページではなく
   この取得処理が `events.json` に焼き込む。どちらも最大で1日1回の更新で、
   カレンダーのような毎時更新ではない。
   - 天気: その日初めての取得時にだけ取り直し、5日分の予報ごと保存する
   - AIコメント: 天気を取り直したとき、または当日のコメントが無いときに
     Gemini API で生成する（下記 Secret が必要）。失敗した場合は前回の
     コメントをそのまま残す
3. GitHub Pages のページ（`index.html`）は `events.json` を読み、時計と
   一緒に表示する。ページは5分ごとに `events.json` を取り直すので、
   サイネージ端末はブラウザを開きっぱなしにするだけでよい。

## 設定（config.json）

| 項目 | 内容 |
|---|---|
| `facilityName` | 施設名（画面左上に表示） |
| `icalUrl` | Googleカレンダーの「iCal 形式の一般公開用アドレス」（カレンダー設定 → 「カレンダーの統合」） |
| `timezone` | 施設のタイムゾーン（例: `Asia/Tokyo`）。日付・時刻・天気の基準 |
| `weather.label` | 天気の地点名（画面表示用） |
| `weather.latitude` / `weather.longitude` | 天気を出す地点の緯度・経度 |
| `eventsDaysBack` / `eventsDaysAhead` | 予定を取得する範囲（今日から何日遡るか／何日先までか） |

注意: カレンダーの共有設定が「空き時間情報のみ（詳細は非表示）」だと、
予定タイトルはすべて `Busy` と表示される。実タイトルを出すには共有設定を
「予定の詳細を表示」に変更すること。

## セットアップ

1. `config.json` を施設に合わせて編集する
2. リポジトリの Settings → Pages で、公開元を `main` ブランチの
   ルートに設定する
3. AIコメントを使う場合は、リポジトリの Settings → Secrets and
   variables → Actions → Secrets に `GEMINI_API_KEY`（Gemini の
   APIキー）を登録する。未登録でもカレンダーと天気は動くが、
   コメントは生成されない
4. Actions の `Update calendar data` を手動で一度実行すると、
   実データの `events.json` が生成される

## ローカルでのデータ生成

```bash
npm install
npm run fetch-calendar
```

`config.json` をそのまま使って `events.json` を生成する。AIコメントまで
試す場合は、環境変数 `GEMINI_API_KEY` を設定してから実行する。
（任意の環境変数: `GEMINI_MODEL` でモデル指定、既定は
`gemini-3.1-flash-lite`）

## 今後の拡張アイデア

- 複数カレンダーの統合と色分け
- 時間帯による表示切替（開館中／閉館後）
- 画面ローテーション（複数画面の巡回表示）
