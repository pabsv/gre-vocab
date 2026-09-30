# Decisions

Why the app works the way it does. Newest decisions at the bottom of each section.

## Data

* Source: Magoosh 1000 GRE Words Anki deck (`data/magoosh-1000.apkg`), 1066 notes, 997 headwords, 66 of them with several senses.
* The deck's "Frequency" field is not a frequency. It is Magoosh's list order: Common 1 to 323, Basic 324 to 699, Advanced 700 to 1066, alphabetical inside each section. It becomes `tier`.
* The unit of learning is a sense, not a headword. Sibling senses are introduced together, kept apart in a session and never used as each other's distractors, because the GRE likes secondary meanings.
* Cleaning (all in `scripts/build_words.py`): entities decoded; about 30 example sentences that were glued onto definitions split back out; the "This word has other definitions" line becomes a note; section markers stripped; `qualify` fixed via overrides; the headword masked where a definition gives it away; synonym groups (strict and loose, both kept out of each other's distractors) and look-alike spellings precomputed. Magoosh's own punctuation is kept.
* More example sentences (2026-09-30): the deck has one per sense, and one sentence gets memorised instead of the word. `data/examples.json` adds more per entry, each tagged with its source: `ebook` (the few new ones in Magoosh's free GRE Vocabulary eBook; its flashcard PDF only repeats the deck) or `gen` (written for this app in GRE text completion style, then checked sense by sense by a second, independent pass). Wiktionary was checked first and rejected: wrong senses, no context clues, mixed register. Every entry now has at least four. The blank and the context pick one at random per task; the answer side lists them all. `gen` sentences are the ones to replace if Magoosh ever shares its data (asked on 2026-09-30).
* While the added sentences are being reviewed, every sentence shows its source and added ones can be flagged (meta `exflag:<id>:<hash>`, synced). `SHOW_SOURCES` in `src/ui/Example.tsx` turns that off.

## Learning

* Typing was removed (2026-09-30). The GRE is all multiple choice and never asks you to produce or spell a word, so typing trained a skill the test does not use and cost the most time per word. What the test needs is word to gist (rough meaning and tone) and picking the word that fits a sentence.
* Ladder per new word, on day one: flashcard as a pretest, choose the meaning, then the sentence blank (choose the word from its meaning when the entry has no example), then explain the meaning. The explain step runs as a final sweep over the whole day's words, because a longer gap makes that recall worth more and it is the direction the GRE tests.
* New words move through a sliding window (a new word enters when one graduates) instead of fixed rounds, so a round never ends in cramming the last two words. A recap checkpoint follows every 8 graduations, whatever the window size.
* The window size is automatic (2026-09-30; the Settings slider is gone). Longer gaps between showings help retention (Kornell 2009: one big flashcard stack beat small ones) but only while recall still succeeds; the useful recall is effortful yet correct (Pyc and Rawson 2009, Pavlik and Anderson 2008). So a staircase on the last 12 answers to new words, flashcards excluded, acting at most every 8 answers: 90% or better adds a word (longer gaps), below 70% stops admitting until one fewer is in play. Bounds 4 to 12. The size a session settles on is stored in `settings.windowSize` (synced) and the next session starts there. Review load plays no part: reviews are their own phase and FSRS spreads them over days.
* Near synonyms learned side by side interfere (Tinkham 1993, Waring 1997, Nation 2000). A queued word whose sense group overlaps (`relatedIds`) a word in play waits while the first non clashing word within 8 places goes first; if all 8 clash, the front word goes anyway.
* No fixed sets. Draining a set at its end brings the last words back with short gaps, which is the cramming the sliding window avoids. Stopping is safe at any point: started words carry over at the MCQ step, finished ones owe their sweep, and the checkpoint offers Stop here. Starting again after a finished session gives the next batch from Today's stepper.
* "Knew it" on the flashcard fast-tracks a word: one sentence blank check graduates it as Easy. Fast-tracked words still get the final sweep, because a four-option check can be guessed; a failed sweep amends the grade to Again.
* A sweep is never lost. A finished new word owes its sweep (`Progress.sweepDue`, derived from events) until a sweep or a graded review happens. The next daily session sweeps owed words at the end, next to that day's own, and the result amends the grade of the day the word was learned. This covers closing the app, the 04:00 rollover discarding a saved session, a drill replacing it and another device. Chosen over persisting more session state because events sync and sessions do not.
* In the window a miss drops a word one rung (never back to the flashcard) and brings it back 2 cards later; a hit brings it back after 2, then 4 cards.
* Grades into FSRS, one per word per study day:

  | Situation | Grade |
  |---|---|
  | Fast-track, check passed | Easy |
  | New word, 0 or 1 miss, sweep passed | Good |
  | New word, 2+ misses | Hard |
  | Sweep "Roughly" (amends the day's grade) | Hard |
  | Sweep failed (amends the day's grade) | Again |
  | Review correct | Good |
  | Review "Roughly" | Hard |
  | Review wrong, then relearned in the same session | Again |

* Reviews are explain the meaning (about 65%) or a sentence blank, shifted toward whichever is weaker for that word but never below 30% for either. Words without an example sentence always explain.
* Drills run choose the meaning, sentence blank, explain. Quick tests and the baseline are one explain per word.
* Old `type` events stay in history and still count in FSRS; nothing new produces them.
* Mistake weight per word (+1 per miss, half life 14 days, times 0.6 on a clean hit) plus recorded confusion pairs drive the Mistakes page, drills and distractor choice. Drills skip words due today so cramming does not inflate the next review, and they never touch the schedule.
* FSRS (ts-fsrs 5.4.2): target recall 90%, maximum interval 120 days, fuzz on, short-term steps off (the session engine handles same-day repetition). New-card first intervals: Again 1, Hard 2, Good 3, Easy 8 days.
* Pace: 30 new words a day by default (estimates use 10 s per review, 40 s per new word; was 50 s with typing, re-measure after a week). Today's stepper (← →) moves the new word total in round steps of 5 and remembers the last pick in settings (`lastNew`, synced), so every session starts at whatever was chosen last; moving the Settings slider clears it back to the daily target. It no longer subtracts words already started today or trims to the budget: both produced surprising starts like 4. Measured estimate: about 40 minutes a day at 30 new words once reviews peak.
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
* Self grading reads left to right and the keys follow the buttons. Flashcard: Knew it 1, Didn't know 2. Sweep: Right 1, Roughly 2 (amber, in the middle), Wrong 3. Roughly means the right gist and tone without the full meaning: a pass at Hard, so honest grading does not cost a failed word. The sweep has no text box (user feedback 2026-09-30): recall the meaning in your head, reveal, grade. It is stored in the event's `hint` field, which typing used before, so sync needed no migration. M toggles auto pronounce.
* No instructional copy or task labels on study cards (user feedback 2026-09-23): the header already says which phase you are in, and extra sentences slow reading.
* Study screens must fit one laptop screen without scrolling (checked at 1536x730 against the longest entries).
* Multiple choice is pick, then commit (2026-09-30). A pick shows right or wrong at once but records nothing and can change freely; Space (or Continue) records whichever option is picked last. So a lucky guess can be downgraded by switching to a wrong option, and a misclick fixed by switching to the right one. It never auto advances. Showing an option's meaning (the eye, or Shift+digit) is free at any time and no longer counts as a miss; honest picking is on the learner.
