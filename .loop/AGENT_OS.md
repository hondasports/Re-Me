# Re:Me Agent OS v1

Agent OSは、既存のAgent Loopを置き換えない。

`.loop/process.yaml` が「どう完了まで進めるか」を定義するworkflow contractなのに対し、`.loop/agent-os.yaml` は「この依頼では何を実行してよく、どのroute/roleで進めるか」を決めるdecision/routing layerや。

```text
User request
  ↓
Instruction priority
  ↓
Effect classification
  ↓
Task type / Complexity
  ↓
Existing Risk / Required Controls
  ↓
Route selection
  ├─ read_only
  ├─ fast
  ├─ standard
  └─ deep
  ↓
Role assignment
  ↓
.loop/process.yaml
  ↓
VERIFY / REVIEW / DELIVER / AFTERCARE
```

## 目的

Re:Me Agent Loop v5はすでに、Spec Confidence、Risk、Required Controls、forward/reverse coverage、Finding Ledger、Human Gate、PR Aftercareを持つ。

Agent OS v1はその前段で、依頼ごとに必要な工程だけを選ぶ。

- 小さいtaskは短く進める
- protected behavior変更は必要十分に深く進める
- Human Gateは具体的なoperation直前だけ要求する
- subagentは人数を増やすためではなく速度か独立coverageに効く時だけ使う
- role間handoffをcompactにする

## Effect model

Effectは「追加Human Gateが必要か」を判定するための分類で、scope外操作を許可する仕組みではない。

| Effect | 例 | 追加Human Gate |
| --- | --- | --- |
| `ro_repository` | repo / Issue / PR / CI調査 | 不要 |
| `ro_public` | 公式docs / Web調査 | 不要 |
| `repo_write` | branch上のcode/docs変更 | 不要 |
| `git_write` | branch / commit / push / requested PR | 不要 |
| `external_reversible_write` | scope内のreversible外部変更 | 原則不要 + service ops control |
| `preview_deploy` | Cloudflare Preview / Preview D1 migration | 原則不要 + service ops control |
| `production_write` | Production Worker / Queue / Cron / R2 write | 必要 |
| `production_data_migration` | Production D1 migration / restore / import | 必要 |
| `irreversible_or_bulk_state` | rollback困難なdelete/bulk mutation | 必要 |
| `production_secret_or_credential` | production credential rotation | 必要 |
| `production_dns_or_domain` | production DNS/domain cutover | 必要 |

production effectを含むtaskでも、read-only discovery、reversible repository変更、test、review、PRは可能な限り先に完了する。

## Task classifier

### Task type

- investigation
- docs
- bugfix
- feature
- refactor
- test
- dependency
- architecture
- ops
- process

### Complexity

- `tiny` — 単一local surface、既知pattern、cross-cutting impactなし
- `small` — 少数の関連surface、bounded verification
- `medium` — 複数surface/caller、nontrivial state/contract、Controlが絡む
- `large` — architecture/cross-cutting、複数workstream、migration、protected boundary

Complexityは工数見積りではなくroute選択用の粗い分類や。

RiskはAgent OSで再定義せず、`.loop/process.yaml`のrisk modelを唯一の正本とする。

## Re:Me protected behavior

次へmaterialに触れる変更は特別扱いする。

- sealed content privacy
- sent letter immutability
- authorization / ownership
- exact schedule privacy
- delivery idempotency
- delivery / notification separation
- private R2 access

protected behavior変更は少なくとも`standard` routeへ昇格し、該当Required Controlを適用する。

## Routes

### `read_only`

調査だけでwrite effectが無いtask。

```text
PREPARE(minimal)
  ↓
read-only discovery
  ↓
claim verification if needed
  ↓
DONE
```

### `fast`

主にtiny/small + R0/R1 + protected behavior変更なし。

```text
PREPARE(minimal)
  ↓
IMPLEMENT
  ↓
targeted VERIFY
  ↓
REVIEW? only if Control requires
  ↓
DELIVER
  ↓
AFTERCARE
```

`fast`はE2E省略を意味しない。user-visible flow変更などでRequired Controlがbrowser E2Eを要求する場合は実行する。

### `standard`

medium、R2、protected behavior変更、またはindependent review Controlがあるtask。

```text
PREPARE
  ↓
IMPLEMENT
  ↓
VERIFY
  ↓
REVIEW? if required
  ↓
DELIVER
  ↓
AFTERCARE
```

### `deep`

large、R3/R4、cross-cutting、複数workstream、migrationなど。

```text
parallel read-only discovery when useful
  ↓
PREPARE / PLAN
  ↓
IMPLEMENT (shared diff writer = 1)
  ↓
VERIFY
  ↓
independent REVIEW
  ↓
DELIVER
  ↓
AFTERCARE
```

R4だけではHuman Gateを追加しない。Human GateはEffectまたはprocess contractの具体的triggerに従う。

## Roles

固定の複数Agentチームは作らない。

- `root_orchestrator` — classifier / router / compact contract / result integration
- `researcher` — read-only discovery
- `planner` — PREPARE補助、AC/IV/Coverage/Controls整理
- `implementer` — shared diffのwriter
- `verifier` — Evidence / gap分類
- `reviewer` — omission-first independent review
- `specialist` — materially distinctなRequired Controlが要求する時だけ

same shared diffに対するwriterは原則1体。

## Compact handoff

letwir/CODEXの「Role / Target / Acceptance / Scope / Known facts」という考え方を、Re:MeではYAML/Markdownのまま採用する。

```text
Role
Target
Acceptance
Scope
Known facts
```

Known factsには検証済み事実だけを入れる。Policy全文、Issue全文、chat全文、前stage Skill全文は渡さない。

## Route escalation

次のEvidenceが出た時だけrouteを昇格する。

- new material scope
- Risk escalation
- newly required Control
- protected behavior変更の発見
- cross-cutting impactの発見
- 複数独立workstreamの発見
- verification/reviewでunbounded gap発見

昇格してもloop全体をrestartせず、unaffected contractとsame-content Evidenceを保持して必要なstage deltaだけ再実行する。

## State

current task instanceの`.loop/state/<task-id>.yaml`へ次をcompactに保存する。

- task type
- complexity
- required effects
- selected route
- route reasons
- role assignments
- gated effects
- route history

tracked templateにはtask固有値を入れない。

## Current runtime / legacy boundary

現行runtimeの正本は次。

- Cloudflare Worker / Hono
- D1
- R2
- Queues
- Cron
- Auth0

ConvexとSupabaseはHistorical artifactや。ADR、legacy migration、schema comparisonなど明示的に必要なtaskでだけ読む。

Supabase CLIはlegacy schema comparison用の開発toolとして残してよいが、通常runtime / CI / E2Eの前提にはしない。

## Non-goals

Agent OS v1では次をしない。

- LRF等の新DSL導入
- persona system導入
- model/vendor固定routing
- 全taskのmulti-agent化
- reviewer人数を増やして品質を担保する設計
- Risk modelの二重化
- production operationの自動承認

狙いは、既存Loopの品質contractを保ったままroute選択を適応化し、不要な工程・context・agent invocationを減らすことや。
