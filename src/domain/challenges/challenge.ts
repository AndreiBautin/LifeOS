import { monthsIn, toSeasonId, type SeasonKey } from '@/domain/game/season'

/**
 * Seasonal challenges, and the pass they fill.
 *
 * Asked for as _"what if we added seasonal 'challenges' that would be
 * worth extra xp, and completing them would be working through a 'battle
 * pass'. Think more like completing holidays stuff and events related to
 * that time."_
 *
 * **The pass fills against the challenges that exist, not against tiers
 * the app invented.** That is the whole of how this fits the model. A
 * battle pass normally has a hundred numbered tiers at thresholds
 * somebody chose, which `domain/game/season.ts` already refuses in
 * writing as "a scale the app can move"; here the denominator is a real
 * count — nine challenges this season, four done — so the bar means
 * something checkable and nothing had to be made up.
 *
 * **A challenge is an act, which is why it may pay at all.** Carving a
 * pumpkin is a thing you decided to do and then did. It is not an
 * outcome, so paying for it is not the streak mistake in a costume, and
 * the rate is flat like every other act here — difficulty deliberately
 * does not scale XP, the rule `domain/mind/practice.ts` already holds.
 *
 * **Completion is never gated by the window.** A Halloween challenge
 * ticked in January is odd and is still a thing you did; refusing it
 * would be the app policing somebody's calendar, which is the same call
 * campaign stages made in being ordered but not gated.
 */

/** Flat, like every other act. */
export const CHALLENGE_XP = 40

/**
 * A challenge the app ships, keyed to a window that repeats every year.
 *
 * `from` and `to` are `MM-DD` rather than dates, because the catalogue
 * describes Halloween rather than Halloween 2026 — the year is supplied
 * by the season being asked about, which is what lets one row serve
 * every year without a migration each December.
 */
export interface ShippedChallenge {
  readonly slug: string
  /** What it belongs to, for grouping on screen. */
  readonly event: string
  readonly title: string
  readonly blurb: string
  /** `MM-DD`. */
  readonly from: string
  readonly to: string
}

/** A challenge somebody wrote themselves, scoped to one season. */
export interface OwnChallenge {
  readonly title: string
  /** The season it belongs to, from `toSeasonId`. */
  readonly seasonId: string
}

/**
 * What the person has done to the challenge list.
 *
 * **One stored shape covers all three edits**, which is what keeps the
 * shipped catalogue editable without a second store: a completion, a
 * removal, and a challenge of their own are all "something said about a
 * challenge id". A shipped instance is addressed as `<slug>:<year>`, so
 * ticking Halloween 2026 says nothing about Halloween 2027 — the bug a
 * bare slug would have.
 *
 * `hiddenAt` is how a shipped challenge is removed. It cannot be
 * deleted, because the catalogue ships in the bundle and would put it
 * straight back on the next release — the same reason a retired habit
 * keeps a stamp rather than being dropped.
 */
export interface ChallengeMark {
  readonly id: string
  readonly completedAt?: string
  readonly hiddenAt?: string
  /** Present only for a challenge the person wrote. */
  readonly own?: OwnChallenge
  readonly updatedAt?: string
}

/** A challenge resolved for one season, ready to draw. */
export interface Challenge {
  readonly id: string
  readonly title: string
  readonly event?: string
  readonly blurb?: string
  /** ISO dates, present only on a shipped challenge. */
  readonly from?: string
  readonly to?: string
  readonly completedAt?: string
  readonly own: boolean
}

export interface ChallengePass {
  readonly challenges: readonly Challenge[]
  readonly done: number
  readonly total: number
}

const monthOf = (monthDay: string): string => monthDay.slice(0, 2)

/**
 * The challenges for one season, with the person's edits applied.
 *
 * A shipped row is placed by the month its window opens in: the season
 * already knows its own three `YYYY-MM` months, so matching on the month
 * supplies the year. That is what makes Winter work without a special
 * case — it spans a year boundary, and a challenge on 12-27 lands in the
 * December that season actually contains rather than in the calendar
 * year the season is named for.
 */
export function challengesFor(
  season: SeasonKey,
  marks: readonly ChallengeMark[],
  catalogue: readonly ShippedChallenge[] = SHIPPED_CHALLENGES,
): readonly Challenge[] {
  const months = monthsIn(season)
  const byId = new Map(marks.map((mark) => [mark.id, mark]))
  const seasonId = toSeasonId(season)

  const shipped = catalogue.flatMap((one): Challenge[] => {
    const month = months.find((key) => key.slice(5, 7) === monthOf(one.from))
    if (month === undefined) return []

    const year = Number(month.slice(0, 4))
    /* A window closing in an earlier month has run into the next year. */
    const toYear = Number(monthOf(one.to)) < Number(monthOf(one.from)) ? year + 1 : year
    const id = shippedIdFor(one.slug, year)
    const mark = byId.get(id)

    if (mark?.hiddenAt !== undefined) return []

    return [
      {
        id,
        title: one.title,
        event: one.event,
        blurb: one.blurb,
        from: `${String(year)}-${one.from}`,
        to: `${String(toYear)}-${one.to}`,
        ...(mark?.completedAt === undefined ? {} : { completedAt: mark.completedAt }),
        own: false,
      },
    ]
  })

  const own = marks.flatMap((mark): Challenge[] => {
    if (mark.own === undefined || mark.hiddenAt !== undefined) return []
    if (mark.own.seasonId !== seasonId) return []

    return [
      {
        id: mark.id,
        title: mark.own.title,
        ...(mark.completedAt === undefined ? {} : { completedAt: mark.completedAt }),
        own: true,
      },
    ]
  })

  /*
   * Shipped first and in catalogue order, own last in the order they
   * were written. Sorting by completion would move a row under the thumb
   * that ticked it, which is the churn the dailies list is deliberately
   * ordered chronologically to avoid.
   */
  return [...shipped, ...own]
}

