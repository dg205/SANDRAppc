# SANDRAppc

A senior/elderly companion matching app — React Native (Expo) frontend + Flask ML backend.

---

## Project Structure

```
SANDRAppc/
├── frontend/   # React Native / Expo app
└── backend/    # Python Flask API with ML matching model
```

---

## Running the Backend

> Requires Python 3.9+

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# On Mac/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
python app.py
```

Backend runs at **http://localhost:5000**

### Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check |
| POST | `/api/match` | Get top 3 matches for a user |
| POST | `/api/users` | Add a new user profile |
| POST | `/api/feedback` | Record match feedback |

---

## Running the Frontend

> Requires Node.js 18+ and the Expo Go app on your phone (or an emulator)

```bash
cd frontend

# Install dependencies
npm install

# Start Expo
npx expo start
```

Then:
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Scan the QR code with the **Expo Go** app on your phone

---

## Notes

- The backend automatically trains the ML model from the CSV on startup — no extra setup needed.
- Make sure the backend is running before launching the frontend.
