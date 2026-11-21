# Deploy guide (about 20 minutes, all free)

You need: your GitHub account, your Vercel account (signed in with GitHub), your FMP API key and your FRED API key.

---

## 1. Put the code on GitHub

1. Unzip `ls-dashboard.zip` on your computer. You'll get a folder called `ls-dashboard`.
2. Go to **github.com** → click **+** (top right) → **New repository**.
3. Name it `ls-dashboard`, choose **Private**, leave every checkbox unticked, click **Create repository**.
4. On the empty repo page, click the link **uploading an existing file**.
5. Open the unzipped `ls-dashboard` folder, select **everything inside it** (the `api`, `lib`, `data`, `public`, `tests`, `dev` folders and the files), and drag them into the browser.
   - Drag the *contents*, not the `ls-dashboard` folder itself, so that `api/` sits at the top of the repo.
   - If your computer hides `.gitignore` / `.vercelignore`, that's fine - they're optional.
6. Wait for the uploads to finish, then click **Commit changes**.

Check: the repo's front page should list `api`, `data`, `lib`, `public`, `package.json`, `vercel.json` at the top level.

## 2. Create the Vercel project (with your keys)

1. Go to **vercel.com** → **Add New…** → **Project**.
2. Under *Import Git Repository*, find `ls-dashboard` and click **Import**.
   - Don't see it? Click **Adjust GitHub App Permissions**, give Vercel access to the `ls-dashboard` repo, and come back.
3. On the configure screen:
   - **Framework Preset:** Other
   - **Root Directory:** leave as `./`
   - **Build and Output Settings:** leave as they are (`vercel.json` handles it)
4. Open **Environment Variables** on the same screen and add three (Key → Value):

   | Key | Value |
   |---|---|
   | `FMP_API_KEY` | your FMP key |
   | `FRED_API_KEY` | your FRED key |
   | `DASHBOARD_PASSCODE` | a passcode you choose (you'll type it on your phone once) |

5. Click **Deploy**. After ~30 seconds you'll get a URL like `https://ls-dashboard-xxxx.vercel.app`.

## 3. Turn on sync between phone and laptop (Redis)

1. In your Vercel project, open the **Storage** tab → **Create Database**.
2. Choose **Upstash** → **Upstash for Redis** (or "Redis" under Marketplace) → **Continue**.
3. Pick the **Free** plan, any region close to Singapore if offered (e.g. `ap-southeast-1`), name it `ls-dashboard`, **Create**.
4. When asked, **Connect** it to the `ls-dashboard` project for all environments. Vercel adds the connection settings automatically - nothing to paste.
5. Go to **Deployments** → click **⋯** on the latest one → **Redeploy**. (New settings only apply after a redeploy.)

Without this step the app still works, but your L/S flags and theses are saved separately on each device, and you'll see a small "Not syncing" badge.

## 4. Check everything works

1. Open your URL, enter your passcode.
2. Tap **⋯** (top right) → **Run check** under *Status*. You want four green dots:
   - **yahoo** - prices, indices, FX
   - **fred** - Treasury yields, real yields, credit spreads
   - **fmp** - US fundamentals
   - **redis** - sync
3. Tap **Update** under *Update fundamentals* once. It uses ~90 of your 250 free daily FMP calls and pulls fresh EBITDA, FCF, net debt, shares, forward EPS and earnings dates for the US names. It skips anything updated in the last 20 hours, so tapping it again the same day costs nothing.

If a dot is red, the message next to it says why (e.g. `Access denied (401)` = key typo; fix it in **Settings → Environment Variables**, then redeploy).

## 5. Put it on your phone's home screen

- **iPhone (Safari):** open the URL → Share button → **Add to Home Screen**.
- **Android (Chrome):** open the URL → ⋮ menu → **Add to Home screen** / **Install app**.

It opens full-screen like an app. It refreshes automatically when you open it after 10+ minutes away, or tap **Refresh**.

---

## Changing things later

- **Passcode / keys:** Vercel → project → **Settings → Environment Variables** → edit → Redeploy.
- **Short interest, beta, non-US fundamentals:** edit `data/baseline.js` on GitHub (pencil icon) → Commit. Vercel redeploys by itself within a minute.
- **Default watchlist / macro instruments:** `lib/universe.js` (same way). Tickers you add in the app are stored separately and aren't affected.

## If prices stop loading

Yahoo's chart feed is unofficial. If the **yahoo** check goes red for days (often `Rate limited (429)` or `Access denied`), the fix is swapping `lib/yahoo.js` for another provider - nothing else in the app needs to change. Ask Claude to do it, and say which provider.
