# AccountaBuild — Play Console Data Safety + Health declarations (answers)

Play Console → App content → **Data safety**. Walk the wizard; here are the answers that match how AccountaBuild actually works.

## 1. Overview
- **Does your app collect or share any of the required user data types?** → **Yes**
- **Is all user data encrypted in transit?** → **Yes** (Firebase uses HTTPS/TLS)
- **Do you provide a way for users to request that their data be deleted?** → **Yes** (in-app account deletion + email jake@munitor.ai). Provide the deletion method.

## 2. Data types collected (mark Collected = Yes; Shared = No for all — data is only visible to the user's own group members, which Google treats as app functionality, not third-party "sharing"; do NOT mark Shared unless you send data to a separate company)

| Data type | Collected | Purpose(s) | Optional? |
|---|---|---|---|
| **Email address** | Yes | App functionality; Account management | Required |
| **Name** (display name) | Yes | App functionality; Account management | Required |
| **Health & fitness** (workouts, calories/nutrition, weight) | Yes | App functionality | **Optional** (only if user enables sync / logs it) |
| **Photos** (progress photos) | Yes | App functionality | Optional |
| **App activity / in-app messages** (group chat, reactions) | Yes | App functionality | Optional |
| **App info & performance / diagnostics** | Yes | App functionality; (optionally) Analytics | Optional |
| **User IDs** | Yes | App functionality; Account management | Required |

Notes for each:
- For **Health and fitness**: purpose = **App functionality** only. Do NOT check Advertising or Analytics for it.
- **Shared** = No for everything (you're not handing data to a separate company; Firebase is a processor, not a recipient — Google's form explicitly excludes service providers/processors from "sharing").
- **Processed ephemerally?** No — logs are stored.
- **Is this data required or optional?** Email/Name/UserID = required to use the app; everything else = optional.

## 3. Security practices
- Encrypted in transit: **Yes**
- Users can request deletion: **Yes**
- Committed to Play Families Policy: **No** (not a kids app)
- Independent security review: **No** (leave unchecked)

---

# Health Connect declaration (required — Google reviews Health Connect apps closely)

Play Console → App content → look for **Health Connect** / **Health apps** declaration (also reachable during the review of the release). Expect to provide:

1. **Which Health Connect permissions you request and why** (paste this):
   - `READ_EXERCISE` — to import the user's workouts into their AccountaBuild log so they don't re-enter them.
   - `READ_NUTRITION` — to import calorie/nutrition entries into their daily log.
   - `READ_WEIGHT` — to import body-weight entries into their weight log.
   - We request **read-only** access, only for data types the user grants, and only when the user enables sync in-app. We do not write to Health Connect and do not use health data for ads.

2. **Privacy policy URL** covering health data → the same policy (privacy-policy.html). It already includes a dedicated "How health data is handled" section, which Google requires.

3. **Demo video (often requested):** a short screen recording showing (a) the user enabling Health sync in AccountaBuild, (b) the Health Connect permission dialog, and (c) synced data appearing in the log. Record this once the app is installed from the internal-testing build.

4. **In-app disclosure:** the app tells the user, before requesting Health Connect permissions, that it will read workouts/nutrition/weight to populate their logs (the Health settings screen + the system permission dialog cover this).

---

# Suggested submission order (once account + service-account key exist)
1. Create the app in Play Console (name AccountaBuild, App, Free, Health & Fitness).
2. Fill **Store listing** (STORE_LISTING.md) + graphics.
3. Fill **App content**: Privacy policy URL, App access (reviewer test login), Ads (No ads → declare none), Content rating (IARC), Data safety (this file), Government apps (No), Health declaration.
4. **Internal testing** track → add your testers' emails.
5. From the project: `eas submit --platform android --profile production` (uploads the built .aab to the internal track as a draft). Then in Play Console, review & roll out to Internal testing.
6. Install via the internal-testing opt-in link on an Android phone, verify Health Connect sync, record the demo video, then promote toward Production when ready.
