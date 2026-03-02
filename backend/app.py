from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Feature list matching the ML model
FEATURES = [
    "age_diff", "same_city", "same_religion", "same_mobility",
    "interest_overlap", "tech_compatibility", "comm_style_compatibility",
    "comfort_compatibility", "food_cuisine_overlap", "dietary_restriction_conflict",
    "cultural_background_match", "holiday_overlap", "multilingual_fluency_match",
    "hobby_overlap", "spirituality_match", "life_stage_needs_alignment",
    "pref_comm_style_match", "tech_affinity_gap", "companionship_gap_overlap",
    "volunteering_help_match", "shared_memory_trigger_overlap"
]

# Initialize ML model and scaler
scaler = StandardScaler()
mlp = MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=500, random_state=42)

# Load and train model on startup
def load_and_train_model():
    global scaler, mlp
    
    # Check if CSV exists
    if os.path.exists("user_match_pairs_expanded_synthetic.csv"):
        df = pd.read_csv("user_match_pairs_expanded_synthetic.csv")
        X = df[FEATURES]
        y = df["match_label"]
        
        scaler.fit(X)
        X_scaled = scaler.transform(X)
        mlp.fit(X_scaled, y)
        print("✓ Model trained successfully from CSV")
    else:
        # Create synthetic training data if CSV doesn't exist
        print("⚠ CSV not found. Creating synthetic training data...")
        np.random.seed(42)
        n_samples = 1000
        
        X_synthetic = np.random.rand(n_samples, len(FEATURES))
        # Create labels based on simple rules
        y_synthetic = (X_synthetic[:, :8].sum(axis=1) > 4).astype(int)
        
        scaler.fit(X_synthetic)
        X_scaled = scaler.transform(X_synthetic)
        mlp.fit(X_scaled, y_synthetic)
        print("✓ Model trained on synthetic data")

# Train model on startup
load_and_train_model()

def extract_features_from_profile(profile):
    """Extract numerical features from user profile"""
    return {
        'age': profile.get('age', 50),
        'city': profile.get('location', '').lower(),
        'religion': profile.get('faith', '').lower(),
        'interests': set(profile.get('interests', [])),
        'languages': set(profile.get('languages', [])),
        'cultural_background': profile.get('culturalBackground', '').lower(),
        'values': set(profile.get('values', [])),
        'food_preferences': set(profile.get('favoriteFood', [])),
        'help_needs': set(profile.get('helpWith', [])),
        'talk_preferences': set(profile.get('talkPreferences', [])),
        'connection_goals': set(profile.get('connectionGoals', [])),
        'family_situation': profile.get('familySituation', '').lower(),
        'available_days': set(profile.get('availableDays', []))
    }

def compute_feature_vector(user1, user2):
    """Compute feature vector for a pair of users"""
    u1 = extract_features_from_profile(user1)
    u2 = extract_features_from_profile(user2)
    
    # Calculate all features
    age_diff = abs(u1['age'] - u2['age'])
    same_city = int(u1['city'] == u2['city'])
    same_religion = int(u1['religion'] == u2['religion'])
    same_mobility = 1  # Default to compatible
    
    interest_overlap = len(u1['interests'] & u2['interests'])
    tech_compatibility = 1  # Simplified
    comm_style_compatibility = len(u1['talk_preferences'] & u2['talk_preferences']) > 0
    comfort_compatibility = 1  # Default compatible
    
    food_overlap = len(u1['food_preferences'] & u2['food_preferences'])
    dietary_conflict = 0  # Simplified
    cultural_match = int(u1['cultural_background'] == u2['cultural_background'])
    holiday_overlap = int(same_religion)  # Simplified
    multilingual_match = len(u1['languages'] & u2['languages']) > 0
    
    hobby_overlap = interest_overlap
    spirituality_match = int(same_religion)
    life_stage_alignment = int(age_diff < 20)
    comm_style_match = int(comm_style_compatibility)
    tech_gap = int(age_diff > 30)
    
    companionship_overlap = len(u1['connection_goals'] & u2['connection_goals']) > 0
    help_match = len(u1['help_needs'] & u2['help_needs']) > 0
    memory_overlap = int(cultural_match or same_religion)
    
    return [
        age_diff, same_city, same_religion, same_mobility,
        interest_overlap, tech_compatibility, comm_style_compatibility,
        comfort_compatibility, food_overlap, dietary_conflict,
        cultural_match, holiday_overlap, multilingual_match,
        hobby_overlap, spirituality_match, life_stage_alignment,
        comm_style_match, tech_gap, companionship_overlap,
        help_match, memory_overlap
    ]

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'model': 'loaded'}), 200

@app.route('/api/match', methods=['POST'])
def calculate_matches():
    """Calculate compatibility scores for a user against all candidates"""
    try:
        data = request.json
        target_user = data.get('targetUser')
        candidates = data.get('candidates', [])
        
        if not target_user or not candidates:
            return jsonify({'error': 'Missing targetUser or candidates'}), 400
        
        # Calculate match scores for all candidates
        matches = []
        for candidate in candidates:
            # Compute feature vector
            features = compute_feature_vector(target_user, candidate)
            
            # Scale and predict
            features_scaled = scaler.transform([features])
            match_prob = mlp.predict_proba(features_scaled)[0][1]
            match_score = round(match_prob * 100, 1)
            
            matches.append({
                'candidate': candidate,
                'score': match_score,
                'features': {
                    'age_diff': features[0],
                    'same_city': features[1],
                    'interest_overlap': features[4],
                    'cultural_match': features[10]
                }
            })
        
        # Sort by score descending
        matches.sort(key=lambda x: x['score'], reverse=True)
        
        return jsonify({
            'matches': matches[:3],  # Return top 3
            'total_candidates': len(candidates)
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/feedback', methods=['POST'])
def record_feedback():
    """Record user feedback to improve model (placeholder for now)"""
    try:
        data = request.json
        user_id = data.get('userId')
        match_id = data.get('matchId')
        is_positive = data.get('isPositive')
        
        # TODO: Store feedback in database and retrain model periodically
        print(f"Feedback received: User {user_id} -> Match {match_id}: {'👍' if is_positive else '👎'}")
        
        return jsonify({'status': 'recorded'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['POST'])
def add_user():
    """Add a new user profile"""
    try:
        user_data = request.json
        # TODO: Store in database
        print(f"New user added: {user_data.get('name')}")
        
        return jsonify({
            'status': 'success',
            'userId': len(user_data)  # Mock ID
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("\n" + "="*50)
    print("🚀 Community Connection ML Backend")
    print("="*50)
    print("Backend running on http://localhost:5000")
    print("Endpoints:")
    print("  GET  /health              - Health check")
    print("  POST /api/match           - Calculate matches")
    print("  POST /api/feedback        - Record feedback")
    print("  POST /api/users           - Add new user")
    print("="*50 + "\n")
    
    app.run(host ="0.0.0.0", debug=True, port=5000)