---
name: workspace-preflight
description: local repositoryを変更するPREPAREで使う軽量helper。独立した直列Gateではない。
---

# Workspace Preflight helper

通常のcode / config / migration / agent-process変更は、`main`を直接編集せずtask branch / worktreeで行う。

Local checkoutを編集する場合、PREPAREの一部として次を実行する。

```bash
pnpm loop:preflight
```

内部では次を実行する。

```bash
node scripts/check-task-worktree.mjs --require-clean
```

canonical `.env.local`から`E2E_AUTH0_*`を現在のworktreeへ同期する。値は表示・commitしない。既存キーは上書きしない。資格情報不足はPREPAREでは止めず、画面変更時は`pnpm loop:e2e-gate`でBLOCKする。

Cloudflare / D1 / R2 / Queue等のlocal/preview設定は`docs/development/preview-environment.md`を正本とする。Production設定をlocal worktreeへ正本としてコピーしない。

Convex / SupabaseはHistorical artifactや。明示的なlegacy comparison/migration taskで必要な場合だけ、それぞれのlegacy docsに従う。通常preflightの前提にしない。

PASS条件:

- branchが`main`ではない
- detached HEADではない
- canonical worktreeとは別の登録済みtask worktree
- baselineがclean
- task identityがIssue / user requestと一致する
- 他taskの差分を混ぜない

必要なら例:

```bash
git worktree add ../re-me-<task> -b agent/<task> main
```

既存差分を勝手にreset / stash / deleteしない。

GitHub connectorのようにrepository API経由で専用branchへ直接変更する場合は、local worktree scriptを無理に実行しない。代わりに次を同等Evidenceとする。

- base refが`main`
- write先が`main`ではない専用task branch
- branchがcurrent task専用である
- 変更前のbase/head identityを記録する

`docs/` / README / CHANGELOGだけの純粋な文書変更は、理由を記録してlocal worktree preflightを省略してよい。`AGENTS.md`、`.loop/`、`skills/`、`scripts/`、migration、CI、設定ファイルはpure docs扱いにしない。

## Deterministic checks

Workspace Preflightまたはtask-state運用ルールを変更した場合は次を実行する。

```bash
pnpm test:loop
pnpm loop:check-task-state-template
```
