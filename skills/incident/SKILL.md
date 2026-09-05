---
name: incident
description: Verification、Review、CI、E2E、外部サービスでFAIL/BLOCKEDや同一失敗の反復が起きたとき、Root Causeを切り分ける。
---

# Incident / Root Cause Loop

自動trigger:

- required Verification FAIL / BLOCKED
- 同じtest / commandが2回同じ理由で失敗
- review findingが再発
- CI / E2E failure原因不明
- localとCI / production-like envの結果が異なる
- env / auth / Cloudflare / Auth0等current runtimeが原因でGateを進めない
- explicit legacy taskでConvex / Supabase artifactが原因で比較・migrationを進めない

`BLOCKED`は`DONE`ではない。「理由をPRに書いて次へ進む」を回避策にしない。

## 手順

1. 事実を固定する。症状と推測を混ぜない。
2. failure domainを分類する。
3. 可能ならbase / controlと比較する。
4. 独立仮説を3つ作る。1つは前提自体が誤りの可能性を含める。
5. 最小のfalsifying checkを1つ実行する。
6. Root Causeまたはexplicit blockerを確定する。
7. 修正後、無効になったGateへ戻る。

Convex / Supabaseはcurrent runtimeとして仮説へ混ぜず、明示legacy taskの時だけ候補にする。

Secret / PIIを調査ログへ転記しない。

Incident解消はProcess Learning Eventとする。
