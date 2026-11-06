# Lugoba Miracle Center Church — Website (Production)

Real **Firebase Auth + Firestore + Cloudinary**. No demo / localStorage mode.

## 1. Add your API keys

Edit **`js/firebase-config.js`**:

```js
window.LMCC_CONFIG = {
  firebase: {
    apiKey: "AIza…",   // already filled in js/firebase-config.js
    authDomain: "lugoba-19106.firebaseapp.com",
    projectId: "lugoba-19106",
    storageBucket: "lugoba-19106.firebasestorage.app",
    messagingSenderId: "557880643763",
    appId: "1:557880643763:web:…"
  },
  cloudinary: {
    cloudName: "your_cloud_name",
    uploadPreset: "your_unsigned_preset",
    folder: "lugoba-miracle-center"
  },
  adminEmails: [
    "mcclfoundation@gmail.com"
  ],
  whatsappNumber: "256704476063"
};
```

## 2. Firebase Console

1. Create project → **Authentication** → enable **Email/Password** and **Google**.
2. **Firestore** → Create database.
3. Add your domain under **Authentication → Authorized domains**.

### Collections used

| Collection | Purpose |
|------------|---------|
| `users` | Member profiles (`status`, `role`, …) |
| `gallery` | Photo metadata (Cloudinary URLs) |
| `settings` | Doc `hero` = slideshow or video |
| `messages` | Contact form log |

### Security rules

Paste the contents of **`firestore.rules`** (in this folder) into Firebase Console → Firestore → Rules → **Publish**.
Edit the admin email list inside it if you add more admins. These rules enforce that **only the admin** can approve/reject/remove
members, delete gallery items, newsletters, messages, recordings and live comments, and that only **approved** members can read or post live comments.

## 3. Cloudinary

1. Sign up at cloudinary.com  
2. **Settings → Upload** → create an **unsigned** upload preset  
3. Put `cloudName` + preset into `js/firebase-config.js`

## 4. How everything connects

| Feature | Backend |
|---------|---------|
| Sign up / Login / Google | Firebase Auth + `users` collection |
| Admin approval | `users.status` = approved / rejected |
| Gallery upload | Cloudinary → Firestore `gallery` |
| Public Gallery | Reads Firestore `gallery` |
| Hero slideshow / video | Firestore `settings/hero` |
| Contact forms | WhatsApp + Firestore `messages` |

Every page loads (in order):

1. Firebase CDN (app + auth + firestore compat)  
2. `js/firebase-config.js`  
3. `js/app.js`


## Storage architecture

| Content | Where it is stored |
|---------|-------------------|
| Gallery photos | **Cloudinary** (file) + Firestore `gallery` (URL, caption, metadata) |
| Newsletter images | **Cloudinary** folder `…/newsletters` + Firestore `newsletters.imageUrl` |
| Newsletter title & body | **Firebase Firestore** collection `newsletters` |
| Hero slideshow images | **Cloudinary** (when admin uploads) + Firestore `settings/hero` |
| Hero / gallery videos | **Cloudinary** (`…/videos`) + Firestore URL / `resourceType: video` |
| Member accounts | **Firebase Auth** + Firestore `users` |
| Contact messages | **Firestore** `messages` + opens WhatsApp |

Firestore collection for newsletters:

```
newsletters/{id}
  title: string
  body: string          // plain text
  imageUrl: string      // Cloudinary secure_url (optional)
  imagePublicId: string
  author: string
  createdAt: timestamp
  published: boolean
```


## 5. First admin

Use an email listed in `adminEmails`, or set `role: "admin"` on a user document in Firestore. Then open **admin.html**.

## Deploy

Upload the folder to any static host (Firebase Hosting, Netlify, cPanel, etc.).

---

Lugoba Miracle Center Church · Lugoba, Kampala (Bombo Road)  
WhatsApp +256 704 476 063 · mcclfoundation@gmail.com  
Senior Pastor Teopisther Najjuma · Branch Pastor Robert Kalyowa


## Live stream (website platform — independent)

