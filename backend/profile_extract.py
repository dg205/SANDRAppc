"""Turn a person's spoken survey answers into structured profile fields.

The voice survey asks open questions, so a new profile has the transcripts
(bio, hobbiesText, ...) but none of the fields the matcher compares
(interests, values, helpWith, ...). Keyword lists only catch exact words, so
most real answers produced nothing. A language model reads the answers the
way a person would. Only fields the person hasn't already filled in are set,
and if the model call fails the profile is saved as-is (the matcher then
falls back to its keyword extraction).
"""
import json
import os

# gpt-oss-20b scored about the same as the 120b model on eval_extract.py
# (33-34 of 37 facts, nothing made up) at under a second instead of ~10.
EXTRACT_MODEL = os.environ.get("GROQ_EXTRACT_MODEL", "openai/gpt-oss-20b")
MAX_REPLY_TOKENS = 900
# gpt-oss models think before answering; a little thinking is plenty here
# and keeps replies fast and inside the token cap.
MODEL_OPTIONS = {
    "openai/gpt-oss-120b": {"reasoning_effort": "low"},
    "openai/gpt-oss-20b": {"reasoning_effort": "low"},
}

# The words the sample profiles and Edit Profile already use, so extracted
# answers line up with everyone else's. Other short phrases are allowed when
# nothing here fits (e.g. "running").
VOCAB = {
    "interests": [
        "art", "baking", "bocce", "chess", "church", "community", "cooking",
        "crafts", "crossword", "dancing", "exercise", "fishing", "gaming",
        "gardening", "golf", "gospel music", "hiking", "history", "jazz",
        "knitting", "meditation", "movies", "music", "opera", "painting",
        "quilting", "reading", "running", "sewing", "soccer", "sports",
        "technology", "theater", "travel", "volunteering", "walking",
        "writing", "yoga",
    ],
    "values": [
        "community", "compassion", "creativity", "education", "faith",
        "family", "generosity", "gratitude", "hard work", "harmony", "honesty",
        "integrity", "intellectual curiosity", "joy", "justice", "kindness",
        "loyalty", "patience", "resilience", "respect", "service",
        "spirituality", "wellness",
    ],
    "helpWith": [
        "appointments", "companionship", "computer help", "cooking", "errands",
        "groceries", "home repairs", "medical appointments", "phone setup",
        "rides", "technology help", "tutoring", "yard work",
    ],
    "connectionGoals": [
        "activity partner", "book club", "companionship", "cultural exchange",
        "friendship", "intellectual conversation", "learning from elders",
        "mentorship",
    ],
    "favoriteFood": [
        "american", "asian", "bbq", "caribbean", "chinese", "healthy",
        "indian", "italian", "korean", "latin american", "mediterranean",
        "mexican", "middle eastern", "seafood", "soul food", "southern",
        "vegetarian", "vietnamese",
    ],
}
# These have a fixed set of answers; anything else is dropped.
FIXED = {
    "talkPreferences": ["in-person", "phone", "video call", "text messages"],
    "availableDays": ["monday", "tuesday", "wednesday", "thursday", "friday",
                      "saturday", "sunday"],
}
FAMILY_SITUATIONS = ["lives alone", "lives with family", "married", "single",
                     "student", "widowed", "divorced"]
# Other ways the model writes a fixed answer, mapped onto the exact option.
SYNONYMS = {
    "in person": "in-person", "in-person meetings": "in-person", "meet up": "in-person",
    "phone call": "phone", "phone calls": "phone", "calls": "phone", "call": "phone",
    "video": "video call", "video calls": "video call", "facetime": "video call", "zoom": "video call",
    "text": "text messages", "texting": "text messages", "text message": "text messages",
    "texts": "text messages",
    "walks": "walking", "books": "reading", "volunteer": "volunteering", "garden": "gardening",
}

LIST_FIELDS = list(VOCAB) + list(FIXED) + ["languages"]
TEXT_FIELDS = ["faith", "location", "culturalBackground", "familySituation"]

# The spoken answers, keyed by the profile field each is saved under.
ANSWERS = {
    "bio": "Tell us a little about yourself and what you enjoy doing.",
    "hobbiesText": "What types of social activities would you like to do with another person or group?",
    "meetingText": "What kind of people would you enjoy connecting with?",
    "commPreferenceText": "How do you prefer to communicate with others?",
    "availabilityText": "When are you usually available for social activities or conversations?",
    "gettingHelpText": "Is there anything important we should consider when suggesting possible social matches?",
}

MAX_ITEMS = 8
MAX_ITEM_LENGTH = 40


def _has_words(text):
    """Whether an answer says anything (not just "." from a silent recording)."""
    return sum(1 for w in str(text or "").split() if any(ch.isalpha() for ch in w)) >= 2


