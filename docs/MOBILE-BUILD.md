# Getting Meteor Pilot into Google Play and the App Store

**For James. Plain English, step by step.** Written 2026-11-20 by the Mobile Platform Engineer.

You don't need a Mac, Android Studio or Xcode. A cloud service called **Codemagic** builds both apps from the GitHub repository. Your part is creating accounts, paying, proving who you are and clicking buttons on websites. Claude can't do these steps for you. The steps are marked 👤 (only you can do it) or 🤖 (ask Claude).

This replaces the "Trusted Web Activity" route in `store/LAUNCH-PLAN.md` part A. One project (Capacitor) now makes **both** apps.

---

## What you need, and what it costs

| Thing | Cost | Why |
|---|---|---|
| Google Play developer account | **US$25 once** | to publish on Google Play |
| Apple Developer Program (Individual) | **US$99 per year** | to publish on the App Store and use TestFlight |
| Codemagic account | **free** for personal use (500 build minutes a month on their Macs) | builds both apps in the cloud. One build takes about 10–25 minutes. |
| A password manager (or a safe notes app) | free | for the passwords and key files you create below. **Losing them causes real trouble.** |
| Your iPhone | (you have it) | installs the TestFlight build |
| An Android phone, borrowed is fine | | to try the Google Play build yourself. The 12 closed testers need Android phones too. |

---

## Step 1. Confirm the app ID 👤 (5 minutes, but it's permanent)

The **app ID** is the app's internal name in both stores, for example `com.meteorpilot.game`. Players never see it, but it **can never be changed after the first upload**. A different ID means a brand-new app with no reviews and no installs.

- **Confirmed by the owner on 2026-11-21: `io.github.jimsky90.meteorpilot`.** It's set in `mobile/capacitor.config.json` and `codemagic.yaml`, and marked confirmed.
- `store/LAUNCH-PLAN.md` (Step 0) suggested **`io.github.jimsky90.meteorpilot`**. That one ties the app to your GitHub username.
- Either is fine. A neutral name like `com.meteorpilot.game` is better if the game might ever move to its own website or company. Choose one.

Tell Claude: *"The app ID is confirmed: com.meteorpilot.game"* (or the one you prefer). 🤖 Claude then sets it in `mobile/capacitor.config.json` and `codemagic.yaml` and marks it confirmed (`appIdConfirmed` in `mobile/package.json`). **Until then, every cloud build stops at its first step on purpose,** so nothing gets uploaded under an ID you didn't choose.

Also decide: **iPhone only, or iPhone and iPad?** **Decided 2026-11-21: iPhone and iPad.** You'll need iPad screenshots (13-inch, 2064 × 2752) for the App Store listing, and the game's layout is being made to fill iPad screens (see MOBILE-GAME-CHANGES.md, M10).

---

## Step 2. Create the store accounts 👤 (start today: approvals take days)

