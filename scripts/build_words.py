#!/usr/bin/env python3
"""Convert the Magoosh Anki deck (.apkg) into src/data/words.json.

Stdlib only. Usage: python scripts/build_words.py [path/to/deck.apkg]
Prints a cleaning report. Manual fixes live in data/overrides.json, keyed by entry id.
"""
import html
import json
import re
import sqlite3
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'magoosh-1000.apkg'
OVERRIDES = ROOT / 'data' / 'overrides.json'
# Extra example sentences keyed by entry id; src is 'ebook' (Magoosh vocab eBook) or 'gen' (written for this app).
EXAMPLES = ROOT / 'data' / 'examples.json'
OUT = ROOT / 'src' / 'data' / 'words.json'

# Magoosh section boundaries hidden in the "Frequency" field (alphabetical inside each section).
COMMON_MAX, BASIC_MAX = 323, 699
OTHER_DEFS = re.compile(r'\s*This word has other definitions but this is the most important one for the GRE\.?\s*$')
SECTION_MARKER = re.compile(r'\s*(Common|Basic|Advanced) Words\.?\s*$')
NOTE_TEXT = 'Has other meanings too; this is the one the GRE tests.'
LABEL_POS = {'adj': 'adjective', 'v': 'verb', 'n': 'noun', 'adv': 'adverb'}
POS_VALUES = {'adjective', 'verb', 'noun', 'adverb'}

# A definition with an example sentence glued on: lowercase word (or closing bracket/quote), space, capitalised sentence.
GLUE = re.compile(r'^(.*?[a-z\)"\'])\s+((?:I\s|[A-Z][a-z]).+)$')

SUFFIXES = {
    '', 's', 'es', 'd', 'ed', 'ing', 'ly', 'ness', 'er', 'ers', 'ment', 'ments', 'ity', 'ities', 'ism',
    'ist', 'ists', 'ous', 'ation', 'ations', 'ingly', 'edly', 'ies', 'ied', 'ily', 'iness', 'ier', 'iest',
    'al', 'ally', 'ance', 'ence', 'ant', 'ent', 'ive', 'ively', 'ize', 'ized', 'ization', 'ic', 'ical',
    'en', 'or', 'ors', 'ility', 'ce', 'cy', 'ces',
}
STOP = set(
    "a an the of or and to in on for with by as from that which who whom is are be being been one oneself "
    "one's someone something somebody especially usually very often more most much such this these those "
    "its it their his her your you at into about than so person people way manner quality state act".split()
)
NEGATION = {'not', 'lacking', 'without', 'no', 'never', 'lack', 'absence', 'absent'}


def load_notes(path):
    z = zipfile.ZipFile(path)
    names = z.namelist()
    if 'collection.anki21' in names:
        data = z.read('collection.anki21')
    elif 'collection.anki21b' in names:
        sys.exit('collection.anki21b is zstd compressed; export with "Support older Anki versions" ticked')
    else:
        data = z.read('collection.anki2')
    con = sqlite3.connect(':memory:')
    con.deserialize(data)
    return [flds.split('\x1f') for (flds,) in con.execute('select flds from notes order by id')]


# UTF-8 text that was read as Windows-1252 somewhere upstream (naÃ¯ve, faÃ§ade, clichÃ©).
MOJIBAKE = re.compile(r'[ÂÃ][\x80-\xbfŒ-™]')
ABBREV_END = re.compile(r'\b(usu|esp)\.$')
ABBREV_FULL = {'usu': 'usually', 'esp': 'especially'}


def fix_mojibake(s):
    # the ¯ of naïve arrived as a space and a combining macron
    s = s.replace('Ã ̄', 'ï').replace('Â\xa0', ' ')

    def repair(m):
        try:
            return m.group(0).encode('cp1252').decode('utf-8')
        except UnicodeError:
            return m.group(0)

    return MOJIBAKE.sub(repair, s).replace('Â', '')


def clean(s):
    s = fix_mojibake(html.unescape(s or ''))
    s = s.replace('\xa0', ' ').replace('�', '')
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'(\w)"(s|t|re|ll|ve|d|m)\b', r"\1'\2", s)  # &quot; used where an apostrophe was meant
    return re.sub(r'\s+', ' ', s).strip()


