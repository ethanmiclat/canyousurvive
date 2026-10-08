#!/usr/bin/env python3
"""Expand question templates over datasets into content/catalog.json.

Each question is a prompt plus a filter over one dataset; its valid-answer set (and size) is computed here.
Only questions whose size fits a typed-round band are kept.

Template types (content/templates/<dataset>.json):
  all                       every entity
  tag      tags=[...]       entities with all of the tags
  anyTag   tags=[...]       entities with any of the tags
  notTag   tags=[...]       entities with none of the tags
  range    prop,min,max     numeric prop within [min, max]
  letters  modes=[starts|contains|lacks], field=name|<prop>
                            one question per letter A-Z ({L} in the prompt)
Every template accepts `where` (tags that must all match) and an optional explicit `id`.
"""

from __future__ import annotations

import string
import sys

from gen_lib import CONTENT, DATASETS, TEMPLATES, load_config, normalize, read_json, write_json

LETTER_MAX_SHARE = 0.9  # a letter filter must exclude at least 10% of its base set to be a real filter


def article(noun: str) -> str:
    if noun.startswith(("US", "Uni", "Eu", "one")):
        return "a"
    return "an" if noun[0].lower() in "aeiou" else "a"


def default_letter_prompts(noun: str) -> dict[str, str]:
    a = article(noun)
    return {
        "starts": f"Name {a} {noun} that starts with the letter {{L}}",
        "contains": f"Name {a} {noun} with the letter {{L}} in its name",
        "lacks": f"Name {a} {noun} with no letter {{L}} in its name",
    }


def has_tags(e, tags) -> bool:
    et = set(e.get("tags", []))
    return all(t in et for t in tags)


def letter_forms(e, field: str) -> list[str]:
    if field == "name":
        forms = [e["name"], *e.get("alt", [])]
    else:
        v = e.get("props", {}).get(field)
        forms = v if isinstance(v, list) else [v] if v else []
    return [normalize(f) for f in forms if f]


def letter_test(mode: str, letter: str, forms: list[str]) -> bool:
    if not forms:
        return False
    if mode == "starts":
        return any(f[:1] == letter for f in forms)
    if mode == "contains":
        return any(letter in f for f in forms)
    if mode == "lacks":
        return all(letter not in f for f in forms)
    raise ValueError(mode)


def suffix(t) -> str:
    return "@" + "+".join(t["where"]) if t.get("where") else ""


def expand(ds, tpl):
    """Yield (id, prompt, entities, base_size, is_letter) for one template."""
    ents = [e for e in ds["entities"] if has_tags(e, tpl.get("where", []))]
    kind = tpl["type"]
    if kind == "all":
        yield tpl.get("id", "all" + suffix(tpl)), tpl["prompt"], ents, len(ents), False
    elif kind == "tag":
        yield tpl.get("id", "tag:" + "+".join(tpl["tags"]) + suffix(tpl)), tpl["prompt"], [e for e in ents if has_tags(e, tpl["tags"])], len(ents), False
    elif kind == "anyTag":
        sel = [e for e in ents if set(e.get("tags", [])) & set(tpl["tags"])]
        yield tpl.get("id", "any:" + "+".join(tpl["tags"]) + suffix(tpl)), tpl["prompt"], sel, len(ents), False
    elif kind == "notTag":
        sel = [e for e in ents if not set(e.get("tags", [])) & set(tpl["tags"])]
        yield tpl.get("id", "not:" + "+".join(tpl["tags"]) + suffix(tpl)), tpl["prompt"], sel, len(ents), False
    elif kind == "range":
        p, lo, hi = tpl["prop"], tpl["min"], tpl["max"]
        sel = [e for e in ents if isinstance(e.get("props", {}).get(p), (int, float)) and lo <= e["props"][p] <= hi]
        yield tpl.get("id", f"range:{p}:{lo}-{hi}" + suffix(tpl)), tpl["prompt"], sel, len(ents), False
    elif kind == "letters":
        field = tpl.get("field", "name")
        prompts = {**default_letter_prompts(tpl.get("noun", "answer")), **tpl.get("prompt", {})}
        for mode in tpl.get("modes", ["starts", "contains", "lacks"]):
            for upper in string.ascii_uppercase:
                letter = upper.lower()
                sel = [e for e in ents if letter_test(mode, letter, letter_forms(e, field))]
                qid = f"{mode}:{letter}" + ("" if field == "name" else f"~{field}") + suffix(tpl)
                yield qid, prompts[mode].replace("{L}", upper), sel, len(ents), True
    else:
        raise ValueError(f"Unknown template type {kind}")


def build():
    config = load_config()
    bands = config["typedRounds"]
    fits = lambda n: any(b["min"] <= n <= b["max"] for b in bands)  # noqa: E731
    questions = []
    errors = []
    for tfile in sorted(TEMPLATES.glob("*.json")):
        spec = read_json(tfile)
        ds_id = spec["dataset"]
        ds = read_json(DATASETS / f"{ds_id}.json")
        seen_sets: set[tuple[str, ...]] = set()
        kept = 0
        for tpl in spec["templates"]:
            for qid, prompt, sel, base, is_letter in expand(ds, tpl):
                n = len(sel)
                if not fits(n):
                    continue
                if is_letter and n > LETTER_MAX_SHARE * base:
                    continue
                answers = tuple(sorted(e["id"] for e in sel))
                if answers in seen_sets:
                    continue
                seen_sets.add(answers)
                full_id = f"{ds_id}:{qid}"
                if not full_id.isascii():
                    errors.append(f"non-ascii question id {full_id}")
                questions.append(
                    {"id": full_id, "dataset": ds_id, "kind": "letters" if is_letter else "curated", "prompt": prompt, "size": n, "answers": list(answers)}
                )
                kept += 1
        if kept == 0:
            errors.append(f"{ds_id}: no questions fit any band")
    ids = [q["id"] for q in questions]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        errors.append(f"duplicate question ids: {sorted(dupes)}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    questions.sort(key=lambda q: q["id"])
    write_json(CONTENT / "catalog.json", {"questions": questions}, compact_lists=True)

    # Summary per band
    print(f"catalog: {len(questions)} questions from {len({q['dataset'] for q in questions})} datasets")
    for b in bands:
        qs = [q for q in questions if b["min"] <= q["size"] <= b["max"]]
        print(f"  round {b['round']} [{b['min']}-{b['max']}]: {len(qs)} questions, {len({q['dataset'] for q in qs})} datasets")


if __name__ == "__main__":
    build()
