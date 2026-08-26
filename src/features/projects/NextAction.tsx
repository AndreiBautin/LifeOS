import { ArrowRight, Check } from 'lucide-react'

import { Badge, Button, Card } from '@/components/shared/primitives'
import type { Recommendation } from '@/domain/projects/priority'

import { useSetActionStatus } from './hooks'

/**
 * One thing to do, and the sentence explaining why.
 *
 * The most valuable thing on a daily-use hub, so it is the first thing on
 * the first screen. The reason line is not decoration: an app that tells
 * you what to do without saying why is one you stop believing the third
 * time it is wrong.
 *
 * When there is nothing it says so in a sentence. "Nothing to do" and
 * "something went wrong" must not look the same on a screen opened every
 * morning, which is why the domain returns an explanation rather than a
 * row of empty fields.
 */
export function NextAction({ recommendation }: { readonly recommendation: Recommendation }) {
  const close = useSetActionStatus()

  const { projectId, actionId, actionDescription, projectName, reason } = recommendation

  if (projectId === undefined || actionId === undefined || actionDescription === undefined) {
    return (
      <Card>
        <p className="text-ink-100 font-medium">Nothing to do next</p>
        <p className="text-ink-500 mt-2 text-sm">{reason}</p>
      </Card>
    )
  }

  return (
    <Card className="border-accent-500/30">
      <div className="flex items-start gap-3">
        <ArrowRight size={18} className="text-accent-400 mt-1 shrink-0" aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="text-ink-50 text-lg leading-snug font-semibold">{actionDescription}</p>
          <p className="text-ink-500 mt-1 text-sm">
            {projectName} · {reason}
          </p>
        </div>
      </div>

      <Button
        variant="primary"
        full
        className="mt-4"
        disabled={close.isPending}
        onClick={() => {
          close.mutate({ id: projectId, actionId, done: true })
        }}
      >
        <Check size={16} aria-hidden />
        Done
      </Button>
    </Card>
  )
}

/** A small readout of where a project stands, for the list below. */
export function StatusBadge({ status }: { readonly status: string }) {
  const tone =
    status === 'blocked'
      ? ('warn' as const)
      : status === 'completed'
        ? ('good' as const)
        : status === 'paused'
          ? ('neutral' as const)
          : ('accent' as const)

  return <Badge tone={tone}>{status}</Badge>
}