def stems(head):
    h = head.lower()
    out = {h}
    if len(h) > 3 and h.endswith('e'):
        out.add(h[:-1])
    if len(h) > 3 and h.endswith('y'):
        out.add(h[:-1] + 'i')
    if len(h) <= 5 and re.search(r'[^aeiou][aeiou][bdgklmnprt]$', h):
        out.add(h + h[-1])
    if len(h) > 5 and h.endswith('es'):
        out.add(h[:-2])
    if len(h) > 5 and h.endswith('s'):
        out.add(h[:-1])
    if len(h) > 6 and h.endswith('ly'):
        out.add(h[:-2])
    if len(h) > 5 and h.endswith(('able', 'ible')):
        out.add(h[:-2])  # affable: affability, affably
    if len(h) > 5 and h.endswith('nt'):
        out.add(h[:-1])  # affluent: affluence
    return out


def token_matches(tok, head):
    t = tok.lower()
    for st in stems(head):
        if t.startswith(st) and t[len(st):] in SUFFIXES:
            return True
    h = head.lower()
    if len(t) >= 5 and h.startswith(t) and len(h) - len(t) <= 4:
        return True  # meteoric: meteor, mettlesome: mettle
    return len(h) >= 9 and t.startswith(h[:-3])


def find_span(text, head):
    for m in re.finditer(r'[A-Za-z]+', text or ''):
        if token_matches(m.group(0), head):
            return [m.start(), m.end()]
    return None


def mask(text, head):
    masked, n = re.subn(r'[A-Za-z]+', lambda m: '____' if token_matches(m.group(0), head) else m.group(0), text)
    return masked if n and masked != text else None


def tidy_def(d):
    d = d.strip().rstrip('.').strip()
    if len(d) > 1 and d[0].isupper() and d[1].islower() and not d.startswith('I '):
        d = d[0].lower() + d[1:]
    return d


def tidy_example(e):
    e = e.strip()
    e = re.sub(r'([.!?]["\']?)\.$', r'\1', e)
    return e


