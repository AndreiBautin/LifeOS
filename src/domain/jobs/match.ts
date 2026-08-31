import { allBullets, type Resume } from '@/domain/resume/resume'

/**
 * What a job description asks for, against what the resume says.
 *
 * **A word match, and it says so on the screen.** It does not understand
 * the posting: it cannot tell that "orchestration" and "Kubernetes" are
 * about the same paragraph, and it will not notice that five years of
 * something is being asked for. What it does is answer the one question
 * a person cannot answer reliably by eye at eleven at night — *which
 * words in this posting appear nowhere in my resume* — and that is worth
 * having on its own.
 *
 * The alternative is a language model, which needs a key, which in a
 * client-only app is a key anybody can read. This needs neither, runs
 * offline, and is the same answer every time it is asked.
 */

/**
 * Splits text into comparable terms.
 *
 * **Punctuation is kept inside a token, and that is the whole
 * difficulty.** The obvious tokeniser strips non-letters, which turns
 * `C#` into `c`, `.NET` into `net` and `Node.js` into two words — on a
 * software posting that is most of the vocabulary destroyed before the
 * comparison starts. So `#`, `+` and `.` survive *within* a run of
 * characters and are trimmed only from the ends.
 *
 * Lower-cased, because `Azure` and `azure` are the same requirement.
 *
 * **Single characters are dropped, and that loses C and R.** Both are
 * real languages and both are also the commonest stray letters in
 * English prose — a posting with a bullet lettered "c)" would
 * otherwise report C as a requirement. Losing two languages is the
 * cheaper of the two mistakes, and `C#` and `C++` survive because
 * their punctuation does.
 */
export function tokenise(text: string): readonly string[] {
  return everyWord(text).filter(worthComparing)
}

/**
 * Every word in order, stopwords included.
 *
 * Adjacency is the whole reason this exists separately. A phrase can
 * only be trusted if its two halves were *next to each other in the
 * posting*, and filtering first destroys that: "strong Azure and
 * scalable Functions" collapses to `azure, functions` and would invent
 * "azure functions" out of a sentence that never said it.
 */
function everyWord(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9#+.]+/)
    .map((token) => token.replace(/^[.]+|[.]+$/g, ''))
}

function worthComparing(token: string): boolean {
  if (token.length <= 1 || STOPWORDS.has(token)) return false

  /*
   * **A bare number is never a skill.** Real postings are full of them —
   * "100% of premiums", "16 weeks", "401" — and they sorted straight to
   * the top of a gap list by frequency, which is the one place they do
   * the most damage.
   */
  if (ONLY_DIGITS.test(token)) return false

  /*
   * **The tail of a contraction is not a word.** The tokeniser splits on
   * the apostrophe, so "we'll" leaves "ll" behind — five of them in one
   * posting, reported as something missing from a resume.
   */
  return !CONTRACTION_TAILS.has(token)
}

const ONLY_DIGITS = new RegExp('^[0-9.]+$')

const CONTRACTION_TAILS = new Set(['ll', 've', 're', 'nt', 'st', 'th', 'em'])

/**
 * Two-word phrases, from words that were genuinely adjacent.
 *
 * **"azure functions" is a different requirement from "azure".** A word
 * match reports Azure covered and says nothing about the gap, which on a
 * posting built out of product names is most of what it was asked. Both
 * halves must be worth comparing on their own, so a stopword between
 * them breaks the pair rather than being stepped over — that is what
 * stops "experience with Azure" becoming a phrase.
 *
 * Two words and not three. Trigrams are mostly noise on a posting of
 * this length, and the first thing they would produce is a longer list
 * to read, which is the opposite of the point.
 */
export function phrases(text: string): readonly string[] {
  const found: string[] = []

  for (const segment of segments(text)) {
    const words = everyWord(segment)
    for (let i = 0; i + 1 < words.length; i += 1) {
      const first = words[i] ?? ''
      const second = words[i + 1] ?? ''
      if (worthComparing(first) && worthComparing(second)) found.push(`${first} ${second}`)
    }
  }

  return found
}

