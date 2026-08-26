import { DomainError } from '@/domain/errors/domain-error'

/**
 * A backlog rule was violated by something a person typed.
 *
 * A `DomainError`, so anything catching the family catches these too, but
 * kept as its own class because it means something different from the rest
 * of that family. Lift throws `DomainError` for states the model considers
 * impossible — a rep range whose low exceeds its high — and those are
 * bugs. An empty title is not a bug; it is Tuesday. The UI renders these
 * as a message beside a field rather than as a report.
 */
export class BacklogValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'backlog.invalid')
    this.name = 'BacklogValidationError'
  }
}
