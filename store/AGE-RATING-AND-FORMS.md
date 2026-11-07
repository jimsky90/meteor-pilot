# Meteor Pilot: age rating and store forms (draft answers)

Prepared November 7, 2026, from the game's code (version 25, `index.html`). These are draft answers to copy into the forms. The forms change wording now and then, so match each answer to the closest question.

**⚠ = check this yourself before you submit.** Each one is a judgment call or depends on a decision you haven't made yet.

### What the answers are based on (facts checked in the code)
- Progress is saved only in the device's local storage. The game has no accounts, server, analytics, ads, crash reporting or tracking code.
- The only outside requests are Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), which load two typefaces. Google receives the player's IP address when this happens.
- The game uses the phone's vibration (can be switched off), screen wake lock (keeps the screen on) and clipboard (only when the player taps "copy" on their score).
- The game has no chat, no player-made content, no links to the open web, and no camera, microphone or location access.
- Content: the player steers a ship and never fires a weapon. Meteors, black holes and solar flares are hazards. A "Mothership" boss fires red dots ("bullets") in patterns, and the player destroys it by catching 5 cores. Ships explode in stylized effects (Pixel Pop, Fireworks and others). There are no people, creatures, blood or gore.
- Shop: cosmetics are bought with coins earned in the game. Three paid items (Supporter Pass, Neon Paint Pack and Legend Paint Pack) have fixed contents. They're in **test mode**, so no money is charged. There are no loot boxes or random rewards. ⚠ The Supporter Pass also gives +25% XP, so it isn't purely cosmetic.

---

## 1. Apple: age rating questionnaire

Where to find it: App Store Connect > your app > App Information > Age Rating > Edit.

