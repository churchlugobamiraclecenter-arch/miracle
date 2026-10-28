/**
 * Lugoba Miracle Center Church — Application Core
 * Real Firebase Auth + Firestore + Cloudinary. No demo mode.
 */
(function () {
  'use strict';

  const CFG = window.LMCC_CONFIG;
  if (!CFG || !CFG.firebase) {
    console.error('LMCC_CONFIG missing. Check js/firebase-config.js');
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
            isAdmin =
              ADMIN_EMAILS.indexOf((user.email || '').toLowerCase()) !== -1 ||
              userProfile.role === 'admin';
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
    var data = snap.exists ? snap.data() : null;
    var admin =
      ADMIN_EMAILS.indexOf(email.toLowerCase()) !== -1 || (data && data.role === 'admin');
    if (data && data.status === 'pending' && !admin) {
      toast('Your account is still pending admin approval.', 'warning');
    } else {
      toast('Welcome back!', 'success');
    }
    return cred.user;
  };

  LMCC.signInGoogle = async function () {
    if (!auth) throw new Error('Firebase not configured — add keys in js/firebase-config.js');
    var provider = new firebase.auth.GoogleAuthProvider();
    var cred = await auth.signInWithPopup(provider);
    var ref = db.collection('users').doc(cred.user.uid);
    var snap = await ref.get();
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
    }
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
    var snap = await db.collection('users').orderBy('createdAt', 'desc').limit(100).get();
    return snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
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
    await db.collection('gallery').doc(id).delete();
    toast('Photo removed', 'info');
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
          media = '<video src="' + item.url + '" controls playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;background:#000"></video>';
        } else {
          media = '<img src="' + item.url + '" alt="' + (item.caption || 'Church photo').replace(/"/g, '&quot;') + '" loading="lazy">';
        }
        return '<div class="gallery-item" data-id="' + item.id + '">' + media +
          '<div class="caption">' + (item.caption || '') + (item.resourceType === 'video' ? ' · Video' : '') + '</div></div>';
      }).join('');
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
    var text = 'Hello Lugoba Miracle Center Church\n\nFrom: ' + (name || 'Website visitor') + '\n\n' + message;
    if (db) {
      try {
        await db.collection('messages').add({
          name: name || 'Visitor',
          message: message,
          at: firebase.firestore.FieldValue.serverTimestamp(),
          userId: currentUser ? currentUser.uid : null
        });
      } catch (e) {
        console.warn('Could not log message', e);
      }
    }
    window.open(waLink(text), '_blank');
    toast('Opening WhatsApp…', 'success');
  };

  LMCC.getMessages = async function () {
    if (!db || !isAdmin) return [];
    var snap = await db.collection('messages').orderBy('at', 'desc').limit(50).get();
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
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
              n.imageUrl +
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
