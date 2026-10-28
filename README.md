# Lugoba Miracle Center Church — Website (Production)

Real **Firebase Auth + Firestore + Cloudinary**. No demo / localStorage mode.

## 1. Add your API keys

Edit **`js/firebase-config.js`**:

```js
window.LMCC_CONFIG = {
  firebase: {
    apiKey: "AIza…",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "……",
    appId: "1:……:web:……"
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

### Example security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null &&
        request.auth.token.email in ['mcclfoundation@gmail.com'];
    }
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if isAdmin() ||
        (request.auth.uid == userId &&
         !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role','status']));
    }
    match /gallery/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /settings/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /messages/{id} {
      allow create: if true;
      allow read, update, delete: if isAdmin();
    }
  }
}
```

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

Add to security rules:

```
match /newsletters/{id} {
  allow read: if true;
  allow write: if isAdmin();
}
```

## 5. First admin

Use an email listed in `adminEmails`, or set `role: "admin"` on a user document in Firestore. Then open **admin.html**.

## Deploy

Upload the folder to any static host (Firebase Hosting, Netlify, cPanel, etc.).

---

Lugoba Miracle Center Church · Lugoba, Kampala (Bombo Road)  
WhatsApp +256 704 476 063 · mcclfoundation@gmail.com  
Senior Pastor Teopisther Najjuma · Branch Pastor Robert Kalyowa
