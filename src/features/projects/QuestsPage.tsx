import { useCampaigns } from '@/features/campaign/hooks'

import { PageHeader } from '@/components/shared/PageHeader'
import { ActiveQuests } from './ActiveQuests'
import { QuestBoard } from './QuestBoard'
import { useActiveQuests } from './hooks'
import { Campaigns } from '@/features/campaign/Campaigns'
import { GoalsCard } from '@/features/goals/GoalsCard'

/**
 * `/quests` — its own page again.
 *
 * **This folded into Today for a while, and un-folded once Today had
 * four zones' worth of content on one screen.** Folded in on *"maybe
 * just consider condensing pages, as its not enough content to fill a
 * page in a full monitor screen without looking awkward"* — and
 * un-folded once that and two other folds (Finance, Train) had made
 * Today taller than any landscape-desktop window could show without
 * shrinking everything illegibly small. See `HomePage`'s own doc for
 * the diagnosis that led here: the actual cause of a persistent "still
 * looks cramped" report was a scale-to-fit transform, not a width bug,
 * and the fix for that transform firing on nearly every real window is
 * to give each of the four folded zones its own screen again rather
 * than keep asking one page to hold all of them at once.
 *
 * **Two columns, not one auto-balanced masonry flow.** The version of
 * this that lived on Today ran every card — `ActiveQuests`, `GoalsCard`,
 * `Campaigns`, and `QuestBoard`'s own `Suggested`/`Contracts`/`The
 * board` triplet — through one `column-width` flow, which is seven or
 * more blocks of wildly different heights for `column-fill:balance` to
 * guess at. Reported plainly, with a screenshot: a wide gap under
 * "Suggested"/"Contracts" beside a column-and-a-half of "The board"
 * still running. That is the exact failure this codebase's own history
 * already names for Today's zone — *"`column-fill:balance` genuinely
 * struggles with only four blocks of wildly different heights"* — one
 * masonry column short by construction, not a bug to chase further.
 *
 * The fix is the same one already applied there: stop asking an
 * algorithm to balance a handful of unevenly-sized blocks and pick the
 * split by hand instead. **Left is what you are actively working on** —
 * the main/side quest cards, goals, and the arc in full. **Right is the
 * board** — what is suggested, what came up, and everything open or
 * finished. That is a genuine content split as well as a height one:
 * the left column is short and changes daily, the right is long and is
 * read less often, so a shorter left column ending above a longer right
 * one is not a gap needing to be filled, the way it is not a bug when
 * two ordinary web pages sitting side by side happen to differ in
 * length.
 */
export function QuestsPage() {
  const active = useActiveQuests()
  /*
   * The first arc with something outstanding. Several arcs are possible
   * and one that is finished has nothing to say about what you are
   * working on now.
   */
  const arcs = useCampaigns()
  const leadingArc = (arcs.data ?? []).find((one) => one.next !== undefined)

  return (
    <div className="space-y-4">
      <PageHeader title="Quests" />

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-6">
          <ActiveQuests
            main={active.data?.main}
            side={active.data?.side}
            {...(leadingArc === undefined ? {} : { arc: leadingArc })}
          />

          {/*
            Silent unless a goal has something available to work on next
            — see the note in `GoalsCard`. A goal is a planning surface
            rather than a quest, so this sits beside the quests it is
            adjacent to in spirit without pretending to be one.
          */}
          <GoalsCard />

          {/*
            `Campaigns` is the arc at full size (every stage, every lap,
            editable), which `ActiveQuests`' `ArcSlot` only ever
            summarised. It is a fragment returning one `<Section>` per
            arc, so several arcs stack as several sections rather than
            one giant one.
          */}
          <Campaigns />
        </div>

        <div className="space-y-6">
          <QuestBoard />
        </div>
      </div>
    </div>
  )
}
