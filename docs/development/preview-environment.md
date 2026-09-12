# Local / Preview 環境

この手順はLocalと共有Previewだけを対象にする。ProductionのAuth0、Worker、D1、R2、Queue、secret、data import、traffic切替は [production-environment.md](production-environment.md) とHuman Gateで扱う。

## 環境の境界

| 境界 | Local | Preview / CI E2E |
|---|---|---|
| Auth0 | DEV tenant / SPA | 同じDEV SPA + Preview callback |
| runtime | Cloudflare Vite plugin + local Worker | `re-me-preview` Worker |
| D1 | `re-me-local` | `re-me-preview` |
| R2 | `re-me-local-attachments` | `re-me-preview-attachments` |
| Queue | `re-me-local-notifications` | `re-me-preview-notifications` |
| browser API | same-originまたは `VITE_API_BASE_URL` | `https://re-me-preview.hondasports.workers.dev` |
| E2E force delivery | `1` | `1` |

現在のPreview URLは次や。

```text
Worker: https://re-me-preview.hondasports.workers.dev
Auth0 application: Re:Me DEV
GitHub environment: preview
```

Preview D1 / R2 / QueueはProductionと別resourceや。Previewへproduction exportを流し込まへん。

Auth0 public valuesの手順は [setup.md](setup.md) の「`VITE_AUTH0_*` の入れ方」を見る。E2E credentialの同期には `pnpm loop:preflight` を使う。

## Local

1. `.env.example` を `.env.local` へコピーする
2. DEVの `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` を設定する。詳しくは [setup.md](setup.md) の「`VITE_AUTH0_*` の入れ方」を見る
3. `VITE_API_BASE_URL` を空にするとlocal Workerのsame-origin APIを使う。remote Previewを使う場合だけPreview URLを指定する
4. `.dev.vars.example` を `.dev.vars` へコピーし、`AUTH0_DOMAIN` と `AUTH0_CLIENT_ID`（または `AUTH0_AUDIENCE`）を設定する。localでもWorkerは Auth0 token を検証する
5. `pnpm dev:full` または `pnpm dev` を起動する
6. schemaを更新したら `pnpm exec wrangler d1 migrations apply re-me-local --local` を実行する

Local Workerは `wrangler.jsonc` の `APP_ENV=local`、`E2E_ALLOW_TEST_AUTH=1`、`E2E_ALLOW_FORCE_DELIVERY=1` を使う。test headerはlocal以外では無視される。

task worktreeで local E2E を動かす場合、`.env.local` と `.dev.vars` はworktreeごとに必要や。`pnpm loop:preflight` が同期するのは `E2E_AUTH0_*` だけで、`VITE_AUTH0_*` と `.dev.vars` は各worktreeへ個別に置く。fresh worktreeでは `pnpm d1:migrations:apply:local` も必要や。詳細は [setup.md](setup.md) の「task worktree での E2E」を見る。

Auth0 DEV SPAには通常、次を登録する。

```text
Allowed Callback URLs: http://127.0.0.1:5173/auth/callback
Allowed Logout URLs:   http://127.0.0.1:5173
Allowed Web Origins:   http://127.0.0.1:5173
```

localの写真はprivate R2へWorker経由で保存する。R2 access keyやVAPID private keyを `VITE_*` に入れへん。

## Preview deploy

GitHub environment `preview` に次のVariablesを置く。

```text
CLOUDFLARE_ACCOUNT_ID
PREVIEW_BASE_URL=https://re-me-preview.hondasports.workers.dev
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_API_BASE_URL=https://re-me-preview.hondasports.workers.dev
```

Secretsは次や。値はログ・Issue・PRへ出さへん。

```text
CLOUDFLARE_API_TOKEN
```

Preview Workerには別途、Cloudflare secretとして `CAPABILITY_SECRET`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`を登録する。CIは名前の存在だけ確認してからdeployする。ブラウザは `/api/push/config` から `VAPID_PUBLIC_KEY` を実行時に取得するため、GitHubへVAPID公開鍵を複製しない。

GitHub environmentの `CLOUDFLARE_API_TOKEN` は、対象accountに対する Workers Scripts、D1、R2、Queues の必要な操作権限を持たせる。D1 migrationを含む `pnpm deploy:preview` が Cloudflare code 7403 で止まる場合は、tokenのaccount scope / D1 permissionを直してからCIを再実行する。token値はログへ出さへん。

手動deployは次や。

```text
pnpm deploy:preview
```

このscriptはPreview build、D1 migrations、Preview Worker deployを順に行う。Auth0の `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` はCIまたはoperatorがsecret値を表示せずWorkerへ渡す。

Auth0 DEV SPAには固定Preview URLだけを登録する。

```text
Allowed Callback URLs: https://re-me-preview.hondasports.workers.dev/auth/callback
Allowed Logout URLs:   https://re-me-preview.hondasports.workers.dev
Allowed Web Origins:   https://re-me-preview.hondasports.workers.dev
```

CIの `Quality gates` と `End-to-end` はmainのrequired checksや。End-to-endはPreview Workerへそのcheckoutのrevisionをdeployし、PlaywrightのfrontendはPreview APIを呼ぶ。Preview deployとCI E2Eは `shared-preview-backend` で直列化する。

## R2 CORS

PreviewのR2 bucketはpublicにせず、CORSの正本は `ops/r2-cors-preview.json` や。CI Playwright originも必要や。

```text
Methods: PUT, GET, HEAD
Allowed headers: Content-Type, Content-Length, If-None-Match
Expose headers: ETag
```

反映するときは対象bucketを確認してから次を実行する。

```text
pnpm exec wrangler r2 bucket cors set re-me-preview-attachments --file ops/r2-cors-preview.json --force
```

## 検証

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:worker`
- `pnpm build:preview`
- `/api/health` とSPA fallback
- Auth0 authenticated API、owner denial、sealed open、reply、photo capability

## 復旧

- Worker: Previewの直前versionへ戻す
- D1: migrationを勝手に巻き戻さず、rehearsalで確認したartifactを使う
- R2: `migration/` / `staging/` の対象prefixだけを扱う。既存objectを消さない
- credential漏洩: PreviewのCloudflare token / Worker secretだけをrotateする
- Auth0 callback error: 固定Preview URLの3項目を確認する

Preview の application runtime は Cloudflare Worker / D1 / R2 / Queue だけを使う。
この repository から旧 backend の source、client、scheduler、依存、CI deploy は撤去済みや。
外部に残る Preview deployment の停止は、Production と取り違えないことを確認してから
別途実施する。Preview の D1 / R2 / Queue data は移行元にせえへん。