/**
 * Where one thought ends and the next begins.
 *
 * **A separator has to actually separate, and the first attempt did
 * not.** Resume sections were joined with ". " on the assumption that a
 * full stop would break the pair — but the tokeniser strips a trailing
 * dot on purpose, so the two words stayed neighbours and a phrase could
 * span two bullets that never touched. "Wrote TypeScript" followed by
 * "Mentored engineers" invented "typescript mentored". Caught by a test
 * written to assert it could not.
 *
 * A dot only ends a segment when whitespace or the end of the text
 * follows it, which is what keeps `node.js` and `.NET` whole — the
 * whole reason the tokeniser tolerates dots in the first place.
 * Commas break too: "Azure, Azure Functions" is a list of two things,
 * not a phrase.
 */
function segments(text: string): readonly string[] {
  return text.split(SEGMENT_BREAK)
}

const SEGMENT_BREAK = new RegExp(
  [
    '[\\r\\n]+', // a line ending is always a break
    '[,;:!?]+', // "Azure, Azure Functions" is a list of two things
    '\\.(?=\\s|$)', // a full stop only when something follows it — node.js survives
  ].join('|'),
)

/**
 * Words too common to mean anything in a comparison.
 *
 * Deliberately short. A long list starts deciding which *skills* are
 * worth mentioning, which is the app having an opinion about somebody's
 * field — these are the words that carry no information in any field.
 */
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'you',
  'our',
  'are',
  'will',
  'this',
  'that',
  'have',
  'has',
  'from',
  'their',
  'them',
  'they',
  'your',
  'all',
  'any',
  'can',
  'not',
  'but',
  'its',
  'it',
  'was',
  'were',
  'been',
  'being',
  'other',
  'more',
  'most',
  'such',
  'than',
  'then',
  'these',
  'those',
  'who',
  'whom',
  'what',
  'when',
  'where',
  'which',
  'while',
  'work',
  'working',
  'role',
  'team',
  'teams',
  'job',
  'position',
  'candidate',
  'candidates',
  'experience',
  'years',
  'year',
  'ability',
  'able',
  'strong',
  'excellent',
  'good',
  'great',
  'well',
  'including',
  'include',
  'includes',
  'across',
  'within',
  'into',
  'out',
  'about',
  'over',
  'under',
  'must',
  'should',
  'would',
  'could',
  'may',
  'also',
  'new',
  'used',
  'using',
  'use',
  'uses',
  'help',
  'like',
  'both',
  'each',
  'per',
  'via',
  'etc',
  /*
   * The voice a posting is written in. "We need", "looking for", "join
   * us" — these say who is talking, never what the job is, and they are
   * frequent enough that leaving them in puts them at the top of the
   * missing list where the actual requirements should be.
   */
  'we',
  'us',
  'need',
  'needs',
  'needed',
  'looking',
  'look',
  'seeking',
  'seek',
  'join',
  'want',
  'wants',
  'ideal',
  'ideally',
  'preferred',
  'plus',
  'bonus',
  'nice',
  /*
   * Two-letter function words, which survived the length rule and came
   * out near the top of a real gap list — "is" and "to" reported as
   * things missing from a resume is the kind of noise that makes a
   * reader stop trusting the rest of the column.
   *
   * `go` is deliberately absent: it is a language.
   */
  'is',
  'to',
  'in',
  'on',
  'of',
  'as',
  'at',
  'by',
  'be',
  'or',
  'an',
  'do',
  'does',
  'did',
  'if',
  'so',
  'up',
  'no',
  'am',
  'my',
  'me',
  /*
   * How a posting says something is wanted, as opposed to what is
   * wanted. Every one of these sits beside the requirement rather than
   * being it.
   */
  'required',
  'require',
  'requires',
  'requirements',
  'essential',
  'expertise',
  'familiar',
  'familiarity',
  'proficiency',
  'proficient',
  'knowledge',
  'understanding',
  'demonstrated',
  'proven',
  'skills',
  'skill',
  'responsibilities',
  'qualifications',
])