export function passFor(challenges: readonly Challenge[]): ChallengePass {
  return {
    challenges,
    done: challenges.filter((one) => one.completedAt !== undefined).length,
    total: challenges.length,
  }
}

/** The id a shipped challenge takes in a given year. */
export function shippedIdFor(slug: string, year: number): string {
  return `${slug}:${String(year)}`
}

/**
 * The shipped catalogue.
 *
 * **Northern-hemisphere and largely American, which is a real limit
 * rather than an oversight.** The season model is already northern and
 * says so — meteorological, Dec–Feb winter — and these are the holidays
 * of the person the app was written for. Anything here can be removed on
 * the screen, and anything missing can be added, which is why a shipped
 * list is defensible at all: it is a starting point somebody can edit,
 * not the app asserting what your year contains.
 *
 * Windows are generous on purpose. A challenge is not a deadline, and a
 * one-day window on a working Tuesday reads as a thing you already
 * failed.
 */
export const SHIPPED_CHALLENGES: readonly ShippedChallenge[] = [
  // Autumn
  {
    slug: 'harvest-walk',
    event: 'Turning of the year',
    title: 'Walk somewhere the leaves have turned',
    blurb: 'The one thing autumn does that no other season can.',
    from: '09-20',
    to: '10-31',
  },
  {
    slug: 'halloween-carve',
    event: 'Halloween',
    title: 'Carve something',
    blurb: 'A pumpkin, ideally. Nobody is checking.',
    from: '10-20',
    to: '10-31',
  },
  {
    slug: 'halloween-horror',
    event: 'Halloween',
    title: 'Watch something frightening',
    blurb: 'Save it to the Codex first and it pays twice.',
    from: '10-20',
    to: '10-31',
  },
  {
    slug: 'thanksgiving-cook',
    event: 'Thanksgiving',
    title: 'Cook for somebody else',
    blurb: 'Feeding people is the whole holiday.',
    from: '11-20',
    to: '11-30',
  },
  {
    slug: 'thanksgiving-move',
    event: 'Thanksgiving',
    title: 'Move before the meal',
    blurb: 'A trot, a walk, a session. Anything before the table.',
    from: '11-20',
    to: '11-30',
  },

  // Winter
  {
    slug: 'winter-give',
    event: 'Midwinter',
    title: 'Give something away',
    blurb: 'Something you own and do not need. The house gets lighter too.',
    from: '12-01',
    to: '12-24',
  },
  {
    slug: 'christmas-make',
    event: 'Christmas',
    title: 'Make rather than buy one gift',
    blurb: 'One is enough for this to count.',
    from: '12-01',
    to: '12-25',
  },
  {
    slug: 'christmas-see',
    event: 'Christmas',
    title: 'See somebody you have not seen this year',
    blurb: 'The Party screen will know if you log it.',
    from: '12-18',
    to: '12-31',
  },
  {
    slug: 'newyear-review',
    event: 'New Year',
    title: 'Read back over the year',
    blurb: 'The seasons are the record. Not a resolution — a look.',
    from: '12-27',
    to: '01-07',
  },
  {
    slug: 'newyear-cold',
    event: 'New Year',
    title: 'Get in cold water',
    blurb: 'Briefly. It is traditional and it is horrible.',
    from: '01-01',
    to: '01-07',
  },
  {
    slug: 'deep-winter-book',
    event: 'Deep winter',
    title: 'Finish a book while it is dark',
    blurb: 'February exists for this.',
    from: '02-01',
    to: '02-28',
  },

  // Spring
  {
    slug: 'spring-clean',
    event: 'Spring',
    title: 'Clear one room properly',
    blurb: 'Then record it on Base and watch the number move.',
    from: '03-01',
    to: '04-30',
  },
  {
    slug: 'spring-grow',
    event: 'Spring',
    title: 'Plant something',
    blurb: 'A pot on a windowsill counts.',
    from: '03-15',
    to: '05-31',
  },
  {
    slug: 'spring-outside',
    event: 'First warm day',
    title: 'Eat a meal outside',
    blurb: 'The first one of the year is the one that counts.',
    from: '04-01',
    to: '05-31',
  },
  {
    slug: 'spring-new-route',
    event: 'Spring',
    title: 'Walk a route you have never walked',
    blurb: 'The Map keeps the fog. This is how it clears.',
    from: '04-01',
    to: '05-31',
  },

  // Summer
  {
    slug: 'solstice-late',
    event: 'Midsummer',
    title: 'Stay out until it gets dark',
    blurb: 'On the longest day that is a commitment.',
    from: '06-15',
    to: '06-30',
  },
  {
    slug: 'summer-water',
    event: 'Summer',
    title: 'Swim outdoors',
    blurb: 'Sea, lake, river, pool. Not the bath.',
    from: '06-01',
    to: '08-31',
  },
  {
    slug: 'summer-trip',
    event: 'Summer',
    title: 'Sleep somewhere that is not home',
    blurb: 'One night away is a trip.',
    from: '06-01',
    to: '08-31',
  },
  {
    slug: 'summer-heat',
    event: 'High summer',
    title: 'Train outside in the heat',
    blurb: 'Early, and take water.',
    from: '07-01',
    to: '08-31',
  },
]
