import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { allBullets, type Company, type Resume } from '@/domain/resume/resume'

import { useAddRole, useRemoveRole, useResume, useSaveResume } from './hooks'

/**
 * The resume, structured — because tailoring means choosing parts of it.
 *
 * A PDF is a picture of a resume. What an application needs is the thing
 * underneath: which bullets exist, which went out for a given role, and
 * which summary was on top. None of that is answerable about a file.
 *
 * **Bulk entry is a paste, not a parser.** Bullets arrive one to a line
 * in a textarea and are split on newlines. Guessing structure out of
 * arbitrary resume text works on the document it was written against and
 * quietly mangles the next one — and a mangled resume is worse than an
 * empty one, because it looks finished.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'

const AREA =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 w-full rounded-xl border p-3 text-sm'

function Header({ resume }: { readonly resume: Resume }) {
  const save = useSaveResume()
  const [name, setName] = useState(resume.name)
  const [contact, setContact] = useState(resume.contact)
  const [summary, setSummary] = useState(resume.summary)

  const dirty = name !== resume.name || contact !== resume.contact || summary !== resume.summary

  return (
    <Card className="space-y-3">
      <input
        className={FIELD}
        aria-label="Name"
        placeholder="Your name"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
        }}
      />
      <input
        className={FIELD}
        aria-label="Contact line"
        placeholder="City · email · phone · links"
        value={contact}
        onChange={(event) => {
          setContact(event.target.value)
        }}
      />
      <textarea
        className={AREA}
        rows={4}
        aria-label="Summary"
        placeholder="The paragraph at the top"
        value={summary}
        onChange={(event) => {
          setSummary(event.target.value)
        }}
      />

      {/*
        Saved on a press, not on every keystroke. A resume is written in
        long passes rather than a field at a time, and autosaving a
        half-typed sentence into the thing an application quotes from is
        the wrong default.
      */}
      <Button
        variant={dirty ? 'primary' : 'outline'}
        full
        disabled={!dirty || save.isPending}
        onClick={() => {
          save.mutate({ ...resume, name, contact, summary })
        }}
      >
        {dirty ? 'Save' : 'Saved'}
      </Button>
    </Card>
  )
}

function CompanyCard({ company }: { readonly company: Company }) {
  const remove = useRemoveRole()

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-ink-50 text-sm font-semibold">{company.name}</p>
        {company.location !== undefined && (
          <p className="text-ink-700 text-xs">{company.location}</p>
        )}
      </div>

      {company.roles.map((role) => (
        <div key={role.id} className="border-ink-800 border-t pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-300 text-sm font-medium">{role.title}</span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove ${role.title}`}
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(role.id)
              }}
            >
              <Trash2 size={14} aria-hidden />
            </Button>
          </div>
          <p className="text-ink-700 numeric text-xs">
            {role.from} – {role.to ?? 'Present'}
          </p>

          <ul className="mt-2 space-y-1.5">
            {role.bullets.map((bullet) => (
              <li key={bullet.id} className="text-ink-500 flex gap-2 text-xs">
                <span aria-hidden>·</span>
                <span className="flex-1">{bullet.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  )
}

function AddRole({ onDone }: { readonly onDone: () => void }) {
  const add = useAddRole()
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [title, setTitle] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [bullets, setBullets] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (company.trim() === '' || title.trim() === '') return

          add.mutate({ company, location, title, from, to, bullets }, { onSuccess: onDone })
        }}
      >
        {/*
          The employer is matched by name, so typing one that already
          exists files this under it as a second role rather than
          repeating the heading. Said on the screen, because a field that
          silently merges is a field somebody will be surprised by.
        */}
        <input
          className={FIELD}
          aria-label="Company"
          placeholder="Company — an existing one adds a role to it"
          value={company}
          onChange={(event) => {
            setCompany(event.target.value)
          }}
        />
        <input
          className={FIELD}
          aria-label="Location"
          placeholder="Location (optional)"
          value={location}
          onChange={(event) => {
            setLocation(event.target.value)
          }}
        />
        <input
          className={FIELD}
          aria-label="Title"
          placeholder="Title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />
        <div className="flex gap-2">
          <input
            className={FIELD}
            aria-label="From"
            placeholder="From"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value)
            }}
          />
          <input
            className={FIELD}
            aria-label="To"
            placeholder="To — blank for present"
            value={to}
            onChange={(event) => {
              setTo(event.target.value)
            }}
          />
        </div>

        <label className="block space-y-1">
          <span className="text-ink-500 text-xs">Bullets — one a line</span>
          <textarea
            className={AREA}
            rows={6}
            aria-label="Bullets"
            placeholder="Paste them straight in. Leading dots are stripped."
            value={bullets}
            onChange={(event) => {
              setBullets(event.target.value)
            }}
          />
        </label>

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add the role
        </Button>
      </form>
    </Card>
  )
}

export function ResumePage() {
  const resume = useResume()
  const [adding, setAdding] = useState(false)

  const current = resume.data

  return (
    <div>
      <PageHeader title="Resume" subtitle="The thing under the PDF" />

      {current === undefined ? null : (
        <>
          <Section title="Top" description="Name, contact line, and the summary">
            <Header key={current.updatedAt ?? 'new'} resume={current} />
          </Section>

          <Section
            title="Experience"
            description={`${String(allBullets(current).length)} bullets to choose from`}
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
              <AddRole
                onDone={() => {
                  setAdding(false)
                }}
              />
            )}

            {current.companies.length === 0 ? (
              <Card>
                <Empty title="Nothing yet">
                  A role at a time, with its bullets pasted one to a line. Typing a company you have
                  already added files the new role under it, so a promotion reads as one.
                </Empty>
              </Card>
            ) : (
              <div className="space-y-3">
                {current.companies.map((company) => (
                  <CompanyCard key={company.id} company={company} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
