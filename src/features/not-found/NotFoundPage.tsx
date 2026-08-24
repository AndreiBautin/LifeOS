import { Link } from 'react-router-dom'

import { Empty } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

export function NotFoundPage() {
  return (
    <Empty title="Nothing here">
      <p>That page does not exist.</p>
      <Link to="/train" className={cn(buttonStyles({ variant: 'primary' }), 'mt-4')}>
        Back to training
      </Link>
    </Empty>
  )
}
