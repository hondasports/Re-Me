import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const TASK_STATE_TEMPLATE_PATTERN = /^\.loop\/templates\/task-state(?:[-_.][^/]*)?\.ya?ml$/i
const TASK_STATE_INSTANCE_PREFIX = '.loop/state/'

export function normalizeChangedPath(filePath) {
  return String(filePath)
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
}

export function isTaskStateTemplatePath(filePath) {
  return TASK_STATE_TEMPLATE_PATTERN.test(normalizeChangedPath(filePath))
}

export function isTaskStateInstancePath(filePath) {
  return normalizeChangedPath(filePath).startsWith(TASK_STATE_INSTANCE_PREFIX)
}

function isEmptyText(value) {
  return typeof value !== 'string' || value.trim() === ''
}

export function evaluateTaskStateTemplateChanges({
  changedPaths = [],
  allowSchemaChange = false,
  schemaChangeReason = '',
} = {}) {
  const normalizedPaths = [...new Set((changedPaths ?? []).map(normalizeChangedPath))]
  const templateChanges = normalizedPaths.filter(isTaskStateTemplatePath)
  const instanceChanges = normalizedPaths.filter(isTaskStateInstancePath)
  const errors = []

  if (instanceChanges.length > 0) {
    errors.push('current task state instances must remain worktree-local and ignored')
  }

  if (templateChanges.length > 0 && !allowSchemaChange) {
    errors.push(
      'task-state template changes require --allow-schema-change with a non-empty --reason',
    )
  }

  if (templateChanges.length > 0 && allowSchemaChange && isEmptyText(schemaChangeReason)) {
    errors.push('--allow-schema-change requires a non-empty --reason')
  }

  return {
    ok: errors.length === 0,
    errors,
    templateChanges,
    instanceChanges,
    changedPaths: normalizedPaths,
  }
}

export function readStagedFiles(cwd) {
  const output = execFileSync('git', ['diff', '--cached', '--name-only', '--no-renames', '-z'], {
    cwd,
    encoding: 'utf8',
  })
  return output.split('\0').filter(Boolean)
}

function printResult({ result, staged }) {
  console.log(`TASK_STATE_TEMPLATE status: ${result.ok ? 'PASS' : 'FAIL'}`)
  console.log(`scope: ${staged ? 'staged paths' : 'provided paths'}`)
  if (result.templateChanges.length > 0) {
    console.log(`template_changes: ${result.templateChanges.join(', ')}`)
  }
  if (result.instanceChanges.length > 0) {
    console.log(`instance_changes: ${result.instanceChanges.join(', ')}`)
  }
  for (const error of result.errors) console.error(`error: ${error}`)
}

export function runTaskStateTemplateCheck({
  cwd = process.cwd(),
  changedPaths,
  staged = true,
  allowSchemaChange = false,
  schemaChangeReason = '',
} = {}) {
  try {
    const paths = changedPaths ?? (staged ? readStagedFiles(cwd) : [])
    const result = evaluateTaskStateTemplateChanges({
      changedPaths: paths,
      allowSchemaChange,
      schemaChangeReason,
    })
    printResult({ result, staged })
    return result.ok ? 0 : 1
  } catch (error) {
    console.error('TASK_STATE_TEMPLATE status: FAIL')
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

export function parseTaskStateTemplateArguments(args) {
  const options = {
    staged: true,
    allowSchemaChange: false,
    schemaChangeReason: '',
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--staged') {
      options.staged = true
    } else if (arg === '--allow-schema-change') {
      options.allowSchemaChange = true
    } else if (arg === '--reason') {
      const reason = args[index + 1]
      if (reason === undefined || reason.startsWith('--')) {
        throw new Error('--reason requires a non-empty value')
      }
      options.schemaChangeReason = reason
      index += 1
    } else {
      throw new Error(`unknown option: ${arg}`)
    }
  }

  if (options.allowSchemaChange && isEmptyText(options.schemaChangeReason)) {
    throw new Error('--allow-schema-change requires a non-empty --reason')
  }

  return options
}

const invokedPath = process.argv[1] ? process.argv[1].toLowerCase() : ''
const modulePath = fileURLToPath(import.meta.url).toLowerCase()
if (invokedPath === modulePath) {
  try {
    process.exitCode = runTaskStateTemplateCheck(
      parseTaskStateTemplateArguments(process.argv.slice(2)),
    )
  } catch (error) {
    console.error('TASK_STATE_TEMPLATE status: FAIL')
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
