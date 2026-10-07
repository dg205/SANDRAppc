"""Check how well spoken survey answers are turned into profile fields.

Each case lists fields that must be found and things that must NOT appear
(e.g. "I don't do video calls" must not give "video call"). Run from
backend/:  python eval_extract.py [model ...]
"""
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
import profile_extract as pe  # noqa: E402

CASES = [
    {
        "name": "senior, widowed, phone only",
        "profile": {
            "userType": "senior",
            "bio": "Well I'm Rosa, I'm a retired teacher here in Decatur, I lost my husband a few years back. I love cooking for people and I still go to Mass every Sunday.",
            "hobbiesText": "I'd love someone to go walking with in the park, maybe play cards or help me in the garden.",
            "meetingText": "Somebody kind and patient, maybe someone who speaks Spanish so I can practice with them.",
            "commPreferenceText": "I like to talk on the phone, and I don't really do the video thing.",
            "availabilityText": "Weekday mornings mostly, not Thursdays because I have my doctor.",
            "gettingHelpText": "I don't drive anymore so rides would help, and my phone confuses me sometimes.",
        },
        "must": {
            "interests": ["cooking", "walking", "gardening"],
            "talkPreferences": ["phone"],
            "availableDays": ["monday", "tuesday", "wednesday", "friday"],
            "helpWith": ["rides"],
            "faith": "catholic",
            "location": "decatur",
            "familySituation": "widowed",
        },
        "must_not": {"talkPreferences": ["video call"], "availableDays": ["thursday", "saturday", "sunday"]},
    },
    {
        "name": "companion, weekends, many channels",
        "profile": {
            "userType": "companion",
            "bio": "Hey I'm Marcus, I'm a nursing student at Georgia State. I play guitar and I'm really into history podcasts.",
            "hobbiesText": "Board games, going for coffee, listening to old records, I'd volunteer too.",
            "meetingText": "Older folks who have stories to tell, I'd love to learn from them.",
            "commPreferenceText": "Texting is easiest but I'm happy to meet up in person or FaceTime.",
            "availabilityText": "Weekends and Tuesday evenings.",
            "gettingHelpText": "I can help with tech stuff, groceries, I have a car so rides too.",
        },
        "must": {
            "interests": ["music", "history", "volunteering"],
            "talkPreferences": ["text messages", "in-person", "video call"],
            "availableDays": ["tuesday", "saturday", "sunday"],
            "helpWith": ["technology help", "groceries", "rides"],
            "familySituation": "student",
        },
        "must_not": {"availableDays": ["monday", "wednesday", "thursday", "friday"]},
    },
    {
        "name": "real answer: short and partly garbled",
        "profile": {
            "userType": "senior",
            "bio": ".I enjoy going on runs and exercise. I enjoy to try new meals",
            "hobbiesText": ".",
            "meetingText": "What is the name of the world?",
            "commPreferenceText": ".",
            "availabilityText": "I'm a little bit more than a little bit.",
            "gettingHelpText": ".",
        },
        "must": {"interests": ["exercise"]},
        "must_not": {"availableDays": list(pe.FIXED["availableDays"]), "faith": "*", "location": "*"},
    },
    {
        "name": "silence only",
        "profile": {"userType": "senior", "bio": ".", "hobbiesText": ".", "meetingText": ".",
                    "commPreferenceText": ".", "availabilityText": ".", "gettingHelpText": "."},
        "must": {},
        "must_not": {"*": "*"},
    },
    {
        "name": "companion, no driving, evenings",
        "profile": {
            "userType": "companion",
            "bio": "I'm Priya, I work in software in Alpharetta. Big reader, I do yoga, and I cook a lot of Indian food.",
            "hobbiesText": "Book club type stuff, walks, maybe teaching someone to use their phone or computer.",
            "meetingText": "Someone curious who likes good conversation.",
            "commPreferenceText": "Video calls during the week, in person on weekends. Please no phone calls, I never answer.",
            "availabilityText": "Monday and Thursday evenings, and Saturday mornings.",
            "gettingHelpText": "I don't have a car so I can't give rides, but I'm great with tech.",
        },
        "must": {
            "interests": ["reading", "yoga", "cooking", "walking"],
            "talkPreferences": ["video call", "in-person"],
            "availableDays": ["monday", "thursday", "saturday"],
            "helpWith": ["technology help"],
            "location": "alpharetta",
        },
        "must_not": {"talkPreferences": ["phone"], "helpWith": ["rides"]},
    },
]


def score(case, got):
    """(found, expected, mistakes) for one case."""
    found = expected = 0
    mistakes = []
    for key, want in case["must"].items():
        have = got.get(key)
        items = want if isinstance(want, list) else [want]
        for item in items:
            expected += 1
            if (isinstance(have, list) and item in have) or have == item:
                found += 1
            else:
                mistakes.append(f"missed {key}={item}")
    for key, bad in case["must_not"].items():
        keys = list(got) if key == "*" else [key]
        for k in keys:
            have = got.get(k)
            if bad == "*":
                if have:
                    mistakes.append(f"made up {k}={have}")
            else:
                for item in bad:
                    if isinstance(have, list) and item in have:
                        mistakes.append(f"wrongly added {k}={item}")
    return found, expected, mistakes


def run(model):
    pe.EXTRACT_MODEL = model
    total_found = total_expected = total_wrong = 0
    print(f"\n##### {model}")
    for case in CASES:
        start = time.time()
        got = pe.extract_profile_fields(case["profile"])
        found, expected, mistakes = score(case, got)
        wrong = sum(1 for m in mistakes if not m.startswith("missed"))
        total_found += found
        total_expected += expected
        total_wrong += wrong
        print(f"  {case['name']}: {found}/{expected} found, {wrong} wrong ({time.time() - start:.1f}s)")
        for m in mistakes:
            print(f"      - {m}")
        time.sleep(2)  # stay under the free tier's per-minute limits
    print(f"  TOTAL: {total_found}/{total_expected} found, {total_wrong} wrong")


if __name__ == "__main__":
    for model in sys.argv[1:] or [pe.EXTRACT_MODEL]:
        run(model)
