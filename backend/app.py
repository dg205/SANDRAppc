from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
import time
import os
import pickle
import re
import tempfile
import base64
import threading
import numpy as np
import pandas as pd
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Groq Whisper transcription (free tier, no PyTorch needed)
# ---------------------------------------------------------------------------
def transcribe_with_groq(audio_path):
    from groq import Groq
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")
    client = Groq(api_key=api_key)
    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-large-v3-turbo",
            file=f,
            language="en",
        )
    return result.text


# Use /data on Render (persistent disk) or local directory otherwise
_BASE_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
DB_PATH = os.path.join(_BASE_DIR, "candidates.db")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "trained_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "scaler.pkl")
AUDIO_UPLOAD_DIR = os.path.join(_BASE_DIR, "AuidoRecordings")
os.makedirs(AUDIO_UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Thread-safe DB helper with WAL mode enabled
# ---------------------------------------------------------------------------
def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")   # allow concurrent reads + writes
    conn.execute("PRAGMA synchronous=NORMAL") # faster writes, still safe
    return conn

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
    {"userType":"senior","name":"Eleanor","age":78,"location":"marietta","faith":"catholic","interests":["knitting","reading","baking","church"],"languages":["english"],"culturalBackground":"irish","values":["family","faith","patience"],"favoriteFood":["irish","american","italian"],"helpWith":["rides","groceries","technology help","errands"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship"],"familySituation":"widowed","availableDays":["monday","wednesday","friday","saturday"]},
    {"userType":"senior","name":"James","age":69,"location":"atlanta","faith":"baptist","interests":["jazz","chess","cooking","walking","history"],"languages":["english"],"culturalBackground":"american","values":["community","education","family","integrity"],"favoriteFood":["soul food","southern","bbq"],"helpWith":["technology help","rides","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["intellectual conversation","companionship","friendship"],"familySituation":"widowed","availableDays":["tuesday","thursday","saturday","sunday"]},
    {"userType":"senior","name":"Sun-Hee","age":67,"location":"norcross","faith":"christian","interests":["cooking","gardening","church","music","sewing"],"languages":["korean","english"],"culturalBackground":"korean","values":["family","respect","hard work","faith"],"favoriteFood":["korean","asian","american"],"helpWith":["technology help","errands","rides"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","friendship","cultural exchange"],"familySituation":"married","availableDays":["monday","wednesday","saturday","sunday"]},
    {"userType":"senior","name":"Frank","age":74,"location":"decatur","faith":"catholic","interests":["cooking","walking","opera","history","bocce"],"languages":["english","italian"],"culturalBackground":"italian","values":["family","generosity","loyalty","faith"],"favoriteFood":["italian","mediterranean","american"],"helpWith":["rides","groceries","yard work","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","activity partner","friendship"],"familySituation":"widowed","availableDays":["tuesday","thursday","saturday","sunday"]},
    {"userType":"senior","name":"Patricia","age":76,"location":"smyrna","faith":"methodist","interests":["painting","reading","crossword","walking","gardening"],"languages":["english"],"culturalBackground":"american","values":["creativity","kindness","education","community"],"favoriteFood":["american","mediterranean","healthy"],"helpWith":["rides","errands","technology help","groceries"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["friendship","book club","companionship"],"familySituation":"lives alone","availableDays":["monday","wednesday","friday","sunday"]},
    {"userType":"senior","name":"Arthur","age":81,"location":"atlanta","faith":"jewish","interests":["reading","theater","chess","history","writing"],"languages":["english","yiddish"],"culturalBackground":"eastern european","values":["education","intellectual curiosity","family","community"],"favoriteFood":["jewish deli","mediterranean","american"],"helpWith":["technology help","rides","groceries","errands"],"talkPreferences":["in-person","phone"],"connectionGoals":["intellectual conversation","companionship","mentorship"],"familySituation":"widowed","availableDays":["sunday","tuesday","thursday","friday"]},
    {"userType":"senior","name":"Consuelo","age":70,"location":"norcross","faith":"catholic","interests":["cooking","dancing","music","church","gardening"],"languages":["spanish","english"],"culturalBackground":"mexican","values":["family","faith","generosity","community"],"favoriteFood":["mexican","latin american","italian"],"helpWith":["rides","errands","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","friendship","cultural exchange"],"familySituation":"lives with family","availableDays":["monday","friday","saturday","sunday"]},
    {"userType":"senior","name":"William","age":67,"location":"marietta","faith":"baptist","interests":["fishing","golf","cooking","sports","history"],"languages":["english"],"culturalBackground":"american","values":["loyalty","honesty","family","service"],"favoriteFood":["southern","bbq","seafood","american"],"helpWith":["yard work","errands","rides","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["activity partner","companionship","friendship"],"familySituation":"married","availableDays":["tuesday","thursday","saturday","sunday"]},
    # --- Chicago area ---
    {"userType":"senior","name":"Loretta","age":72,"location":"chicago","faith":"baptist","interests":["gospel music","cooking","gardening","church","quilting"],"languages":["english"],"culturalBackground":"american","values":["faith","family","community","generosity"],"favoriteFood":["soul food","southern","american"],"helpWith":["rides","groceries","technology help","errands"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship"],"familySituation":"widowed","availableDays":["monday","wednesday","friday","saturday"]},
    {"userType":"senior","name":"Stanislaw","age":77,"location":"chicago","faith":"catholic","interests":["chess","history","cooking","walking","polka music"],"languages":["polish","english"],"culturalBackground":"eastern european","values":["family","faith","hard work","loyalty"],"favoriteFood":["polish","eastern european","american"],"helpWith":["technology help","rides","groceries","errands"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","intellectual conversation","friendship"],"familySituation":"widowed","availableDays":["tuesday","thursday","saturday","sunday"]},
    {"userType":"senior","name":"Miriam","age":74,"location":"evanston","faith":"jewish","interests":["reading","theater","painting","volunteering","cooking"],"languages":["english","hebrew"],"culturalBackground":"american","values":["education","community","creativity","justice"],"favoriteFood":["jewish deli","mediterranean","healthy"],"helpWith":["rides","technology help","errands","groceries"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["intellectual conversation","friendship","companionship"],"familySituation":"lives alone","availableDays":["monday","wednesday","friday","sunday"]},
    # --- Miami area ---
    {"userType":"senior","name":"Esperanza","age":69,"location":"miami","faith":"catholic","interests":["dancing","cooking","music","church","gardening"],"languages":["spanish","english"],"culturalBackground":"cuban","values":["family","faith","joy","community"],"favoriteFood":["cuban","latin american","seafood"],"helpWith":["rides","errands","technology help","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","friendship","cultural exchange"],"familySituation":"widowed","availableDays":["monday","thursday","friday","saturday"]},
    {"userType":"senior","name":"Jean-Baptiste","age":71,"location":"miami","faith":"christian","interests":["music","cooking","gardening","church","community"],"languages":["haitian creole","french","english"],"culturalBackground":"haitian","values":["faith","family","resilience","community"],"favoriteFood":["haitian","caribbean","american"],"helpWith":["rides","groceries","errands","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","friendship","cultural exchange"],"familySituation":"widowed","availableDays":["tuesday","thursday","saturday","sunday"]},
    {"userType":"senior","name":"Sylvia","age":66,"location":"coral gables","faith":"catholic","interests":["painting","reading","cooking","walking","volunteering"],"languages":["spanish","english"],"culturalBackground":"cuban","values":["family","creativity","faith","kindness"],"favoriteFood":["cuban","mediterranean","healthy"],"helpWith":["rides","technology help","errands"],"talkPreferences":["in-person","video call"],"connectionGoals":["friendship","activity partner","companionship"],"familySituation":"lives alone","availableDays":["monday","wednesday","friday","sunday"]},
    # --- Dallas area ---
    {"userType":"senior","name":"Guadalupe","age":68,"location":"dallas","faith":"catholic","interests":["cooking","church","gardening","music","sewing"],"languages":["spanish","english"],"culturalBackground":"mexican","values":["family","faith","generosity","hard work"],"favoriteFood":["mexican","tex-mex","american"],"helpWith":["rides","groceries","errands","technology help"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship"],"familySituation":"lives with family","availableDays":["monday","wednesday","friday","saturday"]},
    {"userType":"senior","name":"Eugene","age":73,"location":"dallas","faith":"methodist","interests":["golf","fishing","history","cooking","sports"],"languages":["english"],"culturalBackground":"american","values":["honesty","loyalty","family","service"],"favoriteFood":["bbq","tex-mex","southern","american"],"helpWith":["yard work","rides","groceries","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["activity partner","companionship","friendship"],"familySituation":"married","availableDays":["tuesday","thursday","saturday","sunday"]},
    # --- Houston area ---
    {"userType":"senior","name":"Thanh","age":70,"location":"houston","faith":"buddhist","interests":["cooking","gardening","meditation","walking","community"],"languages":["vietnamese","english"],"culturalBackground":"vietnamese","values":["family","respect","harmony","hard work"],"favoriteFood":["vietnamese","asian","healthy"],"helpWith":["technology help","rides","errands","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","friendship","cultural exchange"],"familySituation":"lives with family","availableDays":["monday","wednesday","saturday","sunday"]},
    {"userType":"senior","name":"Lakshmi","age":67,"location":"houston","faith":"hindu","interests":["cooking","yoga","gardening","reading","volunteering"],"languages":["hindi","english"],"culturalBackground":"south asian","values":["family","spirituality","education","wellness"],"favoriteFood":["indian","asian","vegetarian","healthy"],"helpWith":["rides","technology help","errands","groceries"],"talkPreferences":["in-person","phone","video call"],"connectionGoals":["companionship","friendship","cultural exchange"],"familySituation":"married","availableDays":["monday","tuesday","thursday","saturday"]},
    # --- New York area ---
    {"userType":"senior","name":"Carmen","age":75,"location":"brooklyn","faith":"catholic","interests":["cooking","dancing","music","church","sewing"],"languages":["spanish","english"],"culturalBackground":"puerto rican","values":["family","faith","community","joy"],"favoriteFood":["puerto rican","latin american","caribbean"],"helpWith":["rides","groceries","errands","technology help"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship"],"familySituation":"widowed","availableDays":["monday","wednesday","friday","saturday"]},
    {"userType":"senior","name":"Salvatore","age":79,"location":"brooklyn","faith":"catholic","interests":["cooking","bocce","opera","history","walking"],"languages":["italian","english"],"culturalBackground":"italian","values":["family","loyalty","generosity","faith"],"favoriteFood":["italian","mediterranean","american"],"helpWith":["rides","groceries","technology help","yard work"],"talkPreferences":["in-person","phone"],"connectionGoals":["companionship","activity partner","friendship"],"familySituation":"widowed","availableDays":["tuesday","thursday","saturday","sunday"]},
    {"userType":"senior","name":"Evelyn","age":80,"location":"queens","faith":"baptist","interests":["gospel music","reading","cooking","church","gardening"],"languages":["english"],"culturalBackground":"american","values":["faith","family","community","gratitude"],"favoriteFood":["soul food","caribbean","american"],"helpWith":["technology help","rides","groceries","errands"],"talkPreferences":["phone","in-person"],"connectionGoals":["companionship","friendship","mentorship"],"familySituation":"widowed","availableDays":["monday","tuesday","thursday","saturday"]},
    {"userType":"senior","name":"Irving","age":82,"location":"manhattan","faith":"jewish","interests":["theater","chess","reading","history","writing"],"languages":["english","yiddish"],"culturalBackground":"eastern european","values":["education","intellectual curiosity","justice","community"],"favoriteFood":["jewish deli","mediterranean","american"],"helpWith":["technology help","rides","errands","groceries"],"talkPreferences":["in-person","phone"],"connectionGoals":["intellectual conversation","companionship","mentorship"],"familySituation":"widowed","availableDays":["sunday","tuesday","thursday","friday"]},
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
    {"userType":"companion","name":"Rachel","age":25,"location":"roswell","faith":"christian","interests":["reading","hiking","cooking","volunteering","yoga"],"languages":["english"],"culturalBackground":"american","values":["kindness","service","wellness","community"],"favoriteFood":["healthy","american","mediterranean"],"helpWith":["rides","groceries","errands","technology help","appointments"],"talkPreferences":["in-person","phone","video call"],"connectionGoals":["friendship","companionship","mentorship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","monday","wednesday"]},
    {"userType":"companion","name":"Kwame","age":29,"location":"decatur","faith":"baptist","interests":["music","cooking","walking","community","sports"],"languages":["english"],"culturalBackground":"american","values":["community","generosity","family","faith"],"favoriteFood":["soul food","southern","american","caribbean"],"helpWith":["rides","yard work","groceries","errands","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","thursday"]},
    {"userType":"companion","name":"Mei","age":23,"location":"sandy springs","faith":"none","interests":["cooking","reading","art","painting","technology"],"languages":["english","mandarin"],"culturalBackground":"chinese","values":["education","creativity","respect","family"],"favoriteFood":["asian","chinese","healthy","mediterranean"],"helpWith":["technology help","rides","errands","groceries","phone setup"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["friendship","companionship","cultural exchange","mentorship"],"familySituation":"student","availableDays":["saturday","sunday","friday","monday"]},
    {"userType":"companion","name":"Patrick","age":33,"location":"marietta","faith":"catholic","interests":["hiking","cooking","history","music","reading"],"languages":["english"],"culturalBackground":"irish","values":["loyalty","family","community","honesty"],"favoriteFood":["irish","american","bbq","italian"],"helpWith":["rides","yard work","errands","groceries","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders","activity partner"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","thursday"]},
    {"userType":"companion","name":"Fatima","age":27,"location":"dunwoody","faith":"muslim","interests":["reading","cooking","volunteering","art","walking"],"languages":["english","arabic"],"culturalBackground":"middle eastern","values":["faith","family","compassion","education","service"],"favoriteFood":["middle eastern","mediterranean","healthy","american"],"helpWith":["rides","groceries","errands","technology help","company"],"talkPreferences":["in-person","phone","video call"],"connectionGoals":["friendship","companionship","mentorship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","friday"]},
    {"userType":"companion","name":"Alex","age":26,"location":"kennesaw","faith":"christian","interests":["technology","walking","cooking","movies","gaming"],"languages":["english"],"culturalBackground":"american","values":["kindness","patience","community","honesty"],"favoriteFood":["american","asian","bbq"],"helpWith":["technology help","rides","phone setup","computer help","errands","groceries"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["friendship","companionship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","monday","thursday"]},
    {"userType":"companion","name":"Lucia","age":30,"location":"norcross","faith":"catholic","interests":["dancing","cooking","music","gardening","volunteering"],"languages":["spanish","english"],"culturalBackground":"colombian","values":["family","faith","joy","community","generosity"],"favoriteFood":["colombian","latin american","mexican","italian"],"helpWith":["rides","errands","groceries","cooking","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","cultural exchange","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","friday"]},
    {"userType":"companion","name":"Daniel","age":24,"location":"alpharetta","faith":"jewish","interests":["chess","reading","history","cooking","theater"],"languages":["english","hebrew"],"culturalBackground":"american","values":["education","community","family","intellectual curiosity"],"favoriteFood":["jewish deli","mediterranean","american"],"helpWith":["technology help","rides","errands","groceries","company"],"talkPreferences":["in-person","phone"],"connectionGoals":["mentorship","friendship","intellectual conversation","companionship"],"familySituation":"student","availableDays":["saturday","sunday","tuesday","friday"]},
    {"userType":"companion","name":"Jasmine","age":28,"location":"roswell","faith":"baptist","interests":["reading","music","volunteering","walking","baking"],"languages":["english"],"culturalBackground":"american","values":["faith","community","kindness","service"],"favoriteFood":["southern","soul food","american"],"helpWith":["rides","groceries","errands","companionship","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","mentorship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","friday"]},
    {"userType":"companion","name":"Oliver","age":31,"location":"sandy springs","faith":"methodist","interests":["walking","history","cooking","music","reading"],"languages":["english"],"culturalBackground":"american","values":["honesty","community","loyalty","family"],"favoriteFood":["american","southern","mediterranean"],"helpWith":["rides","yard work","groceries","errands","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","activity partner","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","monday","thursday"]},
    {"userType":"companion","name":"Yuna","age":25,"location":"dunwoody","faith":"christian","interests":["cooking","art","music","technology","gardening"],"languages":["english","korean"],"culturalBackground":"korean","values":["respect","family","hard work","kindness"],"favoriteFood":["korean","asian","american","healthy"],"helpWith":["technology help","rides","groceries","errands","phone setup"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["friendship","companionship","cultural exchange","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","monday","friday"]},
    {"userType":"companion","name":"Darius","age":32,"location":"kennesaw","faith":"baptist","interests":["sports","music","cooking","walking","community"],"languages":["english"],"culturalBackground":"american","values":["community","generosity","faith","loyalty"],"favoriteFood":["southern","bbq","soul food","american"],"helpWith":["rides","yard work","errands","groceries","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders","activity partner"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","thursday"]},
    {"userType":"companion","name":"Bianca","age":34,"location":"alpharetta","faith":"christian","interests":["gardening","cooking","volunteering","reading","crafts"],"languages":["english"],"culturalBackground":"american","values":["kindness","community","wellness","service"],"favoriteFood":["healthy","american","mediterranean","italian"],"helpWith":["rides","groceries","errands","yard work","companionship"],"talkPreferences":["in-person","phone","video call"],"connectionGoals":["friendship","companionship","mentorship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","friday"]},
    # --- Chicago area ---
    {"userType":"companion","name":"Destiny","age":24,"location":"chicago","faith":"baptist","interests":["gospel music","cooking","volunteering","reading","community"],"languages":["english"],"culturalBackground":"american","values":["faith","community","kindness","service"],"favoriteFood":["soul food","southern","american"],"helpWith":["rides","groceries","errands","technology help","companionship"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","mentorship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","friday"]},
    {"userType":"companion","name":"Tomasz","age":29,"location":"chicago","faith":"catholic","interests":["history","cooking","chess","walking","music"],"languages":["polish","english"],"culturalBackground":"eastern european","values":["family","loyalty","hard work","community"],"favoriteFood":["polish","eastern european","american"],"helpWith":["rides","yard work","errands","groceries","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders","cultural exchange"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","thursday"]},
    {"userType":"companion","name":"Rebecca","age":26,"location":"evanston","faith":"jewish","interests":["reading","theater","cooking","volunteering","art"],"languages":["english","hebrew"],"culturalBackground":"american","values":["education","justice","community","creativity"],"favoriteFood":["jewish deli","mediterranean","healthy"],"helpWith":["rides","technology help","errands","groceries","companionship"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["mentorship","friendship","intellectual conversation","companionship"],"familySituation":"student","availableDays":["saturday","sunday","monday","friday"]},
    {"userType":"companion","name":"Andre","age":31,"location":"oak park","faith":"methodist","interests":["music","cooking","history","walking","community"],"languages":["english"],"culturalBackground":"american","values":["community","honesty","generosity","service"],"favoriteFood":["soul food","american","mediterranean"],"helpWith":["rides","yard work","groceries","errands","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders","activity partner"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","thursday"]},
    # --- Miami area ---
    {"userType":"companion","name":"Isabella","age":23,"location":"miami","faith":"catholic","interests":["dancing","cooking","music","volunteering","art"],"languages":["spanish","english"],"culturalBackground":"cuban","values":["family","faith","joy","kindness"],"favoriteFood":["cuban","latin american","seafood"],"helpWith":["rides","groceries","errands","technology help","companionship"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","cultural exchange","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","friday","wednesday"]},
    {"userType":"companion","name":"Mickael","age":28,"location":"miami","faith":"christian","interests":["music","cooking","community","sports","volunteering"],"languages":["haitian creole","french","english"],"culturalBackground":"haitian","values":["faith","family","resilience","community"],"favoriteFood":["haitian","caribbean","american"],"helpWith":["rides","errands","groceries","yard work","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","cultural exchange","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","thursday"]},
    {"userType":"companion","name":"Valentina","age":30,"location":"coral gables","faith":"catholic","interests":["painting","cooking","reading","volunteering","yoga"],"languages":["spanish","english"],"culturalBackground":"cuban","values":["creativity","family","faith","wellness"],"favoriteFood":["cuban","mediterranean","healthy"],"helpWith":["rides","technology help","errands","groceries","companionship"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["friendship","companionship","mentorship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","monday","friday"]},
    # --- Dallas area ---
    {"userType":"companion","name":"Marisol","age":25,"location":"dallas","faith":"catholic","interests":["cooking","music","volunteering","gardening","church"],"languages":["spanish","english"],"culturalBackground":"mexican","values":["family","faith","generosity","kindness"],"favoriteFood":["mexican","tex-mex","latin american"],"helpWith":["rides","groceries","errands","technology help","companionship"],"talkPreferences":["phone","in-person"],"connectionGoals":["friendship","companionship","mentorship","cultural exchange"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","friday"]},
    {"userType":"companion","name":"Brandon","age":33,"location":"dallas","faith":"methodist","interests":["golf","cooking","history","sports","walking"],"languages":["english"],"culturalBackground":"american","values":["honesty","loyalty","community","service"],"favoriteFood":["bbq","tex-mex","american","southern"],"helpWith":["yard work","rides","errands","groceries","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["activity partner","friendship","companionship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","thursday"]},
    {"userType":"companion","name":"Linh","age":27,"location":"plano","faith":"buddhist","interests":["cooking","reading","art","technology","yoga"],"languages":["vietnamese","english"],"culturalBackground":"vietnamese","values":["family","respect","education","wellness"],"favoriteFood":["vietnamese","asian","healthy"],"helpWith":["technology help","rides","errands","groceries","phone setup"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["friendship","companionship","cultural exchange","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","monday","friday"]},
    # --- Houston area ---
    {"userType":"companion","name":"Anh","age":24,"location":"houston","faith":"buddhist","interests":["cooking","gardening","reading","volunteering","art"],"languages":["vietnamese","english"],"culturalBackground":"vietnamese","values":["family","respect","hard work","compassion"],"favoriteFood":["vietnamese","asian","healthy"],"helpWith":["rides","groceries","errands","technology help","companionship"],"talkPreferences":["in-person","phone","video call"],"connectionGoals":["friendship","companionship","cultural exchange","mentorship"],"familySituation":"student","availableDays":["saturday","sunday","monday","wednesday"]},
    {"userType":"companion","name":"Arjun","age":29,"location":"houston","faith":"hindu","interests":["cooking","yoga","technology","reading","community"],"languages":["hindi","english"],"culturalBackground":"south asian","values":["family","education","spirituality","respect"],"favoriteFood":["indian","asian","vegetarian","healthy"],"helpWith":["technology help","rides","errands","groceries","phone setup"],"talkPreferences":["in-person","video call","phone"],"connectionGoals":["friendship","companionship","cultural exchange","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","thursday"]},
    {"userType":"companion","name":"Keisha","age":31,"location":"houston","faith":"baptist","interests":["music","cooking","volunteering","reading","community"],"languages":["english"],"culturalBackground":"american","values":["faith","community","generosity","kindness"],"favoriteFood":["soul food","southern","american","caribbean"],"helpWith":["rides","groceries","errands","technology help","companionship"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","mentorship","learning from elders"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","friday"]},
    # --- New York area ---
    {"userType":"companion","name":"Gabriela","age":26,"location":"brooklyn","faith":"catholic","interests":["dancing","cooking","music","volunteering","art"],"languages":["spanish","english"],"culturalBackground":"puerto rican","values":["family","faith","joy","community"],"favoriteFood":["puerto rican","latin american","caribbean"],"helpWith":["rides","groceries","errands","technology help","companionship"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","cultural exchange","mentorship"],"familySituation":"single","availableDays":["saturday","sunday","wednesday","friday"]},
    {"userType":"companion","name":"Marco","age":28,"location":"brooklyn","faith":"catholic","interests":["cooking","history","music","walking","sports"],"languages":["italian","english"],"culturalBackground":"italian","values":["family","loyalty","community","generosity"],"favoriteFood":["italian","mediterranean","american"],"helpWith":["rides","yard work","groceries","errands","technology help"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","learning from elders","activity partner"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","thursday"]},
    {"userType":"companion","name":"Zoe","age":23,"location":"queens","faith":"baptist","interests":["music","reading","cooking","volunteering","community"],"languages":["english"],"culturalBackground":"american","values":["faith","community","kindness","service"],"favoriteFood":["soul food","caribbean","american"],"helpWith":["rides","groceries","errands","technology help","companionship"],"talkPreferences":["in-person","phone"],"connectionGoals":["friendship","companionship","mentorship","learning from elders"],"familySituation":"student","availableDays":["saturday","sunday","monday","friday"]},
    {"userType":"companion","name":"Noah","age":32,"location":"manhattan","faith":"jewish","interests":["theater","reading","chess","history","cooking"],"languages":["english","hebrew"],"culturalBackground":"american","values":["education","intellectual curiosity","community","justice"],"favoriteFood":["jewish deli","mediterranean","american"],"helpWith":["technology help","rides","errands","groceries","companionship"],"talkPreferences":["in-person","phone","video call"],"connectionGoals":["mentorship","intellectual conversation","friendship","companionship"],"familySituation":"single","availableDays":["saturday","sunday","tuesday","friday"]},
]

SEED_CANDIDATES = SENIOR_PROFILES + COMPANION_PROFILES

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------
def init_db():
    conn = get_db_connection()
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
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT profile FROM candidates")
    rows = c.fetchall()
    conn.close()
    return [json.loads(row[0]) for row in rows]

def get_candidates_by_type(user_type):
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
    frozenset({"atlanta", "kennesaw"}),
    frozenset({"atlanta", "sandy springs"}),
    frozenset({"atlanta", "roswell"}),
    frozenset({"atlanta", "alpharetta"}),
    frozenset({"atlanta", "dunwoody"}),
    frozenset({"atlanta", "stone mountain"}),
    frozenset({"marietta", "smyrna"}),
    frozenset({"marietta", "kennesaw"}),
    frozenset({"marietta", "roswell"}),
    frozenset({"marietta", "alpharetta"}),
    frozenset({"decatur", "norcross"}),
    frozenset({"decatur", "stone mountain"}),
    frozenset({"smyrna", "kennesaw"}),
    frozenset({"norcross", "roswell"}),
    frozenset({"norcross", "sandy springs"}),
    frozenset({"norcross", "alpharetta"}),
    frozenset({"roswell", "alpharetta"}),
    frozenset({"roswell", "sandy springs"}),
    frozenset({"sandy springs", "dunwoody"}),
    frozenset({"dunwoody", "alpharetta"}),
    frozenset({"phoenix", "tempe"}),
    frozenset({"phoenix", "scottsdale"}),
    frozenset({"phoenix", "mesa"}),
    frozenset({"phoenix", "chandler"}),
    frozenset({"tempe", "scottsdale"}),
    frozenset({"tempe", "mesa"}),
    frozenset({"scottsdale", "mesa"}),
    frozenset({"chicago", "evanston"}),
    frozenset({"chicago", "oak park"}),
    frozenset({"chicago", "naperville"}),
    frozenset({"dallas", "fort worth"}),
    frozenset({"dallas", "plano"}),
    frozenset({"dallas", "irving"}),
    frozenset({"houston", "sugar land"}),
    frozenset({"houston", "pasadena"}),
    frozenset({"miami", "miami beach"}),
    frozenset({"miami", "coral gables"}),
    frozenset({"miami", "hialeah"}),
    frozenset({"brooklyn", "queens"}),
    frozenset({"brooklyn", "manhattan"}),
    frozenset({"queens", "manhattan"}),
    frozenset({"bronx", "manhattan"}),
    frozenset({"bronx", "queens"}),
}

CHRISTIAN_TRADITIONS = {
    "christian", "baptist", "methodist", "catholic", "evangelical",
    "protestant", "pentecostal", "lutheran", "presbyterian", "episcopal",
}

_STOPWORDS = {
    'that','this','with','have','from','they','will','been','were','when',
    'what','also','just','some','time','very','really','about','know',
    'people','like','myself','their','there','would','could','should',
    'things','other','each','every','always','never','maybe','want',
    'love','enjoy','someone','something','anything','need','look','make',
    'take','give','think','feel','find','tell','good','great','nice',
    'little','older','young','years','year','them','those','these',
}

_HOBBY_KW = {
    # cooking & food
    'cook','cooking','baking','bake','baked','kitchen','recipes','recipe',
    'grilling','grill','barbecue','bbq','chef',
    # reading & learning
    'read','reading','books','book','library','studying','study','learning',
    'writing','write','writer','journaling','journal','poetry','poems',
    # outdoors & nature
    'gardening','garden','gardener','plants','planting','hiking','hike','hiker',
    'walking','walk','walks','nature','outdoors','camping','camp','fishing','fish',
    'hunting','hunt','birdwatching','birds',
    # music & arts
    'music','singing','sing','singer','guitar','piano','drums','violin',
    'dancing','dance','dancer','painting','paint','painter','drawing','draw',
    'crafting','craft','crafts','knitting','knit','sewing','sew','quilting','quilt',
    'photography','photos','sculpting','pottery','ceramics','theater','acting',
    # sports & fitness
    'golf','chess','yoga','swimming','swim','running','run','cycling','cycle',
    'tennis','pickleball','bowling','basketball','baseball','football','soccer',
    'sports','sport','exercise','exercising','workout','gym','fitness','pilates',
    # faith & community
    'church','prayer','pray','praying','volunteering','volunteer','volunteered',
    'community','serving','ministry','bible','worship','mosque','synagogue','temple',
    # entertainment & hobbies
    'movies','movie','films','film','television','watching','gaming','games','game',
    'puzzles','puzzle','crossword','sudoku','cards','dominoes','bingo','chess',
    'travel','traveling','trips','trip','exploring','explore','cooking','arts',
    # social
    'socializing','socialize','dining','restaurants','coffee','cafes',
    'conversation','talking','chatting',
}

_VALUE_KW = {
    'family','faith','honesty','honest','kindness','kind','respect','respectful',
    'community','loyal','loyalty','patient','patience','compassion','compassionate',
    'generous','generosity','education','creativity','creative','wellness',
    'integrity','service','spiritual','spirituality','friendship','friend',
    'gratitude','grateful','love','loving','joyful','joy','trust','trustworthy',
    'caring','care','humble','humility','empathy','empathetic','dedicated',
    'supportive','support','giving','helping','helping','sharing','responsibility',
    'responsible','hardworking','hardwork','discipline','disciplined','fairness',
    'justice','equality','moral','morals','ethical','values','religious',
    'devout','devoted','commitment','committed','sincere','authentic',
}

_HELP_KW = {
    'ride','rides','driving','drive','driver','transport','transportation',
    'groceries','grocery','shopping','shop','errands','errand','cooking','cook',
    'cleaning','clean','laundry','yard','yardwork','technology','tech',
    'computer','phone','tablet','ipad','iphone','android','setup','internet',
    'appointments','appointment','doctor','hospital','clinic','pharmacy',
    'medication','medications','prescriptions','prescription','exercise',
    'company','conversation','companionship','talking','assistance','assist',
    'helping','help','lifting','moving','repairs','repair','handyman',
    'delivery','mail','bills','paperwork','reading','translation',
}

_GOAL_KW = {
    'companionship','companion','friendship','friend','friends','conversation',
    'talk','talking','activity','activities','mentor','mentorship','mentoring',
    'learning','learn','social','connection','connect','support','community',
    'share','sharing','bond','bonding','meeting','meet','relationship',
    'together','company','hanging','hangout','visits','visit','outings','outing',
    'adventures','adventure','exploring','explore','helping','help','giving',
    'purpose','meaningful','meaningful','exchange','cultural','wisdom',
    'stories','storytelling','teaching','teach','guidance','inspire','inspired',
}

_KNOWN_CITIES = [
    'atlanta','marietta','decatur','smyrna','norcross','phoenix','tempe',
    'scottsdale','mesa','chandler','chicago','evanston','oak park','naperville',
    'dallas','plano','fort worth','irving','houston','sugar land','pasadena',
    'boston','denver','seattle','portland','miami','coral gables','hialeah',
    'orlando','brooklyn','queens','manhattan','bronx','jersey','austin',
    'nashville','memphis','charlotte','raleigh','kennesaw','sandy springs',
    'roswell','alpharetta','dunwoody','stone mountain',
]

_FAITH_MAP = {
    'christian':  {'christian','christianity','jesus','christ','lord','savior','gospel','grace'},
    'catholic':   {'catholic','mass','rosary','vatican','pope','parish','saint','saints'},
    'baptist':    {'baptist','congregation','revival','baptized','baptism'},
    'methodist':  {'methodist','wesleyan'},
    'jewish':     {'jewish','synagogue','torah','shabbat','hebrew','rabbi','passover','hanukkah','jewish'},
    'muslim':     {'muslim','islam','islamic','mosque','quran','allah','prayer','ramadan','halal'},
    'buddhist':   {'buddhist','buddhism','meditation','mindfulness','dharma','zen','monk'},
    'hindu':      {'hindu','hinduism','temple','diwali','karma','mandir','vedic'},
    'pentecostal':{'pentecostal','charismatic','holy spirit','spirit filled'},
    'presbyterian':{'presbyterian'},
    'lutheran':   {'lutheran'},
    'episcopal':  {'episcopal','episcopal','anglica'},
}

_CULTURE_MAP = {
    'mexican':          ['mexican','mexico','hispanic','latina','latino','chicano','aztec'],
    'colombian':        ['colombian','colombia'],
    'cuban':            ['cuban','cuba'],
    'puerto rican':     ['puerto rican','puerto rico','boricua'],
    'haitian':          ['haitian','haiti','creole'],
    'vietnamese':       ['vietnamese','vietnam','viet'],
    'chinese':          ['chinese','china','cantonese','mandarin','taiwanese'],
    'korean':           ['korean','korea'],
    'south asian':      ['indian','south asian','desi','hindi','bengali','pakistani','sri lankan'],
    'italian':          ['italian','italy','sicilian'],
    'eastern european': ['polish','russian','ukrainian','jewish','czech','hungarian','romanian'],
    'american':         ['american'],
    'caribbean':        ['caribbean','jamaican','trinidad','barbadian','bahamian'],
    'middle eastern':   ['arabic','arab','lebanese','syrian','egyptian','persian','iranian'],
    'african':          ['nigerian','ghanaian','ethiopian','kenyan','african'],
}

# ---------------------------------------------------------------------------
# Phrase-level normalization — maps casual speech to canonical keywords
# Applied BEFORE keyword extraction to expand coverage
# ---------------------------------------------------------------------------
_PHRASE_MAP = [
    # hobbies / activities
    (r'spend time in the kitchen',      'cooking'),
    (r'love to cook|loves? cooking',    'cooking'),
    (r'in the garden|love plants',      'gardening'),
    (r'love to read|avid reader',       'reading'),
    (r'go for walks?|take walks?',      'walking'),
    (r'play chess',                     'chess'),
    (r'play golf',                      'golf'),
    (r'go fishing',                     'fishing'),
    (r'work out|hit the gym',           'exercise'),
    (r'watch movies?|watching films?',  'movies'),
    (r'play cards?',                    'cards'),
    (r'board games?',                   'gaming'),
    # values
    (r'helping others|help others',     'service volunteering'),
    (r'giving back',                    'generosity service'),
    (r'hard work|work hard',            'hardwork'),
    (r'close.?knit family|family first','family'),
    (r'my faith|my religion',           'faith spiritual'),
    (r'care about people',              'caring compassion'),
    # help needs
    (r"can.?t drive|don.?t drive|no longer drive|stopped driving", 'rides transportation'),
    (r'getting around|get around',      'rides transportation'),
    (r'need a ride|need rides',         'rides'),
    (r'trouble with technology|bad with tech', 'technology'),
    (r'help with my phone',             'technology phone'),
    (r'pick up groceries|grocery run',  'groceries'),
    (r'doctor.?s? appointments?',       'appointments'),
    (r'live alone|living alone|by myself|on my own', 'company companionship'),
    # goals
    (r'make friends?|new friends?',     'friendship'),
    (r'not be lonely|less lonely|loneliness', 'companionship'),
    (r'hang out|hangout|chill',         'hangout companionship'),
    (r'someone to talk to',             'conversation companionship'),
    (r'share stories|tell stories',     'storytelling sharing'),
    (r'learn from',                     'learning mentorship'),
    (r'pass on wisdom|share wisdom',    'mentorship wisdom'),
    # family situation
    (r'lost my (wife|husband|spouse)',  'widowed'),
    (r'my (wife|husband) passed',       'widowed'),
    (r'never married',                  'single'),
    (r'live with my (kids?|children|son|daughter|family)', 'lives with family'),
]

def _apply_phrases(text: str) -> str:
    """Expand casual phrases into canonical keywords before extraction."""
    t = text.lower()
    for pattern, replacement in _PHRASE_MAP:
        t = re.sub(pattern, ' ' + replacement + ' ', t)
    return t

def _stem(word: str) -> str:
    """Very lightweight suffix stripping to normalize verb forms."""
    for suffix in ('ing','tion','ed','er','es','ly'):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[:-len(suffix)]
    return word

def _kw_extract(text, min_len=4):
    if not text:
        return []
    text = _apply_phrases(text)
    tokens = re.findall(r'[a-z]{' + str(min_len) + r',}', text.lower())
    results = []
    for t in tokens:
        if t not in _STOPWORDS:
            results.append(t)
            stemmed = _stem(t)
            if stemmed != t and stemmed not in _STOPWORDS:
                results.append(stemmed)
    return results

def preprocess_profile(p):
    p = dict(p)

    if not p.get('location') and p.get('locationText'):
        loc = p['locationText'].lower()
        for city in _KNOWN_CITIES:
            if city in loc:
                p['location'] = city
                break
        if not p.get('location'):
            first_word = re.split(r'\W+', loc.strip())[0]
            p['location'] = first_word or 'unknown'

    if not p.get('interests') and p.get('hobbiesText'):
        tokens = set(_kw_extract(p['hobbiesText']))
        matched = list(tokens & _HOBBY_KW)
        p['interests'] = matched if matched else _kw_extract(p['hobbiesText'], 5)[:6]

    if not p.get('values') and p.get('valuesText'):
        tokens = set(_kw_extract(p['valuesText']))
        matched = list(tokens & _VALUE_KW)
        p['values'] = matched if matched else _kw_extract(p['valuesText'], 5)[:5]

    if not p.get('helpWith') and p.get('gettingHelpText'):
        tokens = set(_kw_extract(p['gettingHelpText']))
        matched = list(tokens & _HELP_KW)
        p['helpWith'] = matched if matched else _kw_extract(p['gettingHelpText'], 5)[:4]

    if not p.get('connectionGoals') and p.get('meetingText'):
        tokens = set(_kw_extract(p['meetingText']))
        matched = list(tokens & _GOAL_KW)
        p['connectionGoals'] = matched if matched else ['companionship', 'friendship']

    if not p.get('talkPreferences'):
        p['talkPreferences'] = ['in-person', 'phone']

    if not p.get('faith'):
        combined = ' '.join([
            p.get('bio', ''), p.get('valuesText', ''),
            p.get('gettingHelpText', ''), p.get('meetingText', ''),
        ]).lower()
        for faith, keywords in _FAITH_MAP.items():
            if any(kw in combined for kw in keywords):
                p['faith'] = faith
                break

    if not p.get('culturalBackground'):
        combined = ' '.join([p.get('bio', ''), p.get('locationText', '')]).lower()
        for culture, hints in _CULTURE_MAP.items():
            if any(h in combined for h in hints):
                p['culturalBackground'] = culture
                break

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
    older = max(senior.get("age", 70), companion.get("age", 30))
    younger = min(senior.get("age", 70), companion.get("age", 30))
    gap = older - younger
    return 1 if 15 <= gap <= 50 else 0

def derive_ml_features(senior, companion):
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
    same_mobility = _age_gap_appropriate(senior, companion)

    i1 = _set(senior, "interests")
    i2 = _set(companion, "interests")
    interest_overlap = len(i1 & i2)
    hobby_overlap = int(interest_overlap > 0)

    ts = _tech_score(senior)
    tc = _tech_score(companion)
    tech_compatibility = int(tc - ts >= 2)
    tech_affinity_gap = int(tc - ts >= 1)

    prefs_s = _set(senior, "talkPreferences")
    prefs_c = _set(companion, "talkPreferences")
    comm_style_compatibility = int(bool(prefs_s & prefs_c))
    pref_comm_style_match = comm_style_compatibility

    sit_c = _str(companion, "familySituation")
    sit_s = _str(senior, "familySituation")
    companion_open = int("single" in sit_c or "student" in sit_c)
    senior_open = int("widow" in sit_s or "alone" in sit_s or "divorced" in sit_s)
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

    senior_goals = _set(senior, "connectionGoals")
    companion_goals = _set(companion, "connectionGoals")
    senior_wants = int(bool({"companionship", "friendship"} & senior_goals))
    companion_offers = int(bool(
        {"companionship", "friendship", "mentorship", "learning from elders"} & companion_goals
    ))
    life_stage_needs_alignment = int(senior_wants and companion_offers)
    companionship_gap_overlap = int(
        bool(senior_goals & companion_goals) and senior_wants and companion_offers
    )

    senior_needs = _set(senior, "helpWith")
    companion_can = _set(companion, "helpWith")
    volunteering_help_match = int(bool(senior_needs & companion_can))

    combined_s = i1 | v1
    combined_c = i2 | v2
    shared_memory_trigger_overlap = int(bool(combined_s & combined_c))

    return {
        "age_diff": age_diff,
        "same_city": same_city,
        "same_religion": same_religion,
        "same_mobility": same_mobility,
        "interest_overlap": interest_overlap,
        "tech_compatibility": tech_compatibility,
        "comm_style_compatibility": comm_style_compatibility,
        "comfort_compatibility": comfort_compatibility,
        "food_cuisine_overlap": food_cuisine_overlap,
        "dietary_restriction_conflict": dietary_restriction_conflict,
        "cultural_background_match": cultural_background_match,
        "holiday_overlap": holiday_overlap,
        "multilingual_fluency_match": multilingual_fluency_match,
        "hobby_overlap": hobby_overlap,
        "spirituality_match": spirituality_match,
        "life_stage_needs_alignment": life_stage_needs_alignment,
        "pref_comm_style_match": pref_comm_style_match,
        "tech_affinity_gap": tech_affinity_gap,
        "companionship_gap_overlap": companionship_gap_overlap,
        "volunteering_help_match": volunteering_help_match,
        "shared_memory_trigger_overlap": shared_memory_trigger_overlap,
    }

def compute_ml_score(senior, companion):
    features = derive_ml_features(senior, companion)
    vec = pd.DataFrame([[features[f] for f in ML_FEATURES]], columns=ML_FEATURES)
    scaled = ML_SCALER.transform(vec)
    prob = ML_MODEL.predict_proba(scaled)[0][1]
    return round(prob * 100, 1)

def compute_rule_score(senior, companion):
    f = derive_ml_features(senior, companion)
    score = 0.0

    if f["same_city"]:
        score += 15

    age_gap = f["age_diff"]
    if 15 <= age_gap <= 55:
        score += max(0.0, 15.0 - abs(age_gap - 38) * 0.35)

    score += min(f["interest_overlap"] * 8, 16)

    if f["volunteering_help_match"]:
        score += 13

    if f["life_stage_needs_alignment"]:
        score += 10

    if f["comm_style_compatibility"]:
        score += 6

    if f["companionship_gap_overlap"]:
        score += 5

    if f["same_religion"]:
        score += 6
    elif f["holiday_overlap"]:
        score += 3

    if f["cultural_background_match"]:
        score += 4

    if f["tech_compatibility"]:
        score += 3

    if f["shared_memory_trigger_overlap"]:
        score += 3

    return round(min(max(score, 40.0), 92.0), 1)

def compute_match_score(senior, companion):
    rule = compute_rule_score(senior, companion)
    if ML_MODEL and ML_SCALER:
        ml = compute_ml_score(senior, companion)
        blended = rule * 0.70 + ml * 0.30
        return round(min(blended, 96.0), 1)
    return rule

def build_feature_breakdown(senior, companion):
    f = derive_ml_features(senior, companion)
    return {
        "age_diff": f["age_diff"],
        "same_city": f["same_city"],
        "interest_overlap": f["interest_overlap"],
        "can_help_with_needs": f["volunteering_help_match"],
        "goals_align": f["companionship_gap_overlap"],
        "tech_compatible": f["tech_compatibility"],
        "shared_faith": f["same_religion"],
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

        target_user = preprocess_profile(target_user)
        print(f"[match] preprocessed profile: interests={target_user.get('interests')}, "
              f"values={target_user.get('values')}, helpWith={target_user.get('helpWith')}, "
              f"location={target_user.get('location')}, faith={target_user.get('faith')}")

        user_type = target_user.get("userType", "")

        if user_type in ("senior", "companion"):
            candidates = get_candidates_by_type(user_type)
        else:
            candidates = data.get("candidates") or get_all_candidates()

        matches = []
        for candidate in candidates:
            if candidate.get("name") == target_user.get("name"):
                continue

            if user_type == "senior":
                senior, companion = target_user, candidate
            elif user_type == "companion":
                senior, companion = candidate, target_user
            else:
                senior, companion = target_user, candidate

            score = compute_match_score(senior, companion)
            features = build_feature_breakdown(senior, companion)
            matches.append({"candidate": candidate, "score": score, "features": features})

        matches.sort(key=lambda x: x["score"], reverse=True)

        city_count = {}
        diverse = []
        remainder = []

        for m in matches:
            city = (m["candidate"].get("location") or "").lower().strip()
            if city_count.get(city, 0) < 2:
                diverse.append(m)
                city_count[city] = city_count.get(city, 0) + 1
            else:
                remainder.append(m)
            if len(diverse) >= 10:
                break

        for m in remainder:
            if len(diverse) >= 10:
                break
            diverse.append(m)

        return jsonify({
            "matches": diverse[:10],
            "total_candidates": len(candidates),
            "scoring_method": "ml_model" if (ML_MODEL and ML_SCALER) else "rule_based",
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/users", methods=["GET"])
def list_users():
    try:
        conn = get_db_connection()
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

        conn = get_db_connection()
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

@app.route("/api/users/<path:email>", methods=["PUT"])
def update_user(email):
    try:
        updates = request.json or {}
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT id, profile FROM candidates")
        rows = c.fetchall()

        target_id = None
        for row_id, profile_json in rows:
            try:
                p = json.loads(profile_json)
                if p.get("email", "").lower() == email.lower():
                    target_id = row_id
                    p.update(updates)
                    c.execute(
                        "UPDATE candidates SET name=?, profile=? WHERE id=?",
                        (p.get("name", "Unknown"), json.dumps(p), row_id)
                    )
                    break
            except Exception:
                continue

        conn.commit()
        conn.close()

        if target_id:
            return jsonify({"status": "updated", "id": target_id}), 200
        return jsonify({"status": "not_found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

#transcribe route
@app.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    tmp_path = None
    saved_audio_path = None

    try:
        print("[transcribe] content-type:", request.content_type)
        print("[transcribe] files keys:", list(request.files.keys()))
        print("[transcribe] json present:", request.is_json)

        # Preferred path: multipart/form-data file upload
        if "audio" in request.files:
            audio_file = request.files["audio"]
            original_name = secure_filename(audio_file.filename or "recording.m4a")
            ext = os.path.splitext(original_name)[1].lower() or ".m4a"

            timestamp = int(time.time() * 1000)
            final_name = f"{timestamp}_{original_name}"
            saved_audio_path = os.path.join(AUDIO_UPLOAD_DIR, final_name)

            audio_file.save(saved_audio_path)

            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp_path = tmp.name

            with open(saved_audio_path, "rb") as src, open(tmp_path, "wb") as dst:
                dst.write(src.read())

        # Backward-compatible fallback: JSON base64
        else:
            data = request.get_json(silent=True)
            if not data or "audio" not in data:
                return jsonify({"error": "No audio data provided"}), 400

            audio_b64 = data["audio"]
            fmt = data.get("format", "m4a")
            audio_bytes = base64.b64decode(audio_b64)

            timestamp = int(time.time() * 1000)
            final_name = f"{timestamp}_recording.{fmt}"
            saved_audio_path = os.path.join(AUDIO_UPLOAD_DIR, final_name)

            with open(saved_audio_path, "wb") as f:
                f.write(audio_bytes)

            with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as tmp:
                tmp_path = tmp.name
                tmp.write(audio_bytes)

        print(f"[transcribe] saved audio: {saved_audio_path}")
        print(f"[transcribe] transcribing with Groq Whisper...")

        text = transcribe_with_groq(tmp_path).strip()

        return jsonify({
            "text": text,
            "saved_audio_path": saved_audio_path
        }), 200

    except Exception as e:
        print(f"[transcribe] error: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

# ---------------------------------------------------------------------------
# Startup — init_db() runs on import so Gunicorn workers also initialize it
# ---------------------------------------------------------------------------
init_db()

if __name__ == "__main__":
    init_db()
    print("\n" + "=" * 55)
    print("Community Connection Backend")
    print("=" * 55)
    print(f"  Scoring: {'ML Neural Network' if ML_MODEL else 'Rule-based (fallback)'}")
    print("  GET  /health                  - Health check")
    print("  GET  /api/candidates          - List all profiles")
    print("  GET  /api/users               - List all users")
    print("  POST /api/match               - Find top matches")
    print("  POST /api/users               - Add new user")
    print("  PUT  /api/users/<email>       - Update user profile")
    print("  POST /api/transcribe          - Transcribe audio (Whisper)")
    print("=" * 55 + "\n")

    port = int(os.environ.get("PORT", 5000))

    try:
        from waitress import serve
        print(f"Starting production server on port {port} (Waitress)...")
        serve(app, host="0.0.0.0", port=port, threads=8)
    except ImportError:
        print("Waitress not found, falling back to Flask dev server...")
        app.run(host="0.0.0.0", debug=False, port=port, threaded=True, use_reloader=False)
