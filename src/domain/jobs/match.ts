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
  return text
    .toLowerCase()
    .split(/[^a-z0-9#+.]+/)
    .map((token) => token.replace(/^[.]+|[.]+$/g, ''))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

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
  /** 0–1. Absent when the posting is empty — nothing over nothing is not a score. */
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
export function matchResume(description: string, resume: Resume): Match {
  const counts = new Map<string, number>()
  for (const token of tokenise(description)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }

  const mine = new Set(
    tokenise(
      [
        resume.summary,
        ...resume.skills.flatMap((group) => [group.label, ...group.skills]),
        ...allBullets(resume).map((bullet) => bullet.text),
      ].join(' '),
    ),
  )

  const covered: Term[] = []
  const missing: Term[] = []
  for (const [word, count] of counts) {
    ;(mine.has(word) ? covered : missing).push({ word, count })
  }

  const byWeight = (a: Term, b: Term): number => b.count - a.count || a.word.localeCompare(b.word)
  covered.sort(byWeight)
  missing.sort(byWeight)

  return {
    covered,
    missing,
    /*
     * Absent rather than zero on an empty posting, which is the rule
     * this app applies everywhere a denominator can vanish: nothing over
     * nothing is not a score, and 0% would read as a terrible match
     * rather than as no comparison having been made.
     */
    ...(counts.size === 0 ? {} : { share: covered.length / counts.size }),
  }
}
