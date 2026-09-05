---
name: service-ops-safety
description: Cloudflare、Auth0、GitHub、OAuth、R2、Queue/Cron、env、secret、deployなどcurrent runtimeの外部サービス操作で読むSafety Skill。Convex/Supabaseは明示的なlegacy taskでだけ扱う。
---

# Service Operations Safety

基本原則「secretを出さない」「production / irreversible writeは明示承認なしに行わない」「必須Verificationを環境不足で省略しない」は`AGENTS.md`に常時保持する。

このSkillは、Cloudflare / Auth0 / OAuth / R2 / Queue / Cron / GitHub write / env / secret / deploy等のservice operationが実際にある時だけ読む。

Convex / SupabaseはHistorical artifactや。ADR、legacy migration、schema comparison等で明示的に必要なtaskだけ対象に含め、current runtimeとして扱わない。

## Operation check

1. 対象環境を明示する: local / preview / production
2. readとwriteを分ける
3. secret値を表示しない
4. productionを通常環境として扱わない
5. 不可逆・高影響操作はHuman Gateを通す
6. 環境不足を理由に必須Verificationを省略しない

外部サービスwrite前に必要な分だけ確認する。

```text
Service:
Environment:
Operation: read | write
Target resource:
Expected effect:
Rollback / recovery:
Secret involved: yes | no
Human Gate required: yes | no
```

Read-onlyの軽微な問い合わせでpacketを毎回フル生成する必要はない。

## Current Re:Me targets

- Cloudflare Workers / D1 / R2 / Queues / Cron / DNS
- Auth0 tenant / application / connection / custom domain
- Google OAuth
- GitHub / GitHub Actions
- Web Push / VAPID
- `.env*` / Worker Secret / deploy key

## Historical-only targets

- Convex deployment / schema / function / environment
- Supabase Auth / PostgreSQL / RLS / migration artifact

Historical targetはcurrent runtime操作と混ぜず、明示taskのsource / comparison / rollback surfaceとしてのみ扱う。

## Secret boundary

- Auth0 Management credential、Cloudflare credential、R2 secret、VAPID private key、OAuth secretをbrowser bundleへ入れない。
- `.env.local`、`.dev.vars`等をcommit / PR / logへ出さない。
- Browser-visible keyとserver-only secretを混同しない。
- Secret rotationを副次作業として勝手に行わない。

## Human Gate required

ユーザーの明示許可なしに次をwriteしない。

- production deploy
- production D1 migration / import / restore / data mutation
- production env / secretの追加・更新・削除
- OAuth production credentialの変更
- secret / VAPID / signing key rotation
- DNS / domain変更
- billing / plan変更
- 大量・不可逆data mutation

Preview deploy / Preview専用D1 migrationはscope内かつRequired Controlを満たす場合は追加Human Gate不要。

必須環境がなくVerificationできない場合はDONEではなくBLOCKEDとする。