- Page: `live.html` — only **approved** members (or admins) can watch and comment.
- **Primary:** Admin goes live from **Admin → Live Stream → Website Live Studio** (camera or screen share). Stream is built into the website (WebRTC). No YouTube required.
- Members watch in HD (when device/connection allows), comment in real time, and can **invite others** with a shareable live link (WhatsApp, Facebook, copy link).
- Optional: still link a YouTube channel for very large audiences.
- Comments: Firestore `livestream_comments` (real-time).
- Settings: `settings/livestream` (`mode: native` or YouTube).
- Signaling rooms: `live_rooms/{sessionId}/viewers/...` (WebRTC).
- Recordings: collection `recordings` (Cloudinary URL + title). Admin can auto-record while live and upload to Cloudinary when the live ends.

Publish the updated **`firestore.rules`** (includes `live_rooms` signaling rules).

### How to go live on the website

1. Open **Admin → Live Stream**
2. Enter a title → **Open camera (HD)** or **Share screen**
3. Press **GO LIVE on website**
4. Keep that browser tab open. Share the invite link with members.
5. Press **End live** when finished (optional Cloudinary upload of the recording).

**HD tips:** Use Chrome/Edge on a computer, good upload speed (≥ 5 Mbps), and keep the admin tab in the foreground. For very large crowds (100+ concurrent), use the optional YouTube channel link.


## Important login and troubleshooting notes

- The supplied `js/firebase-config.js` contains placeholder values (`YOUR_FIREBASE_API_KEY`, etc.). Replace all six Firebase values with the Web App configuration from Firebase Console → Project settings → Your apps. Authentication cannot work until this is done.
- In Firebase Console → Authentication → Sign-in method, enable Email/Password and Google. Create the administrator account under Authentication → Users (or register it through the site), and ensure its email exactly matches `adminEmails`.
- For an email/password administrator, verify the email using the Firebase verification link before using the admin panel. This is required by the security rules.
- Add the deployed hostname under Authentication → Settings → Authorized domains. Test over HTTPS.
- Publish the included `firestore.rules`; ensure the email in `isListedAdmin()` matches `adminEmails` exactly. Do not make the database public to bypass login.
- Contact messages are saved to Firestore `messages`. The updated code now reports a Firestore write error instead of silently claiming that the message was logged. WhatsApp is a separate hand-off.
- Live video must be broadcast by YouTube Studio or another streaming provider. Start a broadcast, then paste its actual YouTube live watch URL (for example `https://www.youtube.com/watch?v=VIDEO_ID`) into Admin → Live Stream → Manual stream URL, select YouTube, and save/start it. A channel ID alone cannot guarantee a currently active public broadcast. The broadcast must be public or unlisted and embeddable.
- Live comments and recordings require a signed-in approved member or administrator. Pending accounts are intentionally blocked.
- For remaining errors, open browser Developer Tools → Console and check the first Firebase error: `auth/unauthorized-domain`, `auth/invalid-credential`, `permission-denied`, or `failed-precondition`.


## Go-live checklist (do these once in the Firebase / Cloudinary consoles)

1. **Authentication → Sign-in method:** enable **Google** and **Email/Password**.
2. **Authentication → Settings → Authorized domains:** add your live domain (and `localhost` for testing).
3. **Firestore Database → Rules:** paste `firestore.rules` and **Publish** (contact messages, gallery delete and admin access all depend on it).
4. **Cloudinary → Settings → Upload → Upload presets:** `lugoba_gallery` must be **Unsigned**.
5. **Admin login:** easiest is **Continue with Google** using `mcclfoundation@gmail.com`. For email + password, the email must be verified (a link is sent on first sign-in).

Deleting a photo removes it from the website. The original file stays in your Cloudinary Media Library and can be removed there.


## Relworx donations (MTN / Airtel PIN prompt)

`donate.html` talks to two Firebase Cloud Functions in `functions/`. The Relworx API key and
business account number are stored as Firebase **secrets**, never in the website files.

Deploy once (needs the Firebase **Blaze** plan, which has a free monthly allowance):

```bash
npm install -g firebase-tools
firebase login
firebase use lugoba
cd functions && npm install && cd ..
firebase functions:secrets:set RELWORX_API_KEY        # paste your (new) Relworx API key
firebase functions:secrets:set RELWORX_ACCOUNT_NO     # paste your Relworx business account number
firebase deploy --only functions,firestore:rules
```

Then confirm `relworxApiBase` in `js/firebase-config.js` matches the URLs printed by the deploy.
Paid, failed and pending gifts appear in the Firestore `donations` collection (status `paid` is set
only by the server after Relworx confirms the amount). Bank transfers stay manual.
