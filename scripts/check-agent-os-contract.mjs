import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REQUIRED_ROUTES = ['read_only', 'fast', 'standard', 'deep']
const REQUIRED_ORCHESTRATION_FIELDS = [
  'task_type',
  'complexity',
  'required_effects',
  'selected_route',
  'route_reasons',
  'role_assignments',
  'gated_effects',
  'route_history',
]

function indentation(line) {
  return line.match(/^ */)?.[0].length ?? 0
}

function extractTopLevelMapKeys(text, heading) {
  const lines = text.split(/\r?\n/)
  const headingIndex = lines.findIndex((line) => line === `${heading}:`)
  if (headingIndex < 0) return []

  const keys = []
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = indentation(line)
    if (indent === 0) break
    if (indent !== 2) continue
    const match = line.match(/^  ([a-zA-Z0-9_]+):(?:\s.*)?$/)
    if (match) keys.push(match[1])
  }
  return keys
}

function extractRoutePaths(text) {
  const lines = text.split(/\r?\n/)
  const routesIndex = lines.findIndex((line) => line === 'routes:')
  if (routesIndex < 0) return {}

  const routes = {}
  let currentRoute = null
  let collectingPath = false

  for (let index = routesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = indentation(line)
    if (indent === 0) break

    const routeMatch = line.match(/^  ([a-zA-Z0-9_]+):\s*$/)
    if (routeMatch) {
      currentRoute = routeMatch[1]
      routes[currentRoute] = []
      collectingPath = false
      continue
    }

    if (!currentRoute) continue
    if (line === '    loop_path:') {
      collectingPath = true
      continue
    }

    if (collectingPath) {
      const stateMatch = line.match(/^      - ([a-zA-Z0-9_]+)\s*$/)
      if (stateMatch) {
        routes[currentRoute].push(stateMatch[1])
        continue
      }
      if (indent <= 4) collectingPath = false
    }
  }

  return routes
}

function extractNestedList(text, parentHeading, childHeading) {
  const lines = text.split(/\r?\n/)
  const parentIndex = lines.findIndex((line) => line === `${parentHeading}:`)
  if (parentIndex < 0) return []

  let childIndex = -1
  for (let index = parentIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = indentation(line)
    if (indent === 0) break
    if (line === `  ${childHeading}:`) {
      childIndex = index
      break
    }
  }
  if (childIndex < 0) return []

  const values = []
  for (let index = childIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = indentation(line)
    if (indent <= 2) break
    const match = line.match(/^    - ([a-zA-Z0-9_]+)\s*$/)
    if (match) values.push(match[1])
  }
  return values
}

function extractOrchestrationFields(text) {
  const lines = text.split(/\r?\n/)
  const index = lines.findIndex((line) => line === 'orchestration:')
  if (index < 0) return []

  const fields = []
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]
    if (line.trim() === '') continue
    const indent = indentation(line)
    if (indent === 0) break
    if (indent !== 2 || line.trimStart().startsWith('#')) continue
    const match = line.match(/^  ([a-zA-Z0-9_]+):/)
    if (match) fields.push(match[1])
  }
  return fields
}

export function evaluateAgentOsContract({ agentOsText, processText, taskStateText }) {
  const errors = []
  const routePaths = extractRoutePaths(agentOsText)
  const routeNames = Object.keys(routePaths)
  const processStates = new Set(extractTopLevelMapKeys(processText, 'states'))
  const orchestrationFields = new Set(extractOrchestrationFields(taskStateText))

  for (const route of REQUIRED_ROUTES) {
    if (!routeNames.includes(route)) errors.push(`missing required route: ${route}`)
  }

  for (const [route, states] of Object.entries(routePaths)) {
    if (states.length === 0) errors.push(`route has no loop_path states: ${route}`)
    for (const state of states) {
      if (!processStates.has(state)) {
        errors.push(`route ${route} references unknown process state: ${state}`)
      }
    }
  }

  for (const field of REQUIRED_ORCHESTRATION_FIELDS) {
    if (!orchestrationFields.has(field)) {
      errors.push(`task-state orchestration field missing: ${field}`)
    }
  }

  if (!processText.includes('agent_os: .loop/agent-os.yaml')) {
    errors.push('process contract does not point to .loop/agent-os.yaml')
  }

  const currentRuntime = extractNestedList(processText, 'runtime_boundary', 'current')
  const historicalRuntime = extractNestedList(processText, 'runtime_boundary', 'historical_only')
  for (const legacy of ['convex', 'supabase']) {
    if (currentRuntime.includes(legacy)) {
      errors.push(`legacy provider appears in current runtime: ${legacy}`)
    }
    if (!historicalRuntime.includes(legacy)) {
      errors.push(`legacy provider missing from historical_only: ${legacy}`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    routes: routePaths,
    processStates: [...processStates],
    orchestrationFields: [...orchestrationFields],
  }
}

export function runAgentOsContractCheck({
  agentOsPath = '.loop/agent-os.yaml',
  processPath = '.loop/process.yaml',
  taskStatePath = '.loop/templates/task-state.yaml',
} = {}) {
  try {
    const result = evaluateAgentOsContract({
      agentOsText: readFileSync(agentOsPath, 'utf8'),
      processText: readFileSync(processPath, 'utf8'),
      taskStateText: readFileSync(taskStatePath, 'utf8'),
    })
    console.log(`AGENT_OS_CONTRACT status: ${result.ok ? 'PASS' : 'FAIL'}`)
    for (const error of result.errors) console.error(`error: ${error}`)
    return result.ok ? 0 : 1
  } catch (error) {
    console.error('AGENT_OS_CONTRACT status: FAIL')
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

const invokedPath = process.argv[1] ? process.argv[1].toLowerCase() : ''
const modulePath = fileURLToPath(import.meta.url).toLowerCase()
if (invokedPath === modulePath) {
  process.exitCode = runAgentOsContractCheck()
}
