# NEUSTGLE - Setup Guide (beginner friendly)

"Meet Someone New. Stay Anonymous."  No login. No account. No real names.

## 1. What you need
- XAMPP with **PHP 8.1+** (cURL must be enabled: in `php.ini` make sure `extension=curl` has no `;` in front, then restart Apache)
- **Node.js 18+** (only to build the React part)
- A free **Supabase** account

## 2. Where the files go
Copy the whole `neustgle` folder to `C:\xampp\htdocs\neustgle`

```
neustgle/
├── .env.example            -> copy to ".env" and fill it in (step 4)
├── .htaccess               blocks access to .env, config, database, react
├── index.php               the chat page (opens immediately, no login)
├── SETUP.md
├── config/
│   ├── supabase.php        Supabase connection + helper functions
│   └── session.php         anonymous temporary sessions (token hash, JWT, rate limit)
├── api/                    PHP endpoints (the 4 buttons + messages)
│   ├── create_session.php  find_stranger.php  next_stranger.php  stop_chat.php
│   └── send_message.php    get_messages.php   report_stranger.php
├── react/                  React source code (needs a build, step 5)
│   ├── package.json  vite.config.js
│   └── src/ main.jsx  App.jsx  components/  services/
├── assets/
│   ├── css/style.css       all styling
│   ├── js/neustgle.js      CREATED by "npm run build"
│   └── images/logo.svg
└── database/
    ├── schema.sql  functions.sql  policies.sql
```

## 3. Configure Supabase
1. Go to https://supabase.com, create a project (free plan is fine).
2. Open **SQL Editor > New query**. Paste and **Run**, in this order:
   1. `database/schema.sql`
   2. `database/functions.sql`
   3. `database/policies.sql`
   (policies.sql also switches on Realtime for the 3 chat tables.)
3. Collect your keys:
   - **Project Settings > API**: *Project URL*.
   - **Project Settings > API Keys > Legacy API keys**: the `anon` key and the `service_role` key.
   - **Project Settings > JWT Keys > Legacy JWT Secret**.
4. Do NOT enable email login or create Supabase users. NEUSTGLE does not use them.

## 4. Create the .env file
Copy `.env.example` to `.env` (same folder) and paste the 4 values.
The `service_role` key and JWT secret are SECRET: they stay in `.env` (PHP only). Never put them in React.

## 5. Build the React app
```
cd C:\xampp\htdocs\neustgle\react
npm install
npm run build
```
This creates `assets/js/neustgle.js`. Run `npm run build` again after every change to a `.jsx` file.

## 6. Run it
1. Start Apache in XAMPP.
2. Open http://localhost/neustgle/
3. To test, open it in **two different browsers** (or one normal + one private window). Each browser is one anonymous stranger, because the session lives in a cookie.
4. Press **Find a Stranger** in both. They connect and can chat in real time.

## 7. How it works
- Visit -> PHP creates a random token (cookie, HttpOnly). The database stores only its SHA-256 hash.
- PHP also gives the browser a 1-hour signed token that can ONLY read that session's own room and messages (Row Level Security).
- Every write (match, send, stop, report) goes through PHP -> secure database functions. The browser cannot write to the database.
- Matching uses one database lock, so nobody is matched twice and nobody matches themselves.
- Closed tabs are detected (beacon + 90 second inactivity cleanup) and the other stranger is notified.
- Reporting saves the report, blocks the pair from matching again, and ends the chat.

## 8. Test checklist
- [ ] Both users see "Stranger" only (never any ID)
- [ ] Find a Stranger -> "Looking for a stranger..." -> "Stranger connected!"
- [ ] Messages appear instantly, timestamps shown, typing indicator works
- [ ] Next / Skip: the other side sees "Stranger has disconnected." and you search again
- [ ] Stop (while searching) cancels; Stop (while chatting) ends it; no automatic new search
- [ ] Report: pick a reason -> chat ends -> the two are never matched again
- [ ] Close one tab -> the other side is notified within ~90 seconds
- [ ] Phone view: all four buttons visible at the bottom

## 9. Troubleshooting
- **"Server is not configured"**: `.env` is missing or a value is empty.
- **Blank page**: you have not run `npm run build` yet (no `assets/js/neustgle.js`).
- **Connects but messages are not instant**: check that policies.sql ran fully (Database > Publications > supabase_realtime must list chat_rooms, chat_participants, messages). Messages still arrive within ~5 seconds through the backup polling.
- **HTTP 500 on api calls**: open `C:\xampp\apache\logs\error.log`.
- **Realtime blocked / CSP error**: `index.php` allows only your Supabase project host; check `SUPABASE_URL`.

## 10. Moderation (Phase 8)
Review reports in Supabase **Table Editor > reports**, or run:
```sql
select created_at, reason, description, reported_session_id, status
from reports where status = 'pending' order by created_at desc;
```
After reviewing: `update reports set status = 'reviewed' where id = '<report id>';`

## 11. Going live
- Use HTTPS and set `APP_ENV=production` in `.env` (secure cookies + HSTS).
- Never commit `.env` to Git.
- Optional: Supabase **Database > Cron** (pg_cron) job running `select cleanup_expired();` every 10 minutes.
