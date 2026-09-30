# Decisions

Why the app works the way it does. Newest decisions at the bottom of each section.

## Data

* Source: Magoosh 1000 GRE Words Anki deck (`data/magoosh-1000.apkg`), 1066 notes, 997 headwords, 66 of them with several senses.
* The deck's "Frequency" field is not a frequency. It is Magoosh's list order: Common 1 to 323, Basic 324 to 699, Advanced 700 to 1066, alphabetical inside each section. It becomes `tier`.
* The unit of learning is a sense, not a headword. Sibling senses are introduced together, kept apart in a session and never used as each other's distractors, because the GRE likes secondary meanings.
* Cleaning (all in `scripts/build_words.py`): entities decoded; about 30 example sentences that were glued onto definitions split back out; the "This word has other definitions" line becomes a note; section markers stripped; `qualify` fixed via overrides; the headword masked where a definition gives it away; synonym groups (strict and loose, both kept out of each other's distractors) and look-alike spellings precomputed. Magoosh's own punctuation is kept.

## Learning

* Typing was removed (2026-09-30). The GRE is all multiple choice and never asks you to produce or spell a word, so typing trained a skill the test does not use and cost the most time per word. What the test needs is word to gist (rough meaning and tone) and picking the word that fits a sentence.
* Ladder per new word, on day one: flashcard as a pretest, choose the meaning, then the sentence blank (choose the word from its meaning when the entry has no example), then explain the meaning. The explain step runs as a final sweep over the whole day's words, because a longer gap makes that recall worth more and it is the direction the GRE tests.
* New words move through a sliding window of 8 (a new word enters when one graduates) instead of fixed rounds, so a round never ends in cramming the last two words. A recap checkpoint follows every 8 graduations.
* "Knew it" on the flashcard fast-tracks a word: one sentence blank check graduates it as Easy. Fast-tracked words still get the final sweep, because a four-option check can be guessed; a failed sweep amends the grade to Again.
* In the window a miss drops a word one rung (never back to the flashcard) and brings it back 2 cards later; a hit brings it back after 2, then 4 cards.
* Grades into FSRS, one per word per study day:

  | Situation | Grade |
  |---|---|
  | Fast-track, check passed | Easy |
  | New word, 0 or 1 miss, sweep passed | Good |
  | New word, 2+ misses | Hard |
  | Sweep failed (amends the day's grade) | Again |
  | Review correct | Good |
  | Review wrong, then relearned in the same session | Again |

* Reviews are explain the meaning (about 65%) or a sentence blank, shifted toward whichever is weaker for that word but never below 30% for either. Words without an example sentence always explain.
* Drills run choose the meaning, sentence blank, explain. Quick tests and the baseline are one explain per word.
* Old `type` events stay in history and still count in FSRS; nothing new produces them.
* Mistake weight per word (+1 per miss, half life 14 days, times 0.6 on a clean hit) plus recorded confusion pairs drive the Mistakes page, drills and distractor choice. Drills skip words due today so cramming does not inflate the next review, and they never touch the schedule.
* FSRS (ts-fsrs 5.4.2): target recall 90%, maximum interval 120 days, fuzz on, short-term steps off (the session engine handles same-day repetition). New-card first intervals: Again 1, Hard 2, Good 3, Easy 8 days.
* Pace: 30 new words a day by default with a 60 minute budget; new words shrink automatically when reviews pile up (10 s per review, 40 s per new word; was 50 s with typing, re-measure after a week). Today has a stepper (← →) that sets the exact number of new words for one session, overriding target and budget. Measured estimate: about 40 minutes a day at 30 new words once reviews peak.
* New-word order is a seeded shuffle per tier, interleaved in proportion to tier size (all three sections finish together), senses adjacent, look-alike headwords at least 60 entries apart so they land on different days. Deterministic, so devices agree without syncing it.

## Storage and sync

* Local-first: Dexie (IndexedDB). Append-only answer events are the truth; progress is a derived cache. Undo voids the last event and re-derives. Every answer writes event, progress and session in one transaction, so a reload resumes on the same card. One tab at a time runs a session (Web Locks).
* Sync lives in the Life OS Supabase project, as Truco already does. Before applying it (2026-09-23) we checked: no `gre` objects existed, no custom event triggers, 14 MB of 500 MB used, 8 existing security advisor findings. After applying: all 18 Life OS tables had identical row counts, the advisor list was unchanged, anonymous reads of `gre_` tables are denied, and a rolled-back test showed owner defaults, immutable events, void-only updates, newer-wins meta and zero visibility for other accounts.
* Protocol: push unpushed events (upsert on id, mark clean only if the row did not change meanwhile), push meta, then pull rows whose server `synced_at` is newer than the cursor minus a 2 minute overlap, keyset paged by (`synced_at`, id). A void on either side wins. The cursor only ever comes from server time. A device refuses to merge a second account.
* Settings, notes, stars and suspensions are last-write-wins per key in `gre_meta`.

## Interface

* Dictionary-desk look: headwords in Source Serif 4 with superscript sense numbers, UI in Schibsted Grotesk (the plan said Inter; swapped for more character), a highlighter mark on the word inside example sentences, warm paper light theme and ink dark theme.
* One blue carries both accent and charts. Mastery uses an ordinal blue ramp, the heatmap a sequential blue, two-series charts blue and orange; all validated for both themes. Green, red and amber are reserved for answer feedback.
* Keyboard first (keys matched by `e.code`), swipe and large targets on phones, the explain input with autocorrect and capitalisation off.
* Self grading reads left to right: Knew it / Right is 1 and ←, Didn't know / Wrong is 2 and →, on both the flashcard and the sweep. M toggles auto pronounce. Space continues after any miss.
* No instructional copy or task labels on study cards (user feedback 2026-09-23): the header already says which phase you are in, and extra sentences slow reading.
* Study screens must fit one laptop screen without scrolling (checked at 1536x730 against the longest entries).
