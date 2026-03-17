from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
import os
import pickle
import re
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), "candidates.db")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "trained_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "scaler.pkl")

# ---------------------------------------------------------------------------
# Load ML model at startup
# ---------------------------------------------------------------------------
ML_MODEL = None
ML_SCALER = None

try:
    with open(MODEL_PATH, "rb") as f:
        ML_MODEL = pickle.load(f)
    with open(SCALER_PATH, "rb") as f:
        ML_SCALER = pickle.load(f)
    print("ML model loaded successfully.")
except Exception as e:
    print(f"Warning: Could not load ML model ({e}). Using rule-based scoring.")

# The 21 features the model is trained on — order matters
ML_FEATURES = [
    "age_diff", "same_city", "same_religion", "same_mobility",
    "interest_overlap", "tech_compatibility", "comm_style_compatibility",
    "comfort_compatibility",
    "food_cuisine_overlap", "dietary_restriction_conflict",
    "cultural_background_match", "holiday_overlap", "multilingual_fluency_match",
    "hobby_overlap", "spirituality_match",
    "life_stage_needs_alignment",
    "pref_comm_style_match",
    "tech_affinity_gap",
    "companionship_gap_overlap",
    "volunteering_help_match",
    "shared_memory_trigger_overlap",
]

# ---------------------------------------------------------------------------
# Seed profiles
# ---------------------------------------------------------------------------