**Google Play** ([play.google.com/console](https://play.google.com/console))
1. Sign in with the Google account you want to own the game. Choose **Personal** account.
2. Pay US$25 and complete identity verification (a photo of your ID). This can take a few days.

**Apple** ([developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/))
1. Use your Apple Account with two-factor authentication turned on. Enroll as an **Individual** with your **legal name**, which is shown as the seller on the App Store.
2. Pay US$99. Approval usually takes 1–2 days.

---

## Step 3. Create your Codemagic account 👤 (10 minutes)

1. Go to [codemagic.io](https://codemagic.io), click **Sign up** and choose **Sign up with GitHub**. Use the GitHub account that owns `jimsky90/meteor-pilot`.
2. Allow Codemagic to see the `meteor-pilot` repository when GitHub asks.
3. In Codemagic, click **Add application**, pick **GitHub**, then **meteor-pilot**. For project type, choose **Ionic Capacitor** or "Other". Codemagic finds the `codemagic.yaml` file in the repository by itself.
4. You'll see three workflows. You'll use them in the steps below.
   - **Android App Bundle (download)**
   - **Android to Google Play closed testing**
   - **iOS to TestFlight**

---

## Part A: Google Play

### A1. Make the Android "upload key" 👤 (one time, 10 minutes)

Google needs every upload signed with a key file that only you have. Google keeps the real signing key safe (this is called "Play App Signing"). If you ever lose this upload key, Google support can reset it, but the reset takes days.

On any Windows, Mac or Linux computer with Java installed (free download: [adoptium.net](https://adoptium.net)), open a terminal and run this one line:

```
keytool -genkeypair -v -keystore meteor-pilot-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

- It asks for a password: make a strong one and **save it in your password manager**.
- It asks for your name and city: any honest answer is fine.
- It creates the file `meteor-pilot-upload.jks`. **Back it up** (password manager attachment or a USB stick), and **never put it in GitHub.**

(If you'd rather not use a terminal, ask Claude to walk you through it on screen. The file and its password should still stay with you only.)

### A2. Give the key to Codemagic 👤

Codemagic > **Team settings** (or your personal account settings) > **codemagic.yaml settings** > **Code signing identities** > **Android keystores** > **Add keystore**:
- **Keystore file:** `meteor-pilot-upload.jks`
- **Keystore password:** your password
- **Key alias:** `upload`
- **Key password:** the same password, unless you chose a separate one
- **Reference name:** `meteor_pilot_upload_key` (type it exactly like this, because the build looks for this name)

### A3. Build the first Android app 👤 (1 click, about 15 minutes)

In Codemagic, open **meteor-pilot** > **Start new build** > branch **main** > workflow **Android App Bundle (download)** > **Start**.
When it turns green, open the build and download the **`.aab`** file under **Artifacts**.

### A4. Create the app in Google Play and upload it 👤 (about 1 hour the first time)

Google requires the **first** upload to be done by hand. After that, Codemagic can upload for you (A6).

1. Play Console > **Create app**. Name **Meteor Pilot**, language English (United States), **Game**, **Free**. Accept the declarations.
2. On the Dashboard, work through **"Set up your app"**. The answers are drafted in `store/AGE-RATING-AND-FORMS.md` and `store/LISTING.md`.
   - Privacy policy URL: `https://jimsky90.github.io/meteor-pilot/privacy.html` (fill in your contact email in that page first).
   - App access: all features are available without special access.
   - Ads: **No**.
   - Content rating questionnaire: see the forms file.
   - Target audience: see the forms file.
   - Data safety: **No data collected**. This is true for the app build, because fonts are now bundled and nothing is sent anywhere.
3. **Test and release > Testing > Closed testing** > the **Closed testing** track ("Alpha") > **Create release**.
4. When asked about app signing, accept **Use Google-generated key** (Play App Signing).
5. Upload the `.aab` from A3. Release name and notes: anything, for example "First test build".
6. **Testers** tab: create an email list with your testers' Gmail addresses, or use a Google Group. Copy the **opt-in link** and send it to them.
7. **Review release** > **Start rollout to Closed testing**. Google reviews it, which takes a few hours to a few days.

**That's the goal: your app is in Google Play closed testing.** Testers open the opt-in link on their Android phone and install from Google Play.

> Reminder from the launch plan: new personal accounts need **12 testers who stay opted in for 14 days in a row** before you can apply for production.

### A5. Each new Android version 👤

**Until A6 is set up:** run **Android App Bundle (download)** again, then in Play Console create a new Closed testing release and upload the new `.aab`. Version numbers go up by themselves.

### A6. Optional: let Codemagic upload to Google Play for you 👤 (30 minutes, one time)

1. [console.cloud.google.com](https://console.cloud.google.com): create a project (any name).
2. In that project, **APIs & Services** > enable **Google Play Android Developer API**.
3. **IAM & Admin > Service accounts > Create service account** (any name, no roles needed here). Open it, go to **Keys > Add key > JSON**, and a `.json` file downloads. **Treat it like a password.**
4. Play Console > **Users and permissions** > **Invite new users**: paste the service account's email (ends in `iam.gserviceaccount.com`). Under **App permissions**, add Meteor Pilot with **Release apps to testing tracks** (and "View app information"). Send the invite.
5. Codemagic > **Team settings** > **codemagic.yaml settings** > **Global variables and secrets**: create the group **`google_play`** and add the variable **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`**. Paste the **whole content** of the `.json` file as its value, and tick **Secret**.
6. From now on, run **Android to Google Play closed testing**. It builds the app and puts it straight into the Closed testing track.

---

## Part B: App Store and TestFlight

### B1. Register the app with Apple 👤 (15 minutes)

1. [developer.apple.com/account](https://developer.apple.com/account) > **Certificates, Identifiers & Profiles** > **Identifiers** > **+** > **App IDs** > **App**.
   - Description: Meteor Pilot
   - Bundle ID: **Explicit**, the app ID from Step 1 (`io.github.jimsky90.meteorpilot`)
   - No extra capabilities are needed yet.
   - Click **Register**.
2. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) > **Apps** > **+** > **New App**.
   - Platform **iOS**, name **Meteor Pilot**, language English (U.S.)
   - The bundle ID you just made, SKU `meteorpilot001`, **Full Access**

### B2. Make an App Store Connect API key and give it to Codemagic 👤 (10 minutes)

1. App Store Connect > **Users and Access** > **Integrations** > **App Store Connect API** > **Team Keys** > **+**. Name it "Codemagic", Access **App Manager**, then **Generate**.
2. **Download the `.p8` file now.** Apple lets you download it only once. Save it with your passwords. Also note the **Issuer ID** (shown above the list) and the **Key ID**.
3. Codemagic > **Team settings** > **Team integrations** > **Developer Portal** > **Connect** (or **Manage keys > Add key**):
   - **App Store Connect API key name:** `Meteor Pilot ASC key` (exactly this, because the build looks for this name)
   - Issuer ID, Key ID, and upload the `.p8` file

### B3. Signing certificate and profile 👤 (10 minutes, in Codemagic)

Codemagic > **Team settings** > **codemagic.yaml settings** > **Code signing identities**:
1. **iOS certificates** > **Generate certificate**. Choose the API key from B2 and type **Apple Distribution**. Codemagic creates it for you. **Download the `.p12` and its password when offered, and keep them with your passwords.**
2. **iOS provisioning profiles** > **Fetch profiles**. Pick the **App Store** profile for your bundle ID.
   - If there isn't one yet, create it at developer.apple.com > **Profiles** > **+** > **App Store Connect** > your App ID > the Distribution certificate from step 1 > name it "Meteor Pilot App Store". Then click **Fetch profiles** again.

### B4. Build and send to TestFlight 👤 (1 click, about 20–30 minutes)

Codemagic > **Start new build** > branch **main** > workflow **iOS to TestFlight** > **Start**.
When the build turns green, Apple still needs 10–30 minutes to "process" it.

### B5. Install it on your iPhone 👤

1. App Store Connect > **Meteor Pilot** > **TestFlight**. The build appears under iOS builds. The encryption question is already answered by the build ("no non-exempt encryption").
2. **Internal Testing** > **+** > create a group (for example "Me"), add yourself (your Apple Account email), and add the build.
3. On your iPhone, install **TestFlight** from the App Store, then open the invite email.

**That's the goal: your app is in TestFlight.** For friends outside your team, use **External Testing**. The first external build gets a short Apple review (usually under a day).

### B6. Each new iOS version 👤
Run **iOS to TestFlight** again. Build numbers go up by themselves.

---

## Every new game version (both stores)

1. The daily engineer updates the game as usual. The web version keeps working exactly as before.
2. 🤖 When you want a new store version, ask Claude to "bump the app version". This changes `"version"` in `mobile/package.json`, for example 1.0.0 to 1.0.1. Small test updates don't need it, because the build number always goes up.
3. 👤 Start the Android and iOS builds in Codemagic, as in A5/A6 and B6.

---

## Only you can do these

- Paying Google and Apple, verifying your identity, two-factor authentication codes, and legal or tax forms.
- Choosing the app ID (Step 1).
- Creating and keeping the Android key file, the Apple `.p8` key, the `.p12` certificate and all passwords. Claude never needs to see them, and they must never go into GitHub.
- The first `.aab` upload in Play Console, the store forms (content rating, data safety, target audience), and finding 12+ testers.
- Pressing "Start rollout" and "Submit for review".

## Claude can do these

The build files, the game changes in `docs/MOBILE-GAME-CHANGES.md`, store texts, tester invitation messages, answers to reviewer questions, and fixing any build that fails. Paste the red error lines from Codemagic into the chat.

---

## If something goes wrong

| What you see in Codemagic | What it means / what to do |
|---|---|
| **Check the app ID** fails: "not confirmed" | Step 1 isn't done yet. Tell Claude the app ID you chose. |
| "No keystore with reference meteor_pilot_upload_key" | A2: the reference name must be exactly `meteor_pilot_upload_key`. |
| "No matching profiles found" / signing error on iOS | B3: fetch the App Store profile for the exact bundle ID. |
| "Version code 3 has already been used" (Google) | You uploaded by hand in between. In Codemagic, add the environment variable `BUILD_NUMBER_OFFSET` = 100 to the workflow and build again. |
| Anything with "font file missing" | Packages didn't install. Run the build again; if it repeats, send the log to Claude. |
| Anything else | Copy the last red lines into the chat for Claude. |

---

## For engineers: how it fits together

- `mobile/scripts/build-www.mjs` makes `mobile/www/` from the repo's `index.html`:
  - The GAME section is unchanged.
  - Fonts are bundled from `@fontsource`.
  - The service worker is removed.
  - `native.js` is injected.
  - `sw.js`, the web manifest and `privacy.html` are left out.
- `mobile/native.js` is the bridge to the phone's features. It uses the official Capacitor plugins:
  - App, Haptics, Preferences, Share, Clipboard, Browser, Status Bar and Splash Screen
  - plus `@capacitor-community/keep-awake`
- `mobile/scripts/patch-native.mjs` applies our settings to the generated native projects: portrait only, version numbers, Android release signing from Codemagic's environment, Info.plist keys, and iPhone only.
- `mobile/scripts/check-config.mjs` checks that the app ID is the same in `capacitor.config.json` and `codemagic.yaml`, and that the owner has confirmed it.
- `mobile/assets/` holds the icon and splash sources. In the cloud, `@capacitor/assets` turns them into every native size.
  - `icon-only.png` (1024) is upscaled from `icons/icon-512.png`, and `icon-foreground.png` from `icons/maskable-512.png`.
  - The splash is the icon on `#070a1a`.
  - **Ask the art side for a true 1024×1024 master icon before launch**, because the upscale is slightly soft.
- `python3 mobile/test_build.py` builds `www/` and checks it:
  - static checks
  - the game in Chromium with a stubbed `window.Capacitor`: back button, pause on app switch, haptics, keep-awake, share links, the hidden Store tab, and save backup and restore

### Why `android/` and `ios/` aren't in git
Capacitor normally keeps the native projects in the repo. Here, every cloud build creates them fresh (`npx cap add`), and all our native settings are applied by `patch-native.mjs`. Reasons:
- Nobody on the team opens Android Studio or Xcode.
- The generated projects are large and change with every Capacitor upgrade.
- This way nothing can drift.

When we add native code (Game Center, RevenueCat), reconsider: at that point, committing `android/` and `ios/` (without build folders) becomes the simpler choice.

### What was and wasn't tested (2026-11-20)
- **Tested:** the build script, every static check, `patch-native.mjs` on copies of Capacitor's template files, and the store build of the game in Chromium with Capacitor stubbed (all checks pass). The font pipeline was tested with stand-in font files.
- **Not tested here:** this machine's network blocks the npm registry. So `npm install`, `npx cap add android/ios` and `@capacitor/assets` could not run, and no real `.aab` or `.ipa` was produced. The first Codemagic build of each workflow is the first real run. If it fails, the fix is usually a one-line change; send the log to Claude.
- **No lock file yet:** `package.json` uses version ranges (Capacitor 8). After the first successful cloud build, commit a `package-lock.json` (made with `npm install` on any machine with internet access) so that every later build uses exactly the same packages.
- **Still needed:** real-device checks (`docs/TECH-DIRECTION.md` checklist item 20):
  - airplane mode
  - the silent switch
  - an app switch and a phone call mid-run
  - safe areas on a recent Android phone (Android 15+ is edge to edge)
