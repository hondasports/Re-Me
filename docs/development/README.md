# 開発ドキュメント

このディレクトリは実行契約そのものではなく、環境・運用・開発計画の詳細を持つ。

## Authority

### Normative runtime / process

開発フローの正本はここではなく次。

- `AGENTS.md`
- `.loop/agent-os.yaml`
- `.loop/process.yaml`
- `.loop/templates/task-state.yaml`
- `skills/*/SKILL.md`

Product / Architectureの正本:

- `docs/product/requirements.md`
- `docs/product/vision.md`
- `docs/architecture/overview.md`
- `docs/architecture/tech-stack.md`
- `docs/architecture/auth-security.md`
- `docs/architecture/data-model.md`
- `docs/architecture/delivery-notifications.md`
- `docs/architecture/decisions/`

### Operational

現行runtimeの環境・運用詳細。

- [セットアップ](setup.md)
- [Local / Preview 環境](preview-environment.md)
- [Production 環境](production-environment.md)
- [品質ゲート](quality-gates.md)
- [本番準備](production-readiness.md)

### Planning / current-supporting

- [Issue 計画](issue-plan.md)

GitHub Issue/PRのcurrent task contractと矛盾する場合は、current explicit instruction / latest approved taskを優先する。

### Historical

- [Legacy data migration status](legacy-migration.md)
- `initial-issues-draft.md`
- `implementation-order.md`
- `supabase/README.md` と `supabase/migrations/`
- superseded ADR

Historical docs/artifactsは現在のruntime構成を定義しない。Convex / Supabaseは明示的なlegacy migration、比較、履歴確認でだけ参照する。

## Current runtime

現在のbackend/runtimeはCloudflare Worker / Hono + D1 / R2 / Queues / Cron、authenticationはAuth0や。

Supabase CLIはlegacy PostgreSQL/RLS schema comparison用の開発toolとして残している。通常runtime / CI / E2EはSupabaseを起動しない。

## Update rule

実装詳細はGitHub Issuesをcurrent task sourceとして扱い、仕様・アーキテクチャ変更は対応する`docs/product/` / `docs/architecture/` / ADR / migrationへ反映する。

Loop contract変更は`.loop/` / `AGENTS.md` / `skills/` / deterministic scriptsを同時に整合させる。
