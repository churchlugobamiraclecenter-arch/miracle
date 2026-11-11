
window.LMCC_CONFIG = {
  firebase: {
    apiKey: "AIzaSyD3JyGyVAHUt1DcFKMJVM1a5Tb5xISjKSY",
  authDomain: "lugoba.firebaseapp.com",
  projectId: "lugoba",
  storageBucket: "lugoba.firebasestorage.app",
  messagingSenderId: "959628417659",
  appId: "1:959628417659:web:7a3e563e39b6404402e0de",
  measurementId: "G-LP8CSWGBGN"
  },
  cloudinary: {
    cloudName: "r7eut0eh",
    uploadPreset: "lugoba_gallery",
    folder: "lugoba-miracle-center"
  },
  adminEmails: [
    "churchlugobamiraclecenter@gmail.com"
  ],
  whatsappNumber: "256704476063",
  // ── Donations ────────────────────────────────────────────────────────
  donations: {
    currency: "UGX",
    minAmount: 1000,
    mtnNumber: "0779233915",      // MTN MoMo receiving number
    airtelNumber: "0705505598",   // Airtel Money receiving number
    accountName: "Lugoba Miracle Center & Church Foundation Ltd",
    bank: {
      bankName: "ADD BANK NAME",          // <-- fill in
      accountName: "ADD ACCOUNT NAME",    // <-- fill in
      accountNumber: "ADD ACCOUNT NUMBER",// <-- fill in
      branch: ""
    },
    // Relworx automatic PIN prompt (MTN / Airtel). The API key lives ONLY in the
    // Firebase Cloud Functions secrets - never here. After deploying the functions,
    // this is the base URL they are served from. Leave empty to use manual mode.
   // Empty = manual mode (donor sends to the numbers above, no gateway needed).
   // To switch on the automatic PIN prompt, set this to the Worker URL:
   // "https://lugoba-pay.churchlugobamiraclecenter.workers.dev"
   relworxApiBase: ""
  },
  // Miracle Center Church Lugoba — auto live when this channel goes live on YouTube
  youtubeChannelId: "UCnBi7R15W7GB7E8Zc2SsrKg",
  // Website live stream (WebRTC) relay servers. STUN alone fails for many viewers on mobile data.
  // Add a TURN service here (Cloudflare Calls TURN, Metered, Twilio, or your own coturn), e.g.:
  //   { urls: ["turn:YOUR_TURN_HOST:3478", "turns:YOUR_TURN_HOST:443?transport=tcp"], username: "...", credential: "..." }
  // Leave empty to use free Google STUN only.
  iceServers: []
};
