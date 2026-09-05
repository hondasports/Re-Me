# Re:Me Agent Loop v6

Re:Me Agent Loop v6は、v5のRisk / Evidence / deterministic enforcementを維持しつつ、KakeiboのAgent OSとletwir/CODEXのeffect-first / routing / compact handoff思想をRe:Me向けに取り込む。

新しい中心構造は次。

```text
User request
  ↓
AGENTS.md
  ↓
.loop/agent-os.yaml
  ├─ Effect
  ├─ Task type / Complexity
  ├─ Route
  └─ Role
  ↓
.loop/process.yaml
  ├─ Spec Confidence
  ├─ Risk / Required Controls
  ├─ Coverage / Finding
  ├─ Verification / Review
  └─ Delivery / Aftercare
  ↓
skills/*
  ↓
deterministic scripts
```

## Source of truth

### Normative

- `AGENTS.md` — 常時contextに置く最小の実行契約 + protected product invariants
- `.loop/agent-os.yaml` — Effect / classifier / route / role / handoff
- `.loop/process.yaml` — Risk / Controls / Verification / Finding / Delivery
- `.loop/templates/task-state.yaml` — tracked schema/template
- `.loop/state/<task-id>.yaml` — current task instance（ignored）
- `skills/*/SKILL.md` — stage / conditional detail

### Explanatory

- `.loop/AGENT_OS.md` — Agent OSの背景と人間向け説明
- このREADME — Loop全体の概要

### Deterministic enforcement

- `scripts/check-loop-evidence.mjs`
- `scripts/check-task-worktree.mjs`
- `scripts/check-task-state-template.mjs`
- `scripts/check-local-e2e-gate.mjs`
- `scripts/check-pr-aftercare.mjs`

文書とScriptが矛盾した場合は、Scriptを正本に昇格させず、normative contractを確認してenforcementを修正する。

## Design principle

```text
Quality = confirmed contract
        + forward coverage
        + reverse coverage
        + Required Controls
        + Verification Evidence
        + blocking finding = 0
```

Gate数・Agent数・文書量を品質指標にしない。

## Agent OS

Agent OSはworkflowを置き換えない。依頼ごとに必要なworkflowの深さを選ぶ。

| Route | 主用途 |
| --- | --- |
| `read_only` | 調査・Issue/CI分析 |
| `fast` | tiny/small + R0/R1 + protected behavior変更なし |
| `standard` | medium / R2 / protected behavior / review Control |
| `deep` | large / R3/R4 / cross-cutting / migration |

route短縮よりRequired Controlを優先する。`fast`でもuser-visible flow変更ならbrowser E2Eを実行する。

## Effect-first

EffectはHuman Gateを「task全体」ではなく「具体的operation」へ束縛するために使う。

例:

```text
production D1 migrationを伴うfeature
  ↓
調査・実装・test・review・PR・CI
  ↓
production_data_migration
  ↓
Human Gate
```

R4だけではHuman Gateを起動しない。

## Compact contract

PREPARE後にstage間で引き継ぐ情報は次へ絞る。

- Goal / In / Out
- Task type / Complexity / Route / Effects
- `ACxx` / `IVxx`
- material assumptions
- Risk / Required Controls
- Coverage Map / `TCxx`
- open Finding IDs
- revision

Issue全文・chat履歴・source本文・前stage Skill全文を各stageで再要約しない。

## Compact role handoff

subagent handoffは原則次だけ。

```text
Role
Target
Acceptance
Scope
Known facts
```

Known factsには検証済み事実だけを入れる。unknownはoutputとして返す。

fixed multi-agent teamは作らず、routeに必要なroleだけ割り当てる。同じshared diffへのwriterは原則1体。

## Protected behavior

次へmaterialに触れる変更は少なくとも`standard`へ昇格する。

- sealed content privacy
- sent letter immutability
- authorization / ownership
- exact schedule privacy
- delivery idempotency
- delivery / notification separation
- private R2 access

## Current runtime / legacy

Current runtime:

- Auth0
- Cloudflare Worker / Hono
- D1 / R2 / Queues / Cron
- React / TypeScript / Vite

Historical only:

- Convex
- Supabase

Legacy artifactは削除しない。ADR・migration history・schema comparisonで明示的に必要な時だけ参照する。Supabase CLIはlegacy schema comparison用途として残し、通常runtime / CI / E2Eの前提にしない。

## Verification

```text
scopeable static / owning tsconfig
  ↓
targeted unit / contract
  ↓
affected Worker / D1 integration
  ↓
required functional Playwright
  ↓
repo-wide regression = CI Aftercare
```

material failureがあれば無意味な下流checkを止める。same-content Evidenceは再利用し、content deltaが無効化した範囲だけ再検証する。

## Finding Ledger

Verification / Review / Security / CI / Human reviewのfindingは、current task instanceの`findings[]`へ統合する。

同じfindingをstageごとに別recordへ増殖させない。protected domain findingはAgent単独でdeferしない。

## Task-state isolation

`.loop/templates/task-state.yaml`はschema only。task固有値を入れない。

task開始時に`.loop/state/<task-id>.yaml`へコピーし、current instanceはcommitしない。

`pnpm loop:check-task-state-template`はtracked template変更を明示schema changeとして扱い、current instanceのstagingを拒否する。

## Process Learning

Process Learningはevent-driven。

改善候補は追加手順より先に、次を検討する。

- 削除
- 統合
- 遅延ロード
- 順序変更
- Evidence再利用
- cheap checkへの置換
- routingの短縮

評価dataを将来導入する場合も、dataはルール/権限ではなくProcess LearningのEvidenceとして扱う。

## Non-goals

- LRF/1等の新DSL
- persona system
- model/vendor固定routing
- 全taskのmulti-agent化
- reviewer数を増やす品質担保
- production operation自動承認
