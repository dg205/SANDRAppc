from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import psycopg2.extras
import requests as req
import json
import time
import os
import pickle
import re
import tempfile
import base64
import threading
from contextlib import contextmanager
from functools import wraps
import jwt
from jwt import PyJWKClient
import numpy as np
import pandas as pd
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from profile_extract import fill_missing_fields

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


MODEL_PATH = os.path.join(os.path.dirname(__file__), "trained_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "scaler.pkl")
AUDIO_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "AudioRecordings")
os.makedirs(AUDIO_UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# PostgreSQL connection (Supabase)
# ---------------------------------------------------------------------------
def get_db_connection():
    database_url = os.environ.get("DATABASE_URL", "")
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        conn = psycopg2.connect(database_url)
    else:
        conn = psycopg2.connect(
            host=os.environ.get("DB_HOST"),
            port=int(os.environ.get("DB_PORT", 5432)),
            dbname=os.environ.get("DB_NAME", "postgres"),
            user=os.environ.get("DB_USER", "postgres"),
            password=os.environ.get("DB_PASSWORD"),
            sslmode="require"
        )
    return conn

@contextmanager
def db_cursor():
    """Yield (conn, cursor) and guarantee the connection is closed, even on error.

    Without this, an exception raised between connect and close leaks the
    connection. That was cheap under SQLite but each connection here is a
    real network connection to Supabase Postgres against a small connection
    limit, so leaks can exhaust it and take the whole backend down.
    """
    conn = get_db_connection()
    try:
        yield conn, conn.cursor()
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# Supabase Storage upload
# ---------------------------------------------------------------------------
PHOTO_BUCKET = "profile-photos"
AUDIO_BUCKET = "survey-audio"

def _storage_config():
    """(supabase_url, service_key), or None if storage isn't configured."""
    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not supabase_url or not service_key:
        print("[storage] SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
        return None
    return supabase_url, service_key

def upload_bytes_to_storage(bucket, object_path, data, content_type):
    """Upload to a public bucket and return the object's public URL, or None."""
    config = _storage_config()
    if not config:
        return None
    supabase_url, service_key = config

    response = req.post(
        f"{supabase_url}/storage/v1/object/{bucket}/{object_path}",
        headers={"Authorization": f"Bearer {service_key}", "Content-Type": content_type},
        data=data,
    )
    if response.status_code in (200, 201):
        public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{object_path}"
        print(f"[storage] uploaded to Supabase: {public_url}")
        return public_url
    print(f"[storage] upload failed: {response.status_code} {response.text}")
    return None

def storage_path_from_url(bucket, public_url):
    """Turn a public object URL back into its path inside the bucket."""
    marker = f"/storage/v1/object/public/{bucket}/"
    if not public_url or marker not in public_url:
        return None
    return public_url.split(marker, 1)[1]

def delete_from_storage(bucket, object_paths):
    """Best-effort delete; a leftover file shouldn't fail the caller."""
    object_paths = [p for p in object_paths if p]
    config = _storage_config()
    if not config or not object_paths:
        return
    supabase_url, service_key = config
    try:
        response = req.delete(
            f"{supabase_url}/storage/v1/object/{bucket}",
            headers={"Authorization": f"Bearer {service_key}"},
            json={"prefixes": object_paths},
        )
        if response.status_code not in (200, 204):
            print(f"[storage] delete failed: {response.status_code} {response.text}")
    except Exception as e:
        print(f"[storage] delete failed: {e}")

def ensure_public_bucket(bucket):
    """Create a public storage bucket if it doesn't exist yet."""
    config = _storage_config()
    if not config:
        return
    supabase_url, service_key = config
    try:
        headers = {"Authorization": f"Bearer {service_key}"}
        if req.get(f"{supabase_url}/storage/v1/bucket/{bucket}", headers=headers).status_code == 200:
            return
        response = req.post(
            f"{supabase_url}/storage/v1/bucket",
            headers=headers,
            json={"id": bucket, "name": bucket, "public": True},
        )
        print(f"[storage] create bucket {bucket}: {response.status_code}")
    except Exception as e:
        print(f"[storage] bucket check failed: {e}")

def upload_to_supabase_storage(file_path, file_name):
    ext = os.path.splitext(file_name)[1].lower()
    content_type_map = {
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
    }
    content_type = content_type_map.get(ext, "audio/octet-stream")

    with open(file_path, "rb") as f:
        return upload_bytes_to_storage(AUDIO_BUCKET, file_name, f, content_type)


# ---------------------------------------------------------------------------
# Supabase Auth (JWT verification)
# ---------------------------------------------------------------------------
# This project's JWT Settings use the newer asymmetric signing keys (ECC
# P-256 / ES256), verified via the project's JWKS endpoint - not the legacy
# shared-secret HS256 path. SUPABASE_JWT_SECRET is kept as an opt-in override
# (unset here) in case the project ever rotates back to a shared secret.
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
_jwks_client = PyJWKClient(f"{os.environ.get('SUPABASE_URL', '')}/auth/v1/.well-known/jwks.json") \
    if not SUPABASE_JWT_SECRET and os.environ.get("SUPABASE_URL") else None

def verify_supabase_jwt(token):
    if SUPABASE_JWT_SECRET:
        return jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
    if _jwks_client is None:
        raise RuntimeError("No SUPABASE_JWT_SECRET or SUPABASE_URL configured")
    key = _jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(token, key.key, algorithms=["ES256"], audience="authenticated")

def require_auth(f):
    """Verify the caller's Supabase access token and pass (user_id, email) as
    the first two arguments to the wrapped route, ahead of any URL params."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        try:
            claims = verify_supabase_jwt(auth_header[7:])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({"error": f"Invalid token: {e}"}), 401
        user_id, email = claims.get("sub"), (claims.get("email") or "").lower()
        if not user_id or not email:
            return jsonify({"error": "Token missing required claims"}), 401
        return f(user_id, email, *args, **kwargs)
    return wrapper

def optional_auth_user_id():
    """The caller's user id if they sent a valid token, else None. For routes
    that stay open but behave better for a signed-in caller."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        return verify_supabase_jwt(auth_header[7:]).get("sub")
    except Exception:
        return None

# People are identified by their candidates.id everywhere (requests,
# messages, blocks, reports). Names are only for display: two people can
# share one, and someone can change theirs.

def get_caller(c, user_id):
    """(candidate_id, name) for the signed-in user, or (None, None) if they
    haven't made a profile yet."""
    c.execute("SELECT id, name FROM candidates WHERE auth_user_id = %s", (user_id,))
    row = c.fetchone()
    return (row[0], row[1]) if row else (None, None)

def get_candidate_name(c, user_id):
    """Look up the display name backing an authenticated user's candidate row."""
    return get_caller(c, user_id)[1]

def get_person(c, candidate_id):
    """(id, name) for a candidate id, or None."""
    c.execute("SELECT id, name FROM candidates WHERE id = %s", (candidate_id,))
    row = c.fetchone()
    return (row[0], row[1]) if row else None

def resolve_person(c, data, id_key="user_id", name_key="user_name"):
    """The person a request body points at: by id, or by name for older app
    builds that only send names (a real account wins over a sample profile
    with the same name). Returns (id, name) or None."""
    raw_id = data.get(id_key)
    if raw_id not in (None, ""):
        try:
            return get_person(c, int(raw_id))
        except (TypeError, ValueError):
            return None
    name = str(data.get(name_key, "")).strip()
    if not name:
        return None
    c.execute(
        "SELECT id, name FROM candidates WHERE name = %s ORDER BY (auth_user_id IS NULL), id LIMIT 1",
        (name,),
    )
    row = c.fetchone()
    return (row[0], row[1]) if row else None

def get_people(c, ids):
    """{id: {"name", "photoUrl"}} for the given candidate ids."""
    ids = [i for i in set(ids) if i is not None]
    if not ids:
        return {}
    c.execute("SELECT id, name, profile FROM candidates WHERE id = ANY(%s)", (ids,))
    return {
        row[0]: {"name": row[1], "photoUrl": json.loads(row[2]).get("photoUrl")}
        for row in c.fetchall()
    }

def get_blocked_ids(c, my_id):
    """Everyone this user blocked, plus everyone who blocked them."""
    c.execute(
        """
        SELECT blocked_id FROM blocks WHERE blocker_id = %s
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id = %s
        """,
        (my_id, my_id),
    )
    return {row[0] for row in c.fetchall()}


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
    with db_cursor() as (conn, c):
        c.execute("""
            CREATE TABLE IF NOT EXISTS candidates (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                profile TEXT NOT NULL
            )
        """)
        # auth_user_id/email: added for real auth (Supabase Auth). NULL on the
        # 68 seed profiles, which aren't accounts - Postgres treats NULL as
        # distinct in a unique index, so they're unaffected by these.
        c.execute("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS auth_user_id UUID")
        c.execute("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email TEXT")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS candidates_auth_user_id_unique_idx ON candidates (auth_user_id)")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS candidates_email_lower_unique_idx ON candidates (lower(email))")
        c.execute("""
            CREATE TABLE IF NOT EXISTS connection_requests (
                id SERIAL PRIMARY KEY,
                from_user_name TEXT NOT NULL,
                to_user_name TEXT NOT NULL,
                proposed_day TEXT NOT NULL,
                proposed_time TEXT NOT NULL,
                message TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS survey_responses (
                id SERIAL PRIMARY KEY,
                user_name TEXT NOT NULL,
                user_email TEXT,
                user_type TEXT,
                question_key TEXT NOT NULL,
                audio_file_path TEXT,
                transcription TEXT,
                structured_answer TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                connection_id INTEGER NOT NULL,
                sender_name TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        # Private chat content: keep Supabase's public REST API away from it.
        # The backend's postgres role bypasses row-level security, so it is unaffected.
        c.execute("ALTER TABLE messages ENABLE ROW LEVEL SECURITY")
        c.execute("""
            CREATE TABLE IF NOT EXISTS push_tokens (
                id SERIAL PRIMARY KEY,
                auth_user_id UUID NOT NULL,
                expo_push_token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (auth_user_id, expo_push_token)
            )
        """)
        # The meetup plan for a connection. NULL until someone changes it, in
        # which case it's the day/time from the original request, unconfirmed.
        c.execute("ALTER TABLE connection_requests ADD COLUMN IF NOT EXISTS meetup_day TEXT")
        c.execute("ALTER TABLE connection_requests ADD COLUMN IF NOT EXISTS meetup_time TEXT")
        c.execute("ALTER TABLE connection_requests ADD COLUMN IF NOT EXISTS meetup_place TEXT")
        c.execute("ALTER TABLE connection_requests ADD COLUMN IF NOT EXISTS meetup_status TEXT")
        c.execute("ALTER TABLE connection_requests ADD COLUMN IF NOT EXISTS meetup_updated_by TEXT")
        # Blocks and reports are keyed by display name, like connection_requests.
        c.execute("""
            CREATE TABLE IF NOT EXISTS blocks (
                id SERIAL PRIMARY KEY,
                blocker_name TEXT NOT NULL,
                blocked_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (blocker_name, blocked_name)
            )
        """)
        c.execute("ALTER TABLE blocks ENABLE ROW LEVEL SECURITY")
        # Reviewed by hand in the Supabase dashboard; there's no admin screen.
        c.execute("""
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                reporter_name TEXT NOT NULL,
                reported_name TEXT NOT NULL,
                connection_id INTEGER,
                reason TEXT NOT NULL,
                details TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        c.execute("ALTER TABLE reports ENABLE ROW LEVEL SECURITY")
        c.execute("SELECT COUNT(*) FROM candidates")
        if c.fetchone()[0] == 0:
            for candidate in SEED_CANDIDATES:
                c.execute(
                    "INSERT INTO candidates (name, profile) VALUES (%s, %s)",
                    (candidate["name"], json.dumps(candidate))
                )
            print(f"Seeded {len(SEED_CANDIDATES)} profiles ({len(SENIOR_PROFILES)} seniors, {len(COMPANION_PROFILES)} companions)")
        migrate_names_to_ids(c)
        conn.commit()

    ensure_public_bucket(PHOTO_BUCKET)

    try:
        from retrain import retrain_model
        result = retrain_model()
        print(f"Model retrained on startup: {result}")
        with open(MODEL_PATH, "rb") as f:
            ML_MODEL_NEW = pickle.load(f)
        with open(SCALER_PATH, "rb") as f:
            ML_SCALER_NEW = pickle.load(f)
        global ML_MODEL, ML_SCALER
        ML_MODEL = ML_MODEL_NEW
        ML_SCALER = ML_SCALER_NEW
    except Exception as e:
        print(f"Startup retrain skipped: {e}")

# (table, id column, name column) pairs that point at a person.
PERSON_COLUMNS = [
    ("connection_requests", "from_user_id", "from_user_name"),
    ("connection_requests", "to_user_id", "to_user_name"),
    ("connection_requests", "meetup_updated_by_id", "meetup_updated_by"),
    ("messages", "sender_id", "sender_name"),
    ("blocks", "blocker_id", "blocker_name"),
    ("blocks", "blocked_id", "blocked_name"),
    ("reports", "reporter_id", "reporter_name"),
    ("reports", "reported_id", "reported_name"),
]

def migrate_names_to_ids(c):
    """Add a candidate-id column next to every name column and fill it in for
    rows saved before ids were used. Only touches rows whose id is still
    empty, so running it on every startup is safe. A name with no profile
    behind it (old test data) is left empty and so belongs to nobody."""
    for table, id_col, _ in PERSON_COLUMNS:
        c.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {id_col} INTEGER")
    for table, id_col, name_col in PERSON_COLUMNS:
        # Names were never unique; a real account wins over a sample profile.
        c.execute(f"""
            UPDATE {table} t SET {id_col} = person.id
            FROM (
                SELECT DISTINCT ON (name) name, id FROM candidates
                ORDER BY name, (auth_user_id IS NULL), id
            ) person
            WHERE t.{id_col} IS NULL AND t.{name_col} = person.name
        """)
    # Two different people may share a name, so blocks are unique per id now.
    c.execute("ALTER TABLE blocks DROP CONSTRAINT IF EXISTS blocks_blocker_name_blocked_name_key")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS blocks_blocker_blocked_id_idx ON blocks (blocker_id, blocked_id)")
    c.execute("CREATE INDEX IF NOT EXISTS connection_requests_from_id_idx ON connection_requests (from_user_id)")
    c.execute("CREATE INDEX IF NOT EXISTS connection_requests_to_id_idx ON connection_requests (to_user_id)")

def get_all_candidates():
    with db_cursor() as (conn, c):
        c.execute("SELECT id, profile FROM candidates")
        rows = c.fetchall()
    candidates = []
    for row in rows:
        p = json.loads(row[1])
        p.pop("email", None)
        p["id"] = row[0]
        candidates.append(p)
    return candidates

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
    'mobility','caregiver','caregivers','safety','comfort','comfortable',
    'language','languages',
}

_TALK_KW = {
    'phone','call','calling','text','texting','message','messaging',
    'video','facetime','zoom',
    'person','meeting','meet','visit','visiting',
    'group','activity','activities',
    'caregiver','family','relative','relatives',
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

    if not p.get('talkPreferences') and p.get('commPreferenceText'):
        tokens = set(_kw_extract(p['commPreferenceText']))
        matched = list(tokens & _TALK_KW)
        p['talkPreferences'] = matched if matched else ['in-person', 'phone']

    if not p.get('talkPreferences'):
        p['talkPreferences'] = ['in-person', 'phone']

    if not p.get('faith'):
        combined = ' '.join([
            p.get('bio', ''), p.get('commPreferenceText', ''),
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

    senior_interests = _set(senior, "interests")
    companion_interests = _set(companion, "interests")
    senior_values = _set(senior, "values")
    companion_values = _set(companion, "values")
    senior_languages = _set(senior, "languages")
    companion_languages = _set(companion, "languages")

    return {
        "age_diff": f["age_diff"],
        "same_city": f["same_city"],
        "interest_overlap": f["interest_overlap"],
        "can_help_with_needs": f["volunteering_help_match"],
        "goals_align": f["companionship_gap_overlap"],
        "tech_compatible": f["tech_compatibility"],
        "shared_faith": f["same_religion"],
        "age_gap_appropriate": f["same_mobility"],
        "shared_interests": sorted(list(senior_interests & companion_interests)),
        "shared_values": sorted(list(senior_values & companion_values)),
        "shared_languages": sorted(list(senior_languages & companion_languages)),
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

        # A signed-in caller never sees themselves, or anyone on either side
        # of a block. Signed out, the best we can do is skip their own name.
        my_id, blocked = None, set()
        auth_id = optional_auth_user_id()
        if auth_id:
            with db_cursor() as (conn, c):
                my_id, _ = get_caller(c, auth_id)
                if my_id is not None:
                    blocked = get_blocked_ids(c, my_id)

        matches = []
        for candidate in candidates:
            if my_id is not None:
                if candidate.get("id") == my_id:
                    continue
            elif candidate.get("name") == target_user.get("name"):
                continue
            if candidate.get("id") in blocked:
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
        with db_cursor() as (conn, c):
            c.execute("SELECT id, name, profile FROM candidates")
            rows = c.fetchall()

        users = []
        for row in rows:
            profile = json.loads(row[2])
            profile.pop("email", None)
            profile["id"] = row[0]
            users.append(profile)

        return jsonify(users), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/users", methods=["POST"])
@require_auth
def add_user(user_id, email):
    try:
        user_data = request.json or {}
        name = user_data.get("name", "Unknown")
        # email always comes from the verified token, never the client body
        user_data["email"] = email
        # photoUrl is only ever set by the photo upload route
        user_data.pop("photoUrl", None)

        with db_cursor() as (conn, c):
            # Retaking the survey replaces the profile; keep their photo.
            c.execute("SELECT profile FROM candidates WHERE auth_user_id = %s", (user_id,))
            existing = c.fetchone()
            existing = json.loads(existing[0]) if existing else {}
            if existing.get("photoUrl"):
                user_data["photoUrl"] = existing["photoUrl"]

            # Fill interests, values, help, days etc. from the spoken answers.
            # Which fields came from voice last time is the server's record,
            # not whatever the app sends.
            user_data["fieldsFromVoice"] = existing.get("fieldsFromVoice", [])
            user_data = fill_missing_fields(user_data)

            c.execute("""
                INSERT INTO candidates (name, profile, auth_user_id, email)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (auth_user_id) DO UPDATE
                SET name = EXCLUDED.name, profile = EXCLUDED.profile, email = EXCLUDED.email
                RETURNING id
            """, (name, json.dumps(user_data), user_id, email))
            new_id = c.fetchone()[0]
            conn.commit()

        print(f"User upserted: {name} ({user_data.get('userType', 'unknown type')})")
        return jsonify({"status": "success", "userId": new_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/users/me", methods=["GET"])
@require_auth
def get_my_user(user_id, email):
    try:
        with db_cursor() as (conn, c):
            c.execute("SELECT id, profile FROM candidates WHERE auth_user_id = %s", (user_id,))
            row = c.fetchone()

        if not row:
            return jsonify({"status": "not_found"}), 404

        profile = json.loads(row[1])
        profile["id"] = row[0]
        return jsonify(profile), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/users/me", methods=["PUT"])
@require_auth
def update_my_user(user_id, email):
    try:
        updates = request.json or {}
        updates.pop("email", None)  # email is only ever set from the verified token
        updates.pop("photoUrl", None)  # and photoUrl only by the photo upload route
        updates.pop("fieldsFromVoice", None)  # kept by the server, see below

        with db_cursor() as (conn, c):
            c.execute("SELECT id, profile FROM candidates WHERE auth_user_id = %s", (user_id,))
            row = c.fetchone()
            if not row:
                return jsonify({"status": "not_found"}), 404

            candidate_id, profile_json = row
            p = json.loads(profile_json)
            # A field the person changes here is theirs now, so a later survey
            # retake won't refill it from their voice answers.
            from_voice = [k for k in p.get("fieldsFromVoice", [])
                          if k not in updates or updates[k] == p.get(k)]
            p.update(updates)
            if from_voice:
                p["fieldsFromVoice"] = from_voice
            else:
                p.pop("fieldsFromVoice", None)
            p["email"] = email

            c.execute(
                "UPDATE candidates SET name=%s, profile=%s, email=%s WHERE id=%s",
                (p.get("name", "Unknown"), json.dumps(p), email, candidate_id)
            )
            conn.commit()

        return jsonify({"status": "updated", "id": candidate_id}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

MAX_PHOTO_BYTES = 5 * 1024 * 1024
PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

def _set_my_photo(c, user_id, photo_url):
    """Store a new photoUrl (or None) on the caller's profile and return the
    old one, or raise LookupError if they have no profile yet."""
    c.execute("SELECT id, profile FROM candidates WHERE auth_user_id = %s", (user_id,))
    row = c.fetchone()
    if not row:
        raise LookupError
    candidate_id, profile_json = row
    profile = json.loads(profile_json)
    old_url = profile.get("photoUrl")
    if photo_url:
        profile["photoUrl"] = photo_url
    else:
        profile.pop("photoUrl", None)
    c.execute("UPDATE candidates SET profile = %s WHERE id = %s", (json.dumps(profile), candidate_id))
    return old_url

@app.route("/api/users/me/photo", methods=["POST"])
@require_auth
def upload_my_photo(user_id, email):
    try:
        photo = request.files.get("photo")
        if photo is None:
            return jsonify({"error": "photo is required"}), 400
        ext = PHOTO_TYPES.get((photo.mimetype or "").lower())
        if not ext:
            return jsonify({"error": "Photo must be a JPEG, PNG or WebP image"}), 400
        data = photo.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES:
            return jsonify({"error": "Photo is too large (max 5 MB)"}), 400

        with db_cursor() as (conn, c):
            if not get_candidate_name(c, user_id):
                return jsonify({"error": "Complete your profile first"}), 404

            # A fresh name per upload, so phones don't keep showing a cached old photo.
            object_path = f"{user_id}/{int(time.time() * 1000)}.{ext}"
            photo_url = upload_bytes_to_storage(PHOTO_BUCKET, object_path, data, photo.mimetype)
            if not photo_url:
                return jsonify({"error": "Could not store the photo, please try again"}), 502

            old_url = _set_my_photo(c, user_id, photo_url)
            conn.commit()

        delete_from_storage(PHOTO_BUCKET, [storage_path_from_url(PHOTO_BUCKET, old_url)])
        return jsonify({"status": "updated", "photoUrl": photo_url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/users/me/photo", methods=["DELETE"])
@require_auth
def delete_my_photo(user_id, email):
    try:
        with db_cursor() as (conn, c):
            try:
                old_url = _set_my_photo(c, user_id, None)
            except LookupError:
                return jsonify({"error": "Complete your profile first"}), 404
            conn.commit()

        delete_from_storage(PHOTO_BUCKET, [storage_path_from_url(PHOTO_BUCKET, old_url)])
        return jsonify({"status": "removed"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _delete_auth_user(user_id):
    """Delete the Supabase Auth login itself. Returns True on success."""
    config = _storage_config()
    if not config:
        return False
    supabase_url, service_key = config
    response = req.delete(
        f"{supabase_url}/auth/v1/admin/users/{user_id}",
        headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
    )
    if response.status_code not in (200, 204, 404):
        print(f"[auth] delete user failed: {response.status_code} {response.text}")
        return False
    return True

@app.route("/api/users/me", methods=["DELETE"])
@require_auth
def delete_my_account(user_id, email):
    """Delete everything tied to this account, then the login itself. Reports
    other people filed about this user are kept as a safety record."""
    try:
        with db_cursor() as (conn, c):
            c.execute("SELECT id, profile FROM candidates WHERE auth_user_id = %s", (user_id,))
            row = c.fetchone()
            my_id = row[0] if row else None
            photo_url = json.loads(row[1]).get("photoUrl") if row else None

            c.execute(
                "SELECT audio_file_path FROM survey_responses WHERE lower(user_email) = lower(%s)",
                (email,),
            )
            audio_paths = [storage_path_from_url(AUDIO_BUCKET, r[0]) for r in c.fetchall()]

            if my_id is not None:
                c.execute(
                    """
                    DELETE FROM messages WHERE connection_id IN (
                        SELECT id FROM connection_requests
                        WHERE from_user_id = %s OR to_user_id = %s
                    )
                    """,
                    (my_id, my_id),
                )
                c.execute(
                    "DELETE FROM connection_requests WHERE from_user_id = %s OR to_user_id = %s",
                    (my_id, my_id),
                )
                c.execute("DELETE FROM blocks WHERE blocker_id = %s OR blocked_id = %s", (my_id, my_id))
                c.execute("DELETE FROM reports WHERE reporter_id = %s", (my_id,))
            c.execute("DELETE FROM survey_responses WHERE lower(user_email) = lower(%s)", (email,))
            c.execute("DELETE FROM push_tokens WHERE auth_user_id = %s", (user_id,))
            c.execute("DELETE FROM candidates WHERE auth_user_id = %s", (user_id,))

            # Delete the login before committing: if that fails, roll back so
            # the user can retry instead of ending up with a login and no data.
            if not _delete_auth_user(user_id):
                conn.rollback()
                return jsonify({"error": "Could not delete your account, please try again"}), 502
            conn.commit()

        delete_from_storage(PHOTO_BUCKET, [storage_path_from_url(PHOTO_BUCKET, photo_url)])
        delete_from_storage(AUDIO_BUCKET, audio_paths)
        return jsonify({"status": "deleted"}), 200
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

        # Upload audio to Supabase Storage and use the public URL if successful
        final_audio_url = saved_audio_path
        if saved_audio_path and os.path.exists(saved_audio_path):
            storage_url = upload_to_supabase_storage(saved_audio_path, os.path.basename(saved_audio_path))
            if storage_url:
                final_audio_url = storage_url

        return jsonify({
            "text": text,
            "saved_audio_path": final_audio_url
        }), 200

    except Exception as e:
        print(f"[transcribe] error: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

# ---------------------------------------------------------------------------
# Connection Request Routes
# ---------------------------------------------------------------------------
# Who's who is decided by candidate id. Names are still stored next to the
# ids and returned, so older app builds that compare names keep working.

REQUEST_COLUMNS = (
    "id, from_user_id, to_user_id, from_user_name, to_user_name, "
    "proposed_day, proposed_time, message, status, created_at"
)

def _open_request_between(c, a_id, b_id):
    """(from_user_id, status) of a pending/accepted request between two
    people in either direction, or None."""
    c.execute(
        """
        SELECT from_user_id, status FROM connection_requests
        WHERE status IN ('pending', 'accepted')
          AND ((from_user_id = %s AND to_user_id = %s)
            OR (from_user_id = %s AND to_user_id = %s))
        LIMIT 1
        """,
        (a_id, b_id, b_id, a_id),
    )
    return c.fetchone()


@app.route("/api/connect", methods=["POST"])
@require_auth
def send_connect_request(user_id, email):
    try:
        data = request.json or {}
        day       = str(data.get("proposed_day", "")).strip()
        proposed_time = str(data.get("proposed_time", "")).strip()
        message   = str(data.get("message", "")).strip()

        if not (data.get("to_user_id") or str(data.get("to_user_name", "")).strip()) \
                or not day or not proposed_time:
            return jsonify({"error": "Missing required fields"}), 400

        with db_cursor() as (conn, c):
            my_id, my_name = get_caller(c, user_id)
            if my_id is None:
                return jsonify({"error": "Complete your profile first"}), 404
            target = resolve_person(c, data, "to_user_id", "to_user_name")
            if target is None:
                return jsonify({"error": "We couldn't find that person"}), 404
            to_id, to_name = target
            if to_id == my_id:
                return jsonify({"error": "You can't send a request to yourself"}), 400
            # Same message either way, so nobody learns they've been blocked.
            if to_id in get_blocked_ids(c, my_id):
                return jsonify({"error": "You can't send a request to this person"}), 403

            existing = _open_request_between(c, my_id, to_id)
            if existing:
                existing_from, existing_status = existing
                if existing_status == "accepted":
                    error = f"You're already connected with {to_name}"
                elif existing_from == my_id:
                    error = f"You already sent {to_name} a request"
                else:
                    error = f"{to_name} already sent you a request. You can accept it on your dashboard"
                return jsonify({"error": error}), 409

            c.execute(
                """
                INSERT INTO connection_requests
                    (from_user_id, to_user_id, from_user_name, to_user_name,
                     proposed_day, proposed_time, message)
                VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
                """,
                (my_id, to_id, my_name, to_name, day, proposed_time, message)
            )
            new_id = c.fetchone()[0]
            conn.commit()

        return jsonify({"status": "sent", "request_id": new_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/connect/<user_name>", methods=["GET"])
@require_auth
def get_connect_requests(user_id, email, user_name):
    """The caller's requests. The name in the path is from older app builds
    and must be the caller's own; the lookup itself goes by id."""
    try:
        # received (default) = requests sent to this user, sent = requests they
        # made, all = both. The WHERE text comes from this fixed dict only.
        direction = request.args.get("direction", "received").strip().lower()
        filters = {
            "received": "to_user_id = %(me)s",
            "sent": "from_user_id = %(me)s",
            "all": "(to_user_id = %(me)s OR from_user_id = %(me)s)",
        }
        if direction not in filters:
            return jsonify({"error": "direction must be 'received', 'sent' or 'all'"}), 400

        with db_cursor() as (conn, c):
            my_id, my_name = get_caller(c, user_id)
            if my_id is None:
                return jsonify({"error": "Complete your profile first"}), 404
            if my_name != user_name:
                return jsonify({"error": "Forbidden"}), 403

            # Removed connections (unfriended or blocked) drop out of every list.
            c.execute(
                "SELECT " + REQUEST_COLUMNS + ", " + MEETUP_COLUMNS
                + " FROM connection_requests WHERE " + filters[direction]
                + " AND status <> 'removed' ORDER BY created_at DESC",
                {"me": my_id},
            )
            rows = c.fetchall()
            people = get_people(c, [i for row in rows for i in (row[1], row[2])])

        requests_list = []
        for row in rows:
            (rid, from_id, to_id, from_stored, to_stored,
             day, time_, message, status, created_at) = row[:10]
            # Current names, in case someone has renamed themselves since.
            from_name = people.get(from_id, {}).get("name", from_stored)
            to_name = people.get(to_id, {}).get("name", to_stored)
            sent_by_me = from_id == my_id
            other_id = to_id if sent_by_me else from_id
            meetup = _meetup_from_row((from_id, from_name, day, time_), row[10:], people)
            meetup["updated_by_me"] = meetup.pop("updated_by_id") == my_id
            requests_list.append({
                "id": rid,
                "from_user_id": from_id,
                "to_user_id": to_id,
                "from_user_name": from_name,
                "to_user_name": to_name,
                "proposed_day": day,
                "proposed_time": time_,
                "message": message,
                "status": status,
                "created_at": str(created_at),
                "from_user_photo": people.get(from_id, {}).get("photoUrl"),
                "to_user_photo": people.get(to_id, {}).get("photoUrl"),
                "sent_by_me": sent_by_me,
                "other_user_id": other_id,
                "other_user_name": to_name if sent_by_me else from_name,
                "other_user_photo": people.get(other_id, {}).get("photoUrl"),
                "meetup": meetup,
            })
        return jsonify({"requests": requests_list}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/connect/<int:request_id>", methods=["PUT"])
@require_auth
def respond_connect_request(user_id, email, request_id):
    try:
        data = request.json or {}
        status = data.get("status", "").strip()

        if status not in ("accepted", "rejected"):
            return jsonify({"error": "status must be 'accepted' or 'rejected'"}), 400

        with db_cursor() as (conn, c):
            my_id, _ = get_caller(c, user_id)
            if my_id is None:
                return jsonify({"error": "Complete your profile first"}), 404

            c.execute("SELECT to_user_id FROM connection_requests WHERE id = %s", (request_id,))
            row = c.fetchone()
            if row is None:
                return jsonify({"error": "Request not found"}), 404
            # Only the recipient of the request may accept/reject it.
            if row[0] != my_id:
                return jsonify({"error": "Forbidden"}), 403

            c.execute(
                "UPDATE connection_requests SET status = %s WHERE id = %s",
                (status, request_id)
            )
            conn.commit()

        return jsonify({"status": "updated", "new_status": status}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Message Routes - chat between the two people on an accepted connection
# ---------------------------------------------------------------------------

MAX_MESSAGE_LENGTH = 2000

def _get_connection_parties(c, connection_id):
    """Return (from_user_id, to_user_id, status) for a request, or None."""
    c.execute(
        "SELECT from_user_id, to_user_id, status FROM connection_requests WHERE id = %s",
        (connection_id,)
    )
    return c.fetchone()


@app.route("/api/messages", methods=["POST"])
@require_auth
def send_message(user_id, email):
    try:
        data = request.json or {}
        try:
            connection_id = int(data.get("connection_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "connection_id is required"}), 400
        body = str(data.get("body", "")).strip()

        if not body:
            return jsonify({"error": "body is required"}), 400
        if len(body) > MAX_MESSAGE_LENGTH:
            return jsonify({"error": f"Message is too long (max {MAX_MESSAGE_LENGTH} characters)"}), 400

        with db_cursor() as (conn, c):
            my_id, my_name = get_caller(c, user_id)
            if my_id is None:
                return jsonify({"error": "Complete your profile first"}), 404

            parties = _get_connection_parties(c, connection_id)
            if parties is None:
                return jsonify({"error": "Connection not found"}), 404
            from_id, to_id, status = parties
            if my_id not in (from_id, to_id):
                return jsonify({"error": "Not a participant in this connection"}), 403
            if status == "removed":
                return jsonify({"error": "This connection has ended"}), 400
            if status != "accepted":
                return jsonify({"error": "Messaging opens once the request is accepted"}), 400

            c.execute(
                "INSERT INTO messages (connection_id, sender_id, sender_name, body) VALUES (%s, %s, %s, %s) RETURNING id, created_at",
                (connection_id, my_id, my_name, body)
            )
            message_id, created_at = c.fetchone()
            conn.commit()

        return jsonify({"status": "sent", "message_id": message_id, "created_at": str(created_at)}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/messages/<int:connection_id>", methods=["GET"])
@require_auth
def get_messages(user_id, email, connection_id):
    try:
        since_id = request.args.get("since_id", default=0, type=int)

        with db_cursor() as (conn, c):
            my_id, _ = get_caller(c, user_id)
            if my_id is None:
                return jsonify({"error": "Complete your profile first"}), 404

            parties = _get_connection_parties(c, connection_id)
            if parties is None:
                return jsonify({"error": "Connection not found"}), 404
            if my_id not in (parties[0], parties[1]):
                return jsonify({"error": "Not a participant in this connection"}), 403

            c.execute(
                "SELECT id, sender_id, sender_name, body, created_at FROM messages WHERE connection_id = %s AND id > %s ORDER BY id ASC",
                (connection_id, since_id)
            )
            rows = c.fetchall()
            people = get_people(c, [r[1] for r in rows])

        return jsonify({
            "connection_id": connection_id,
            "messages": [
                {
                    "id": r[0],
                    "sender_id": r[1],
                    "sender_name": people.get(r[1], {}).get("name", r[2]),
                    "mine": r[1] == my_id,
                    "body": r[3],
                    "created_at": str(r[4]),
                }
                for r in rows
            ],
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Meetup Routes - the plan for when and where two connected people meet
# ---------------------------------------------------------------------------

MAX_PLACE_LENGTH = 120
MEETUP_COLUMNS = "meetup_day, meetup_time, meetup_place, meetup_status, meetup_updated_by_id, meetup_updated_by"

def _meetup_from_row(request_fields, meetup_fields, people=None):
    """Build the meetup plan. request_fields = (from_user_id, from_user_name,
    proposed_day, proposed_time); meetup_fields = the MEETUP_COLUMNS values.
    Until someone edits it, the plan is the original request's day and time,
    suggested by the requester and not yet confirmed. Includes
    updated_by_id, which routes turn into updated_by_me before replying."""
    from_id, from_name, proposed_day, proposed_time = request_fields
    day, time_, place, status, updated_by_id, updated_by_name = meetup_fields
    if not status:
        return {"day": proposed_day, "time": proposed_time, "place": "",
                "status": "proposed", "updated_by": from_name, "updated_by_id": from_id}
    name = (people or {}).get(updated_by_id, {}).get("name", updated_by_name)
    return {"day": day, "time": time_, "place": place or "",
            "status": status, "updated_by": name, "updated_by_id": updated_by_id}

def _load_meetup_for_participant(c, user_id, connection_id):
    """(my_id, my_name, meetup, error_response). Only the two people on an
    accepted connection can see or change its meetup."""
    my_id, my_name = get_caller(c, user_id)
    if my_id is None:
        return None, None, None, (jsonify({"error": "Complete your profile first"}), 404)
    c.execute(
        "SELECT from_user_id, to_user_id, from_user_name, proposed_day, proposed_time, status, "
        + MEETUP_COLUMNS + " FROM connection_requests WHERE id = %s",
        (connection_id,),
    )
    row = c.fetchone()
    if row is None:
        return None, None, None, (jsonify({"error": "Connection not found"}), 404)
    from_id, to_id, from_name, day, time_, status = row[:6]
    if my_id not in (from_id, to_id):
        return None, None, None, (jsonify({"error": "Not a participant in this connection"}), 403)
    if status != "accepted":
        return None, None, None, (jsonify({"error": "This connection has ended"}), 400)
    people = get_people(c, [from_id, row[10]])
    from_name = people.get(from_id, {}).get("name", from_name)
    return my_id, my_name, _meetup_from_row((from_id, from_name, day, time_), row[6:], people), None

def _meetup_reply(meetup, my_id):
    reply = dict(meetup)
    reply["updated_by_me"] = reply.pop("updated_by_id") == my_id
    return jsonify({"meetup": reply})


@app.route("/api/connect/<int:connection_id>/meetup", methods=["GET"])
@require_auth
def get_meetup(user_id, email, connection_id):
    try:
        with db_cursor() as (conn, c):
            my_id, _, meetup, err = _load_meetup_for_participant(c, user_id, connection_id)
        if err:
            return err
        return _meetup_reply(meetup, my_id), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/connect/<int:connection_id>/meetup", methods=["PUT"])
@require_auth
def update_meetup(user_id, email, connection_id):
    """Suggest a new day, time and place. The other person then confirms it."""
    try:
        data = request.json or {}
        day = str(data.get("day", "")).strip()
        time_ = str(data.get("time", "")).strip()
        place = str(data.get("place", "")).strip()
        if not day or not time_:
            return jsonify({"error": "Pick a day and a time"}), 400
        if len(place) > MAX_PLACE_LENGTH:
            return jsonify({"error": f"Place is too long (max {MAX_PLACE_LENGTH} characters)"}), 400

        with db_cursor() as (conn, c):
            my_id, my_name, _, err = _load_meetup_for_participant(c, user_id, connection_id)
            if err:
                return err
            c.execute(
                """
                UPDATE connection_requests
                SET meetup_day = %s, meetup_time = %s, meetup_place = %s,
                    meetup_status = 'proposed', meetup_updated_by_id = %s,
                    meetup_updated_by = %s
                WHERE id = %s
                """,
                (day, time_, place, my_id, my_name, connection_id),
            )
            conn.commit()

        return _meetup_reply({"day": day, "time": time_, "place": place, "status": "proposed",
                              "updated_by": my_name, "updated_by_id": my_id}, my_id), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/connect/<int:connection_id>/meetup/confirm", methods=["POST"])
@require_auth
def confirm_meetup(user_id, email, connection_id):
    """Agree to the other person's suggestion. You can't confirm your own."""
    try:
        with db_cursor() as (conn, c):
            my_id, _, meetup, err = _load_meetup_for_participant(c, user_id, connection_id)
            if err:
                return err
            if meetup["updated_by_id"] == my_id:
                return jsonify({"error": "The other person needs to confirm your suggestion"}), 400
            # Writes the plan out in full, which also covers a plan that was
            # still just the original request's day and time.
            c.execute(
                """
                UPDATE connection_requests
                SET meetup_day = %s, meetup_time = %s, meetup_place = %s,
                    meetup_status = 'confirmed', meetup_updated_by_id = %s,
                    meetup_updated_by = %s
                WHERE id = %s
                """,
                (meetup["day"], meetup["time"], meetup["place"],
                 meetup["updated_by_id"], meetup["updated_by"], connection_id),
            )
            conn.commit()

        return _meetup_reply({**meetup, "status": "confirmed"}, my_id), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Safety Routes - remove a connection, block, and report
# ---------------------------------------------------------------------------

REPORT_REASONS = {
    "harassment", "inappropriate", "scam", "fake_profile", "safety", "other",
}
MAX_REPORT_DETAILS = 1000

def _end_connections_between(c, a_id, b_id):
    """Mark every open request or connection between two people removed."""
    c.execute(
        """
        UPDATE connection_requests SET status = 'removed'
        WHERE status IN ('pending', 'accepted')
          AND ((from_user_id = %s AND to_user_id = %s)
            OR (from_user_id = %s AND to_user_id = %s))
        """,
        (a_id, b_id, b_id, a_id),
    )

def _block(c, me, other):
    """me and other are (id, name)."""
    c.execute(
        """
        INSERT INTO blocks (blocker_id, blocked_id, blocker_name, blocked_name)
        VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING
        """,
        (me[0], other[0], me[1], other[1]),
    )
    _end_connections_between(c, me[0], other[0])


@app.route("/api/connect/<int:connection_id>/remove", methods=["POST"])
@require_auth
def remove_connection(user_id, email, connection_id):
    try:
        with db_cursor() as (conn, c):
            my_id, _ = get_caller(c, user_id)
            if my_id is None:
                return jsonify({"error": "Complete your profile first"}), 404

            parties = _get_connection_parties(c, connection_id)
            if parties is None:
                return jsonify({"error": "Connection not found"}), 404
            if my_id not in (parties[0], parties[1]):
                return jsonify({"error": "Not a participant in this connection"}), 403

            c.execute(
                "UPDATE connection_requests SET status = 'removed' WHERE id = %s",
                (connection_id,),
            )
            conn.commit()

        return jsonify({"status": "removed"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/blocks", methods=["GET"])
@require_auth
def list_my_blocks(user_id, email):
    try:
        with db_cursor() as (conn, c):
            my_id, _ = get_caller(c, user_id)
            if my_id is None:
                return jsonify({"error": "Complete your profile first"}), 404
            c.execute(
                "SELECT blocked_id, blocked_name, created_at FROM blocks WHERE blocker_id = %s ORDER BY created_at DESC",
                (my_id,),
            )
            rows = c.fetchall()
            people = get_people(c, [r[0] for r in rows])

        return jsonify({
            "blocks": [
                {"user_id": r[0], "user_name": people.get(r[0], {}).get("name", r[1]),
                 "created_at": str(r[2])}
                for r in rows
            ],
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/blocks", methods=["POST"])
@require_auth
def block_user(user_id, email):
    try:
        data = request.json or {}
        with db_cursor() as (conn, c):
            me = get_caller(c, user_id)
            if me[0] is None:
                return jsonify({"error": "Complete your profile first"}), 404
            other = resolve_person(c, data)
            if other is None:
                return jsonify({"error": "We couldn't find that person"}), 404
            if other[0] == me[0]:
                return jsonify({"error": "You can't block yourself"}), 400
            _block(c, me, other)
            conn.commit()

        return jsonify({"status": "blocked"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _unblock(user_id, where, value):
    with db_cursor() as (conn, c):
        my_id, _ = get_caller(c, user_id)
        if my_id is None:
            return jsonify({"error": "Complete your profile first"}), 404
        # Ended connections stay ended; they can send a new request.
        c.execute("DELETE FROM blocks WHERE blocker_id = %s AND " + where, (my_id, value))
        conn.commit()
    return jsonify({"status": "unblocked"}), 200


@app.route("/api/blocks/<int:blocked_id>", methods=["DELETE"])
@require_auth
def unblock_user(user_id, email, blocked_id):
    try:
        return _unblock(user_id, "blocked_id = %s", blocked_id)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/blocks/<user_name>", methods=["DELETE"])
@require_auth
def unblock_user_by_name(user_id, email, user_name):
    """For older app builds, which unblock by name."""
    try:
        return _unblock(user_id, "blocked_name = %s", user_name)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reports", methods=["POST"])
@require_auth
def report_user(user_id, email):
    """Record a report and block the person, so they can't keep contacting
    the reporter while it's reviewed."""
    try:
        data = request.json or {}
        reason = str(data.get("reason", "")).strip()
        details = str(data.get("details", "")).strip()[:MAX_REPORT_DETAILS]
        connection_id = data.get("connection_id")

        if not (data.get("user_id") or str(data.get("user_name", "")).strip()):
            return jsonify({"error": "user_id is required"}), 400
        if reason not in REPORT_REASONS:
            return jsonify({"error": "Pick a reason for the report"}), 400
        try:
            connection_id = int(connection_id) if connection_id is not None else None
        except (TypeError, ValueError):
            connection_id = None

        with db_cursor() as (conn, c):
            me = get_caller(c, user_id)
            if me[0] is None:
                return jsonify({"error": "Complete your profile first"}), 404
            other = resolve_person(c, data)
            if other is None:
                return jsonify({"error": "We couldn't find that person"}), 404
            if other[0] == me[0]:
                return jsonify({"error": "You can't report yourself"}), 400

            c.execute(
                """
                INSERT INTO reports
                    (reporter_id, reported_id, reporter_name, reported_name, connection_id, reason, details)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (me[0], other[0], me[1], other[1], connection_id, reason, details),
            )
            _block(c, me, other)
            conn.commit()

        return jsonify({"status": "reported"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/retrain", methods=["POST"])
def retrain_endpoint():
    # This is hit by a scheduled job, not a logged-in user, so it checks a
    # shared secret instead of require_auth. Left open if RETRAIN_SECRET
    # isn't configured (e.g. local dev).
    secret = os.environ.get("RETRAIN_SECRET", "")
    if secret and request.headers.get("X-Retrain-Secret", "") != secret:
        return jsonify({"error": "Forbidden"}), 403
    try:
        from retrain import retrain_model
        result = retrain_model()

        # Reload the updated model into memory immediately
        global ML_MODEL, ML_SCALER
        with open(MODEL_PATH, "rb") as f:
            ML_MODEL = pickle.load(f)
        with open(SCALER_PATH, "rb") as f:
            ML_SCALER = pickle.load(f)

        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Survey Response Routes
# ---------------------------------------------------------------------------

@app.route("/api/survey/save", methods=["POST"])
@require_auth
def save_survey_responses(user_id, email):
    try:
        data = request.json or {}
        user_name = data.get("user_name", "").strip()
        user_type = data.get("user_type", "").strip()
        responses = data.get("responses", [])

        if not user_name:
            return jsonify({"error": "user_name is required"}), 400

        with db_cursor() as (conn, c):
            # Retaking the survey replaces the previous answers rather than
            # adding another full copy of them.
            c.execute(
                "SELECT audio_file_path FROM survey_responses WHERE lower(user_email) = lower(%s)",
                (email,),
            )
            old_audio = {r[0] for r in c.fetchall() if r[0]}
            c.execute("DELETE FROM survey_responses WHERE lower(user_email) = lower(%s)", (email,))

            for r in responses:
                question_key = r.get("question_key", "")
                audio_file_path = r.get("audio_file_path")
                transcription = r.get("transcription")
                structured = r.get("structured_answer")
                structured_answer = json.dumps(structured) if structured else None

                c.execute("""
                    INSERT INTO survey_responses (user_name, user_email, user_type, question_key, audio_file_path, transcription, structured_answer)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (user_name, email, user_type, question_key, audio_file_path, transcription, structured_answer))

            conn.commit()

        # Recordings from the old answers that the new ones don't reuse.
        kept = {r.get("audio_file_path") for r in responses}
        delete_from_storage(
            AUDIO_BUCKET,
            [storage_path_from_url(AUDIO_BUCKET, url) for url in old_audio - kept],
        )
        return jsonify({"status": "saved", "count": len(responses)}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/survey/responses/<user_name>", methods=["GET"])
@require_auth
def get_survey_responses(user_id, email, user_name):
    try:
        # Survey answers can include sensitive personal info, so the caller's
        # token email must match the account's stored email - this replaces
        # the earlier client-supplied ?user_email= query param.
        with db_cursor() as (conn, c):
            c.execute("""
                SELECT id, question_key, audio_file_path, transcription, structured_answer, created_at
                FROM survey_responses
                WHERE user_name = %s AND lower(user_email) = lower(%s)
                ORDER BY id ASC
            """, (user_name, email))
            rows = c.fetchall()

        if not rows:
            return jsonify({"error": "Not found"}), 404

        responses = [
            {
                "id": row[0],
                "question_key": row[1],
                "audio_file_path": row[2],
                "transcription": row[3],
                "structured_answer": json.loads(row[4]) if row[4] else None,
                "created_at": str(row[5]),
            }
            for row in rows
        ]

        return jsonify({"user_name": user_name, "responses": responses}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
    print("  POST /api/users               - Add/update current user (auth)")
    print("  GET  /api/users/me            - Get current user (auth)")
    print("  PUT  /api/users/me            - Update current user (auth)")
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
