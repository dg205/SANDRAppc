# SANDRAppc

SANDRAppc matches older adults ("seniors") with younger companions. Each person
answers a short survey, mostly by voice. The app then ranks people on the other
side by how well they fit, and two people who connect can chat and plan a
meetup.

**Try it in a browser:** https://sandrapp-web.onrender.com

- **Frontend:** React Native app built with Expo (Expo Router, NativeWind, TypeScript)
- **Backend:** Flask API with a rule-based + machine-learning match score
- **Services:** Supabase (Postgres, Auth, file storage), Groq (speech-to-text and profile extraction), Render (backend hosting)

---

## How it works

1. **Sign up / log in.** Accounts use Supabase Auth. The app sends the user's access token with every backend request.
2. **Voice survey.** The user picks Senior or Companion, enters their age, and answers six spoken questions (bio, hobbies, how they like to meet, values, what they can teach, what they need help with). Each recording is transcribed with Groq Whisper.
3. **Profile extraction.** A Groq language model reads the transcripts and fills in the structured fields the matcher compares (interests, values, help needed or offered, availability, ...). If that call fails, a keyword-based fallback is used.
4. **Profile summary.** The user sees what the app understood and can edit it.
5. **Matches.** The backend scores everyone on the opposite side and returns the top 10, with at most two people from the same city near the top.
6. **Connect.** A user sends a connect request; the other person accepts or declines it.
7. **Chat and meetup.** Accepted connections get a chat (polled every 5 seconds) and a meetup card where one person proposes a time and both confirm it.
8. **Safety.** Users can block, report or remove a connection, upload a profile photo, and delete their account.

---

## Running locally

### Backend

> Requires Python 3.11

```bash
cd backend
python -m venv venv

# Mac/Linux
source venv/bin/activate
# Windows
venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env    # then fill in your values
python app.py
```

The API runs at **http://localhost:5000**. On startup it creates any missing
database tables and retrains the model, which rewrites `scaler.pkl` and
`trained_model.pkl`. Discard those changes unless you mean to commit a new
model.

### Frontend

> Requires Node.js 18+

```bash
cd frontend
npm install
cp .env.example .env    # then fill in your values
npx expo start
```

Then press `w` to open it in a web browser. The app uses native modules
(speech recognition, `expo-dev-client`), so on a phone or emulator it needs a
development build rather than Expo Go:

```bash
npx expo run:android
```

To test against your local backend instead of the deployed one, set
`EXPO_PUBLIC_API_URL=http://localhost:5000` (web) or set
`EXPO_PUBLIC_LAN_IP` to your computer's local IP address (phone or emulator)
and leave `EXPO_PUBLIC_API_URL` unset.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | What it's for |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres connection string. Use the Session pooler address, since the direct host is IPv6-only |
| `SUPABASE_URL` | Yes | Supabase project URL, for file storage and checking login tokens |
| `SUPABASE_SERVICE_KEY` | Yes | Service-role key, for uploading audio and photos and deleting accounts |
| `GROQ_API_KEY` | Yes | Speech-to-text and profile extraction |
| `SUPABASE_JWT_SECRET` | No | Checks login tokens with the project's JWT secret. Without it, tokens are checked against the project's public keys at `SUPABASE_URL` |
| `RETRAIN_SECRET` | No | Shared secret the daily retrain job must send. If unset, `/api/retrain` is open |
| `GROQ_EXTRACT_MODEL` | No | Groq model for profile extraction (default `openai/gpt-oss-20b`) |
| `PORT` | No | Port to listen on (default 5000; Render sets it automatically) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | No | Alternative to `DATABASE_URL` |

### Frontend (`frontend/.env`)

| Variable | What it's for |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend URL, e.g. `https://sandrappc.onrender.com` |
| `EXPO_PUBLIC_LAN_IP` | Your computer's local IP, used when `EXPO_PUBLIC_API_URL` is unset on a phone or emulator |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL, for login |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key, for login |
| `EXPO_PUBLIC_ENABLE_TEST_MODE` | Set to `1` to show test tools in non-dev builds (already on in local dev) |

---

## API overview

Routes marked 🔒 need an `Authorization: Bearer <Supabase access token>` header.

| Area | Routes |
|---|---|
| Health | `GET /health` |
| Profile | 🔒 `POST /api/users` · 🔒 `GET/PUT/DELETE /api/users/me` · 🔒 `POST/DELETE /api/users/me/photo` |
| Survey | `POST /api/transcribe` · 🔒 `POST /api/survey/save` · 🔒 `GET /api/survey/responses/<user_name>` |
| Matching | `POST /api/match` (a token is optional; with one, you're never matched with yourself or anyone you've blocked) |
| Connections | 🔒 `POST /api/connect` · 🔒 `GET /api/connect/<user_name>?direction=received\|sent\|all` · 🔒 `PUT /api/connect/<id>` · 🔒 `POST /api/connect/<id>/remove` |
| Meetups | 🔒 `GET/PUT /api/connect/<id>/meetup` · 🔒 `POST /api/connect/<id>/meetup/confirm` |
| Messages | 🔒 `POST /api/messages` · 🔒 `GET /api/messages/<connection_id>?since_id=` |
| Safety | 🔒 `GET/POST /api/blocks` · 🔒 `DELETE /api/blocks/<id or user_name>` · 🔒 `POST /api/reports` |
| Model | `POST /api/retrain` (needs the `X-Retrain-Secret` header when `RETRAIN_SECRET` is set) |

---

## Deployment

- **Web app:** Render static site at https://sandrapp-web.onrender.com, serving the Expo web build. It's built from `frontend/` with `npx expo export --platform web`, publishes `frontend/dist`, and rewrites all paths to `/index.html` so links like `/login` load directly. The `EXPO_PUBLIC_*` variables are set on the static site in Render, because they're baked into the build.
- **Backend:** Render service `sandrappc-backend` (`backend/render.yaml`), deployed from the `master` branch and run with gunicorn. It's on the free tier, so it sleeps when idle and the first request after that can take about 50 seconds.
- **Database and storage:** Supabase. Survey audio is stored in the public `survey-audio` bucket.
- **Daily retrain:** needs a `RETRAIN_SECRET` repository secret in GitHub that matches the backend's `RETRAIN_SECRET`.
- **App builds:** EAS profiles in `frontend/eas.json` (`development`, `preview` with test mode on, `production`).

---

## Project structure

```
SANDRAppc/
├── .github/workflows/        # daily model retrain
├── backend/
│   ├── app.py                # Flask API: routes, database setup, match scoring
│   ├── profile_extract.py    # turns survey transcripts into profile fields
│   ├── retrain.py            # trains the RandomForest match model
│   ├── eval_matching.py      # matcher evaluation
│   ├── eval_extract.py       # profile extraction evaluation
│   ├── trained_model.pkl     # saved model + scaler
│   └── user_match_pairs_expanded_synthetic.csv   # training data
└── frontend/
    ├── app/                  # screens (Expo Router: one file per route)
    │   ├── welcome, login, signup, home, survey, editProfile
    │   └── profile/          # survey steps, matches, requests, chat, profile summary
    ├── components/           # shared UI (recorder, avatar, meetup card, safety sheet, ...)
    └── utils/                # API client, auth, profile state, storage, speech
```
