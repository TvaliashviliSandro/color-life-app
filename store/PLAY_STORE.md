# Getting Color Life onto Google Play

Everything code-side is ready: real rewarded ads, Google Play Billing for coin packs, a signed `.aab` build,
a privacy policy, and listing graphics. What's left are accounts and settings only you can create.
Do the steps in order; each one unlocks the next.

---

## 1. Google Play developer account (one-off $25)

1. Go to <https://play.google.com/console/signup> and sign in with the Google account that should own the app.
2. Choose **Personal** (just you) or **Organization** (needs a D-U-N-S number for a company).
3. Pay the $25 fee and complete identity verification (ID photo; can take a few days).

> **New personal accounts must run a closed test first:** at least **12 testers** opted in for **14 days in a row**
> before you can apply for production. Start gathering testers (friends' Gmail addresses) now. See step 7.

## 2. Create your private upload key (on your computer, ~2 minutes)

The Play Store bundle must be signed with a key only you hold. Google keeps the real app-signing key
("Play App Signing"); yours is the *upload* key, and Google can reset it if you ever lose it.

You need Java installed (`keytool` comes with it). In a terminal:

```bash
keytool -genkeypair -v -keystore upload.keystore -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a password (remember it) and your name/country (any values are fine).
Then turn the file into text for GitHub:

```bash
# macOS
base64 -i upload.keystore | pbcopy        # now on your clipboard
# Linux
base64 -w0 upload.keystore
# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.keystore")) | Set-Clipboard
```

Keep `upload.keystore` and its password somewhere safe (a password manager). **Never commit it and never paste it in a chat.**

## 3. Add the key to GitHub secrets

GitHub → **color-life-app → Settings → Secrets and variables → Actions → Secrets → New repository secret**:

| Name | Value |
|---|---|
| `UPLOAD_KEYSTORE_BASE64` | the base64 text from step 2 |
| `UPLOAD_KEYSTORE_PASSWORD` | the keystore password |
| `UPLOAD_KEY_ALIAS` | `upload` |
| `UPLOAD_KEY_PASSWORD` | the same password (unless you chose a different key password) |

Then **Actions → Build app → Run workflow**. When it finishes, the run page has an artifact
**ColorLife-play-bundle** containing `ColorLife-play.aab`. That's the file you upload to Play.

## 4. Create the app in Play Console

1. **Create app** → name `Color Life: Predict the Step`, language English, **Game**, **Free**, accept the declarations.
2. **Testing → Internal testing → Create new release**, accept Play App Signing, upload `ColorLife-play.aab`.
   (Internal testing is instant and needs no review. Use it to try real purchases on your own phone.)
3. Package name will be `io.github.tvaliashvilisandro.colorlife`. It's permanent, and players never see it.

## 5. Coin packs (in-app products)

After the first upload (Play only allows products once a build with billing is uploaded):
**Monetize → Products → In-app products → Create product**, four times:

| Product ID (exact) | Name | Price |
|---|---|---|
| `coins_500` | 500 coins | $0.99 |
| `coins_1200` | 1,200 coins | $1.99 |
| `coins_3000` | 3,000 coins | $4.99 |
| `coins_7000` | 7,000 coins | $9.99 |

Activate each. Play converts prices to local currencies; the app shows Play's prices automatically.
To buy without being charged while testing: **Settings → License testing**, add your Gmail address.
You also need a **payments profile** (Console → Settings → Payments profile) to sell anything.

## 6. Real ads (AdMob)

Until you do this the app shows Google's **test ads**, which is safe and expected.

1. Sign up at <https://admob.google.com> with the same Google account.
2. **Apps → Add app → Android → "Is it listed on a supported store?" → No** (link it to Play later, once it's live).
3. Copy the **App ID** (`ca-app-pub-XXXXXXXX~YYYYYYYY`).
   GitHub → **Settings → Secrets and variables → Actions → Variables → New variable**: `ADMOB_APP_ID` = that ID.
4. **Ad units → Add → Rewarded**, name it "Continue", reward 1 "heart". Copy the unit ID
   (`ca-app-pub-XXXXXXXX/ZZZZZZZZ`).
5. Edit `www/js/config.js`: put the unit ID in `rewardedAdUnit` and set `testAds: false`. Commit and push.
6. **Privacy & messaging → GDPR → Create message** (the consent popup for EU/UK players). Publish it.

Don't tap your own real ads; AdMob can suspend accounts for that. Use the test ads, or add your phone as a test device in AdMob.

## 7. Closed test (12 testers, 14 days)

**Testing → Closed testing → Create track** → upload the same `.aab` → **Testers**: create an email list with
at least 12 Gmail addresses → copy the opt-in link and send it to them. Each tester opens the link, taps
**Become a tester**, then installs from Play. The 14 days start once 12 people have opted in; they should keep it installed.

## 8. App content (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | `https://tvaliashvilisandro.github.io/color-life-app/privacy.html` |
| Ads | **Yes, my app contains ads** |
| App access | All functionality available without special access |
| Content rating | Fill in the IARC questionnaire: puzzle game, no violence, no user chat, **in-app purchases: yes**. Expect "Everyone / PEGI 3". |
| Target audience | **13 and over** (choosing under-13 brings Google's Families policy, which needs extra ad settings) |
| Advertising ID | **Yes**, used for **Advertising or marketing** (the AdMob SDK uses it) |
| Government / financial / health apps | No |

**Data safety** (from Google's AdMob guidance; the app itself sends nothing to any server of yours):

- Does the app collect or share user data? **Yes** (through the AdMob SDK)
- Is data encrypted in transit? **Yes** · Can users request deletion? **No** (nothing is stored by you; say data is not linked to an account)
- Data types, all **collected and shared**, **not** required (ads are optional), purposes **Advertising or marketing, Analytics, Fraud prevention**:
  - **Location → Approximate location** (from IP address)
  - **App activity → App interactions**
  - **App info and performance → Diagnostics**
  - **Device or other IDs**

Game progress is stored only on the phone, so it isn't "collected". Payments are handled by Google Play and
don't need declaring.

## 9. Store listing

Copy text from [`listing.md`](listing.md); upload `icon-512.png`, `feature-graphic.png` and the six
`screenshots/`. You'll also need a public contact email (Play shows it on the listing).

## 10. Production

After the 14-day closed test: **Dashboard → Apply for production**, answer the short questionnaire about the test,
then create a production release with the latest `.aab`. Review usually takes a few days.
Every later push to `main` builds a new `.aab` with a higher version number; upload it as a new release to update.

---

### What's already done in the code

- `www/js/monetize.js`: AdMob rewarded ads (with the consent form) and Google Play Billing; each purchase is granted
  once and then consumed so packs can be bought again.
- The Android app starts at 0 coins, hides the "Playtest build" label and the placeholder leaderboard.
  The web/iPhone version keeps its labelled test mocks.
- `android/app/build.gradle`: AdMob App ID from `ADMOB_APP_ID`; Play bundle signed with your upload key.
- `.github/workflows/build.yml`: builds `ColorLife-play.aab` whenever the upload-key secrets exist.
- `www/privacy.html`: privacy policy (also linked at the bottom of the Shop).
