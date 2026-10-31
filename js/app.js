/**
 * Lugoba Miracle Center Church — Application Core
 * Real Firebase Auth + Firestore + Cloudinary.
 */
(function () {
  'use strict';

  // Always expose LMCC so login buttons never throw "LMCC is not defined"
  window.LMCC = window.LMCC || {};

  const CFG = window.LMCC_CONFIG;
  if (!CFG || !CFG.firebase) {
    console.error('LMCC_CONFIG missing. Check that js/firebase-config.js is uploaded and loads before js/app.js');
    LMCC.signInEmail = function () {
      return Promise.reject(new Error('Config missing: upload js/firebase-config.js with your Firebase keys'));
    };
    LMCC.signInGoogle = function () {
      return Promise.reject(new Error('Config missing: upload js/firebase-config.js with your Firebase keys'));
    };
    LMCC.isAdmin = function () { return false; };
    LMCC.esc = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };
    return;
  }

  const ADMIN_EMAILS = (CFG.adminEmails || []).map(function (e) { return e.toLowerCase(); });
  const WA = CFG.whatsappNumber || '256704476063';

  var app, auth, db;
  var currentUser = null;
  var userProfile = null;
  var isAdmin = false;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function toast(msg, type) {
    type = type || 'info';
    var el = document.getElementById('lmcc-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lmcc-toast';
      el.style.cssText = 'position:fixed;bottom:90px;right:20px;z-index:9999;max-width:340px;padding:12px 18px;border-radius:10px;font-size:0.92rem;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.15);transition:opacity .3s,transform .3s;opacity:0;transform:translateY(12px);';
      document.body.appendChild(el);
    }
    var map = {
      success: ['#e6f4ea', '#137333'],
      error: ['#fce8e6', '#c5221f'],
      warning: ['#fef7e0', '#b06000'],
      info: ['#e8f0fe', '#1967d2']
    };
    var c = map[type] || map.info;
    el.style.background = c[0];
    el.style.color = c[1];
    el.style.borderLeft = '4px solid ' + c[1];
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
    }, 4500);
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isListedAdmin(user) {
    // Listed admin emails only count when the email is verified (stops someone
    // registering the admin address by password and getting admin rights).
    return !!(user && user.email &&
      ADMIN_EMAILS.indexOf(user.email.toLowerCase()) !== -1 && user.emailVerified);
  }

  function waLink(text) {
    return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(text || 'Hello Lugoba Miracle Center Church');
  }

  function isConfigured() {
    return CFG.firebase.apiKey && CFG.firebase.apiKey !== 'YOUR_FIREBASE_API_KEY';
  }

  function initFirebase() {
    if (!isConfigured()) {
      console.warn('Firebase keys not set. Add them in js/firebase-config.js');
      toast('Add your Firebase API keys in js/firebase-config.js', 'warning');
      updateAuthUI();
      return;
    }
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK not loaded');
      toast('Firebase SDK missing', 'error');
      return;
    }
    try {
      app = firebase.initializeApp(CFG.firebase);
      auth = firebase.auth();
      db = firebase.firestore();

      auth.onAuthStateChanged(async function (user) {
        currentUser = user;
        userProfile = null;
        isAdmin = false;

        if (user) {
          try {
            var snap = await db.collection('users').doc(user.uid).get();
            if (snap.exists) {
              userProfile = snap.data();
            } else {
              userProfile = {
                email: user.email,
                displayName: user.displayName || '',
                status: 'pending',
                role: 'member',
                provider: (user.providerData[0] && user.providerData[0].providerId) || 'unknown',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              };
              await db.collection('users').doc(user.uid).set(userProfile, { merge: true });
            }
            var emailLc = (user.email || '').toLowerCase();
            isAdmin =
              isListedAdmin(user) ||
              (userProfile && userProfile.role === 'admin' && userProfile.status === 'approved');
            // Listed admin emails are always promoted (fixes first-admin lockout)
            if (isAdmin) {
              try {
                await db.collection('users').doc(user.uid).set(
                  {
                    role: 'admin',
                    status: 'approved',
                    email: user.email
                  },
                  { merge: true }
                );
                if (userProfile) {
                  userProfile.role = 'admin';
                  userProfile.status = 'approved';
                }
              } catch (promoteErr) {
                console.warn('Admin promote skipped', promoteErr);
              }
            }
          } catch (err) {
            console.error('Profile load error', err);
          }
        }

        updateAuthUI();
        document.dispatchEvent(
          new CustomEvent('lmcc:auth', {
            detail: { user: currentUser, profile: userProfile, isAdmin: isAdmin }
          })
        );
      });
    } catch (err) {
      console.error('Firebase init error', err);
      toast('Firebase failed: ' + err.message, 'error');
    }
  }

  function updateAuthUI() {
    $$('.auth-guest').forEach(function (el) { el.classList.toggle('hidden', !!currentUser); });
    $$('.auth-user').forEach(function (el) { el.classList.toggle('hidden', !currentUser); });
    $$('.auth-admin').forEach(function (el) { el.classList.toggle('hidden', !isAdmin); });

    var nameEl = $('.auth-display-name');
    if (nameEl && currentUser) {
      nameEl.textContent =
        currentUser.displayName ||
        (userProfile && userProfile.displayName) ||
        currentUser.email ||
        'Member';
    }
    var avatar = $('.auth-avatar');
    if (avatar && currentUser) {
      var src = currentUser.displayName || currentUser.email || 'M';
      avatar.textContent = src.charAt(0).toUpperCase();
    }
  }

  window.LMCC = window.LMCC || {};

  LMCC.esc = esc;
  LMCC.toast = toast;
  LMCC.isAdmin = function () { return isAdmin; };
  LMCC.currentUser = function () { return currentUser; };
  LMCC.userProfile = function () { return userProfile; };

  LMCC.signUpEmail = async function (email, password, fullName, phone) {
    if (!auth) throw new Error('Firebase not configured — add keys in js/firebase-config.js');
    var cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: fullName });
    await db.collection('users').doc(cred.user.uid).set({
      email: email,
      displayName: fullName,
      phone: phone || '',
      status: 'pending',
      role: 'member',
      provider: 'password',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Account created. Awaiting admin approval.', 'success');
    return cred.user;
  };

  LMCC.signInEmail = async function (email, password) {
    if (!auth) throw new Error('Firebase not configured — add keys in js/firebase-config.js');
    var cred = await auth.signInWithEmailAndPassword(email, password);
    var snap = await db.collection('users').doc(cred.user.uid).get();
    var data = snap.exists ? snap.data() : {};
    var listed = ADMIN_EMAILS.indexOf((email || '').toLowerCase()) !== -1;
    if (listed && !cred.user.emailVerified) {
      try { await cred.user.sendEmailVerification(); } catch (e) {}
      await auth.signOut();
      throw new Error('Please verify your email first. We just sent a verification link to ' + email + ' — click it, then sign in again.');
    }
    var admin = listed || (data && data.role === 'admin');
    if (admin) {
      await db.collection('users').doc(cred.user.uid).set(
        { role: 'admin', status: 'approved', email: email },
        { merge: true }
      );
      isAdmin = true;
      toast('Welcome, administrator!', 'success');
      return cred.user;
    }
    if (data && data.status === 'pending') {
      toast('Your account is still pending admin approval.', 'warning');
      await auth.signOut();
      throw new Error('pending');
    }
    if (data && data.status === 'rejected') {
      toast('This account was not approved.', 'error');
      await auth.signOut();
      throw new Error('rejected');
    }
    toast('Welcome back!', 'success');
    return cred.user;
  };

  LMCC.signInGoogle = async function () {
    if (!auth) throw new Error('Firebase not configured — add keys in js/firebase-config.js');
    var provider = new firebase.auth.GoogleAuthProvider();
    var cred = await auth.signInWithPopup(provider);
    var ref = db.collection('users').doc(cred.user.uid);
    var snap = await ref.get();
    var emailLc = (cred.user.email || '').toLowerCase();
    var listedAdmin = ADMIN_EMAILS.indexOf(emailLc) !== -1;
    if (listedAdmin || (snap.exists && snap.data().role === 'admin')) {
      await ref.set(
        {
          email: cred.user.email,
          displayName: cred.user.displayName || '',
          status: 'approved',
          role: 'admin',
          provider: 'google.com'
        },
        { merge: true }
      );
      isAdmin = true;
      toast('Welcome, administrator!', 'success');
      return cred.user;
    }
    if (!snap.exists) {
      await ref.set({
        email: cred.user.email,
        displayName: cred.user.displayName || '',
        status: 'pending',
        role: 'member',
        provider: 'google.com',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      toast('Welcome! Your account is pending admin approval.', 'info');
      await auth.signOut();
      throw new Error('pending');
    }
    var data = snap.data() || {};
    if (data.status === 'pending') {
      toast('Your account is still pending admin approval.', 'warning');
      await auth.signOut();
      throw new Error('pending');
    }
    toast('Welcome back!', 'success');
    return cred.user;
  };

  LMCC.signOut = async function () {
    if (auth) await auth.signOut();
    currentUser = null;
    userProfile = null;
    isAdmin = false;
    updateAuthUI();
    toast('Signed out', 'info');
  };

  LMCC.getPendingUsers = async function () {
    if (!db || !isAdmin) return [];
    var snap = await db.collection('users').where('status', '==', 'pending').get();
    return snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
  };

  LMCC.getAllUsers = async function () {
    if (!db || !isAdmin) return [];
    // No orderBy: documents without createdAt (e.g. promoted admins) would be dropped.
    var snap = await db.collection('users').limit(500).get();
    var rows = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
    rows.sort(function (a, b) {
      var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return rows;
  };

  /** Removes the member's profile from Firestore. (The Firebase Auth login itself can only be
   *  removed in Firebase Console → Authentication; a removed member who signs in again returns as "pending".) */
  LMCC.deleteUserRecord = async function (uid) {
    if (!isAdmin) throw new Error('Admin only');
    if (currentUser && uid === currentUser.uid) throw new Error('You cannot remove your own account');
    await db.collection('users').doc(uid).delete();
    toast('Member record removed', 'info');
  };

  LMCC.approveUser = async function (uid) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('users').doc(uid).update({
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUser.email
    });
    toast('User approved', 'success');
  };

  LMCC.rejectUser = async function (uid) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('users').doc(uid).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('User rejected', 'info');
  };

  LMCC.uploadToCloudinary = async function (file, subfolder) {
    var c = CFG.cloudinary;
    if (!c || !c.cloudName || c.cloudName === 'YOUR_CLOUDINARY_CLOUD_NAME') {
      throw new Error('Cloudinary not configured. Set cloudName and uploadPreset in js/firebase-config.js');
    }
    var isVideo = (file.type || '').indexOf('video/') === 0 ||
      /\.(mp4|webm|mov|m4v|avi)$/i.test(file.name || '');
    var resource = isVideo ? 'video' : 'image';
    var form = new FormData();
    form.append('file', file);
    form.append('upload_preset', c.uploadPreset);
    var folder = c.folder || 'lugoba-miracle-center';
    if (subfolder) folder = folder + '/' + subfolder;
    else if (isVideo) folder = folder + '/videos';
    form.append('folder', folder);

    var res = await fetch(
      'https://api.cloudinary.com/v1_1/' + c.cloudName + '/' + resource + '/upload',
      { method: 'POST', body: form }
    );
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error((err.error && err.error.message) || 'Cloudinary upload failed');
    }
    var data = await res.json();
    return {
      url: data.secure_url,
      publicId: data.public_id,
      resourceType: data.resource_type || resource,
      width: data.width,
      height: data.height,
      duration: data.duration || null,
      format: data.format || null
    };
  };

  LMCC.addGalleryItem = async function (file, caption) {
    if (!isAdmin) throw new Error('Admin only');
    toast("Uploading to Cloudinary…", "info");
    var uploaded = await LMCC.uploadToCloudinary(file);
    var item = {
      url: uploaded.url,
      publicId: uploaded.publicId,
      resourceType: uploaded.resourceType || 'image',
      caption: caption || file.name.replace(/\.[^.]+$/, ''),
      duration: uploaded.duration || null,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy: currentUser.email
    };
    var ref = await db.collection('gallery').add(item);
    toast('Photo added to gallery', 'success');
    return Object.assign({ id: ref.id }, item, { url: uploaded.url });
  };

  LMCC.getGallery = async function () {
    if (!db) return [];
    var snap = await db.collection('gallery').orderBy('uploadedAt', 'desc').limit(60).get();
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  };

  LMCC.deleteGalleryItem = async function (id) {
    if (!isAdmin) throw new Error('Admin only');
    try {
      await db.collection('gallery').doc(id).delete();
    } catch (e) {
      if (e && e.code === 'permission-denied') {
        throw new Error('Permission denied. Publish firestore.rules in Firebase Console and sign in with the verified admin email.');
      }
      throw e;
    }
    toast('Photo removed from the gallery', 'info');
  };

  LMCC.renderGallery = async function (selector) {
    var el = $(selector);
    if (!el) return;
    el.innerHTML = '<div class="spinner"></div>';
    try {
      var items = await LMCC.getGallery();
      if (!items.length) {
        el.innerHTML = '<p style="text-align:center;color:var(--ink-soft);grid-column:1/-1">No photos yet. Administrators can upload from the dashboard.</p>';
        return;
      }
      el.innerHTML = items
        .map(function (item) {
        var media;
        if (item.resourceType === 'video') {
          media = '<video src="' + esc(LMCC.playableVideoUrl(item.url)) + '" controls playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;background:#000"></video>';
        } else {
          media = '<img src="' + esc(item.url) + '" alt="' + esc(item.caption || 'Church photo') + '" loading="lazy">';
        }
        return '<div class="gallery-item" data-id="' + esc(item.id) + '">' + media +
          '<button type="button" class="gallery-del auth-admin hidden" data-del-gallery="' + esc(item.id) + '">Delete</button>' +
          '<div class="caption">' + esc(item.caption || '') + (item.resourceType === 'video' ? ' · Video' : '') + '</div></div>';
      }).join('');
      updateAuthUI();
      if (!el._delBound) {
        el._delBound = true;
        el.addEventListener('click', async function (e) {
          var b = e.target.closest('[data-del-gallery]');
          if (!b) return;
          if (!confirm('Delete this photo/video from the gallery?')) return;
          try {
            await LMCC.deleteGalleryItem(b.getAttribute('data-del-gallery'));
            var card = b.closest('.gallery-item');
            if (card) card.remove();
          } catch (err) { toast(err.message || 'Delete failed', 'error'); }
        });
      }
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p style="text-align:center;color:#c5221f">Could not load gallery. Check Firebase configuration.</p>';
    }
  };

  LMCC.getHero = async function () {
    var defaults = {
      type: 'slideshow',
      slides: [
        'images/pastors-service.jpg',
        'images/worship-celebration.jpg',
        'images/congregation-leaders.jpg',
        'images/women-ministry.jpg',
        'images/worship-drums.jpg'
      ]
    };
    if (!db) return defaults;
    try {
      var snap = await db.collection('settings').doc('hero').get();
      if (snap.exists) return snap.data();
    } catch (e) {
      console.warn('Hero load', e);
    }
    return defaults;
  };

  LMCC.setHeroSlides = async function (urls) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('settings').doc('hero').set({
      type: 'slideshow',
      slides: urls,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email
    }, { merge: true });
    toast('Hero slideshow updated', 'success');
  };


  LMCC.resetHero = async function () {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('settings').doc('hero').delete();
    toast('Homepage hero reset to the default church photos', 'info');
  };

  LMCC.uploadHeroVideo = async function (file) {
    if (!isAdmin) throw new Error('Admin only');
    if (!file) throw new Error('Choose a video file');
    var uploaded = await LMCC.uploadToCloudinary(file, 'videos');
    if (uploaded.resourceType !== 'video') {
      throw new Error('File was not stored as video on Cloudinary');
    }
    await LMCC.setHeroVideo(uploaded.url);
    return uploaded;
  };

  LMCC.setHeroVideo = async function (url) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('settings').doc('hero').set({
      type: 'video',
      url: url,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email
    }, { merge: true });
    toast('Hero video set', 'success');
  };

  LMCC.sendMessage = async function (name, message) {
    name = String(name || 'Visitor').trim().slice(0, 120);
    message = String(message || '').trim();
    if (!message) throw new Error('Please enter a message before sending.');
    if (message.length > 2000) throw new Error('Your message is too long (maximum 2,000 characters).');
    if (!db) throw new Error('Message service is not connected. Please try again later or contact the church on WhatsApp.');
    try {
      await db.collection('messages').add({
        name: name || 'Visitor',
        message: message,
        at: firebase.firestore.FieldValue.serverTimestamp(),
        userId: currentUser ? currentUser.uid : null
      });
    } catch (e) {
      console.error('Could not save contact message:', e);
      throw new Error('Your message could not be saved (' + (e.code || 'Firestore error') + '). Please contact the church directly on WhatsApp.');
    }
    var waText = 'Hello Lugoba Miracle Center Church\n\nFrom: ' + name + '\n\n' + message;
    try { window.open(waLink(waText), '_blank', 'noopener'); } catch (e) {}
    toast('Thank you! Your message has been sent to the church.', 'success');
    return true;
  };

  var VIEW_TTL_MS = 30 * 60 * 1000; // 30 minutes after admin views a message

  function messageViewedAtMs(m) {
    if (!m || !m.viewedAt) return null;
    if (m.viewedAt.toDate) return m.viewedAt.toDate().getTime();
    if (typeof m.viewedAt === 'number') return m.viewedAt;
    return null;
  }

  function isMessageExpired(m) {
    var viewed = messageViewedAtMs(m);
    if (viewed == null) return false;
    return Date.now() - viewed >= VIEW_TTL_MS;
  }

  LMCC.getMessages = async function () {
    if (!db || !isAdmin) return [];
    var snap = await db.collection('messages').orderBy('at', 'desc').limit(50).get();
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
      .filter(function (m) { return !isMessageExpired(m); });
  };

  LMCC.deleteMessage = async function (id) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('messages').doc(id).delete();
    toast('Message deleted', 'info');
  };

  /** Mark one or more messages as viewed by admin (sets viewedAt only if missing). */
  LMCC.markMessagesViewed = async function (ids) {
    if (!db || !isAdmin || !ids || !ids.length) return;
    try {
      var unique = [];
      var seen = {};
      ids.forEach(function (id) {
        if (id && !seen[id]) { seen[id] = true; unique.push(id); }
      });
      var batch = db.batch();
      var count = 0;
      for (var i = 0; i < unique.length; i++) {
        var snap = await db.collection('messages').doc(unique[i]).get();
        if (!snap.exists) continue;
        if (snap.data().viewedAt) continue; // do not reset the 30-min clock
        batch.update(snap.ref, {
          viewedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        count++;
      }
      if (count) await batch.commit();
    } catch (e) {
      console.warn('markMessagesViewed failed', e);
    }
  };

  /**
   * Delete messages that the admin has already viewed and that are older than 30 minutes.
   * Safe to call periodically while the admin dashboard is open.
   */
  LMCC.purgeViewedMessages = async function () {
    if (!db || !isAdmin) return 0;
    var snap = await db.collection('messages').orderBy('at', 'desc').limit(50).get();
    var now = Date.now();
    var toDelete = [];
    snap.docs.forEach(function (d) {
      var data = d.data();
      var viewed = data.viewedAt
        ? (data.viewedAt.toDate ? data.viewedAt.toDate().getTime() : data.viewedAt)
        : null;
      if (viewed != null && now - viewed >= VIEW_TTL_MS) {
        toDelete.push(d.id);
      }
    });
    if (!toDelete.length) return 0;
    var batch = db.batch();
    toDelete.forEach(function (id) {
      batch.delete(db.collection('messages').doc(id));
    });
    await batch.commit();
    return toDelete.length;
  };

  /**
   * Real-time messages for admin dashboard.
   * - onUpdate(items): full list (excludes expired viewed messages)
   * - onNew(row): only for messages that arrive after subscribe (for multi-toast UI)
   * Automatically marks newly arrived messages as viewed so the 30-min TTL starts.
   */
  LMCC.listenMessages = function (onUpdate, onNew) {
    if (!db || !isAdmin) return function () {};
    var initial = true;
    var seen = {};
    return db.collection('messages')
      .orderBy('at', 'desc')
      .limit(50)
      .onSnapshot(function (snap) {
        var items = snap.docs.map(function (d) {
          return Object.assign({ id: d.id }, d.data());
        }).filter(function (m) { return !isMessageExpired(m); });

        if (onUpdate) onUpdate(items);

        if (!initial && onNew) {
          var newlyAdded = [];
          snap.docChanges().forEach(function (change) {
            if (change.type === 'added') {
              var row = Object.assign({ id: change.doc.id }, change.doc.data());
              if (!seen[row.id] && !isMessageExpired(row)) {
                seen[row.id] = true;
                newlyAdded.push(row);
                onNew(row);
              }
            }
          });
          // Start the 30-min clock as soon as admin sees the live notification
          if (newlyAdded.length) {
            LMCC.markMessagesViewed(newlyAdded.map(function (m) { return m.id; }));
          }
        } else {
          items.forEach(function (m) { seen[m.id] = true; });
        }
        initial = false;
      }, function (err) {
        console.error('messages listener', err);
      });
  };


  // ── Newsletter (text in Firestore, images in Cloudinary) ────────────
  LMCC.createNewsletter = async function (title, body, imageFile, author) {
    if (!isAdmin) throw new Error('Admin only');
    if (!title || !body) throw new Error('Title and body are required');
    var imageUrl = '';
    var publicId = '';
    if (imageFile) {
      var uploaded = await LMCC.uploadToCloudinary(imageFile, 'newsletters');
      imageUrl = uploaded.url;
      publicId = uploaded.publicId;
    }
    var doc = {
      title: title,
      body: body,
      imageUrl: imageUrl,
      imagePublicId: publicId,
      author: author || (currentUser && currentUser.email) || 'Church Office',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      published: true
    };
    var ref = await db.collection('newsletters').add(doc);
    toast('Newsletter published', 'success');
    return Object.assign({ id: ref.id }, doc);
  };

  LMCC.getNewsletters = async function () {
    if (!db) return [];
    var snap = await db
      .collection('newsletters')
      .orderBy('createdAt', 'desc')
      .limit(40)
      .get();
    return snap.docs.map(function (d) {
      return Object.assign({ id: d.id }, d.data());
    });
  };

  LMCC.deleteNewsletter = async function (id) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('newsletters').doc(id).delete();
    toast('Newsletter removed', 'info');
  };

  LMCC.renderNewsletters = async function (selector) {
    var el = $(selector);
    if (!el) return;
    el.innerHTML = '<div class="spinner"></div>';
    try {
      var items = await LMCC.getNewsletters();
      if (!items.length) {
        el.innerHTML =
          '<p style="text-align:center;color:var(--ink-soft)">No newsletters yet. Check back soon.</p>';
        return;
      }
      el.innerHTML = items
        .map(function (n) {
          var when =
            n.createdAt && n.createdAt.toDate
              ? n.createdAt.toDate().toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })
              : '';
          var img = n.imageUrl
            ? '<img src="' +
              esc(n.imageUrl) +
              '" alt="" style="border-radius:var(--radius-md);margin-top:1rem;max-height:280px;width:100%;object-fit:cover;">'
            : '';
          return (
            '<article class="card" style="margin-bottom:1.5rem">' +
            '<h3>' +
            (n.title || '').replace(/</g, '&lt;') +
            '</h3>' +
            '<p style="color:var(--ink-soft);font-size:.9rem;margin-bottom:.6rem">' +
            (when ? when + ' · ' : '') +
            (n.author || 'Church Office').replace(/</g, '&lt;') +
            '</p>' +
            '<p style="white-space:pre-wrap">' +
            (n.body || '').replace(/</g, '&lt;') +
            '</p>' +
            img +
            '</article>'
          );
        })
        .join('');
    } catch (err) {
      console.error(err);
      el.innerHTML =
        '<p style="text-align:center;color:#c5221f">Could not load newsletters. Check Firebase configuration.</p>';
    }
  };



  // ── Record browser capture → Cloudinary (admin live studio) ─────────
  LMCC.uploadVideoBlob = async function (blob, filename, subfolder, onProgress) {
    if (!isAdmin) throw new Error('Admin only');
    var c = CFG.cloudinary;
    if (!c || !c.cloudName || c.cloudName === 'YOUR_CLOUDINARY_CLOUD_NAME') {
      throw new Error('Cloudinary not configured');
    }
    var file = new File([blob], filename || ('live-' + Date.now() + '.webm'), {
      type: blob.type || 'video/webm'
    });
    // Use XHR for upload progress
    return new Promise(function (resolve, reject) {
      var form = new FormData();
      form.append('file', file);
      form.append('upload_preset', c.uploadPreset);
      form.append('folder', (c.folder || 'lugoba-miracle-center') + '/' + (subfolder || 'recordings'));
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + c.cloudName + '/video/upload');
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = function () {
        try {
          var data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
            resolve({
              url: data.secure_url,
              publicId: data.public_id,
              resourceType: 'video',
              duration: data.duration || null,
              format: data.format || null,
              bytes: data.bytes || null
            });
          } else {
            reject(new Error((data.error && data.error.message) || 'Cloudinary video upload failed'));
          }
        } catch (err) {
          reject(err);
        }
      };
      xhr.onerror = function () { reject(new Error('Network error uploading to Cloudinary')); };
      xhr.send(form);
    });
  };

  LMCC.finishLiveAndStoreRecording = async function (blob, meta) {
    if (!isAdmin) throw new Error('Admin only');
    meta = meta || {};
    var uploaded = await LMCC.uploadVideoBlob(
      blob,
      meta.filename || ('service-' + Date.now() + '.webm'),
      'recordings',
      meta.onProgress
    );
    await LMCC.saveRecording(uploaded.url, meta.title || 'Live service recording');
    await LMCC.stopLiveStream(uploaded.url);
    // keep stream doc pointing at recording for replay
    await db.collection('settings').doc('livestream').set({
      active: false,
      recordingUrl: uploaded.url,
      lastRecordingPublicId: uploaded.publicId,
      endedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    toast('Recording stored on Cloudinary', 'success');
    return uploaded;
  };



  /** Auto live embed from YouTube Channel ID — no copy-paste each stream. */
  LMCC.youtubeChannelLiveEmbed = function (channelId) {
    if (!channelId) return '';
    channelId = String(channelId).trim();
    var m = channelId.match(/channel\/(UC[\w-]+)/i);
    if (m) channelId = m[1];
    if (channelId.indexOf('UC') !== 0) return '';
    return 'https://www.youtube.com/embed/live_stream?channel=' + encodeURIComponent(channelId) + '&autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1';
  };

  /** Show / hide the stream on the member Live page without losing the channel link. */
  LMCC.setLiveVisible = async function (visible) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('settings').doc('livestream').set({
      active: !!visible,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: (currentUser && currentUser.email) || ''
    }, { merge: true });
    toast(visible ? 'Live page is ON for members' : 'Live page is OFF for members', visible ? 'success' : 'info');
  };

  LMCC.setYoutubeChannel = async function (channelId, title) {
    if (!isAdmin) throw new Error('Admin only');
    channelId = String(channelId || '').trim();
    var m = channelId.match(/channel\/(UC[\w-]+)/i);
    if (m) channelId = m[1];
    if (channelId.indexOf('UC') !== 0) {
      throw new Error('Use Channel ID starting with UC… (YouTube Studio → Settings → Channel → Advanced)');
    }
    var embed = LMCC.youtubeChannelLiveEmbed(channelId);
    await db.collection('settings').doc('livestream').set(
      {
        mode: 'youtube_channel',
        youtubeChannelId: channelId,
        embedUrl: embed,
        streamUrl: embed,
        provider: 'youtube',
        active: true,
        title: title || 'Church Live Stream',
        description: 'Linked to YouTube channel — when you go live on YouTube, members see it here automatically.',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: (currentUser && currentUser.email) || ''
      },
      { merge: true }
    );
    toast('YouTube channel linked. Go live on YouTube — the website will show it automatically.', 'success');
  };

  // ── Live stream (approved members only; comments in Firestore) ──────
  function normaliseLive(snap) {
    if (!snap.exists) {
      // Optional default from config
      var ch = (CFG.youtubeChannelId || '').trim();
      if (ch) {
        return {
          mode: 'youtube_channel',
          youtubeChannelId: ch,
          active: true,
          provider: 'youtube',
          title: 'Church Live Stream',
          embedUrl: LMCC.youtubeChannelLiveEmbed(ch),
          streamUrl: LMCC.youtubeChannelLiveEmbed(ch)
        };
      }
      return null;
    }
    var data = snap.data();
    if (data.youtubeChannelId && (!data.embedUrl || data.mode === 'youtube_channel')) {
      data.embedUrl = LMCC.youtubeChannelLiveEmbed(data.youtubeChannelId);
      data.streamUrl = data.embedUrl;
      data.provider = 'youtube';
    }
    return data;
  }

  LMCC.getLiveStream = async function () {
    if (!db) return null;
    return normaliseLive(await db.collection('settings').doc('livestream').get());
  };

  /** Real-time: the Live page updates the moment admin changes anything (no polling, no player reload). */
  LMCC.listenLiveStream = function (callback) {
    if (!db) return function () {};
    return db.collection('settings').doc('livestream').onSnapshot(function (snap) {
      callback(normaliseLive(snap));
    }, function (err) {
      console.error('livestream listener', err);
      callback(null, err);
    });
  };

  LMCC.startLiveStream = async function (payload) {
    if (!isAdmin) throw new Error('Admin only');
    var data = {
      active: true,
      title: payload.title || 'Live Service',
      description: payload.description || '',
      streamUrl: payload.streamUrl || '',
      embedUrl: payload.embedUrl || '',
      provider: payload.provider || 'youtube',
      thumbnailUrl: payload.thumbnailUrl || '',
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      startedBy: currentUser.email,
      endedAt: null,
      recordingUrl: ''
    };
    await db.collection('settings').doc('livestream').set(data, { merge: true });
    toast('Live stream started', 'success');
    return data;
  };

  LMCC.stopLiveStream = async function (recordingUrl) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('settings').doc('livestream').set({
      active: false,
      endedAt: firebase.firestore.FieldValue.serverTimestamp(),
      recordingUrl: recordingUrl || '',
      stoppedBy: currentUser.email
    }, { merge: true });
    toast('Live stream ended', 'info');
  };

  LMCC.saveRecording = async function (recordingUrl, title) {
    if (!isAdmin && !currentUser) throw new Error('Sign in required');
    if (!isAdmin) {
      var prof = userProfile;
      if (!prof || prof.status !== 'approved') throw new Error('Approved members only');
    }
    var ref = await db.collection('recordings').add({
      url: recordingUrl,
      title: title || 'Service recording',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.email,
      byAdmin: !!isAdmin
    });
    toast('Recording saved', 'success');
    return ref.id;
  };

  LMCC.getRecordings = async function () {
    if (!db) return [];
    var snap = await db.collection('recordings').orderBy('createdAt', 'desc').limit(30).get();
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  };

  LMCC.deleteRecording = async function (id) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('recordings').doc(id).delete();
    toast('Recording removed', 'info');
  };

  /** Browser recordings are .webm, which iPhones/Safari cannot play. Cloudinary converts on request when the URL ends in .mp4. */
  LMCC.playableVideoUrl = function (url) {
    url = url || '';
    if (/res\.cloudinary\.com\/.+\/video\/upload\//.test(url)) return url.replace(/\.(webm|mov|mkv)(\?.*)?$/i, '.mp4');
    return url;
  };

  LMCC.canWatchLive = function () {
    if (!currentUser) return false;
    if (isAdmin) return true;
    return !!(userProfile && userProfile.status === 'approved');
  };

  LMCC.postLiveComment = async function (text) {
    if (!LMCC.canWatchLive()) throw new Error('Only approved members can comment');
    text = (text || '').trim();
    if (!text) throw new Error('Write a message');
    if (text.length > 500) throw new Error('Message too long');
    await db.collection('livestream_comments').add({
      text: text,
      userId: currentUser.uid,
      displayName: currentUser.displayName || (userProfile && userProfile.displayName) || currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  };

  LMCC.listenLiveComments = function (callback, limitCount) {
    if (!db) return function () {};
    limitCount = limitCount || 80;
    return db.collection('livestream_comments')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .onSnapshot(function (snap) {
        var items = snap.docs.map(function (d) {
          return Object.assign({ id: d.id }, d.data());
        }).reverse();
        callback(items);
      }, function (err) {
        console.error('comments listener', err);
        callback([], err);
      });
  };

  LMCC.deleteLiveComment = async function (id) {
    if (!isAdmin) throw new Error('Admin only');
    await db.collection('livestream_comments').doc(id).delete();
  };

  LMCC.clearLiveComments = async function () {
    if (!isAdmin) throw new Error('Admin only');
    var total = 0;
    // loop: a batch holds at most 500 writes
    while (true) {
      var snap = await db.collection('livestream_comments').limit(400).get();
      if (snap.empty) break;
      var batch = db.batch();
      snap.docs.forEach(function (d) { batch.delete(d.ref); });
      await batch.commit();
      total += snap.size;
    }
    toast(total + ' comments cleared', 'info');
  };

  function initMobileMenu() {
    /* Always handled by js/menu.js — do not bind here. */
    return;
  }

  async function initHeroSlideshow() {
    var container = $('#heroSection');
    if (!container) return;

    var hero = await LMCC.getHero();

    if (hero.type === 'video' && hero.url) {
      var video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2';
      video.src = hero.url;
      container.insertBefore(video, container.firstChild);
      return;
    }

    var slides = (hero.slides && hero.slides.length) ? hero.slides : [
      'images/pastors-service.jpg',
      'images/worship-celebration.jpg',
      'images/congregation-leaders.jpg',
      'images/women-ministry.jpg',
      'images/worship-drums.jpg'
    ];

    var slidesWrap = document.createElement('div');
    slidesWrap.className = 'hero-slides';
    slides.forEach(function (src, i) {
      var d = document.createElement('div');
      d.className = 'hero-slide' + (i === 0 ? ' active' : '');
      d.style.backgroundImage = "url('" + src + "')";
      slidesWrap.appendChild(d);
    });
    container.insertBefore(slidesWrap, container.firstChild);

    var dots = document.createElement('div');
    dots.className = 'hero-dots';
    slides.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hero-dot' + (i === 0 ? ' active' : '');
      b.setAttribute('aria-label', 'Slide ' + (i + 1));
      b.addEventListener('click', function () { goTo(i); });
      dots.appendChild(b);
    });
    container.appendChild(dots);

    var idx = 0;
    function goTo(n) {
      var all = $$('.hero-slide', container);
      var allDots = $$('.hero-dot', container);
      if (!all.length) return;
      all[idx].classList.remove('active');
      allDots[idx].classList.remove('active');
      idx = n;
      all[idx].classList.add('active');
      allDots[idx].classList.add('active');
    }
    if (slides.length > 1) {
      setInterval(function () { goTo((idx + 1) % slides.length); }, 5500);
    }
  }

  function ensureFirebaseScripts(cb) {
    if (typeof firebase !== 'undefined') {
      cb();
      return;
    }
    var scripts = [
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
    ];
    var loaded = 0;
    scripts.forEach(function (src) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () {
        loaded++;
        if (loaded === scripts.length) cb();
      };
      s.onerror = function () { console.error('Failed to load', src); };
      document.head.appendChild(s);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMobileMenu();
    ensureFirebaseScripts(function () {
      initFirebase();
      initHeroSlideshow();
      if ($('#galleryGrid')) LMCC.renderGallery('#galleryGrid');
      if ($('#newsletterList')) LMCC.renderNewsletters('#newsletterList');
    });

    var btn = document.getElementById('btnSignOut');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        LMCC.signOut().then(function () {
          if (location.pathname.indexOf('admin') !== -1) location.href = 'index.html';
          else location.reload();
        });
      });
    }
  });
})();
