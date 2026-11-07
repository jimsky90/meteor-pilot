# Meteor Pilot: launch plan for Google Play and the App Store

Prepared November 7, 2026. Written for a non-technical owner: every step says who does it and what it costs. Links go to official documentation where it exists. Where I used other sources, the link says so.

**Legend:** 👤 = James does it (accounts, payments, legal, decisions). 🤖 = Claude can do it (code, files, text, images). ⚠ = check this yourself, or a decision is needed.

---

## At a glance

| | Google Play (do first) | Apple App Store (second) |
|---|---|---|
| Account cost | **US$25, once** | **US$99 per year** |
| How the game is packaged | Trusted Web Activity (TWA): a thin Android app that opens your live web game full screen in Chrome | Capacitor: a real iOS app with the game files inside it |
| Computer needed | Any computer. PWABuilder runs in the browser. | A Mac with Xcode 26, **or** a cloud build service |
| Biggest hurdle | 12 testers in a closed test for 14 days in a row (new personal accounts) | Guideline 4.2 "minimum functionality" review risk |
| Realistic time to go live | **3 to 5 weeks** | **3 to 6 weeks** (can run alongside Google) |
| Other costs | $0 (optional domain about $10–20/year) | $0 with Codemagic's free tier, or rent or buy a Mac |

---

## Step 0. Decisions and fixes before building anything

These affect both stores. Settle them first, because some are hard to change later.

