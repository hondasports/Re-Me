import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  evaluateTaskStateTemplateChanges,
  isTaskStateInstancePath,
  isTaskStateTemplatePath,
  normalizeChangedPath,
  parseTaskStateTemplateArguments,
  readStagedFiles,
  runTaskStateTemplateCheck,
} from './check-task-state-template.mjs'

describe('task-state path classification', () => {
  it('normalizes separators and leading ./', () => {
    expect(normalizeChangedPath('./.loop\\state\\issue-70.yaml')).toBe('.loop/state/issue-70.yaml')
  })

  it('recognizes the tracked template and template variants', () => {
    expect(isTaskStateTemplatePath('.loop/templates/task-state.yaml')).toBe(true)
    expect(isTaskStateTemplatePath('.loop\\templates\\task-state.schema.yml')).toBe(true)
    expect(isTaskStateTemplatePath('.loop/state/issue-70.yaml')).toBe(false)
  })

  it('recognizes current task instances', () => {
    expect(isTaskStateInstancePath('.loop/state/issue-70.yaml')).toBe(true)
    expect(isTaskStateInstancePath('.loop\\state\\issue-70.yaml')).toBe(true)
    expect(isTaskStateInstancePath('.loop/templates/task-state.yaml')).toBe(false)
  })
})

describe('evaluateTaskStateTemplateChanges', () => {
  it('passes when no task-state paths are staged', () => {
    expect(evaluateTaskStateTemplateChanges({ changedPaths: ['README.md'] })).toMatchObject({
      ok: true,
      errors: [],
    })
  })

  it('fails template changes without an explicit schema reason', () => {
    expect(
      evaluateTaskStateTemplateChanges({
        changedPaths: ['.loop/templates/task-state.yaml'],
      }),
    ).toMatchObject({ ok: false })
  })

  it('allows a schema-only change with a reason', () => {
    expect(
      evaluateTaskStateTemplateChanges({
        changedPaths: ['.loop/templates/task-state.yaml'],
        allowSchemaChange: true,
        schemaChangeReason: 'add Agent OS orchestration schema',
      }),
    ).toMatchObject({ ok: true, errors: [] })
  })

  it('requires a reason for the schema exception', () => {
    expect(
      evaluateTaskStateTemplateChanges({
        changedPaths: ['.loop/templates/task-state.yaml'],
        allowSchemaChange: true,
      }),
    ).toMatchObject({ ok: false })
  })

  it('always fails staged current instances, including with schema exception', () => {
    expect(
      evaluateTaskStateTemplateChanges({
        changedPaths: ['.loop/state/issue-70.yaml'],
        allowSchemaChange: true,
        schemaChangeReason: 'schema change',
      }),
    ).toMatchObject({ ok: false })
  })

  it('fails when a template and a current instance are both staged', () => {
    const result = evaluateTaskStateTemplateChanges({
      changedPaths: ['.loop/templates/task-state.yaml', '.loop/state/issue-70.yaml'],
      allowSchemaChange: true,
      schemaChangeReason: 'schema change',
    })
    expect(result.ok).toBe(false)
    expect(result.templateChanges).toHaveLength(1)
    expect(result.instanceChanges).toHaveLength(1)
  })
})

describe('task-state template check CLI helpers', () => {
  it('parses the staged schema exception', () => {
    expect(
      parseTaskStateTemplateArguments([
        '--staged',
        '--allow-schema-change',
        '--reason',
        'schema-only contract',
      ]),
    ).toEqual({
      staged: true,
      allowSchemaChange: true,
      schemaChangeReason: 'schema-only contract',
    })
  })

  it('rejects an exception without a reason', () => {
    expect(() => parseTaskStateTemplateArguments(['--allow-schema-change'])).toThrow(
      '--allow-schema-change requires a non-empty --reason',
    )
  })

  it('runs against supplied paths without reading git', () => {
    expect(
      runTaskStateTemplateCheck({
        changedPaths: ['README.md'],
        staged: true,
      }),
    ).toBe(0)
  })

  it('keeps both paths visible for a staged template rename', () => {
    const repository = mkdtempSync(path.join(os.tmpdir(), 'task-state-template-check-'))
    try {
      execFileSync('git', ['init', '-q'], { cwd: repository })
      execFileSync('git', ['config', 'user.name', 'task-state-check'], { cwd: repository })
      execFileSync('git', ['config', 'user.email', 'task-state-check@example.invalid'], {
        cwd: repository,
      })
      const templateDirectory = path.join(repository, '.loop', 'templates')
      mkdirSync(templateDirectory, { recursive: true })
      writeFileSync(path.join(templateDirectory, 'task-state.yaml'), 'schema: true\n')
      execFileSync('git', ['add', '.loop/templates/task-state.yaml'], { cwd: repository })
      execFileSync('git', ['commit', '-qm', 'initial'], { cwd: repository })
      mkdirSync(path.join(repository, 'docs'))
      execFileSync('git', ['mv', '.loop/templates/task-state.yaml', 'docs/task-state.yaml'], {
        cwd: repository,
      })

      expect(readStagedFiles(repository)).toEqual(
        expect.arrayContaining(['.loop/templates/task-state.yaml', 'docs/task-state.yaml']),
      )
      expect(runTaskStateTemplateCheck({ cwd: repository, staged: true })).toBe(1)
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
  })
})