SENIOR_PROFILES = [
    {"userType":"senior","name":"Maria","age":70,"location":"atlanta","faith":"christian","interests":["music","gardening","cooking"],"languages":["english","spanish"],"culturalBackground":"mexican","values":["family","faith","kindness"],"favoriteFood":["mexican","american"],"helpWith":["rides","groceries","technology help"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship"],"familySituation":"widowed","availableDays":["monday","wednesday","friday"]},
    {"userType":"senior","name":"Dorothy","age":68,"location":"atlanta","faith":"baptist","interests":["reading","walking","gardening","music"],"languages":["english"],"culturalBackground":"american","values":["kindness","family","community"],"favoriteFood":["southern","american"],"helpWith":["groceries","rides","errands"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","book club"],"familySituation":"widowed","availableDays":["monday","wednesday","friday","saturday"]},
    {"userType":"senior","name":"Harold","age":75,"location":"smyrna","faith":"jewish","interests":["chess","reading","history","cooking"],"languages":["english","yiddish"],"culturalBackground":"eastern european","values":["education","family","community"],"favoriteFood":["jewish deli","mediterranean"],"helpWith":["technology help","groceries","rides"],"talkPreferences":["in-person","phone"],"connectionGoals":["intellectual conversation","companionship"],"familySituation":"widowed","availableDays":["sunday","tuesday","thursday"]},
    {"userType":"senior","name":"Rosa","age":73,"location":"atlanta","faith":"catholic","interests":["cooking","music","church","knitting"],"languages":["spanish","english"],"culturalBackground":"mexican","values":["family","faith","generosity"],"favoriteFood":["mexican","italian"],"helpWith":["rides","technology help","errands"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship"],"familySituation":"lives with family","availableDays":["monday","thursday","friday"]},
    {"userType":"senior","name":"Robert","age":72,"location":"decatur","faith":"methodist","interests":["golf","fishing","cooking","history"],"languages":["english"],"culturalBackground":"american","values":["honesty","family","loyalty"],"favoriteFood":["southern","bbq","seafood"],"helpWith":["yard work","technology help","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["activity partner","companionship"],"familySituation":"married","availableDays":["tuesday","thursday","saturday"]},
    {"userType":"senior","name":"Betty","age":71,"location":"atlanta","faith":"baptist","interests":["gospel music","cooking","gardening","church"],"languages":["english"],"culturalBackground":"american","values":["faith","family","generosity"],"favoriteFood":["southern","soul food"],"helpWith":["rides","groceries","technology help"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship"],"familySituation":"widowed","availableDays":["monday","tuesday","thursday","saturday"]},
    {"userType":"senior","name":"Grace","age":65,"location":"atlanta","faith":"christian","interests":["painting","music","walking","volunteering"],"languages":["english"],"culturalBackground":"american","values":["creativity","kindness","faith"],"favoriteFood":["american","mediterranean"],"helpWith":["rides","errands","technology help"],"talkPreferences":["in-person","video call"],"connectionGoals":["friendship","activity partner"],"familySituation":"lives alone","availableDays":["monday","wednesday","friday","sunday"]},
    {"userType":"senior","name":"Carlos","age":66,"location":"norcross","faith":"catholic","interests":["soccer","cooking","music","gardening"],"languages":["spanish","english"],"culturalBackground":"colombian","values":["family","faith","hard work"],"favoriteFood":["colombian","latin american"],"helpWith":["errands","technology help","rides"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","activity partner"],"familySituation":"married","availableDays":["saturday","sunday","wednesday"]},
]

COMPANION_PROFILES = [
    {"userType":"companion","name":"Aisha","age":26,"location":"atlanta","faith":"christian","interests":["cooking","music","volunteering","reading"],"languages":["english"],"culturalBackground":"american","values":["kindness","community","faith"],"favoriteFood":["soul food","american"],"helpWith":["rides","groceries","technology help","errands"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","friendship","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","wednesday"]},
    {"userType":"companion","name":"Tyler","age":30,"location":"marietta","faith":"christian","interests":["history","cooking","walking","movies"],"languages":["english"],"culturalBackground":"american","values":["loyalty","honesty","community"],"favoriteFood":["bbq","southern","american"],"helpWith":["rides","yard work","errands","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","tuesday"]},
    {"userType":"companion","name":"Sofia","age":24,"location":"atlanta","faith":"catholic","interests":["music","cooking","gardening","volunteering"],"languages":["spanish","english"],"culturalBackground":"mexican","values":["family","faith","kindness"],"favoriteFood":["mexican","latin american"],"helpWith":["rides","groceries","errands","technology help"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","friday"]},
    {"userType":"companion","name":"Marcus","age":28,"location":"decatur","faith":"baptist","interests":["music","walking","cooking","gardening"],"languages":["english"],"culturalBackground":"american","values":["community","faith","generosity"],"favoriteFood":["southern","american"],"helpWith":["rides","groceries","yard work","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","thursday"]},
    {"userType":"companion","name":"Priya","age":32,"location":"atlanta","faith":"christian","interests":["reading","painting","yoga","cooking"],"languages":["english"],"culturalBackground":"south asian","values":["wellness","education","kindness"],"favoriteFood":["healthy","mediterranean","asian"],"helpWith":["rides","technology help","errands","groceries"],"talkPreferences":["video call","phone","in-person"],"connectionGoals":["friendship","companionship","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","monday"]},
    {"userType":"companion","name":"Diego","age":27,"location":"norcross","faith":"catholic","interests":["soccer","cooking","music","history"],"languages":["spanish","english"],"culturalBackground":"colombian","values":["family","faith","hard work"],"favoriteFood":["colombian","latin american","mexican"],"helpWith":["rides","errands","yard work","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","wednesday"]},
    {"userType":"companion","name":"Emma","age":22,"location":"smyrna","faith":"jewish","interests":["reading","chess","history","cooking"],"languages":["english","hebrew"],"culturalBackground":"american","values":["education","community","family"],"favoriteFood":["mediterranean","american"],"helpWith":["technology help","groceries","rides","errands"],"talkPreferences":["in-person","phone"],"connectionGoals":["mentorship","friendship","companionship"],"familySituation":"student","availableDays":["saturday","sunday","friday"]},
    {"userType":"companion","name":"Jordan","age":35,"location":"atlanta","faith":"methodist","interests":["walking","fishing","cooking","music"],"languages":["english"],"culturalBackground":"american","values":["honesty","kindness","community"],"favoriteFood":["southern","american","seafood"],"helpWith":["yard work","rides","errands","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","activity partner"],"familySituation":"married","availableDays":["saturday","sunday","thursday"]},
]

SEED_CANDIDATES = SENIOR_PROFILES + COMPANION_PROFILES


# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            profile TEXT NOT NULL
        )
    """)
    c.execute("SELECT COUNT(*) FROM candidates")
    if c.fetchone()[0] == 0:
        for candidate in SEED_CANDIDATES:
            c.execute(
                "INSERT INTO candidates (name, profile) VALUES (?, ?)",
                (candidate["name"], json.dumps(candidate))
            )
        print(f"Seeded {len(SEED_CANDIDATES)} profiles ({len(SENIOR_PROFILES)} seniors, {len(COMPANION_PROFILES)} companions)")
    conn.commit()
    conn.close()


def get_all_candidates():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT profile FROM candidates")
    rows = c.fetchall()
    conn.close()
    return [json.loads(row[0]) for row in rows]


def get_candidates_by_type(user_type):
    """Return only profiles of the OPPOSITE type for intergenerational matching."""
    opposite = "companion" if user_type == "senior" else "senior"
    return [p for p in get_all_candidates() if p.get("userType", "") == opposite]


# ---------------------------------------------------------------------------
# Nearby cities
# ---------------------------------------------------------------------------
NEARBY_CITIES = {
    frozenset({"atlanta", "marietta"}),
    frozenset({"atlanta", "decatur"}),
    frozenset({"atlanta", "smyrna"}),
    frozenset({"atlanta", "norcross"}),
    frozenset({"marietta", "smyrna"}),
    frozenset({"decatur", "norcross"}),
}

CHRISTIAN_TRADITIONS = {
    "christian", "baptist", "methodist", "catholic", "evangelical",
    "protestant", "pentecostal", "lutheran", "presbyterian", "episcopal",
}


# ---------------------------------------------------------------------------
# Audio-transcript → structured field preprocessing
# ---------------------------------------------------------------------------

_STOPWORDS = {
    'that','this','with','have','from','they','will','been','were','when',
    'what','also','just','some','time','very','really','about','know',
    'people','like','myself','their','there','would','could','should',
    'things','other','each','every','always','never','maybe','want',
    'love','enjoy','someone','something','anything','need','look','make',
    'take','give','think','feel','find','tell','good','great','nice',
    'little','older','young','years','year','them','those','these',
}

_HOBBY_KW    = {'gardening','cooking','baking','reading','walking','music','singing',
                'dancing','painting','knitting','chess','golf','fishing','hiking',
                'yoga','volunteering','church','prayer','sewing','crafting','puzzles',
                'movies','travel','photography','sports','running','cycling','swimming',
                'writing','drawing','theater','history','crossword','crafts'}

_VALUE_KW    = {'family','faith','honesty','kindness','respect','community','loyalty',
                'patience','compassion','generosity','education','creativity','wellness',
                'integrity','service','spiritual','friendship','gratitude','love','joy'}

_HELP_KW     = {'rides','groceries','technology','errands','cooking','cleaning','yard',
                'laundry','appointments','phone','computer','shopping','medication',
                'exercise','company','conversation','lifting','driving'}

_GOAL_KW     = {'companionship','friendship','conversation','activity','mentorship',
                'learning','social','connection','support','community','sharing',
                'companion'}

_KNOWN_CITIES = ['atlanta','marietta','decatur','smyrna','norcross','phoenix','tempe',
                 'scottsdale','chicago','dallas','houston','boston','denver','seattle',
                 'portland','miami','orlando','brooklyn','queens','manhattan','jersey',
                 'brooklyn','austin','nashville','memphis','charlotte','raleigh']

_FAITH_MAP = {
    'christian':  {'christian','christianity','jesus','christ'},
    'catholic':   {'catholic','mass','rosary'},
    'baptist':    {'baptist'},
    'methodist':  {'methodist'},
    'jewish':     {'jewish','synagogue','torah','shabbat','hebrew'},
    'muslim':     {'muslim','islam','mosque','quran'},
    'buddhist':   {'buddhist','buddhism','meditation'},
    'hindu':      {'hindu','hinduism'},
}

_CULTURE_MAP = {
    'mexican':       ['mexican','mexico','hispanic','latina','latino'],
    'colombian':     ['colombian','colombia'],
    'american':      ['american'],
    'korean':        ['korean','korea'],
    'chinese':       ['chinese','china'],
    'italian':       ['italian','italy'],
    'south asian':   ['indian','south asian','desi','hindi'],
    'eastern european': ['polish','russian','ukrainian','jewish'],
}


def _kw_extract(text, min_len=4):
    """Return a list of lowercase alpha tokens that are not stopwords."""
    if not text:
        return []
    tokens = re.findall(r'[a-z]{' + str(min_len) + r',}', text.lower())
    return [t for t in tokens if t not in _STOPWORDS]


def preprocess_profile(p):
    """
    Convert a new user's audio-transcript fields (locationText, hobbiesText,
    valuesText, gettingHelpText, meetingText, bio) into the structured arrays
    that derive_ml_features() expects (location, interests, values, helpWith,
    connectionGoals, talkPreferences, faith, culturalBackground, familySituation).

    Only fills in a field when it is absent / empty in the original profile.
    Returns a NEW dict — the original is not mutated.
    """
    p = dict(p)

    # ── location ──────────────────────────────────────────────────────────
    if not p.get('location') and p.get('locationText'):
        loc = p['locationText'].lower()
        for city in _KNOWN_CITIES:
            if city in loc:
                p['location'] = city
                break
        if not p.get('location'):
            first_word = re.split(r'\W+', loc.strip())[0]
            p['location'] = first_word or 'unknown'

    # ── interests (from hobbies recording) ───────────────────────────────
    if not p.get('interests') and p.get('hobbiesText'):
        tokens = set(_kw_extract(p['hobbiesText']))
        matched = list(tokens & _HOBBY_KW)
        p['interests'] = matched if matched else _kw_extract(p['hobbiesText'], 5)[:6]

    # ── values ────────────────────────────────────────────────────────────
    if not p.get('values') and p.get('valuesText'):
        tokens = set(_kw_extract(p['valuesText']))
        matched = list(tokens & _VALUE_KW)
        p['values'] = matched if matched else _kw_extract(p['valuesText'], 5)[:5]

    # ── helpWith (from getting-help recording) ───────────────────────────
    if not p.get('helpWith') and p.get('gettingHelpText'):
        tokens = set(_kw_extract(p['gettingHelpText']))
        matched = list(tokens & _HELP_KW)
        p['helpWith'] = matched if matched else _kw_extract(p['gettingHelpText'], 5)[:4]

    # ── connectionGoals (from meeting recording) ──────────────────────────
    if not p.get('connectionGoals') and p.get('meetingText'):
        tokens = set(_kw_extract(p['meetingText']))
        matched = list(tokens & _GOAL_KW)
        p['connectionGoals'] = matched if matched else ['companionship', 'friendship']

    # ── talkPreferences ────────────────────────────────────────────────────
    if not p.get('talkPreferences'):
        p['talkPreferences'] = ['in-person', 'phone']

    # ── faith (from bio / values text) ────────────────────────────────────
    if not p.get('faith'):
        combined = ' '.join([
            p.get('bio', ''), p.get('valuesText', ''),
            p.get('gettingHelpText', ''), p.get('meetingText', ''),
        ]).lower()
        for faith, keywords in _FAITH_MAP.items():
            if any(kw in combined for kw in keywords):
                p['faith'] = faith
                break

    # ── culturalBackground ─────────────────────────────────────────────────
    if not p.get('culturalBackground'):
        combined = ' '.join([p.get('bio', ''), p.get('locationText', '')]).lower()
        for culture, hints in _CULTURE_MAP.items():
            if any(h in combined for h in hints):
                p['culturalBackground'] = culture
                break

    # ── familySituation ────────────────────────────────────────────────────
    if not p.get('familySituation') and p.get('bio'):
        bio = p['bio'].lower()
        if 'widow' in bio:
            p['familySituation'] = 'widowed'
        elif 'married' in bio:
            p['familySituation'] = 'married'
        elif 'alone' in bio or 'by myself' in bio:
            p['familySituation'] = 'lives alone'
        elif 'single' in bio:
            p['familySituation'] = 'single'
        else:
            p['familySituation'] = 'lives alone'

    return p


# ---------------------------------------------------------------------------
# Intergenerational feature encoding
# ---------------------------------------------------------------------------
def _set(p, k):
    return set(v.lower().strip() for v in p.get(k, []))

def _str(p, k):
    return p.get(k, "").lower().strip()

def _tech_score(p):
    prefs = _set(p, "talkPreferences")
    age = p.get("age", 30)
    base = 2 if age >= 55 else 4
    if "video call" in prefs or "video" in prefs:
        return min(5, base + 1)
    if "text" in prefs:
        return base
    return max(1, base - 1)

def _age_gap_appropriate(senior, companion):
    older  = max(senior.get("age", 70), companion.get("age", 30))
    younger = min(senior.get("age", 70), companion.get("age", 30))
    gap = older - younger
    return 1 if 15 <= gap <= 50 else 0


def derive_ml_features(senior, companion):
    """
    Compute the 21 ML features for a senior <-> companion pair.
    Feature names match what the model was trained on.
    """
    c1 = _str(senior, "location")
    c2 = _str(companion, "location")
    same_city = int(c1 == c2 or frozenset({c1, c2}) in NEARBY_CITIES)

    f1 = _str(senior, "faith")
    f2 = _str(companion, "faith")
    same_religion = int(f1 == f2)
    broad_faith = int(
        (f1 in CHRISTIAN_TRADITIONS and f2 in CHRISTIAN_TRADITIONS) or f1 == f2
    )

    age_diff = abs(senior.get("age", 70) - companion.get("age", 30))
    same_mobility = _age_gap_appropriate(senior, companion)  # repurposed

    i1 = _set(senior, "interests")
    i2 = _set(companion, "interests")
    interest_overlap = len(i1 & i2)
    hobby_overlap = int(interest_overlap > 0)

    ts = _tech_score(senior)
    tc = _tech_score(companion)
    tech_compatibility = int(tc - ts >= 2)   # companion is more tech-savvy
    tech_affinity_gap  = int(tc - ts >= 1)

    prefs_s = _set(senior, "talkPreferences")
    prefs_c = _set(companion, "talkPreferences")
    comm_style_compatibility = int(bool(prefs_s & prefs_c))
    pref_comm_style_match    = comm_style_compatibility

    sit_c = _str(companion, "familySituation")
    sit_s = _str(senior, "familySituation")
    companion_open = int("single" in sit_c or "student" in sit_c)
    senior_open    = int("widow" in sit_s or "alone" in sit_s or "divorced" in sit_s)
    comfort_compatibility = int(companion_open == 1 or senior_open == 1)

    fd1 = _set(senior, "favoriteFood")
    fd2 = _set(companion, "favoriteFood")
    food_cuisine_overlap = int(bool(fd1 & fd2))
    dietary_restriction_conflict = 0

    cu1 = _str(senior, "culturalBackground")
    cu2 = _str(companion, "culturalBackground")
    cultural_background_match = int(cu1 == cu2 and bool(cu1))
    holiday_overlap = int(broad_faith or cultural_background_match)

    l1 = _set(senior, "languages")
    l2 = _set(companion, "languages")
    multilingual_fluency_match = int(bool(l1 & l2) and len(l1) >= 2)

    v1 = _set(senior, "values")
    v2 = _set(companion, "values")
    spiritual_kw = {"faith", "church", "spiritual", "god", "prayer", "religion"}
    sp_s = int(bool(spiritual_kw & v1) or bool(f1))
    sp_c = int(bool(spiritual_kw & v2) or bool(f2))
    spirituality_match = int(sp_s == sp_c and same_religion)

    senior_goals    = _set(senior, "connectionGoals")
    companion_goals = _set(companion, "connectionGoals")
    senior_wants    = int(bool({"companionship", "friendship"} & senior_goals))
    companion_offers = int(bool(
        {"companionship", "friendship", "mentorship", "learning from elders"} & companion_goals
    ))
    life_stage_needs_alignment = int(senior_wants and companion_offers)
    companionship_gap_overlap  = int(
        bool(senior_goals & companion_goals) and senior_wants and companion_offers
    )

    senior_needs  = _set(senior, "helpWith")
    companion_can = _set(companion, "helpWith")
    volunteering_help_match = int(bool(senior_needs & companion_can))

    combined_s = i1 | v1
    combined_c = i2 | v2
    shared_memory_trigger_overlap = int(bool(combined_s & combined_c))

    return {
        "age_diff":                      age_diff,
        "same_city":                     same_city,
        "same_religion":                 same_religion,
        "same_mobility":                 same_mobility,
        "interest_overlap":              interest_overlap,
        "tech_compatibility":            tech_compatibility,
        "comm_style_compatibility":      comm_style_compatibility,
        "comfort_compatibility":         comfort_compatibility,
        "food_cuisine_overlap":          food_cuisine_overlap,
        "dietary_restriction_conflict":  dietary_restriction_conflict,
        "cultural_background_match":     cultural_background_match,
        "holiday_overlap":               holiday_overlap,
        "multilingual_fluency_match":    multilingual_fluency_match,
        "hobby_overlap":                 hobby_overlap,
        "spirituality_match":            spirituality_match,
        "life_stage_needs_alignment":    life_stage_needs_alignment,
        "pref_comm_style_match":         pref_comm_style_match,
        "tech_affinity_gap":             tech_affinity_gap,
        "companionship_gap_overlap":     companionship_gap_overlap,
        "volunteering_help_match":       volunteering_help_match,
        "shared_memory_trigger_overlap": shared_memory_trigger_overlap,
    }


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def compute_ml_score(senior, companion):
    features = derive_ml_features(senior, companion)
    vec = pd.DataFrame([[features[f] for f in ML_FEATURES]], columns=ML_FEATURES)
    scaled = ML_SCALER.transform(vec)
    prob = ML_MODEL.predict_proba(scaled)[0][1]
    return round(prob * 100, 1)


def compute_rule_score(senior, companion):
    f = derive_ml_features(senior, companion)
    score = 0
    score += 20 if f["same_city"] else 0
    score += 20 if f["same_mobility"] else 0
    score += min(f["interest_overlap"] * 8, 25)
    score += 15 if f["volunteering_help_match"] else 0
    score += 10 if f["life_stage_needs_alignment"] else 0
    score += 10 if f["tech_compatibility"] else 0
    return round(score, 1)


def compute_match_score(senior, companion):
    if ML_MODEL and ML_SCALER:
        return compute_ml_score(senior, companion)
    return compute_rule_score(senior, companion)


def build_feature_breakdown(senior, companion):
    f = derive_ml_features(senior, companion)
    return {
        "age_diff":            f["age_diff"],
        "same_city":           f["same_city"],
        "interest_overlap":    f["interest_overlap"],
        "can_help_with_needs": f["volunteering_help_match"],
        "goals_align":         f["companionship_gap_overlap"],
        "tech_compatible":     f["tech_compatibility"],
        "shared_faith":        f["same_religion"],
        "age_gap_appropriate": f["same_mobility"],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "ml_model_loaded": ML_MODEL is not None,
        "matching_mode": "intergenerational",
    }), 200


@app.route("/api/candidates", methods=["GET"])
def list_candidates():
    try:
        candidates = get_all_candidates()
        return jsonify({"candidates": candidates, "total": len(candidates)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/match", methods=["POST"])
def calculate_matches():
    try:
        data = request.json or {}
        target_user = data.get("targetUser") or data.get("currentUser")

        if not target_user:
            return jsonify({"error": "Missing targetUser"}), 400

        # Convert audio transcript fields → structured arrays for ML feature extraction
        target_user = preprocess_profile(target_user)
        print(f"[match] preprocessed profile: interests={target_user.get('interests')}, "
              f"values={target_user.get('values')}, helpWith={target_user.get('helpWith')}, "
              f"location={target_user.get('location')}, faith={target_user.get('faith')}")

        user_type = target_user.get("userType", "")

        # Intergenerational: only match against opposite type
        if user_type in ("senior", "companion"):
            candidates = get_candidates_by_type(user_type)
        else:
            candidates = data.get("candidates") or get_all_candidates()

        matches = []
        for candidate in candidates:
            if candidate.get("name") == target_user.get("name"):
                continue

            # Always pass (senior, companion) to the feature encoder
            if user_type == "senior":
                senior, companion = target_user, candidate
            elif user_type == "companion":
                senior, companion = candidate, target_user
            else:
                senior, companion = target_user, candidate

            score    = compute_match_score(senior, companion)
            features = build_feature_breakdown(senior, companion)
            matches.append({"candidate": candidate, "score": score, "features": features})

        matches.sort(key=lambda x: x["score"], reverse=True)

        return jsonify({
            "matches":          matches[:3],
            "total_candidates": len(candidates),
            "scoring_method":   "ml_model" if (ML_MODEL and ML_SCALER) else "rule_based",
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/users", methods=["GET"])
def list_users():
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, name, profile FROM candidates")
        rows = c.fetchall()
        conn.close()
        users = []
        for row in rows:
            profile = json.loads(row[2])
            profile["id"] = row[0]
            users.append(profile)
        return jsonify(users), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/users", methods=["POST"])
def add_user():
    try:
        user_data = request.json or {}
        name = user_data.get("name", "Unknown")
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO candidates (name, profile) VALUES (?, ?)",
            (name, json.dumps(user_data))
        )
        new_id = c.lastrowid
        conn.commit()
        conn.close()
        print(f"New user added: {name} ({user_data.get('userType', 'unknown type')})")
        return jsonify({"status": "success", "userId": new_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    print("\n" + "=" * 55)
    print("Community Connection Backend — Intergenerational Mode")
    print("=" * 55)
    print(f"  Scoring: {'ML Neural Network' if ML_MODEL else 'Rule-based (fallback)'}")
    print("  GET  /health           - Health check")
    print("  GET  /api/candidates   - List all profiles")
    print("  GET  /api/users        - List all users")
    print("  POST /api/match        - Match senior <-> companion")
    print("  POST /api/users        - Add new user")
    print("=" * 55 + "\n")
    app.run(host="0.0.0.0", debug=True, port=5000)