export interface Term {
  readonly word: string
  /** How often the posting says it — a thing named five times matters more. */
  readonly count: number
}

export interface Match {
  /** Terms the posting uses that the resume also uses. */
  readonly covered: readonly Term[]
  /** Terms the posting uses that appear nowhere in the resume. */
  readonly missing: readonly Term[]
  /**
   * Two-word phrases the posting uses and the resume does not.
   *
   * Kept apart from `missing` rather than mixed in, because they answer
   * different questions: a missing *word* is something never mentioned,
   * a missing *phrase* is usually something mentioned in another
   * context. "Azure" covered and "azure functions" missing is a real and
   * specific gap, and burying it among single words would lose exactly
   * the distinction it exists to draw.
   */
  readonly missingPhrases: readonly Term[]
  /**
   * 0–1, over single words only.
   *
   * Phrases are deliberately not in this denominator. Every phrase is
   * made of words that are already counted, so folding them in would
   * weigh the same vocabulary twice and move the number for a reason
   * nobody could trace back to the posting.
   */
  readonly share?: number
}

/**
 * Compares a posting against the whole resume.
 *
 * The resume side is every bullet, every skill, and the summary — a term
 * demonstrated in a bullet is covered whether or not it is also listed
 * as a skill, and the reverse. Splitting them would report a gap that is
 * only a gap in one section.
 *
 * Sorted by how often the posting says it, so the top of the missing
 * list is what the posting is actually about rather than whatever
 * happens to sort first alphabetically.
 */
/**
 * Compares a posting against the whole resume.
 *
 * `ignoring` is for the employer's own name, and it earns its place: a
 * posting says the company constantly — ten times in the first real one
 * tried — and the company is never a requirement of the job. Left in, it
 * sorts to the top of the gap list by frequency and is the first thing
 * somebody reads.
 */
export function matchResume(
  description: string,
  resume: Resume,
  ignoring: readonly string[] = [],
): Match {
  const ignored = new Set(ignoring.flatMap((word) => tokenise(word)))
  const counts = new Map<string, number>()
  for (const token of tokenise(description)) {
    if (ignored.has(token)) continue
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }

  const mine = new Set(
    tokenise(
      [
        resume.summary,
        ...resume.skills.flatMap((group) => [group.label, ...group.skills]),
        ...allBullets(resume).map((bullet) => bullet.text),
      ].join('. '),
    ),
  )

  const covered: Term[] = []
  const missing: Term[] = []
  for (const [word, count] of counts) {
    ;(mine.has(word) ? covered : missing).push({ word, count })
  }

  const myPhrases = new Set(
    phrases(
      [
        resume.summary,
        ...resume.skills.flatMap((group) => [group.label, ...group.skills]),
        ...allBullets(resume).map((bullet) => bullet.text),
      ].join('\n'),
    ),
  )

  const phraseCounts = new Map<string, number>()
  for (const phrase of phrases(description)) {
    if (myPhrases.has(phrase)) continue
    if (phrase.split(' ').some((word) => ignored.has(word))) continue
    phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1)
  }

  const byWeight = (a: Term, b: Term): number => b.count - a.count || a.word.localeCompare(b.word)
  covered.sort(byWeight)
  missing.sort(byWeight)

  const missingPhrases = [...phraseCounts].map(([word, count]) => ({ word, count })).sort(byWeight)

  return {
    covered,
    missing,
    missingPhrases,
    /*
     * Absent rather than zero on an empty posting, which is the rule
     * this app applies everywhere a denominator can vanish: nothing over
     * nothing is not a score, and 0% would read as a terrible match
     * rather than as no comparison having been made.
     */
    ...(counts.size === 0 ? {} : { share: covered.length / counts.size }),
  }
}
