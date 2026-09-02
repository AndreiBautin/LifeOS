import { Brain, FileText, Plus } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { buttonStyles } from '@/components/shared/styles'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { JOBS } from '@/domain/base/base'
import { APPLICATION_STAGES } from '@/domain/jobs/application'
import type { Project } from '@/domain/projects/project'

import { matchResume } from '@/domain/jobs/match'
import { LeadsSection } from './LeadsSection'
import { useResume } from '../resume/hooks'
import {
  useAddProject,
  useJobApplications,
  useSetActionStatus,
  useUpdateProject,
} from '../projects/hooks'

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
/**
 * The posting, and what it asks for that the resume does not say.
 *
 * **Stored in `description`, which is the field a project already has.**
 * For an application the posting *is* the description of the thing, and
 * a parallel field would be a second place for the same text — the same
 * reuse that makes a house job a project rather than a new record.
 *
 * **A word match, said plainly on the screen.** It cannot tell that
 * "orchestration" and "Kubernetes" are about the same paragraph, and
 * claiming more than it does would be worse than the feature not
 * existing. What it answers is the question nobody can answer reliably
 * by eye at eleven at night: which words in this posting appear nowhere
 * in my resume.
 */
function Posting({ application }: { readonly application: Project }) {
  const update = useUpdateProject()
  const resume = useResume()
  const [text, setText] = useState(application.description ?? '')

  const saved = application.description ?? ''

  /*
   * The employer is excluded from the comparison. An application
   * approved from a lead is named "ramp — Senior Security Engineer", so
   * the half before the dash is the company — and a posting says its own
   * name constantly, ten times in the first real one tried, while never
   * requiring it of the applicant. Left in, it sorts straight to the top
   * of the gap list, which is the first thing anybody reads.
   */
  const employer = application.name.split('—')[0] ?? ''

  const match =
    resume.data === undefined || saved.trim() === ''
      ? undefined
      : matchResume(saved, resume.data, [employer])

  return (
    <div className="border-ink-800 mt-2 space-y-3 border-t pt-3">
      <textarea
        className="bg-ink-900 border-ink-700 text-ink-50 placeholder:text-ink-700 w-full rounded-xl border p-3 text-sm"
        rows={5}
        aria-label={`Posting for ${application.name}`}
        placeholder="Paste the job description"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
      />

      {text !== saved && (
        <Button
          variant="primary"
          size="sm"
          full
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ id: application.id, changes: { description: text } })
          }}
        >
          Save the posting
        </Button>
      )}

      {match !== undefined && (
        <>
          <p className="text-ink-700 text-xs">
            {/*
              The number is a word overlap and is labelled as one. A bare
              percentage would read as a judgement about whether to
              apply, which nothing here is entitled to make.
            */}
            {match.share === undefined
              ? 'Nothing to compare yet.'
              : `${String(Math.round(match.share * 100))}% of the words in this posting appear somewhere in your resume. It is a word match — it does not read either document.`}
          </p>

          {/*
            Phrases first, and above the single words on purpose. "azure
            functions" missing while "azure" is covered is the sharpest
            thing on the panel — a specific gap inside something you do
            know — and it would be lost among thirty single words.
          */}
          {match.missingPhrases.length > 0 && (
            <div>
              <p className="text-ink-500 mb-1 text-xs tracking-wide uppercase">
                Phrases the posting uses
              </p>
              <div className="flex flex-wrap gap-1">
                {match.missingPhrases.slice(0, 12).map((term) => (
                  <span
                    key={term.word}
                    className="border-warn-500/40 text-warn-500 rounded-lg border px-2 py-0.5 text-xs"
                  >
                    {term.word}
                    {term.count > 1 && <span className="text-ink-700"> ×{term.count}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {match.missing.length > 0 && (
            <div>
              <p className="text-ink-500 mb-1 text-xs tracking-wide uppercase">
                Not in your resume
              </p>
              <div className="flex flex-wrap gap-1">
                {match.missing.slice(0, 24).map((term) => (
                  <span
                    key={term.word}
                    className="border-warn-500/40 text-warn-500 numeric rounded-lg border px-2 py-0.5 text-xs"
                  >
                    {term.word}
                    {term.count > 1 && <span className="text-ink-700"> ×{term.count}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {match.covered.length > 0 && (
            <div>
              <p className="text-ink-500 mb-1 text-xs tracking-wide uppercase">Already covered</p>
              <div className="flex flex-wrap gap-1">
                {match.covered.slice(0, 24).map((term) => (
                  <span
                    key={term.word}
                    className="border-ink-800 text-ink-500 numeric rounded-lg border px-2 py-0.5 text-xs"
                  >
                    {term.word}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ApplicationRow({ application }: { readonly application: Project }) {
  const advance = useSetActionStatus()
  const [showing, setShowing] = useState(false)

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
        <Button
          variant="ghost"
          size="sm"
          /* Not the same name as the textarea it reveals — two controls
             with one name is two things a screen reader cannot tell apart. */
          aria-label={`${showing ? 'Hide' : 'Show'} the posting for ${application.name}`}
          aria-expanded={showing}
          onClick={() => {
            setShowing(!showing)
          }}
        >
          <FileText size={14} aria-hidden />
        </Button>
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

      {showing && <Posting application={application} />}
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
      {/*
        **Resume and Mind hang off this screen**, asked for as _"resume
        should be navigable from the improve income/job search stuff, and
        mind is really training for job interviews so it should probably
        go to there."_

        Both were stray links in a block on the home page. A header
        action is where this app already puts the screens that belong to
        another — Train carries Plan and History the same way — and the
        difference from the block is that these are *about* job hunting
        rather than merely also lacking a tab.

        The resume is the document these applications are matched
        against, so the link is where the matching happens. Mind is a
        wider area than interview prep and this is the reading of it that
        earns the link; if practice ever stops being about interviews,
        this is the placement to revisit.
      */}
      <PageHeader
        title="Job search"
        subtitle="What is out, and how far each one has got"
        action={
          <>
            <Link to="/resume" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
              <FileText size={16} aria-hidden />
              Resume
            </Link>
            <Link to="/mind" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
              <Brain size={16} aria-hidden />
              Mind
            </Link>
          </>
        }
      />

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

      <LeadsSection />

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
