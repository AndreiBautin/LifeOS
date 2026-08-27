import { describe, expect, it } from 'vitest'
import type { ValidationError } from './DomainError'

describe('ValidationError', () => {
  it('carries a field name and a human-readable message', () => {
    const error: ValidationError = { field: 'name', message: 'Name is required.' }

    expect(error.field).toBe('name')
    expect(error.message).toBe('Name is required.')
  })
})