def slug(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def content_tokens(d):
    return {t for t in re.findall(r"[a-z']+", d.lower()) if len(t) > 2 and t not in STOP}


def norm_def(d):
    d = re.sub(r'^(to|a|an|the)\s+', '', d.lower().strip())
    return re.sub(r'[^a-z ]', '', d).strip()


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def osa(a, b):
    """Optimal string alignment distance (Levenshtein plus adjacent swaps)."""
    la, lb = len(a), len(b)
    d = [[0] * (lb + 1) for _ in range(la + 1)]
    for i in range(la + 1):
        d[i][0] = i
    for j in range(lb + 1):
        d[0][j] = j
    for i in range(1, la + 1):
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[la][lb]


def common_prefix(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    notes = load_notes(src)
    overrides = json.loads(OVERRIDES.read_text(encoding='utf-8')) if OVERRIDES.exists() else {}
    extra = json.loads(EXAMPLES.read_text(encoding='utf-8')) if EXAMPLES.exists() else {}
    extra.pop('_comment', None)
    report = defaultdict(list)

    raw = []
    for f in notes:
        word_raw, def_raw, pos_raw, ex_raw, freq_raw = (f + [''] * 5)[:5]
        word_raw = clean(word_raw)
        m = re.match(r'^(.*?)\s*\((.+?)\)\s*$', word_raw)
        head, label = (m.group(1).strip(), m.group(2).strip()) if m else (word_raw, None)
        if label and not label.endswith('.') and not label[-1].isdigit():
            label += '.'
        defn, ex, note = clean(def_raw), clean(ex_raw), None
        if OTHER_DEFS.search(ex):
            ex, note = OTHER_DEFS.sub('', ex).strip(), NOTE_TEXT
        if SECTION_MARKER.search(ex):
            ex = SECTION_MARKER.sub('', ex).strip()
        # "noticed (usu." + "refers to an amount). There is...": the deck split the definition at an abbreviation.
        a = ABBREV_END.search(defn)
        tail = re.match(r'^([a-z][^.]*?)\.\s+(.+)$', ex) if a else None
        if tail:
            defn = defn[:a.start()] + ABBREV_FULL[a.group(1)] + ' ' + tail.group(1)
            ex = tail.group(2)
            report['rejoined definition split at an abbreviation'].append(f'{word_raw}: {defn}')
        g = GLUE.match(defn)
        if g and find_span(g.group(2), head):
            defn = g.group(1)
            if not ex:
                ex = g.group(2)
                report['split glued example'].append(f'{word_raw}: "{g.group(2)[:60]}"')
            else:
                report['dropped glued sentence (example already present)'].append(f'{word_raw}: "{g.group(2)[:60]}"')
        elif g and not ex:
            report['possible glued example NOT split (no headword in tail)'].append(f'{word_raw}: {defn[:90]}')
        pos = clean(pos_raw).lower()
        label_pos = LABEL_POS.get(re.sub(r'[^a-z]', '', (label or '').lower()))
        if label_pos and label_pos != pos:
            report['POS differs from sense label (label wins)'].append(f'{word_raw}: field={pos} label={label_pos}')
            pos = label_pos
        raw.append({
            'head': head, 'label': label, 'pos': pos, 'def': tidy_def(defn), 'ex': tidy_example(ex) or None,
            'note': note, 'rank': int(freq_raw),
        })

    # ids and sense numbering
    groups = defaultdict(list)
    for r in raw:
        groups[r['head'].lower()].append(r)
    for g in groups.values():
        g.sort(key=lambda r: r['rank'])
        for i, r in enumerate(g):
            base = slug(r['head'])
            if r['label']:
                r['id'] = f"{base}-{slug(r['label'])}"
            elif len(g) > 1:
                r['id'] = f'{base}-{i + 1}'
            else:
                r['id'] = base
            r['sense'], r['senses'] = i + 1, len(g)
    ids = [r['id'] for r in raw]
    assert len(ids) == len(set(ids)), 'duplicate ids'

    by_id = {r['id']: r for r in raw}
    for key, patch in overrides.items():
        if key.startswith('_'):
            continue
        if key not in by_id:
            report['override for unknown id'].append(key)
            continue
        by_id[key].update(patch)
        report['overrides applied'].append(f'{key}: {", ".join(patch)}')

    # Spelling fixes in the deck's own text: whole words only, a leading capital kept.
    typos = overrides.get('_typos', {})
    if typos:
        alts = '|'.join(re.escape(k) for k in sorted(typos, key=len, reverse=True))
        pattern = re.compile(r"\b(" + alts + r")(?![\w'])", re.I)

        def fix(m):
            new = typos[m.group(1).lower()]
            return new[0].upper() + new[1:] if m.group(1)[0].isupper() else new

        for r in raw:
            for f in ('def', 'ex'):
                if r.get(f):
                    found = sorted({m.group(1) for m in pattern.finditer(r[f])})
                    if found:
                        r[f] = pattern.sub(fix, r[f])
                        report['spelling fixed'].append(f"{r['id']}: {', '.join(found)}")

    for r in raw:
        assert r['pos'] in POS_VALUES, (r['id'], r['pos'])
        r['tier'] = 'common' if r['rank'] <= COMMON_MAX else 'basic' if r['rank'] <= BASIC_MAX else 'advanced'
        if r['ex'] and r.get('exSpanWord'):
            i = r['ex'].find(r['exSpanWord'])
            r['exSpan'] = [i, i + len(r['exSpanWord'])] if i >= 0 else None
        elif r['ex']:
            r['exSpan'] = find_span(r['ex'], r['head'])
            if not r['exSpan']:
                report['example without a findable headword'].append(f"{r['id']}: {r['ex'][:70]}")
        else:
            report['no example'].append(r['id'])
        r['exs'] = [{'t': r['ex'], 'span': r['exSpan'], 'src': 'magoosh'}] if r['ex'] and r['exSpan'] else []
        for x in extra.get(r['id'], []):
            i = x['text'].find(x['form'])
            if i < 0 or x['text'].count(x['form']) != 1 or not token_matches(x['form'], r['head']) and not x['form'].lower().startswith(r['head'].lower()[:4]):
                report['extra example with a bad form'].append(f"{r['id']}: {x['form']!r} in {x['text'][:60]}")
                continue
            r['exs'].append({'t': x['text'], 'span': [i, i + len(x['form'])], 'src': x['src']})
        md = r.get('defMasked') or mask(r['def'], r['head'])
        if md:
            r['defMasked'] = md
            report['definition masked for type-the-word'].append(f"{r['id']}: {md}")
        if re.search(r'&[a-z#0-9]+;', r['def'] + (r['ex'] or '')):
            report['entity left'].append(r['id'])

    # near-synonyms (definition overlap) between different headwords
    toks = {r['id']: content_tokens(r['def']) for r in raw}
    norms = {r['id']: norm_def(r['def']) for r in raw}
    syn, near = defaultdict(set), defaultdict(set)
    for i, a in enumerate(raw):
        for b in raw[i + 1:]:
            if a['head'].lower() == b['head'].lower():
                continue
            ta, tb = toks[a['id']], toks[b['id']]
            j = jaccard(ta, tb)
            neg_mismatch = bool(ta & NEGATION) != bool(tb & NEGATION)
            identical = norms[a['id']] == norms[b['id']]
            if identical or (j >= 0.75 and not neg_mismatch and a['pos'] == b['pos']):
                syn[a['id']].add(b['id'])
                syn[b['id']].add(a['id'])
            if identical or (j >= 0.45 and not neg_mismatch):
                near[a['id']].add(b['id'])
                near[b['id']].add(a['id'])

    # look-alike spellings between headwords
    heads = sorted({r['head'].lower() for r in raw})
    head_ids = defaultdict(list)
    for r in raw:
        head_ids[r['head'].lower()].append(r['id'])

    head_pos = defaultdict(set)
    for r in raw:
        head_pos[r['head'].lower()].add(r['pos'])

    def meaning_overlap(h1, h2):
        return max(jaccard(toks[x], toks[y]) for x in head_ids[h1] for y in head_ids[h2])

    def derivation(h1, h2):
        # audacious/audacity, contrite/contrition: same root, different part of speech
        pre = common_prefix(h1, h2)
        return pre >= 5 and pre >= 0.6 * min(len(h1), len(h2)) and not (head_pos[h1] & head_pos[h2])

    look = defaultdict(list)
    for i, a in enumerate(heads):
        for b in heads[i + 1:]:
            if abs(len(a) - len(b)) > 3:
                continue
            short = min(len(a), len(b))
            dist = osa(a, b)
            pre = common_prefix(a, b)
            close = (short >= 5 and dist <= 2) or (short == 4 and dist <= 1) or (short >= 6 and pre >= 5)
            if close and meaning_overlap(a, b) < 0.34 and not derivation(a, b):
                look[a].append((dist, -pre, b))
                look[b].append((dist, -pre, a))

    for r in raw:
        s = sorted(syn[r['id']])
        n = sorted(near[r['id']] - syn[r['id']])
        lk = [h for _, _, h in sorted(look[r['head'].lower()])[:4]]
        if s:
            r['syn'] = s
        if n:
            r['near'] = n
        if lk:
            r['look'] = lk

    raw.sort(key=lambda r: r['rank'])
    keys = ['id', 'word', 'label', 'sense', 'senses', 'pos', 'def', 'defMasked', 'exs', 'note', 'tier',
            'rank', 'syn', 'near', 'look']
    entries = []
    for r in raw:
        r['word'] = r['head']
        entries.append({k: r[k] for k in keys if r.get(k) not in (None, [])})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('[\n' + ',\n'.join(json.dumps(e, ensure_ascii=False) for e in entries) + '\n]\n', encoding='utf-8')

    tiers = defaultdict(int)
    for e in entries:
        tiers[e['tier']] += 1
    print(f'{len(entries)} entries, {len(groups)} headwords, tiers {dict(tiers)}')
    print(f"synonym links {sum(len(e.get('syn', [])) for e in entries) // 2}, "
          f"near links {sum(len(e.get('near', [])) for e in entries) // 2}, "
          f"headwords with look-alikes {sum(1 for v in look.values() if v)}")
    for title, items in report.items():
        print(f'\n## {title} ({len(items)})')
        for it in items:
            print('  ' + it)
    print(f'\nwrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
