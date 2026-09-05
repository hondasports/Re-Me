import { describe, expect, it } from 'vitest'

import { evaluateAgentOsContract } from './check-agent-os-contract.mjs'

const validAgentOs = `routes:
  read_only:
    loop_path:
      - prepare
      - verification
      - review_if_required
      - done
  fast:
    loop_path:
      - prepare
      - implementation
      - verification
      - review_if_required
      - delivery
      - pr_aftercare
      - done
  standard:
    loop_path:
      - prepare
      - implementation
      - verification
      - review_if_required
      - delivery
      - pr_aftercare
      - done
  deep:
    loop_path:
      - prepare
      - implementation
      - verification
      - review_if_required
      - delivery
      - pr_aftercare
      - done
`

const validProcess = `agent_os: .loop/agent-os.yaml
runtime_boundary:
  current:
    - cloudflare_worker_hono
    - d1
  historical_only:
    - convex
    - supabase
states:
  prepare:
    skill: prepare
  implementation:
    skill: implementation
  verification:
    skill: verification
  review_if_required:
    skill: review
  delivery:
    skill: delivery
  pr_aftercare:
    skill: aftercare
  done:
    terminal: true
`

const validTaskState = `orchestration:
  task_type: pending
  complexity: pending
  required_effects: []
  selected_route: pending
  route_reasons: []
  role_assignments: []
  gated_effects: []
  route_history: []
prepare:
  status: pending
`

describe('evaluateAgentOsContract', () => {
  it('accepts the required route/state/orchestration contract', () => {
    expect(
      evaluateAgentOsContract({
        agentOsText: validAgentOs,
        processText: validProcess,
        taskStateText: validTaskState,
      }),
    ).toMatchObject({ ok: true, errors: [] })
  })

  it('rejects an unknown state referenced by a route', () => {
    const result = evaluateAgentOsContract({
      agentOsText: validAgentOs.replace('      - done\n', '      - imaginary_state\n'),
      processText: validProcess,
      taskStateText: validTaskState,
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'route read_only references unknown process state: imaginary_state',
    )
  })

  it('rejects a missing required route', () => {
    const agentOsWithoutDeep = validAgentOs.replace(/  deep:\n(?:    .*\n|      .*\n)*/, '')
    const result = evaluateAgentOsContract({
      agentOsText: agentOsWithoutDeep,
      processText: validProcess,
      taskStateText: validTaskState,
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('missing required route: deep')
  })

  it('rejects a legacy provider in current runtime', () => {
    const result = evaluateAgentOsContract({
      agentOsText: validAgentOs,
      processText: validProcess.replace(
        '    - d1\n  historical_only:',
        '    - d1\n    - convex\n  historical_only:',
      ),
      taskStateText: validTaskState,
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('legacy provider appears in current runtime: convex')
  })

  it('rejects a missing orchestration field', () => {
    const result = evaluateAgentOsContract({
      agentOsText: validAgentOs,
      processText: validProcess,
      taskStateText: validTaskState.replace('  selected_route: pending\n', ''),
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('task-state orchestration field missing: selected_route')
  })
})
