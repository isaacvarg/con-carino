import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  USER_REFERENCE_COLUMNS,
  USER_REFERENCES_HANDLED_SEPARATELY,
} from '#/server/user-merge'

const MODELS_DIR = join(__dirname, '../../prisma/models')

/** `FinancialAccount` → `financialAccount`, the Prisma client delegate name. */
function delegateName(model: string): string {
  return model[0].toLowerCase() + model.slice(1)
}

/** Every `model.field` in the schema that holds a User id. */
function userColumnsInSchema(): Set<string> {
  const columns = new Set<string>()
  for (const file of readdirSync(MODELS_DIR)) {
    if (!file.endsWith('.prisma')) continue
    const source = readFileSync(join(MODELS_DIR, file), 'utf8')
    for (const block of source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      const [, model, body] = block
      for (const line of body.split('\n')) {
        // Relations: `user User? @relation(..., fields: [userId], ...)`
        const relation = line.match(
          /^\s*\w+\s+User\??\s+@relation\(.*fields:\s*\[(\w+)\]/,
        )
        if (relation) columns.add(`${delegateName(model)}.${relation[1]}`)
        // Plain id columns with no relation, e.g. responsibleSetByUserId.
        const plain = line.match(/^\s*(\w*UserId)\s+String/)
        if (plain) columns.add(`${delegateName(model)}.${plain[1]}`)
      }
    }
  }
  return columns
}

describe('user merge coverage', () => {
  const covered = new Set(
    [...USER_REFERENCE_COLUMNS, ...USER_REFERENCES_HANDLED_SEPARATELY].map(
      (c) => `${c.model}.${c.field}`,
    ),
  )

  it('handles every column in the schema that references a user', () => {
    const missing = [...userColumnsInSchema()].filter((c) => !covered.has(c))
    expect(missing).toEqual([])
  })

  it('lists no column that is not in the schema', () => {
    const schema = userColumnsInSchema()
    const stale = [...covered].filter((c) => !schema.has(c))
    expect(stale).toEqual([])
  })
})
