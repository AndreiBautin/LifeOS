import { Plus } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { JOBS } from '@/domain/base/base'
import { APPLICATION_STAGES } from '@/domain/jobs/application'
import type { Project } from '@/domain/projects/project'

import { useAddProject, useJobApplications, useSetActionStatus } from '../projects/hooks'

/**
 * The job search: what is out, and how far each one has got.
 *
 * **An application is a `Project`, not a new record.** It has a name, a
 * fixed set of stages and a home — the shape a house job already is, and
 * a second implementation of "a thing with steps" would be a second
 * place for a bug about steps to live.
 *
 * **No level, and that was decided in phase 0.** `registry.ts` gives
 * this area no ladders, with the reason attached: a campaign has stages
 * and an end, which is not the same as having a ceiling — there is no
 * such thing as being maximally good at looking for work. What it has
 * instead is one act and one rating.
 */

/**
 * One application, and the one thing you can do to it: advance it.
 *
 * Advancing is closing the next stage, which is the whole reason the
 * stages are `ActionItem`s — `completedAt` records the date, and
 * `jobs.stage-advances-in-month` is a count of those dates. Storing a
 * current stage instead would say where each application is and never
 * when it got there.
 */
function ApplicationRow({ application }: { readonly application: Project }) {
  const advance = useSetActionStatus()

  const open = application.actions.filter((action) => action.status !== 'done')
  const done = application.actions.length - open.length
  const next = open[0]

  return (
    <li className="border-ink-800 border-b py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-50 min-w-0 flex-1 truncate text-sm font-medium">
          {application.name}
        </span>
        {next === undefined ? (
          <Badge tone="good">Offer</Badge>
        ) : (
          <span className="text-ink-500 numeric shrink-0 text-xs">
            {done}/{application.actions.length}
          </span>
        )}
      </div>

      {next !== undefined && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-ink-500 flex-1 truncate text-xs">Next: {next.description}</span>
          {/*
            Named for the stage rather than labelled "Advance", because
            the button is the record of an event and the event has a
            name. It also stops the row reading as a to-do list: these
            are things that happened to you, not things you did.
          */}
          <Button
            size="sm"
            variant="outline"
            disabled={advance.isPending}
            onClick={() => {
              advance.mutate({ id: application.id, actionId: next.id, done: true })
            }}
          >
            Reached {next.description.toLowerCase()}
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * Sending one, which is the only act this area pays for.
 *
 * Thirty XP on creation — between a side-quest step and a main one —
 * because sending is the part you decide. Everything after it is an
 * outcome and pays nothing.
 */
function AddApplication({ onDone }: { readonly onDone: () => void }) {
  const add = useAddProject()
  const [name, setName] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return

          add.mutate(
            { name, belongsTo: JOBS, steps: [...APPLICATION_STAGES] },
            { onSuccess: onDone },
          )
          setName('')
        }}
      >
        <input
          className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm"
          aria-label="Company and role"
          placeholder="Acme — Backend engineer"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
        />

        {/*
          Stated rather than offered, unlike a house job's steps. Every
          application has the same three stages ahead of it and none of
          them is optional — you do not decline to be interviewed — so a
          checkbox would be asking a question with one answer.
        */}
        <p className="text-ink-700 text-xs">
          Opens with {APPLICATION_STAGES.join(', ').toLowerCase()} ahead of it.
        </p>

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Sent it
        </Button>
      </form>
    </Card>
  )
}

export function JobsPage() {
  const applications = useJobApplications()
  const [adding, setAdding] = useState(false)

  const all = applications.data ?? []
  const live = all.filter((one) => one.actions.some((action) => action.status !== 'done'))
  const landed = all.filter((one) => one.actions.every((action) => action.status === 'done'))

  return (
    <div>
      <PageHeader title="Job search" subtitle="What is out, and how far each one has got" />

      <Section
        title="Out there"
        description="Sent, and waiting on somebody else"
        action={
          <Button
            variant={adding ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => {
              setAdding(!adding)
            }}
          >
            {adding ? 'Close' : 'Add'}
          </Button>
        }
      >
        {adding && (
          <AddApplication
            onDone={() => {
              setAdding(false)
            }}
          />
        )}

        <Card>
          {applications.data === undefined ? null : live.length === 0 ? (
            <Empty title="Nothing out">
              An application opens with the stages ahead of it. Sending one is worth XP; reaching an
              interview is not — that is something that happened to you, and this app pays for what
              you did.
            </Empty>
          ) : (
            <ul>
              {live.map((application) => (
                <ApplicationRow key={application.id} application={application} />
              ))}
            </ul>
          )}
        </Card>
      </Section>

      {landed.length > 0 && (
        <Section title="Through every stage" description="Nothing left to wait on">
          <Card>
            <ul>
              {landed.map((application) => (
                <ApplicationRow key={application.id} application={application} />
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </div>
  )
}
