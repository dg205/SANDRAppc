"""Compare match models against the rule-based score.

    python eval_model.py             real accepted/rejected requests (read-only)
    python eval_model.py --simulate  made-up outcomes for the sample profiles

Every number comes from cross-validation: each pair is scored by a model
that was trained without it, so the results show how a model does on
people it hasn't seen. ROC-AUC is how often a real match outranks a real
non-match (0.5 is a coin flip, 1.0 is perfect). "Blend" is what the app
would show: 70% rule score + 30% model.

The simulation invents outcomes where people care more about shared days
and the help they need than the hand-set rule weights say, plus plenty of
randomness. It shows what the check looks like when a model has something
real to learn; it says nothing about real users.

Run from backend/.
"""
import contextlib
import io
import os
import sys
import warnings

import numpy as np
from dotenv import load_dotenv
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.neural_network import MLPClassifier

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
with contextlib.redirect_stdout(io.StringIO()):
    import app as backend  # noqa: E402
import retrain  # noqa: E402

warnings.filterwarnings("ignore", category=UserWarning)


def simulated_pairs(n=300, seed=0):
    rng = np.random.default_rng(seed)
    seniors = [backend.preprocess_profile(p) for p in backend.SENIOR_PROFILES]
    companions = [backend.preprocess_profile(p) for p in backend.COMPANION_PROFILES]
    all_pairs = [(s, c) for s in seniors for c in companions]
    picked = rng.choice(len(all_pairs), size=min(n, len(all_pairs)), replace=False)
    pairs = []
    for i in picked:
        s, c = all_pairs[i]
        f = backend.model_features(s, c)
        appeal = (3 * f["availability_share"] + 3 * f["help_share"] + 1.5 * f["location_share"]
                  + 0.5 * f["interests_share"] + rng.normal(0, 0.8))
        pairs.append((s, c, appeal))
    cutoff = np.median([a for _, _, a in pairs])
    return [(s, c, int(a > cutoff)) for s, c, a in pairs]


def main():
    simulate = "--simulate" in sys.argv
    pairs = simulated_pairs() if simulate else retrain.load_labeled_pairs()
    positives = sum(label for _, _, label in pairs)
    print(f"{'Simulated' if simulate else 'Real'} outcomes: {len(pairs)} pairs, "
          f"{positives} accepted, {len(pairs) - positives} rejected")
    if len(pairs) < retrain.MIN_PAIRS or min(positives, len(pairs) - positives) < retrain.MIN_PER_CLASS:
        print(f"Not enough to evaluate: need {retrain.MIN_PAIRS} pairs with at least "
              f"{retrain.MIN_PER_CLASS} of each. The app uses rule-based scoring until then.")
        print("Try: python eval_model.py --simulate")
        return

    X, y, rule = retrain.build_dataset(pairs)
    print(f"\n{'':24s}{'model alone':>12s}{'blend':>8s}   ROC-AUC")
    print(f"{'rule score (no model)':24s}{'':>12s}{roc_auc_score(y, rule):8.3f}")
    models = dict(retrain.candidate_models())
    models["gradient boosting"] = HistGradientBoostingClassifier(random_state=0)
    models["MLP neural net"] = MLPClassifier((16,), max_iter=3000, alpha=1e-2, random_state=0)
    for name, model in models.items():
        prob = retrain.out_of_fold_probabilities(model, X, y)
        blend = backend.blend_scores(rule, prob * 100)
        print(f"{name:24s}{roc_auc_score(y, prob):12.3f}{roc_auc_score(y, blend):8.3f}")

    summary, model, _ = retrain.train_and_select(pairs)
    if summary["model_active"]:
        print(f"\nretrain.py would keep: {summary['model']}")
        if summary["model"] == "logistic regression":
            print("What it learned (per standard deviation of each feature; + means more likely a match):")
            for feat, w in sorted(zip(backend.ML_FEATURES, model.coef_[0]), key=lambda t: -abs(t[1])):
                print(f"  {feat:24s}{w:+.2f}")
    else:
        print(f"\nretrain.py would keep no model: {summary['reason']}")


if __name__ == "__main__":
    main()
