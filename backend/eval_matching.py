"""Compare the old and new match scoring.

1. Scenarios: one person and two candidates where one is clearly the better
   match (e.g. the one who can give rides on the days they're free). A good
   scorer ranks the better one higher.
2. Spread: for every sample profile, how many of their top 10 matches are
   tied. Ties make "top matches" an arbitrary pick.

Run from backend/:  python eval_matching.py
"""
import contextlib
import io
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
with contextlib.redirect_stdout(io.StringIO()):
    import app as backend  # noqa: E402


def old_rule_score(senior, companion):
    """The scoring before this change, kept here to compare against,
    including its habit of treating two unknown cities or faiths as a match."""
    f = backend.derive_ml_features(senior, companion)
    c1, c2 = backend._str(senior, "location"), backend._str(companion, "location")
    same_city = c1 == c2 or frozenset({c1, c2}) in backend.NEARBY_CITIES
    same_religion = backend._str(senior, "faith") == backend._str(companion, "faith")
    score = 0.0
    if same_city:
        score += 15
    if 15 <= f["age_diff"] <= 55:
        score += max(0.0, 15.0 - abs(f["age_diff"] - 38) * 0.35)
    score += min(f["interest_overlap"] * 8, 16)
    score += 13 * f["volunteering_help_match"]
    score += 10 * f["life_stage_needs_alignment"]
    score += 6 * f["comm_style_compatibility"]
    score += 5 * f["companionship_gap_overlap"]
    score += 6 if same_religion else 3 * f["holiday_overlap"]
    score += 4 * f["cultural_background_match"]
    score += 3 * f["tech_compatibility"]
    score += 3 * f["shared_memory_trigger_overlap"]
    return round(min(max(score, 40.0), 92.0), 1)


def new_rule_score(senior, companion):
    return backend.compute_rule_score(senior, companion)


def old_final_score(senior, companion):
    """What the app showed before: old rules blended 70/30 with the model."""
    ml = backend.compute_ml_score(senior, companion)
    return round(min(old_rule_score(senior, companion) * 0.7 + ml * 0.3, 96.0), 1)


def new_final_score(senior, companion):
    """What the app shows now: new rules blended 70/30 with the model."""
    return backend.compute_match_score(senior, companion)


SENIOR = {
    "userType": "senior", "age": 72, "location": "decatur", "faith": "catholic",
    "interests": ["jazz", "gardening", "walking"], "values": ["kindness", "family"],
    "helpWith": ["rides", "technology help"], "talkPreferences": ["phone", "in-person"],
    "availableDays": ["monday", "wednesday", "friday"], "languages": ["english"],
    "connectionGoals": ["companionship", "friendship"],
}
COMPANION = {
    "userType": "companion", "age": 27, "location": "atlanta", "faith": "",
    "interests": ["movies"], "values": ["kindness"], "helpWith": ["groceries"],
    "talkPreferences": ["phone"], "availableDays": ["wednesday"], "languages": ["english"],
    "connectionGoals": ["friendship"],
}


def variant(**changes):
    return {**COMPANION, **changes}


SCENARIOS = [
    ("can give the rides she needs",
     variant(helpWith=["rides", "technology help"]), variant(helpWith=["yard work"])),
    ("free on her days vs only weekends",
     variant(availableDays=["monday", "wednesday", "friday"]), variant(availableDays=["saturday", "sunday"])),
    ("likes music (related to her jazz) vs technology (unrelated)",
     variant(interests=["music"]), variant(interests=["technology"])),
    ("likes running (related to her walking) vs chess",
     variant(interests=["running"]), variant(interests=["chess"])),
    ("lives nearby vs across the country",
     variant(location="decatur"), variant(location="dallas")),
    ("known nearby city beats an unknown city",
     variant(location="decatur"), variant(location="")),
    ("phone/in-person vs video only",
     variant(talkPreferences=["phone", "in-person"]), variant(talkPreferences=["video call"])),
    ("shares 3 interests vs 1",
     variant(interests=["jazz", "gardening", "walking"]), variant(interests=["jazz", "chess", "movies"])),
    ("helps with both needs vs one",
     variant(helpWith=["rides", "technology help"]), variant(helpWith=["rides"])),
    ("same faith vs none mentioned",
     variant(faith="catholic"), variant(faith="")),
]


def run_scenarios(score):
    passed = 0
    for label, better, worse in SCENARIOS:
        a, b = score(SENIOR, better), score(SENIOR, worse)
        ok = a > b
        passed += ok
        print(f"    {'PASS' if ok else 'FAIL'} {label}: {a} vs {b}")
    return passed


def spread(score):
    """Average distinct scores in each senior's top 10, and how many seniors
    have a tie for first place."""
    seniors = [p for p in backend.SEED_CANDIDATES if p["userType"] == "senior"]
    companions = [p for p in backend.SEED_CANDIDATES if p["userType"] == "companion"]
    distinct, tied_first = [], 0
    for s in seniors:
        top = sorted((score(s, c) for c in companions), reverse=True)[:10]
        distinct.append(len(set(top)))
        tied_first += top[0] == top[1]
    return sum(distinct) / len(distinct), tied_first, len(seniors)


if __name__ == "__main__":
    runs = [("OLD rules", old_rule_score), ("NEW rules", new_rule_score),
            ("OLD final score shown in the app", old_final_score),
            ("NEW final score shown in the app", new_final_score)]
    for label, score in runs:
        print(f"\n##### {label}")
        print("  Scenarios (better candidate should score higher):")
        passed = run_scenarios(score)
        avg_distinct, tied_first, n = spread(score)
        print(f"  Scenarios passed: {passed}/{len(SCENARIOS)}")
        print(f"  Spread: {avg_distinct:.1f} different scores in an average top 10; "
              f"{tied_first}/{n} seniors have a tie for first place")
