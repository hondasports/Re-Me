# 開発セットアップ

Re:Me の runtime は Auth0 + Cloudflare Worker + D1 + private R2 + Queues で構成する。
過去の database artifact は比較用で、通常の local / CI test は起動を要求しない。

## 前提

- Node.js 24 LTS
- pnpm 11
- Auth0 DEV tenant / SPA application
- Cloudflare account
- Google Cloud project（Production 用 OAuth client は DEV と分離）

## 主な scripts

```text
pnpm dev
pnpm dev:full
pnpm build
pnpm deploy:preview
pnpm deploy:production   # Human Gate 後だけ
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm test:worker
pnpm test:e2e
pnpm cf:typegen
```

`dev:full` と `dev` は Cloudflare Vite plugin を通った同じ local Worker runtime を起動する。
`deploy:preview` は Preview build → D1 migrations → Preview Worker deploy、`deploy:production`
も Production で同じ順や。Production command は本番構築・data import・traffic の Human
Gate を代替せえへん。

## Provider / API

```text
QueryClientProvider
  └─ MantineProvider
      └─ ApiClientProvider
          └─ Auth0Provider
              └─ LiveAuthRuntimeProvider
                  └─ React Router
```

Auth0 は authentication、Worker の認証済み API が authorization と domain state
transition の source of truth や。ブラウザは TanStack Query で Worker API を読む。
`letters` metadata と本文を Worker / D1 で分け、exact `scheduledAt` は browser response
へ出さへん。

## Browser environment

```text
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_API_BASE_URL
```

Browser へ出さない:

```text
AUTH0_AUDIENCE / CAPABILITY_SECRET
VAPID_PRIVATE_KEY / VAPID_SUBJECT
CLOUDFLARE_API_TOKEN
R2 credential
E2E_AUTH0_PASSWORD
```

`VITE_*` は公開値だけや。`VITE_API_BASE_URL` は local では空（same-origin）、Preview /
Production では固定 Worker URL を指定する。
Web Push の公開鍵は Worker の `/api/push/config` から実行時に取得する。GitHub の
build variable と二重管理せず、`VAPID_PUBLIC_KEY` は Worker secret のままにする。

## Auth0 DEV のセットアップ

1. DEV tenant の既存 SPA `Re:Me DEV` を使う。新しいSPAは作らない
2. Google OAuth connection を有効化する
3. local callback / logout / web origin と固定 Preview URL を登録する
4. `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` を `.env.local` に設定する
5. Universal Login で Google login を確認する
6. E2E 用 database user は `E2E_AUTH0_EMAIL` / `E2E_AUTH0_PASSWORD` として canonical
   `.env.local` だけに置く。chat / log / commit へ出さない

Auth0 domain と client id は public value や。Management API credential、client secret、
E2E password は公開せえへん。

### `VITE_AUTH0_*` の入れ方

Auth0 CLI を使う場合は、DEV tenant と既存 SPA を確認してから public value だけを設定する。

1. `auth0 login`
2. `auth0 tenants list` で DEV tenant を確認する
3. `auth0 apps list` から既存の `Re:Me DEV` の `client_id` を確認する
4. `.env.local` に `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` を一度だけ設定する
5. `pnpm loop:preflight` で E2E credential の worktree 同期状態を確認する

Auth0 CLI token は `.config/auth0/` に書かれる場合がある。この path は gitignore 済みで、
token 値を chat、Issue、PR、log に出さへん。

## Local Worker / D1

1. `.env.example` を `.env.local` へコピーする
2. DEV Auth0 public values を設定する
3. `.dev.vars.example` を `.dev.vars` へコピーし、`AUTH0_DOMAIN` と `AUTH0_CLIENT_ID`（または `AUTH0_AUDIENCE`）を設定する。Worker は local でも Auth0 token を `AUTH0_DOMAIN` の JWKS で検証し、audience を `AUTH0_AUDIENCE` または `AUTH0_CLIENT_ID` と照合する。写真や push を触る場合だけ `CAPABILITY_SECRET` / `VAPID_*` も追加する
4. `pnpm exec wrangler d1 migrations apply re-me-local --local` を実行する
5. `pnpm dev:full` を起動する

初回の local Worker / R2 / Queue resource は `wrangler.jsonc` の local binding から作る。
test-only header と force delivery は `APP_ENV=local` の場合だけ有効や。Preview / Production
の Worker はこの header を信用せえへんことを Worker test で確認する。

## Preview

Preview の resource、GitHub environment、Auth0 callback は
[preview-environment.md](preview-environment.md) を正とする。Preview D1 へ Production
data を入れない。Preview Worker secret は `CAPABILITY_SECRET`、`VAPID_PUBLIC_KEY`、
`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を対象環境へ登録し、値はログへ出さへん。

## E2E

通常 E2E は Google OAuth UI を毎回通さず、Auth0 database test identity で Universal
Login を完了する。Playwright は `storageState` を `e2e/.auth/` に保存し、Auth0 callback
→ Worker JWT 検証 → `/api/users/ensure` → authenticated API を検証する。

最低限:

- authenticated local / Preview session → draft → send
- sealed letter arrival → open
- open → reply → send to future
- ownership denial、sealed content denial、photo capability expiration

Google OAuth 自体は少数の smoke test で検証し、critical E2E へ毎回含めない。

### task worktree での E2E

`pnpm loop:preflight` は canonical `.env.local` から `E2E_AUTH0_*` だけを同期する。
worktree で authenticated E2E を動かすには別途次が必要や。

1. worktree の `.env.local` へ `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` を設定する。無いと Auth0 redirect が始まらず auth.setup が timeout する
2. worktree の `.dev.vars` へ `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID`（または `AUTH0_AUDIENCE`）を設定する。無いと Worker の JWT 検証が失敗して api-session が `error` になる
3. 新規 worktree では `pnpm d1:migrations:apply:local` で worktree 固有の local D1 へ migration を適用する

いずれも ignore 済みの worktree local file やから commit されへん。値は canonical worktree からコピーしてええが、chat / log / PR へ出さへん。

## 撤去後の完了条件

- Worker API / D1 authorization / R2 capability / Cron / Queue が Preview で動く
- repository に別 backend の source、client、scheduler、dependency、CI deploy が無い
- D1 の一時 import bookkeeping が migration で撤去されている
- local / Preview の Worker test と critical E2E が PASS する
- Production は未デプロイ・未投入のまま保持し、初回構築は別 Human Gate で行う
