import { BookMarked, Newspaper, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { Badge, Button, Card } from '@/components/shared/primitives'
import { SOURCE_LABELS, type Story } from '@/domain/news/story'
import type { RankedStory } from '@/domain/news/digest'
import { createItem } from '@/domain/backlog/item'
import { logger } from '@/shared/logging/logger'

import { savedLinks } from '@/application/use-cases/news/digest'

import { useRetryToday } from '@/features/shared/useRetryToday'

import { DIGEST, useDigest } from './useDigest'

/**
 * This morning's reading, on Today.
 *
 * **It pays no XP, and that is the whole design.** A digest is the one
 * thing in the hub that is not a record of anything you did — reading a
 * headline list is not an act, and paying for marking items read would
 * create exactly the farming incentive the act/outcome line exists to
 * prevent. Finance already runs this way: an area that reports and never
 * pays is not an incomplete area.
 *
 * **The one action lands somewhere that does score.** Saving a story to
 * the Codex makes it a backlog item, and logging progress against that
 * pays `backlog.progress-logged`, and finishing it pays
 * `backlog.item-finished` — both feeding Intellect. So the path from
 * "this looks interesting" to XP goes through a record of having
 * actually read the thing, rather than through having seen a headline.
 *
 * **Silent when there is nothing to say.** No sources, nothing cleared
 * the floor, or the read has not happened means no card — the rule every
 * area card on this screen follows.
 */

function StoryRow({
  ranked,
  onSave,
  saved,
  pending,
}: {
  readonly ranked: RankedStory
  readonly onSave: (story: Story) => void
  readonly saved: boolean
  readonly pending: boolean
}) {
  const { story, hits } = ranked

  return (
    <li className="border-ink-800 flex items-start gap-2 border-b py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        {/*
          The story's own link when it has one, and the discussion when
          it does not. An Ask HN has a null url on the live API, so a row
          that assumed a link would render a dead one.
        */}
        <a
          href={story.url ?? story.discussionUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-ink-50 block text-sm"
        >
          {story.title}
        </a>

        <p className="text-ink-700 mt-0.5 text-xs">
          {SOURCE_LABELS[story.source]}
          <span className="numeric"> · {story.points} points</span>
          {story.comments > 0 && (
            <>
              {' · '}
              <a
                href={story.discussionUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink-500 numeric underline-offset-2 hover:underline"
              >
                {story.comments} comments
              </a>
            </>
          )}
          {/*
            Why it is where it is. The order is interest hits then the
            source's own points, and saying so is what keeps it from
            reading as an opaque ranking.
          */}
          {hits > 0 && <span className="text-accent-400"> · matches your interests</span>}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        disabled={saved || pending}
        aria-label={saved ? `${story.title} is in your Codex` : `Save ${story.title} to the Codex`}
        onClick={() => {
          onSave(story)
        }}
      >
        <BookMarked size={14} aria-hidden className={saved ? 'text-good-500' : undefined} />
      </Button>
    </li>
  )
}

export function DigestCard() {
  const digest = useDigest()
  const services = useServices()
  const client = useQueryClient()
  const retry = useRetryToday((all) => all.digestStore, DIGEST)
  /*
   * Which links are already in the Codex, read rather than remembered.
   *
   * A story can sit on the front page two days running, so without this
   * the card quietly invites the same article twice — and component
   * state alone resets on reload, which is exactly when the duplicate
   * gets made. The same guard `appliedLinks` gives the job leads, for
   * the same reason.
   */
  const alreadySaved = useQuery({
    queryKey: ['news', 'saved-links'],
    queryFn: () => savedLinks(services),
  })

  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set())
  const [open, setOpen] = useState(false)

  /*
   * Saved as an ordinary backlog item, through the domain's own
   * `createItem` — so it arrives validated, with an id and a stamp, and
   * is indistinguishable from one typed by hand. A story is an article,
   * which is what the `articles` category is for.
   */
  const save = useMutation({
    mutationFn: async (story: Story) => {
      const item = createItem(
        {
          title: story.title,
          category: 'articles',
          /*
           * `backlog`, not the person's configured default status.
           *
           * That default is a preference about where things they type in
           * should start; a story saved off a headline is definitionally
           * something they have not read yet, and filing it as
           * `currently-using` would put it on the goals board claiming a
           * daily target nobody set.
           */
          status: 'backlog',
          priority: 'medium',
          notes: story.url ?? story.discussionUrl,
        },
        services,
      )

      await services.items.save(item)
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['backlog'] })
      void client.invalidateQueries({ queryKey: ['news', 'saved-links'] })
      void client.invalidateQueries({ queryKey: ['today'] })
    },
    onError: (error: unknown) => {
      logger.error('digest.save-failed', { message: String(error) })
    },
  })

  if (digest === undefined) return null

  const { stories, failures } = digest
  if (stories.length === 0 && failures.length === 0) return null

  // Three is a glance; the rest is a decision to read more.
  const shown = open ? stories : stories.slice(0, 3)

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Newspaper size={16} className="text-ink-500 shrink-0" aria-hidden />
        <p className="text-ink-50 flex-1 text-sm font-medium">This morning</p>
        {stories.length > 0 && <Badge tone="neutral">{stories.length}</Badge>}
      </div>

      {save.isError && (
        <p role="alert" className="text-bad-500 text-xs">
          That could not be saved to the Codex.
        </p>
      )}

      {/*
        **The failures, and a way out of them.** They used to be two red
        lines and nothing else: the gate remembers a run for the rest of
        the day, and a run where every source failed is still a
        remembered run — so a single bad moment on a resuming phone
        pinned "Hacker News could not be read" to the screen until
        midnight with nothing anywhere able to try again.

        Pressing it forgets today and re-runs. That is a decision rather
        than a storm, which is exactly the distinction `once-a-day.ts`
        described and had no control for.
      */}
      {failures.length > 0 && (
        <div className="mb-1">
          {failures.map((failure) => (
            <p key={failure.source} className="text-warn-500 text-xs">
              {failure.reason}
            </p>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="mt-1"
            onClick={() => {
              retry()
            }}
          >
            <RefreshCw size={14} aria-hidden />
            Try again
          </Button>
        </div>
      )}

      <ul>
        {shown.map((ranked) => (
          <StoryRow
            key={ranked.story.id}
            ranked={ranked}
            saved={
              saved.has(ranked.story.id) ||
              (alreadySaved.data?.has(ranked.story.url ?? ranked.story.discussionUrl) ?? false)
            }
            pending={save.isPending}
            onSave={(story) => {
              save.mutate(story, {
                /*
                 * Marked saved only once the write succeeded. Marking
                 * optimistically is how the first version of this hid a
                 * failure: the domain refused an invented status, the
                 * error went to the log, and the tick turned green over
                 * a record that did not exist.
                 */
                onSuccess: () => {
                  setSaved((was) => new Set([...was, story.id]))
                },
              })
            }}
          />
        ))}
      </ul>

      {stories.length > shown.length && (
        <Button
          variant="ghost"
          size="sm"
          full
          onClick={() => {
            setOpen(true)
          }}
        >
          {stories.length - shown.length} more
        </Button>
      )}

      {/*
        Said plainly, because it is the thing that keeps this honest. The
        digest pays nothing; the Codex does, and only once you have
        logged actually reading something.
      */}
      <p className="text-ink-700 mt-1 text-xs">
        Reading pays nothing. Saving to the Codex and logging progress there does.
      </p>
    </Card>
  )
}