1. 👤⚠ **Choose the game's permanent web address (origin).** The Android app is tied to one web address, and players' saved progress (local storage) belongs to that address. If you change the address later, web players lose their progress. Options are in part A, step A2. The recommended choice is to keep `jimsky90.github.io` and add a small second repository for the verification file.
2. 👤⚠ **Choose the app ID (package name / bundle ID).** It can never be changed after the first upload. Recommended: `io.github.jimsky90.meteorpilot` on both stores. (If you'd rather put it under a company name, use something like `com.yourcompany.meteorpilot`.)
3. 🤖 **Fixes to the game before submitting** (Claude can make all of these; you approve):
   - Hide the Shop's **Store** tab (the paid items with "test checkout") in store builds until real payments are on. Both stores require their own payment system for digital items, and Apple rejects test or demo features (Guideline 2.1, app completeness). The coins shop stays.
   - **Bundle the two fonts** inside the app instead of loading them from Google. This makes "no data collected" plainly true, and the game works offline from the first launch. See `AGE-RATING-AND-FORMS.md`.
   - Fix the audit's high-priority bugs, especially "Fly through 6 gates" (impossible), the sideways scroll at 360px, and the streak chip. Reviewers and early testers will notice them.
   - Remove the leftover crypto and wallet code and CSS (audit bug 9).
   - Decide the **Supporter Pass +25% XP** question (part C).
   - Add a **"Privacy" link** in Settings that opens `privacy.html`.
4. 🤖 **Put `privacy.html` online.** It's already written at the repo root. When you push it, it goes live at `https://jimsky90.github.io/meteor-pilot/privacy.html`. Fill in `[your contact email]` first.
5. 👤 **Make a contact email** for the game, for example a new Gmail. Both stores show it publicly.

---

## Part A. Google Play first (Trusted Web Activity)

### Why a TWA
A TWA is a tiny Android app that opens your PWA in Chrome, full screen with no browser bar. When you update `index.html` on GitHub, Play players get the update too, without a new store upload. Google built this for PWAs and accepts it on Play. You can create one with **PWABuilder** (a website, nothing to install) or **Bubblewrap** (Google's command-line tool). ([Chrome: TWA quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start), [web.dev: Using a PWA in your Android app](https://web.dev/articles/using-a-pwa-in-your-android-app))

### A1. Create the Google Play developer account 👤
1. Go to `play.google.com/console/signup` and sign in with the Google account that should own the game. Use a long-term account, not a throwaway.
2. Choose **Personal** account (unless you have a registered company with a D-U-N-S number).
3. Pay the **US$25 one-time fee**. Mastercard, Visa or American Express; no prepaid cards.
4. Verify your identity. Google may ask for a **government ID and a credit card in your legal name**. If the details don't match, the fee isn't refunded.
5. Install the **Play Console app** on an Android phone and verify you have access to an Android device. Personal accounts must do this before they can publish.
   - Source: [Google: Register for a developer account](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)
   - ⚠ Time: identity verification usually takes a few days, sometimes longer. Start this **first**, because everything else waits on it.
   - ⚠ If you later sell items, Google may show your **address** on the listing for monetized apps. Check this in Play Console when you set up payments.

### A2. Solve the GitHub Pages "subpath" problem ⚠
For the Android app to open full screen (no browser bar), Chrome checks a file called **`assetlinks.json`** at **`/.well-known/assetlinks.json` on the root of the domain**. Your game lives in a subfolder (`jimsky90.github.io/meteor-pilot/`), so a file in this repo would be published at `jimsky90.github.io/meteor-pilot/.well-known/...`. **That's the wrong place, and Chrome won't look there.** ([web.dev](https://web.dev/articles/using-a-pwa-in-your-android-app), [PWABuilder: Asset links](https://github.com/pwa-builder/pwabuilder-google-play/blob/main/Asset-links.md)) If verification fails, the app still works, but shows a browser address bar at the top, which looks unprofessional and invites bad reviews.

Pick one:

| Option | What you do | Cost | Pros | Cons |
|---|---|---|---|---|
| **1. Root repo on GitHub (recommended)** | Create a second public repo named exactly **`jimsky90.github.io`**. Add an empty `.nojekyll` file and `.well-known/assetlinks.json`. Turn on GitHub Pages. The file then appears at `https://jimsky90.github.io/.well-known/assetlinks.json`, and your game stays exactly where it is. | Free | Players keep their progress. Nothing else moves. About 15 minutes. | Your GitHub username stays in the app's address. ⚠ GitHub's site builder (Jekyll) skips folders starting with a dot unless `.nojekyll` is present. After pushing, open the URL in a browser and confirm the file loads ([report of this problem](https://github.com/pwa-builder/cloudapk/issues/56)). |
| **2. Custom domain** | Buy a domain such as `meteorpilot.app` or `playmeteorpilot.com` (about $10–20/year), point GitHub Pages at it, and put `assetlinks.json` at its root. | About $10–20/year | Looks professional, and the address is yours forever. | **Web players' saved progress doesn't carry over** to the new address. Do it **before** launch or never. Also needs DNS setup (Claude can walk you through it). |
| **3. Move hosting** | Host the game at the root of a Netlify or Cloudflare Pages site. | Free | Simple root hosting. | Same progress-reset problem as option 2, plus a second place to update. |

⚠ The address you choose goes into the Android package, so decide before step A3.

### A3. Build the Android package 🤖 + 👤
**Easiest path: PWABuilder (no installs)**
1. Go to `pwabuilder.com`, enter `https://jimsky90.github.io/meteor-pilot/` and press Start. It scores your manifest and service worker. Your PWA already has a name, icons, a maskable icon, a service worker and full-screen display.
2. Choose **Package for stores > Android > Generate**. In the options:
   - **Package ID:** `io.github.jimsky90.meteorpilot` (permanent; see Step 0)
   - **App name:** Meteor Pilot. **Launcher name:** Meteor Pilot
   - **Version:** 1.0.0, **version code:** 1 (raise it by 1 on every later upload)
   - **Display:** fullscreen. **Orientation:** portrait
   - **Signing key:** "Create new"
3. Download the zip. It contains the **`.aab`** file (what you upload to Play), an `.apk` (for testing on your phone), the **signing key** (`signing.keystore`), a text file with its passwords, and a starter `assetlinks.json`. ([PWABuilder: next steps](https://github.com/pwa-builder/CloudAPK/blob/master/Next-steps-unsigned.md))
4. 👤 **Back up the keystore and its password file** in two safe places, such as a password manager and a USB drive. **If you lose it, you can't update the app with the same key.** Never put it in the public GitHub repo.

**Alternative: Bubblewrap (command line, Claude can run it)**
Needs Node.js 14.15 or newer and **JDK 17**. Bubblewrap can download the Android tools itself on first run.
```
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://jimsky90.github.io/meteor-pilot/manifest.webmanifest
bubblewrap build          # makes app-release-bundle.aab and a signed .apk
bubblewrap fingerprint generateAssetLinks
```
([Bubblewrap README](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md))

⚠ **Target API level:** since **August 31, 2026**, new apps must target **Android 16 (API level 36)** ([Android: target API requirements](https://developer.android.com/google/play/requirements/target-sdk)). Use the latest PWABuilder or Bubblewrap. If Play Console rejects the upload for target API, Claude can raise `targetSdkVersion` in the generated project and rebuild.

🤖 **Store build tweak:** Claude can set the TWA's start address to `.../meteor-pilot/?src=play`, so the game knows it's the Play version and hides the Store tab and Install button there.

### A4. Create the app in Play Console 👤
1. Play Console > **Create app**. Name: `Meteor Pilot: Space Arcade` (or `Meteor Pilot`). Default language: English (US). **Game**, **Free**. Accept the declarations.
2. Fill in **Policy and programs > App content** using `AGE-RATING-AND-FORMS.md`: privacy policy, app access, ads, content rating, target audience, data safety and the rest.
3. Fill in **Grow users > Store presence > Main store listing** using `LISTING.md`.
4. Turn on **Play App Signing** (the default). Google keeps the final signing key, and your keystore becomes the "upload key".

### A5. Fix `assetlinks.json` with Google's key 🤖 + 👤
Because Google re-signs your app, the asset links file must include **Google's** key fingerprint, not only yours.
1. 👤 Play Console > your app > **Test and release > Setup > App integrity > App signing**. Copy the **SHA-256 certificate fingerprint** from the "App signing key certificate" box, and also the one from "Upload key certificate".
2. 🤖 Claude puts both into `assetlinks.json` (two entries, separated by a comma):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.github.jimsky90.meteorpilot",
    "sha256_cert_fingerprints": [
      "AA:BB:...:GOOGLE_PLAY_APP_SIGNING_KEY",
      "CC:DD:...:YOUR_UPLOAD_KEY"
    ]
  }
}]
```
3. 👤 Push it to the location chosen in A2 and open the URL in a browser to confirm it loads.
   ([PWABuilder: Asset links](https://github.com/pwa-builder/pwabuilder-google-play/blob/main/Asset-links.md))
4. Test: install the version from your closed test on your phone. **No browser bar at the top** means it worked. If the bar is still there, clear Chrome's data for the site and open the app again.

### A6. Closed test: 12 testers for 14 days 👤 (Claude can draft the messages)
New **personal** accounts (created after November 13, 2023) must run a **closed test with at least 12 testers who stay opted in for at least 14 days in a row** before they can apply for production. Testers who leave early don't count, and leaving and rejoining restarts their 14 days. ([Google Play Console Help: App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)) I checked these numbers on Google's help page in November 2026. Third-party guides updated in October 2026 report the same 12 testers and 14 days ([example](https://newly.app/how-to/google-play-twelve-testers-rule)).

1. Play Console > **Test and release > Testing > Closed testing > Create track**. Upload the `.aab`.
2. Add testers by email list or Google Group. **Recruit 15 to 20**, not 12, because some people drop out. Testers need an Android phone and a Google account.
3. Send them the opt-in link (Claude can write the invite). Ask them to **stay opted in for at least 15 days**, play a few times, and send feedback.
4. Push a small update during the test (for example, a bug fix with a new version code). Google's production form asks what you changed based on feedback.
5. On day 15 or later: Dashboard > **Apply for production**. You answer questions about the test, the game and your readiness. Claude can draft the answers from tester feedback. Google says the review usually takes **7 days or less**.
6. Once approved: **Production > Create release**, upload the `.aab` (or promote the tested one), and roll out. The first production review typically takes a few days.

⚠ Paid "tester communities" exist, but Google judges how engaged the testers were, so real players (friends, family, community, social followers) are safer.

### A7. Google Play store assets (exact specs)
From [Google Play Console Help: preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB):

| Asset | Requirement | Status |
|---|---|---|
| App icon | **512 × 512 px**, 32-bit PNG (with alpha), max 1,024 KB. No badges or "#1"-style text. | You have `icons/icon-512.png`. 🤖 Claude can check it against the spec. |
| Feature graphic | **1024 × 500 px**, JPEG or 24-bit PNG, **no transparency** | 🤖 Claude can design one. |
| Phone screenshots | **2 to 8**. JPEG or 24-bit PNG, no transparency. Each side 320–3,840 px, and the long side at most 2× the short side. | 🤖 Claude can capture these. |
| For game "large format" placement | **At least 3 portrait 9:16 screenshots, minimum 1080 × 1920**, showing real gameplay | Recommended: make 1080 × 1920 your standard size. |
| Tablet screenshots | Optional (minimum 4 if you supply them) | Skip at launch. |
| Preview video | Optional, but **highly recommended for games**. A public or unlisted YouTube link with ads turned off. Show gameplay in the first 10 seconds. The first 30 seconds autoplay. | 🤖 Claude can make a short gameplay clip, and 👤 you upload it to YouTube. |

### Google timeline (realistic)
| Week | What happens |
|---|---|
| 1 | Create the account and verify ID (👤). Game fixes and fonts (🤖). Asset-links repo (👤🤖). Build the `.aab`. Fill in forms and listing. |
| 1–2 | Upload to closed testing and recruit 15–20 testers. **The 14-day clock starts when testers opt in.** |
| 3–4 | Test runs. Ship one update from feedback. |
| 4–5 | Apply for production (about 7 days). Release. |

---

## Part B. Apple App Store

### B1. Why the PWA can't just be submitted
The App Store only accepts **app builds made with Apple's Xcode** and signed with your Apple developer certificate. A web address isn't a submission. Since **April 28, 2026**, uploads must be built with **Xcode 26 or later with the iOS 26 SDK** ([report on Apple's requirement](https://www.seasiainfotech.com/blog/apple-mandates-xcode-26-for-app-store-submissions), [Capawesome: Xcode 26 requirement](https://capawesome.io/blog/xcode-26-requirement-for-capacitor-apps/)). So you need a native "shell" around the game.

### B2. Pick a wrapper
| | **Capacitor (recommended)** | PWABuilder iOS package |
|---|---|---|
| What it is | A real iOS project. Your `index.html` is **copied inside the app**, and plugins give it native features. | A Swift app that **loads your live website** in a web view ([PWABuilder blog](https://blog.pwabuilder.com/posts/publish-your-pwa-to-the-ios-app-store/)). |
| Works offline from the first launch | Yes | Only after the first online load |
| Native extras that reduce 4.2 risk | Easy to add: real haptics, Game Center, native share sheet, in-app purchases through RevenueCat | Limited |
| Updates | A new build and review for each game update | The web game updates instantly (Apple dislikes apps that change a lot without review) |
| Payments later | RevenueCat Capacitor plugin (part C) | Possible, but more manual |
| Needs a Mac or cloud build | Yes | Yes |

**Recommendation: Capacitor.** It gives Apple the strongest "this is a real app" case and the cleanest path to payments. The same project can also produce the Android app later (part C).

### B3. Apple Developer account 👤
- **US$99 per year**, as an **Individual**. Individuals don't need a D-U-N-S number. You need an Apple Account with two-factor authentication, your **legal name** (no nicknames or company names, or approval is delayed), and a verified phone and street address (no P.O. box). **Your legal name appears as the seller on the App Store.** ([Apple: Enrollment](https://developer.apple.com/programs/enroll/))
- Enroll at `developer.apple.com/programs/enroll`, ideally in the Apple Developer app on an iPhone, which is often fastest. Approval often takes about 1–2 days, sometimes longer.
- ⚠ To show a company name instead of your own, you'd need to enroll as an **organization**. That requires a legal entity, a D-U-N-S number and a website on the company's domain.
- ⚠ **EU distribution:** App Store Connect asks whether you're a "trader" under the EU Digital Services Act. If you sell in-app items, you probably are, and your address, phone and email are then **shown publicly in the EU**. If that's a problem, leave the EU out at first.

### B4. Reserve the name "Meteor Pilot" now 👤
Names are first-come, first-served, and only one app can use a name per language. As soon as your account is approved:
1. developer.apple.com > Certificates, Identifiers & Profiles > **Identifiers > +** > App IDs > App > Bundle ID `io.github.jimsky90.meteorpilot` (explicit).
2. App Store Connect > **Apps > + > New App**. Platform iOS, name **Meteor Pilot**, language English (U.S.), that bundle ID, SKU `meteorpilot001`, Full Access. ([Apple: Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app))
3. Saving the record holds the name while it exists. You don't need to submit anything yet ([Apple forums](https://developer.apple.com/forums/thread/809402)).
   - ⚠ Apple doesn't say how long an unused name is held. Developers report that records left with no build for a long time can lose their name, so upload a TestFlight build within a few months.
   - You can change the store name to `Meteor Pilot: Space Arcade` when you submit, but changing it releases plain "Meteor Pilot" for others to take. I suggest keeping **"Meteor Pilot"** as the Apple name and letting the subtitle carry the keywords. In `LISTING.md`, use alternative subtitle C.

### B5. Build without owning a Mac 👤 + 🤖
| Option | Cost | Notes |
|---|---|---|
| **Codemagic** (cloud) | **Free: 500 macOS build minutes per month** for personal accounts, then $0.095/min ([Codemagic pricing](https://docs.codemagic.io/billing/pricing/)) | Builds the Capacitor iOS app and uploads to TestFlight. One build takes about 5–15 minutes, so the free tier covers many builds. Claude can write the `codemagic.yaml`. |
| Capawesome Cloud | Free sign-up, paid tiers | Made for Capacitor ([Capawesome: build without a Mac](https://capawesome.io/blog/how-to-build-and-deploy-ios-apps-without-a-mac/)). |
| Rent a Mac (MacinCloud, MacStadium) | Hourly or monthly | You'd use Xcode remotely. |
| Buy a Mac mini | About $600 or more | Easiest long-term if you'll make more apps. |
| Ionic Appflow | Not recommended | Reported to be shutting down. |

For cloud builds, you also create an **App Store Connect API key** (Users and Access > Integrations), so the service can sign and upload for you. Claude can guide each click.

### B6. What Claude builds 🤖
1. A Capacitor project around the game: `npm create @capacitor/app`, copy `index.html`, icons and fonts into it, then `npx cap add ios`.
2. Native improvements, each one also a 4.2 defense:
   - **Real haptics** through Capacitor Haptics. iPhones ignore the web vibration call the game uses now, so iPhone players get no vibration today.
   - **Save data in native storage** (Capacitor Preferences) as well as local storage. Capacitor's docs warn that mobile systems can clear web local storage ([Capacitor: Preferences](https://capacitorjs.com/docs/apis/preferences)).
   - **Game Center:** trophies become Game Center achievements, plus a daily-course leaderboard. That's a real social feature, it's Apple's own (no new privacy label entries for you), and reviewers value it.
   - **Native share sheet** for the score text, instead of copy to clipboard.
   - Status bar hidden, splash screen, and the right icon sizes (1024 × 1024 store icon, no transparency).
   - Hide the web Install button and Store tab in the iOS build.
   - `ITSAppUsesNonExemptEncryption = NO` in Info.plist.
3. ⚠ **iPad decision:** the game's stage is capped at 420 px wide, so on an iPad it's a small column. Either ship **iPhone-only** (it still runs on iPads in iPhone mode, and you skip iPad screenshots) or let Claude scale the game for iPad. iPhone-only is recommended for 1.0.

### B7. Guideline 4.2 "minimum functionality": the risk and how to reduce it
Apple's rule: *"Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store."* (as quoted in [MobiLoud's guide to Apple's guidelines](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper); the official text is in Apple's App Store Review Guidelines, section 4.2).

**Risk level for Meteor Pilot: low to medium.** A full game with 40 levels, bosses and progression is far from a "repackaged website". Apple rejects web-wrapped *websites* much more often than self-contained *games*. The risks are things that make it *look* like a website:

| Risk | Fix |
|---|---|
| Loads a live web page (remote URL) | Bundle the files inside the app with Capacitor. |
| Web-only touches: an "Install" button, "Add to Home Screen" hints, links that open a browser | Hide them in the iOS build. |
| Needs the internet (Google Fonts) | Bundle the fonts. The game then works fully offline, so test in airplane mode. |
| No native features | Haptics, Game Center and the share sheet (B6). |
| Test or demo purchases visible (Guideline 2.1, and in-app purchase rules) | Hide the Store tab until StoreKit is live. |
| Bugs or layout problems on the review device | Fix the audit bugs first. Test on a small iPhone (SE size) and a large one. |
| Reviewer can't find the content | Write clear review notes (below). |

**Notes for App Review (paste into App Store Connect, edit as needed):**
> Meteor Pilot is a self-contained arcade game. All game files are bundled in the app, and it works fully offline. There are no accounts and no sign-in. To see the main features: tap Play (daily course), open Levels (40 levels across 4 worlds, with a Mothership boss at levels 10, 20, 30 and 40), Hangar (7 ships and upgrades) and Shop (cosmetics bought with coins earned in the game). The app uses native haptics and Game Center achievements and leaderboards. It has no ads, no tracking, no loot boxes and no third-party SDKs.

If it's rejected under 4.2 anyway: reply in Resolution Center and explain the native features. Claude can draft the reply. Don't just resubmit unchanged.

### B8. TestFlight 👤 + 🤖
- After a build uploads, it appears in App Store Connect > TestFlight.
- **Internal testers** (people you add to your App Store Connect team, up to 100) can play right away, with no review.
- **External testers** (up to 10,000, invited by email or public link) need a quick **Beta App Review** for the first build. It's useful to catch 4.2 concerns early.
- Run TestFlight for about 1 week with 5–10 iPhone players, then submit for review.
- ⚠ The tester limits are as I understand Apple's current rules. Confirm them in App Store Connect.

### B9. Apple store assets
From [App Store Connect Help: screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications):
- **iPhone screenshots:** 1 to 10, portrait. Provide the **6.9-inch size, 1320 × 2868** (also accepted: 1290 × 2796 and 1260 × 2736). Without these, Apple requires the 6.5-inch size (1284 × 2778 or 1242 × 2688). JPEG or PNG with **no transparency**.
- **iPad screenshots (13-inch, 2064 × 2752)** are needed only if the app runs natively on iPad. Not needed if you ship iPhone-only.
- **App icon:** 1024 × 1024 PNG, no transparency, no rounded corners (Apple adds them). It goes inside the build.
- **Optional:** app preview video of 15–30 seconds.

### Apple timeline (realistic)
| Week | What happens |
|---|---|
| 1 | Enroll and pay $99 (👤). Reserve the name. Claude builds the Capacitor project. |
| 2 | Set up Codemagic and the API key (👤🤖). First TestFlight build. |
| 3 | TestFlight with friends. Fix issues. Screenshots and listing. |
| 3–4 | Submit. Reviews usually take 1–2 days. Allow for **one or two rounds** if Apple raises 4.2 or other questions. |

---

## Part C. Turning on real payments later

### C1. What already exists in the game
The Shop calls `window.COMET_PAYMENTS.buy(id)` for paid items, where `id` is `"pass"`, `"neon"` or `"legend"`. It expects a promise that resolves **true only after the store confirms payment**, resolves **false if the player cancels**, and **throws an error** if the purchase fails. If that hook is missing, the Shop shows its labeled "Test checkout". So the store builds only need to **define that hook before the game starts**. The game logic stays the same. (The `COMET_` in the name is an internal leftover. Players never see it, and it can stay.)

### C2. Before you can sell 👤
- **Apple:** App Store Connect > Business: sign the **Paid Apps Agreement** and add bank and tax details. Consider joining the **App Store Small Business Program** (lower commission for small developers).
- **Google:** Play Console > Monetization setup: create a **payments profile** (merchant account) with bank details. Google also charges a reduced service fee on a developer's first US$1M of yearly earnings.
- ⚠ Check the current commission rates in each console. They were 15% for small developers on both stores, but they change.

### C3. Create the products (identical in both stores) 👤 + 🤖
| Game id | Product type | Suggested store product ID | Price |
|---|---|---|---|
| `pass` | Non-consumable (one-time) | `meteorpilot.pass` | Tier near $4.99 |
| `neon` | Non-consumable | `meteorpilot.neon` | Tier near $1.99 |
| `legend` | Non-consumable | `meteorpilot.legend` | Tier near $2.99 |

⚠ **Supporter Pass decision:** right now it includes "+25% XP forever". That's allowed by both stores, but it contradicts "paid items are cosmetic only", and your audit found it speeds up progression for payers. Recommended: make it purely cosmetic (Founder paint, Founder badge, a special trail or Boom) before selling it.

### C4. Use RevenueCat to handle both stores
RevenueCat is a service that talks to Apple's StoreKit and Google Play Billing, checks receipts on its servers, and tells the app what the player owns. You have no server, so this matters: Google, for example, **refunds purchases that aren't acknowledged within 3 days** ([Chrome: Play Billing in TWAs](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)), and RevenueCat does that acknowledgement for you.
- **Cost:** free up to **$2,500 per month** in tracked revenue, then 1% ([RevenueCat pricing](https://revenuecat.com/pricing)).
- **Plugin:** `@revenuecat/purchases-capacitor` (iOS and Android) ([npm](https://npmjs.com/package/@revenuecat/purchases-capacitor)).
- 👤 Setup: create a RevenueCat project and add the iOS and Android apps. Connect your App Store Connect in-app purchase key and a Google Play service-account key (RevenueCat walks you through it). Then create one **entitlement** per item (`founder`, `neon`, `legend`), each attached to its product.

**⚠ Android needs a change here.** RevenueCat's plugin works in a **Capacitor** app, not in a TWA. When you turn on payments, the recommended move is to **switch the Android app from TWA to the same Capacitor project used for iOS**. Keep the same package name (`io.github.jimsky90.meteorpilot`) and upload key, and Play treats it as a normal update. Players keep their progress if the game also saves it in native storage before the switch, and Claude can add a one-time migration.
*The alternative,* staying a TWA and using Google's Digital Goods API (`bubblewrap` `playBilling` feature), **requires your own server** to verify and acknowledge every purchase, so it isn't recommended for a no-server game.

### C5. How it plugs into the existing hook 🤖 (sketch; Claude finalizes it against the current RevenueCat docs)
```js
// store-payments.js: loaded in the Capacitor build before index.html's game code
import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';

const PRODUCT = { pass: 'meteorpilot.pass', neon: 'meteorpilot.neon', legend: 'meteorpilot.legend' };
const ENTITLEMENT = { pass: 'founder', neon: 'neon', legend: 'legend' };

await Purchases.configure({
  apiKey: Capacitor.getPlatform() === 'ios' ? 'appl_PUBLIC_KEY' : 'goog_PUBLIC_KEY'
});

const owns = info => Object.keys(ENTITLEMENT).filter(id => info.entitlements.active[ENTITLEMENT[id]]);

window.COMET_PAYMENTS = {
  // Contract the game already expects: true = paid and confirmed, false = cancelled, throw = failed
  async buy(id) {
    const { products } = await Purchases.getProducts({ productIdentifiers: [PRODUCT[id]] });
    if (!products.length) throw new Error('This item is not available right now');
    try {
      const { customerInfo } = await Purchases.purchaseStoreProduct({ product: products[0] });
      return owns(customerInfo).includes(id);
    } catch (e) {
      if (e && e.userCancelled) return false;
      throw e;
    }
  },
  // New: needed for a "Restore purchases" button (see C6)
  async restore() { const { customerInfo } = await Purchases.restorePurchases(); return owns(customerInfo); },
  // New: lets the Shop show real local prices instead of the hard-coded "$4.99"
  async prices() {
    const { products } = await Purchases.getProducts({ productIdentifiers: Object.values(PRODUCT) });
    return Object.fromEntries(products.map(p => [Object.keys(PRODUCT).find(k => PRODUCT[k] === p.identifier), p.priceString]));
  }
};
```

### C6. Small game changes needed when payments go live 🤖
1. **"Restore purchases" button** in the Shop that calls `COMET_PAYMENTS.restore()` and gives back owned items. Apple expects a restore option for one-time purchases, and RevenueCat recommends calling restore only when the player taps the button ([RevenueCat: Restoring purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases)). It also matters because the game keeps purchases only in local storage, which can be wiped.
2. **Check what the player owns on startup** (`Purchases.getCustomerInfo()`), and give back anything missing.
3. **Show store prices** from `prices()`.
4. **Show the Store tab again** in store builds, and keep the test checkout only on the website.
5. **Update the paperwork:** privacy policy (payments via Apple/Google and RevenueCat), Apple App Privacy (likely "Purchase history"), Google Data safety, and redo the IARC questionnaire (In-App Purchases = Yes).
6. **Test with sandbox accounts:** Apple sandbox testers (App Store Connect > Users and Access > Sandbox) and Google license testers (Play Console > Settings > License testing). These buy for free.

**Payments timeline:** about 1–2 weeks after both apps are live. Agreements and banking 1–3 days, products 1 day, code 2–4 days, sandbox testing, then a store review.

---

## Part D. Checklist: who does what

### 👤 James (owner actions)
- [ ] Decide: permanent web address (A2), app ID (Step 0), violence answer and target audience (forms file), Supporter Pass XP, iPhone-only or iPad
- [ ] Create a public contact email, then replace `[your contact email]` in `privacy.html` (or ask Claude to)
- [ ] Google Play account: pay $25, verify ID, verify device in the Play Console app
- [ ] Create the `jimsky90.github.io` repo (or buy a domain)
- [ ] Generate the Android package on PWABuilder (or let Claude run Bubblewrap) and **back up the keystore and passwords**
- [ ] Create the app in Play Console, paste the listing, fill in the App content forms
- [ ] Copy both SHA-256 fingerprints from App integrity and send them to Claude
- [ ] Recruit 15–20 Android testers, and keep them for 14+ days
- [ ] Apply for production, then release
- [ ] Apple: enroll and pay $99/year, reserve "Meteor Pilot", create the bundle ID
- [ ] Sign up for Codemagic and create an App Store Connect API key
- [ ] Recruit TestFlight testers. Submit for review. Answer the reviewer if needed.
- [ ] Upload the preview video to YouTube (unlisted, ads off)
- [ ] Later: Paid Apps Agreement, Google payments profile, banking and tax, RevenueCat account, create products, sandbox testers
- [ ] Push changes to GitHub when you're happy (Claude doesn't push without your OK)

### 🤖 Claude
- [x] Privacy policy page (`privacy.html`)
- [x] Store listing copy and ASO research (`store/LISTING.md`)
- [x] Draft form answers (`store/AGE-RATING-AND-FORMS.md`)
- [x] Name check (`store/NAME-CHECK.md`)
- [ ] Game fixes before submitting: hide the Store tab in store builds, bundle the fonts, audit bugs, remove crypto leftovers, add a Privacy link
- [ ] `assetlinks.json` and the `jimsky90.github.io` repo files
- [ ] Run Bubblewrap if you prefer it to PWABuilder. Raise the target API if needed.
- [ ] Screenshots at 1080 × 1920 (Google) and 1320 × 2868 (Apple), a 1024 × 500 feature graphic, and a short gameplay video
- [ ] Tester invitation message, feedback form text, production-access answers
- [ ] Capacitor iOS project with haptics, Game Center, native storage, share sheet and `codemagic.yaml`
- [ ] App Review notes, and a Resolution Center reply if needed
- [ ] Payments: the `COMET_PAYMENTS` bridge, Restore button, real prices, Android switch to Capacitor, paperwork updates

---

## Total costs (first year)
| Item | Cost |
|---|---|
| Google Play developer account | $25 (once) |
| Apple Developer Program | $99/year |
| Codemagic (cloud iOS builds) | $0 within 500 min/month |
| Custom domain (optional) | about $10–20/year |
| RevenueCat | $0 up to $2,500/month revenue, then 1% |
| **Minimum to launch on both stores** | **$124** |
