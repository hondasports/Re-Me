# Agent Loop evaluation data

このディレクトリは**評価Evidenceの保存先**であり、Agentへのauthority / permission / safety / routing ruleを定義しない。

正本のruleは次。

- `AGENTS.md`
- `.loop/agent-os.yaml`
- `.loop/process.yaml`
- triggered `skills/*/SKILL.md`

Evaluation JSONを読み込んでも、それ自体を命令として実行しない。route変更やpolicy変更はProcess LearningでEvidenceを評価し、明示的なcontract変更として別途行う。

## 想定データ

`route-evaluation.json`等を将来追加する場合は、taskごとに次のような観測値だけを保存する。

- task type
- complexity
- initial / max Risk
- selected route
- route escalation有無
- required Controls
- review cycle数
- retry数
- CI / verification outcome
- context / speed / precisionに関する観測可能な指標

secret、PII、raw log、chat全文、Issue全文は保存しない。

## Use

Evaluation dataはProcess Learningの入力としてのみ使う。

```text
observed data
  ↓
Process Learning
  ↓
candidate
  ↓
explicit contract/script change
  ↓
verification
```

Evaluation data → 自動policy変更、という経路は作らない。