def _prompt(profile):
    role = ("an older adult looking for companionship"
            if profile.get("userType") == "senior"
            else "a younger companion offering friendship and help")
    help_meaning = ("things they would like help with"
                    if profile.get("userType") == "senior"
                    else "things they are happy to help others with")
    answers = "\n".join(
        f'Q: {question}\nA: "{str(profile.get(field, "")).strip()}"'
        for field, question in ANSWERS.items()
        if _has_words(profile.get(field))
    )
    vocab = "\n".join(f"- {k}: {', '.join(v)}" for k, v in VOCAB.items())
    fixed = "\n".join(f"- {k}: only {', '.join(v)}" for k, v in FIXED.items())
    return f"""The person below is {role} on an app that matches older adults with younger companions. Read their spoken survey answers (speech-to-text, so expect small errors) and fill in their profile.

Rules:
- Only include what they said or clearly implied. If something wasn't mentioned, leave it empty. Never guess.
- Use lowercase. Prefer words from these lists; if nothing fits, use a short phrase of 1 to 3 words:
{vocab}
{fixed}
- helpWith means {help_meaning}.
- talkPreferences: "in person" or "meet up" means in-person; "call" means phone; "facetime", "zoom" or "video" means video call; "text" means text messages.
- availableDays: "weekdays" means monday to friday, "weekends" means saturday and sunday.
- languages: languages they speak, as plain names like "english" or "spanish".
- faith: their religion if they mention one (e.g. "catholic", "baptist", "jewish"), else "".
- location: their city if they mention one, else "".
- culturalBackground: their heritage if they mention it (e.g. "mexican", "korean"), else "".
- familySituation: one of {", ".join(FAMILY_SITUATIONS)} if they mention it, else "".
- Read every answer for every field: people mention interests, days or help in any answer. Respect "not" and "don't": something they say they don't do or like is left out.
- Use the plain activity word: "walks" is walking, "books" is reading, "playing guitar" is music. Any way of meeting face to face (in person, meet up, coffee together) counts as in-person.
- A student of any kind has familySituation "student".

Example. Answers: "I'm retired in Marietta and love the garden. I'd enjoy cards or coffee. Call me, I don't text. Free weekends and Wednesday afternoons. I can't drive." Result: {{"interests": ["gardening", "card games", "coffee"], "talkPreferences": ["phone"], "availableDays": ["wednesday", "saturday", "sunday"], "helpWith": ["rides"], "location": "marietta", ...the rest empty}}

Answers:
{answers}

Reply with only a JSON object with exactly these keys: {", ".join(LIST_FIELDS + TEXT_FIELDS)}. List fields are arrays of strings; the others are strings."""


def _clean_list(value, allowed=None):
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        if not isinstance(item, str):
            continue
        item = item.strip().lower()
        item = SYNONYMS.get(item, item)
        if not item or len(item) > MAX_ITEM_LENGTH:
            continue
        if allowed is not None and item not in allowed:
            continue
        if item not in out:
            out.append(item)
    return out[:MAX_ITEMS]


def _clean_text(value):
    if not isinstance(value, str):
        return ""
    value = value.strip().lower()
    return value if len(value) <= MAX_ITEM_LENGTH else ""


def clean_extracted(raw):
    """Keep only well-formed fields from the model's reply."""
    if not isinstance(raw, dict):
        return {}
    out = {}
    for key in LIST_FIELDS:
        allowed = FIXED.get(key)
        items = _clean_list(raw.get(key), allowed)
        if items:
            out[key] = items
    for key in TEXT_FIELDS:
        text = _clean_text(raw.get(key))
        if key == "familySituation" and text not in FAMILY_SITUATIONS:
            text = ""
        if text and text not in ("none", "unknown", "n/a"):
            out[key] = text
    return out


def extract_profile_fields(profile):
    """Structured fields from the spoken answers, or {} if there's nothing
    to read or the model can't be reached."""
    if not any(_has_words(profile.get(field)) for field in ANSWERS):
        return {}
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return {}
    try:
        from groq import Groq
        client = Groq(api_key=api_key, timeout=20.0)
        response = client.chat.completions.create(
            model=EXTRACT_MODEL,
            messages=[{"role": "user", "content": _prompt(profile)}],
            response_format={"type": "json_object"},
            temperature=0,
            # A full profile is ~300 tokens; the cap keeps a reply inside the
            # free tier's per-minute output limit.
            max_tokens=MAX_REPLY_TOKENS,
            **MODEL_OPTIONS.get(EXTRACT_MODEL, {}),
        )
        return clean_extracted(json.loads(response.choices[0].message.content))
    except Exception as e:
        print(f"[extract] skipped: {e}")
        return {}


def fill_missing_fields(profile):
    """Return a copy of the profile with empty fields filled in from the
    spoken answers. Fields the person set themselves are never replaced.
    `fieldsFromVoice` lists what was filled in, so it's easy to check, and
    so a retaken survey refreshes those fields from the new answers."""
    profile = dict(profile)
    for key in profile.pop("fieldsFromVoice", None) or []:
        profile.pop(key, None)
    extracted = extract_profile_fields(profile)
    filled = []
    for key, value in extracted.items():
        if not profile.get(key):
            profile[key] = value
            filled.append(key)
    if filled:
        profile["fieldsFromVoice"] = filled
    return profile