Apple redid this questionnaire in July 2025. It now has the tiers 4+, 9+, 13+, 16+ and 18+, and new required questions about in-app controls, capabilities, medical or wellness topics and violent themes ([Apple: updated age ratings](https://developer.apple.com/news/?id=ks775ehf)). For each kind of content, you answer **None**, **Infrequent** or **Frequent**. ([Sonar: how the new questionnaire maps to tiers](https://trysonar.app/blog/app-store-age-rating))

### Step 1: In-app controls
| Question | Answer | Why |
|---|---|---|
| Parental controls | **No** | The game doesn't have any. |
| Age assurance (checking a player's age) | **No** | The game doesn't ask for anyone's age. |

### Step 2: Capabilities
| Question | Answer | Why |
|---|---|---|
| Unrestricted web access | **No** | The game has no browser and no outside links. ⚠ Make sure the iOS wrapper doesn't open outside links inside the app. Answering Yes makes the game 16+. |
| User-generated content | **No** | Players can't post or share anything inside the app. |
| Messaging and chat | **No** | |
| Advertising | **No** | |
| Social media features | **No** | Answering Yes would force 13+. |

### Step 3: Content
| Content | Answer | Why |
|---|---|---|
| Cartoon or fantasy violence | **None** ⚠ | You dodge rocks and catch cores. There's no weapon, character or creature, and the "violence" is abstract ships exploding. **⚠ This is the main judgment call.** If you think the boss "bullets" and ship explosions count, answer **Infrequent**, and the rating becomes **9+**. Both answers are honest. Apple is more likely to object to None than to Infrequent, but 4+ reaches more players. |
| Realistic violence | None | |
| Prolonged graphic or sadistic realistic violence | None | |
| Guns or other weapons (if asked) | None | The player has no weapon. The boss "bullets" are glowing dots. |
| Horror or fear themes | None | A siren plays when the boss comes and the screen flashes during hits. That's arcade tension, not horror. |
| Profanity or crude humor | None | |
| Mature or suggestive themes | None | |
| Sexual content or nudity / graphic sexual content | None | |
| Alcohol, tobacco or drug use or references | None | |
| Medical or treatment information / wellness topics | None | |
| Simulated gambling | None | There's no casino, slots or card games. |
| Gambling (real money) | No | |
| Contests | No | The daily course has no prizes, entry fees or leaderboards. |
| Loot boxes | **No** | Everything for sale has fixed, visible contents. The daily gift is always exactly 30 coins. |

### Other Apple settings on the same pages
- **Kids Category / "Made for Kids":** **don't choose it.** It comes with extra rules (parental gates and more), and the game isn't designed only for children.
- **Set a higher age rating than Apple assigns:** not needed.

### Expected Apple result
- **4+** if cartoon or fantasy violence = None.
- **9+** if cartoon or fantasy violence = Infrequent.

---

## 2. Apple: App Privacy ("nutrition label")

Where to find it: App Store Connect > your app > App Privacy. You also need a **privacy policy URL**: `https://jimsky90.github.io/meteor-pilot/privacy.html`.

### Draft answer
**"Do you or your third-party partners collect data from this app?" → No.**
The App Store page will show **"Data Not Collected"**.

### Why "No" is honest
Apple defines "collect" as sending data off the device in a way that lets you or your third-party partners access it for longer than needed to handle the request in real time ([Apple: App privacy details](https://developer.apple.com/support/app-privacy-on-the-app-store/)).
- **Game progress, settings, scores and ghost runs** stay in local storage on the device. They're never sent anywhere, so they aren't "collected".
- **You have no server**, so you receive nothing.
- **No third-party SDKs.** The game has no analytics, ads, crash reporting or login code.
- **Clipboard** is used only when the player taps copy. Nothing is sent.
- **The test-mode shop** keeps a purchase list only on the device.

### ⚠ The one gray area: Google Fonts
If the iOS build still loads fonts from Google, Google receives the device's IP address. Apple says an IP address that's sent and then discarded after the request doesn't need to be disclosed. Google, however, keeps its own server logs, so it's unclear whether that counts as "collection".

**Recommended fix (removes the question completely):** for the iOS and Android builds, **put the two font files inside the app** instead of loading them from Google. Both fonts, Chakra Petch and Atkinson Hyperlegible, are free under the SIL Open Font License, which allows bundling them. Claude can make this change. Then "Data Not Collected" is plainly true, the game works offline from the very first launch, and the privacy policy can drop its Google Fonts section.

**If you keep Google Fonts in the iOS app,** most developers in this situation still answer "No data collected", because the font request isn't used for tracking, you never receive the data, and Google isn't an SDK you've built into the app. The strictest reading would have you declare "Coarse Location" (IP-based) as collected by a third party. ⚠ Your call. Bundling the fonts means you never have to make it.

### Tracking
**"Does this app track users?" → No.** No data is linked with other companies' data for advertising, and nothing is shared with data brokers. The game doesn't need to show Apple's App Tracking Transparency prompt.

### ⚠ When you turn on real payments later
Payments through Apple's StoreKit by themselves don't count against your label, because Apple doesn't make you disclose data Apple collects. **If you add RevenueCat**, it stores purchase history under an anonymous app user ID. Update the label at that point, probably to **Purchases > Purchase History**, used for **App Functionality**, and check whether it counts as "linked to the user". RevenueCat publishes guidance for these answers. Update the privacy policy at the same time.

---

## 3. Google Play: Data safety form

Where to find it: Play Console > your app > Policy and programs > App content > Data safety.

Google requires this form even for apps that collect nothing, and it requires a privacy policy ([Google: Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)).

### Draft answers
| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** ⚠ (see Google Fonts below) |
| (Google then skips the encryption and deletion questions) | |
| Privacy policy URL (App content > Privacy policy) | `https://jimsky90.github.io/meteor-pilot/privacy.html` |

The Play listing will show **"No data collected"** and **"No data shared with third parties"**.

### Why "No" is honest
- Google defines "collect" as sending data off the user's device from your app, including through libraries or SDKs. Saving data on the device doesn't count.
- The game sends nothing to you, and it includes no SDKs.

### ⚠ Google Fonts again
In the Play version (Trusted Web Activity), the game runs in Chrome, and Chrome fetches the fonts from Google, so the device's IP address reaches Google. IP address isn't one of the data types the form lists. The closest is "Approximate location", which counts only if the IP is used to work out location. You don't use it, and you never get it. Most developers in this situation answer "No". **Best fix:** bundle the fonts (as described in section 2), and this question goes away.

### ⚠ When you turn on real payments later
Payments through Google Play Billing are handled by Google. If you use RevenueCat (or your own server) to check purchases, declare **Financial info > Purchase history**: *Collected*, for *App functionality*, *Not shared* (RevenueCat counts as a service provider), *Encrypted in transit: Yes*. Update the privacy policy too.

---

## 4. Google Play: IARC content rating questionnaire

Where to find it: Play Console > App content > Content ratings > Start questionnaire. You enter an email address (the rating certificate is sent there), choose the category **"Game"**, and answer the questions. The ratings come back right away, at no cost. ([Google: content ratings](https://support.google.com/googleplay/answer/6209544?hl=en), [IARC: how it works](https://www.globalratings.com/?p=18))

| Topic | Draft answer | Notes |
|---|---|---|
| Category | **Game** | |
| Violence: does the game contain violence? | **⚠ Yes, but only mild, fantasy or abstract violence against non-human things and vehicles**, *or* **No** | Same judgment call as with Apple. The player's ship explodes when it runs out of shields, and the player destroys a boss spaceship. There are no characters, blood or gore. Answering "Yes, fantasy, non-realistic" may add a "Mild Fantasy Violence" note in some regions, but it's the safer answer. |
| Blood or gore | No | |
| Fear or horror | No | |
| Sexual content or nudity | No | |
| Language (swearing) | No | |
| Drugs, alcohol or tobacco | No | |
| Crude humor | No | |
| Gambling: real or simulated | No | |
| Does the game contain random items that can be bought (loot boxes)? | **No** | Fixed-content packs only. |
| Can users interact or exchange content? | **No** | There's no chat, multiplayer or sharing inside the app. Copying your score to the clipboard is something the player does outside the app. |
| Does the app share the user's current location? | No | |
| Does the app allow purchases of digital goods? | **⚠ Depends on the build.** No for v1.0 if the Store tab is hidden (recommended). **Yes** once real Google Play Billing is on. | Answering Yes adds an "In-App Purchases" notice. You'll need to redo the questionnaire when payments go live. |
| Does the app provide unrestricted internet access (browser or search)? | No | |
| Does it contain NFTs or blockchain? | No | Make sure the leftover crypto code mentioned in the audit is gone before submitting. It isn't shown to players, but a reviewer reading the code could see it. |

### Expected IARC results (the most likely outcome, not a guarantee)
| Authority | If violence = No | If violence = mild fantasy |
|---|---|---|
| ESRB (Americas) | Everyone | Everyone, possibly "Mild Fantasy Violence" |
| PEGI (Europe) | PEGI 3 | PEGI 3, or PEGI 7 |
| USK (Germany) | USK 0 | USK 0, or 6 |
| ClassInd (Brazil) | L | L, or 10 |
| ACB (Australia) | G | G, or PG |
| IARC generic (other regions) | 3+ | 3+, or 7+ |

When payments go live, the listings will also show **"In-App Purchases"**. Because there are no loot boxes, it won't say "Includes Random Items".

---

## 5. Other Google Play "App content" forms

| Form | Draft answer | ⚠ |
|---|---|---|
| **App access** | All features are available without special access (no login). | |
| **Ads** | **No**, my app doesn't contain ads. | |
| **Target audience and content** | Age groups: **13–15, 16–17, 18+**. | ⚠ **Big decision.** Picking any age group under 13 brings in Google's Families Policy, with extra rules and reviews. It's doable for a game that collects nothing, but bundle the fonts first. Google also asks whether the listing "could unintentionally appeal to children". The space theme and bright colors do appeal to kids, so answer honestly. If Google thinks the game targets children, it may ask you to follow the Families rules anyway. |
| **News app** | No | |
| **Health apps** | No health features | |
| **Financial features** | None | |
| **Government app** | No | |
| **Data deletion** | Not required, because there are no accounts. | |
| **Store settings > contact details** | An email address (required, and shown publicly). A website (optional): `https://jimsky90.github.io/meteor-pilot/` | ⚠ Use an address you're happy for the public to see. |

## 6. Other Apple App Store Connect questions

| Question | Draft answer | ⚠ |
|---|---|---|
| **Export compliance (encryption)** | Uses only standard HTTPS through the operating system, so it's **exempt**. Add `ITSAppUsesNonExemptEncryption = NO` to the iOS project's Info.plist so you aren't asked on every build. | |
| **Content rights**: does the app contain, show or access third-party content? | **No** if the music is your own and the fonts are bundled under their open license. Answer Yes, with rights confirmed, if you use any licensed music or art. | ⚠ Confirm the soundtrack is original. The code makes it in the game, which suggests it is. |
| **Sign-in information for App Review** | Not needed: "No sign-in required". | |
| **Notes for App Review** | See the template in `LAUNCH-PLAN.md`, part B. | |
| **Price** | Free | |
| **Availability** | All countries, or start with a few. | ⚠ Some countries need extra paperwork. |

---

## Summary of answers you must double-check
1. **Violence level** (Apple and IARC): None, which gives 4+ / PEGI 3, or mild fantasy, which gives 9+ / possibly PEGI 7. Pick one and use the same answer in both stores.
2. **Google Fonts:** decide whether to bundle the fonts before submitting (recommended). It makes "Data Not Collected" / "No data collected" plainly true.
3. **Digital purchases** (IARC): No while the store is hidden, Yes when billing goes live. Then redo the IARC questionnaire, Apple's App Privacy and Google's Data safety form, and update the privacy policy.
4. **Target audience** (Google): 13+ only, or include under 13 (Families Policy).
5. **Unrestricted web access** (Apple): make sure the iOS wrapper opens no outside links inside the app.
6. **Supporter Pass XP boost:** not a form question, but it affects whether you can call purchases "cosmetic".
7. **Public contact email** in both stores and in `privacy.html`, which still shows the placeholder `[your contact email]`.
