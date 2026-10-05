# LeetCode Log

A small website for logging the LeetCode problems you've solved. Type a problem
number and the title, difficulty and link fill in automatically. Add the type of
question (as many tags as you like), write notes in the description box, flag
problems you want to revisit, and click **Save**.

- **Website:** plain HTML/CSS/JS in [`docs/`](docs), hosted free on GitHub Pages. No build step.
- **Database:** [Supabase](https://supabase.com) (hosted Postgres, free plan). Only you can sign in,
  and Row Level Security means nobody else can read or change your entries.

## Using it

| You want to… | Do this |
| --- | --- |
| Add a problem | Type the number → **Enter** → type a tag → **Enter** (repeat) → **Enter** on an empty tag box jumps to the description → **Save** (or **Ctrl + Enter**) |
| Add a tag LeetCode uses for that problem | Click a `+ Tag` chip under the Type box |
| Remove a tag | Click its **×**, or press **Backspace** in the empty tag box |
| Edit or delete | Use the buttons on the entry (**Esc** cancels an edit) |
| Mark for review | Tick **Needs review** in the form, or click the flag on any entry |
| Find something | Search box (number, title, notes, tags), or filter by type, difficulty or review; click a tag on an entry to filter by it |
| Open the problem on LeetCode | Click its title |

## One-time setup (about 10 minutes)

Until step 3 is done, the site runs in **demo mode** and only saves to your current browser.

### 1. Create the database

1. Sign up at [supabase.com](https://supabase.com) and click **New project** (the free plan is fine).
   Pick any name and region and save the database password somewhere. You won't need it for this app.
2. When the project is ready, open **SQL Editor**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. You should see "Success. No rows returned".

### 2. Create your login

1. Go to **Authentication → Users → Add user → Create new user**. Enter your email and a password,
   and tick **Auto Confirm User**.
2. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up",
   so you stay the only account.

### 3. Connect the website to the database

1. In Supabase, click **Connect** at the top of the project (or open **Project Settings → API Keys**).
   Copy the **Project URL** and the **anon / publishable** key.
2. Paste them into [`docs/config.js`](docs/config.js). You can do this right on GitHub with the ✏️ edit button:
   ```js
   export const SUPABASE_URL = "https://abcdefgh.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...";   // or sb_publishable_...
   ```
   Both values are designed to be public. Your data is protected by your login and the database rules
   in `schema.sql`. **Never** put the `service_role` / secret key here.

### 4. Put it online with GitHub Pages

1. Make sure these files are on the `main` branch.
2. In this repo on GitHub, go to **Settings → Pages**. Under *Build and deployment*, choose
   **Deploy from a branch**, then branch **main** and folder **/docs**, and click **Save**.
3. After a minute the site is live at **https://neilluong.github.io/Sandbox/**. Sign in with the
   account from step 2.

Every push to `main` that changes `docs/` redeploys the site automatically.

## Good to know

- **Free Supabase projects pause after about a week with no activity.** Your data is kept. If the site
  can't load your problems, open the Supabase dashboard and click **Restore project**.
- **Backups:** in Supabase, open **Table Editor → problems → Export → CSV** at any time.
- **Run it locally:** `python3 -m http.server -d docs 8000` and open http://localhost:8000.
  It needs a local server because opening `index.html` directly from disk won't load the JavaScript modules.
- **Refresh the problem list** (for newly released problems): `node scripts/update-problems.mjs`,
  then commit `docs/problems.json`. The list comes from [doocs/leetcode](https://github.com/doocs/leetcode),
  because LeetCode doesn't allow scripts to download it directly. Problems that aren't in the list can
  still be added by typing the title yourself.

## Project layout

```
docs/                     the website (GitHub Pages serves this folder)
  index.html              page structure
  styles.css              styling (light and dark mode)
  app.js                  form, list, filters, auto-fill
  db.js                   saving to Supabase, or the browser in demo mode
  config.js               your Supabase URL and key
  problems.json           number → title, difficulty, LeetCode tags
supabase/schema.sql       database table and security rules
scripts/update-problems.mjs  rebuilds docs/problems.json
```
