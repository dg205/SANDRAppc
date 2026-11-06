"""Train the match model from real outcomes, and keep it only if it helps.

Training data is every senior-companion pair whose connection request was
accepted (label 1) or rejected (label 0). Until there are enough of those,
or when the model doesn't rank real outcomes better than the rule-based
score alone, no model is saved and the app scores with rules only.

The check: for each candidate model, cross-validation gives a score for
every pair from a model that never saw that pair. Those scores are blended
with the rule score the same way the app blends them. The model is kept
only if both it and the blend rank outcomes clearly better than chance, and
the blend beats the rule score alone. Ranking is measured by ROC-AUC: how
often a real match outranks a real non-match (0.5 is a coin flip, 1.0 is
perfect).
"""
import json
import os
import pickle

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app import (
    ML_FEATURES, MODEL_PATH, SCALER_PATH, blend_scores, compute_rule_score,
    db_cursor, model_features, preprocess_profile,
)

# Below this there's too little data for a trustworthy check.
MIN_PAIRS = 40
MIN_PER_CLASS = 10
CV_FOLDS = 5
# The blend has to beat the rules by at least this much ROC-AUC, so noise
# between folds doesn't switch the model on.
MIN_AUC_GAIN = 0.02
# ...and the model alone has to beat a coin flip (0.5) by this many times
# the spread ROC-AUC has on random labels. Without this, a rule score that
# lands under 0.5 by luck is easy for a lucky model to "beat".
CHANCE_MARGIN_SDS = 2.5


def chance_auc_bar(positives, negatives):
    """ROC-AUC a model needs to show it found more than luck. The spread of
    AUC on random labels shrinks as data grows, so the bar drops toward 0.5."""
    sd = ((positives + negatives + 1) / (12 * positives * negatives)) ** 0.5
    return 0.5 + CHANCE_MARGIN_SDS * sd


def candidate_models():
    return {
        "logistic regression": LogisticRegression(max_iter=2000, class_weight="balanced"),
        "random forest": RandomForestClassifier(
            n_estimators=300, min_samples_leaf=3, class_weight="balanced", random_state=42,
        ),
    }


def senior_and_companion(p1, p2):
    if p1.get("userType") == "companion" or p2.get("userType") == "senior":
        return p2, p1
    return p1, p2


def load_labeled_pairs():
    """(senior, companion, label) for every accepted or rejected request.
    When the same two people have several requests, the latest one counts."""
    with db_cursor() as (conn, c):
        c.execute("""
            SELECT from_user_id, to_user_id, status
            FROM connection_requests
            WHERE status IN ('accepted', 'rejected')
            ORDER BY id
        """)
        requests = c.fetchall()
        c.execute("SELECT id, profile FROM candidates")
        profiles = {cid: json.loads(profile) for cid, profile in c.fetchall()}

    latest = {}
    for from_id, to_id, status in requests:
        latest[frozenset((from_id, to_id))] = (from_id, to_id, status)

    pairs = []
    for from_id, to_id, status in latest.values():
        p1, p2 = profiles.get(from_id), profiles.get(to_id)
        if not p1 or not p2:
            continue
        senior, companion = senior_and_companion(preprocess_profile(p1), preprocess_profile(p2))
        pairs.append((senior, companion, 1 if status == "accepted" else 0))
    return pairs


def build_dataset(pairs):
    """Feature table, labels and rule scores for (senior, companion, label) pairs."""
    X = pd.DataFrame([model_features(s, c) for s, c, _ in pairs], columns=ML_FEATURES)
    y = np.array([label for _, _, label in pairs])
    rule = np.array([compute_rule_score(s, c) for s, c, _ in pairs])
    return X, y, rule


def out_of_fold_probabilities(model, X, y):
    """A match probability for every pair, each from a model trained
    without that pair."""
    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=0)
    pipeline = make_pipeline(StandardScaler(), model)
    return cross_val_predict(pipeline, X, y, cv=cv, method="predict_proba")[:, 1]


def train_and_select(pairs):
    """Returns (summary, model, scaler). model and scaler are None when no
    model should be used."""
    positives = sum(label for _, _, label in pairs)
    summary = {
        "labeled_pairs": len(pairs),
        "accepted": positives,
        "rejected": len(pairs) - positives,
        "model_active": False,
    }
    if len(pairs) < MIN_PAIRS or min(positives, len(pairs) - positives) < MIN_PER_CLASS:
        summary["reason"] = (
            f"not enough outcomes yet (need {MIN_PAIRS} accepted or rejected "
            f"pairs with at least {MIN_PER_CLASS} of each)"
        )
        return summary, None, None

    X, y, rule = build_dataset(pairs)
    summary["rule_auc"] = round(float(roc_auc_score(y, rule)), 3)
    summary["chance_bar"] = round(chance_auc_bar(positives, len(pairs) - positives), 3)

    results = {}
    for name, model in candidate_models().items():
        prob = out_of_fold_probabilities(model, X, y)
        results[name] = {
            "model_auc": round(float(roc_auc_score(y, prob)), 3),
            "blend_auc": round(float(roc_auc_score(y, blend_scores(rule, prob * 100))), 3),
        }
    summary["candidates"] = results

    best = max(results, key=lambda name: results[name]["blend_auc"])
    # Both the model and the blend the app would show must clear the bar.
    if min(results[best]["model_auc"], results[best]["blend_auc"]) < summary["chance_bar"]:
        summary["reason"] = f"best model ({best}) isn't clearly better than chance"
        return summary, None, None
    if results[best]["blend_auc"] < summary["rule_auc"] + MIN_AUC_GAIN:
        summary["reason"] = f"best blend ({best}) doesn't beat the rule score alone"
        return summary, None, None

    scaler = StandardScaler().fit(X)
    model = candidate_models()[best].fit(scaler.transform(X), y)
    summary.update(model_active=True, model=best)
    return summary, model, scaler


def retrain_model():
    summary, model, scaler = train_and_select(load_labeled_pairs())
    if model is None:
        # Leave nothing behind for load_model() to pick up.
        for path in (MODEL_PATH, SCALER_PATH):
            if os.path.exists(path):
                os.remove(path)
    else:
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(model, f)
        with open(SCALER_PATH, "wb") as f:
            pickle.dump(scaler, f)
    summary["status"] = "success"
    return summary
