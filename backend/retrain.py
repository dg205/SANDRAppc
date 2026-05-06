import os
import json
import pickle
import pandas as pd
import psycopg2
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

from app import derive_ml_features, ML_FEATURES, preprocess_profile

MODEL_PATH = os.path.join(os.path.dirname(__file__), "trained_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "scaler.pkl")
CSV_PATH = os.path.join(os.path.dirname(__file__), "user_match_pairs_expanded_synthetic.csv")


def _get_db_connection():
    database_url = os.environ.get("DATABASE_URL", "")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    return psycopg2.connect(database_url)


def retrain_model():
    # 1. Load synthetic baseline data
    df_synthetic = pd.read_csv(CSV_PATH)

    # 2. Pull real outcomes from the database
    conn = _get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT from_user_name, to_user_name, status
        FROM connection_requests
        WHERE status IN ('accepted', 'rejected')
    """)
    requests = c.fetchall()

    c.execute("SELECT name, profile FROM candidates")
    rows = c.fetchall()
    conn.close()

    profiles = {name: json.loads(profile) for name, profile in rows}

    # 3. Build feature rows from real accepted/rejected pairs
    real_rows = []
    for from_name, to_name, status in requests:
        p1 = profiles.get(from_name)
        p2 = profiles.get(to_name)
        if not p1 or not p2:
            continue

        p1 = preprocess_profile(p1)
        p2 = preprocess_profile(p2)

        if p1.get("userType") == "senior":
            senior, companion = p1, p2
        elif p1.get("userType") == "companion":
            senior, companion = p2, p1
        else:
            senior, companion = p1, p2

        features = derive_ml_features(senior, companion)
        row = {f: features[f] for f in ML_FEATURES}
        row["match_label"] = 1 if status == "accepted" else 0
        real_rows.append(row)

    # 4. Combine — weight real data 3x since it's ground truth
    if real_rows:
        df_real = pd.DataFrame(real_rows)
        df_real_weighted = pd.concat([df_real] * 3, ignore_index=True)
        df_combined = pd.concat([df_synthetic, df_real_weighted], ignore_index=True)
    else:
        df_combined = df_synthetic

    X = df_combined[ML_FEATURES]
    y = df_combined["match_label"]

    # 5. Scale and retrain
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        class_weight="balanced",
    )
    model.fit(X_scaled, y)

    # 6. Save new model files
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    with open(SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)

    return {
        "status": "success",
        "synthetic_rows": len(df_synthetic),
        "real_rows": len(real_rows),
        "total_rows": len(df_combined),
    }
