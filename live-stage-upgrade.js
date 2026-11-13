/*
 * TikTok-style Live Upgrade for live.html (Lugoba Miracle Center)
 * Add ONE line to live.html just before </body>, after js/menu.js and the main <script> block:
 *   <script src="live-tiktok-upgrade.js"></script>
 * Then publish the Firestore rules in firestore-live-rules-additions.txt (needed for likes + viewers).
 *
 * Adds: big video stage, full screen, zoom (buttons, pinch, drag), Fit/Fill, likes with floating
 * hearts (double-tap too), live comment feed over the video, comment box on the video,
 * live viewer count, and "X joined" notices.
 */
(function () {
  var started = false, sid = null, me = null, unsubs = [], hbTimer = null, flushTimer = null;
  var pending = 0, ownUnseen = 0, lastLikes = null, presenceFirst = true, commentsFirst = true;
  var scale = 1, tx = 0, ty = 0, usedRealFs = false;
  var wrap, host;

  function $(id) { return document.getElementById(id); }
  function db() { return firebase.firestore(); }

  var css = document.createElement('style');
  css.textContent =
    '.live-layout{grid-template-columns:1fr!important}' +
    '.live-player-wrap{touch-action:manipulation;user-select:none}' +
    '@media(max-width:900px){.live-player-wrap{aspect-ratio:auto!important;height:72vh}}' +
    '.live-player-wrap.pseudo-full{position:fixed!important;inset:0;z-index:99999;height:100vh!important;width:100vw;border-radius:0;border:0;aspect-ratio:auto!important}' +
    '#playerHost{transform-origin:center;will-change:transform}' +
    '.live-player-wrap.fill #playerHost video{object-fit:cover!important}' +
    '.tk{position:absolute;inset:0;z-index:4;pointer-events:none}' +
    '.tk *{pointer-events:auto}' +
    '.tk-top{position:absolute;top:12px;right:12px;display:flex;gap:6px}' +
    '.tk-pill{background:rgba(0,0,0,.6);color:#fff;font-weight:700;font-size:.8rem;padding:.3rem .65rem;border-radius:999px}' +
    '.tk-side{position:absolute;right:10px;bottom:120px;display:flex;flex-direction:column;gap:10px;align-items:center}' +
    '.tk-btn{width:46px;height:46px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:1.15rem;cursor:pointer;font-weight:700}' +
    '.tk-like{width:56px;height:56px;font-size:1.6rem;background:rgba(225,29,72,.9)}' +
    '.tk-count{color:#fff;font-weight:800;font-size:.8rem;text-shadow:0 1px 4px #000;margin-top:-6px}' +
    '.tk-feed{position:absolute;left:10px;bottom:112px;width:min(70%,360px);display:flex;flex-direction:column;gap:6px;pointer-events:none;max-height:34%;overflow:hidden;justify-content:flex-end}' +
    '.tk-msg{background:rgba(0,0,0,.5);color:#fff;border-radius:14px;padding:.35rem .7rem;font-size:.85rem;animation:tkIn .25s ease;transition:opacity .6s;width:fit-content;max-width:100%;word-break:break-word}' +
    '.tk-msg b{color:#f0d78c;margin-right:.35rem}' +
    '.tk-msg.join{background:rgba(27,90,57,.85)}' +
    '@keyframes tkIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
    '.tk-form{position:absolute;left:10px;right:76px;bottom:58px;display:flex;gap:6px}' +
    '.tk-form input{flex:1;border:0;border-radius:999px;padding:.55rem 1rem;background:rgba(255,255,255,.92);font:inherit;min-width:0}' +
    '.tk-form button{border:0;border-radius:999px;background:#1b5a39;color:#fff;font-weight:700;padding:0 1rem;cursor:pointer}' +
    '.tk-heart{position:absolute;right:22px;bottom:150px;font-size:1.8rem;pointer-events:none;animation:tkFloat 2.2s ease-out forwards}' +
    '@keyframes tkFloat{0%{opacity:1;transform:translate(0,0) scale(.6)}100%{opacity:0;transform:translate(var(--dx),-240px) scale(1.4)}}';
  document.head.appendChild(css);

  function build() {
    wrap = document.querySelector('.live-player-wrap');
    host = $('playerHost');
    if (!wrap || !host || $('tkOverlay')) return;
    var o = document.createElement('div');
    o.id = 'tkOverlay';
    o.className = 'tk';
    o.innerHTML =
      '<div class="tk-top"><span class="tk-pill">👁 <span id="tkViewers">0</span></span></div>' +
      '<div class="tk-side">' +
        '<button class="tk-btn tk-like" id="tkLike" aria-label="Like">❤</button><div class="tk-count" id="tkLikeCount">0</div>' +
        '<button class="tk-btn" id="tkZoomIn" aria-label="Zoom in">＋</button>' +
        '<button class="tk-btn" id="tkZoomOut" aria-label="Zoom out">－</button>' +
        '<button class="tk-btn" id="tkFill" aria-label="Fit or fill" style="font-size:.7rem">FILL</button>' +
        '<button class="tk-btn" id="tkFull" aria-label="Full screen">⛶</button>' +
      '</div>' +
      '<div class="tk-feed" id="tkFeed"></div>' +
      '<form class="tk-form" id="tkForm"><input id="tkInput" maxlength="500" placeholder="Add a comment…" autocomplete="off"><button type="submit">Send</button></form>';
    wrap.appendChild(o);

    $('tkLike').addEventListener('click', like);
    $('tkZoomIn').addEventListener('click', function () { setZoom(scale + 0.5); });
    $('tkZoomOut').addEventListener('click', function () { setZoom(scale - 0.5); });
    $('tkFill').addEventListener('click', function () {
      wrap.classList.toggle('fill');
      this.textContent = wrap.classList.contains('fill') ? 'FIT' : 'FILL';
    });
    $('tkFull').addEventListener('click', toggleFull);
    wrap.addEventListener('dblclick', function (e) { if (!e.target.closest('.tk-side,.tk-form,button,input')) like(); });
    $('tkForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var inp = $('tkInput'), t = inp.value.trim();
      if (!t || Date.now() - (window.__lastChat || 0) < 3000) return;
      window.__lastChat = Date.now();
      try { await LMCC.postLiveComment(t); inp.value = ''; } catch (err) { alert(err.message || 'Could not send'); }
    });

    // Pinch zoom + drag to pan
    var d0 = 0, s0 = 1, drag = null;
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) { d0 = dist(e.touches); s0 = scale; }
    }, { passive: true });
    wrap.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && d0) { e.preventDefault(); setZoom(s0 * dist(e.touches) / d0); }
    }, { passive: false });
    wrap.addEventListener('touchend', function () { d0 = 0; }, { passive: true });
    wrap.addEventListener('pointerdown', function (e) {
      if (scale > 1 && !e.target.closest('.tk-side,.tk-form,button,input')) drag = { x: e.clientX - tx, y: e.clientY - ty };
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag) return; tx = e.clientX - drag.x; ty = e.clientY - drag.y; applyZoom();
    });
    window.addEventListener('pointerup', function () { drag = null; });
    document.addEventListener('fullscreenchange', function () {
      if (!document.fullscreenElement && usedRealFs) { wrap.classList.remove('pseudo-full'); usedRealFs = false; }
    });
  }

  function dist(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
  function setZoom(s) { scale = Math.max(1, Math.min(3, s)); if (scale === 1) { tx = 0; ty = 0; } applyZoom(); }
  function applyZoom() {
    var mx = (scale - 1) * wrap.clientWidth / 2, my = (scale - 1) * wrap.clientHeight / 2;
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
    host.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
  }
  function toggleFull() {
    if (wrap.classList.contains('pseudo-full')) {
      wrap.classList.remove('pseudo-full');
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      usedRealFs = false;
    } else {
      wrap.classList.add('pseudo-full');
      if (wrap.requestFullscreen) wrap.requestFullscreen().then(function () { usedRealFs = true; }).catch(function () {});
    }
    setTimeout(applyZoom, 100);
  }

  // ---------- Likes ----------
  function like() {
    if (pending >= 40) return;
    pending++;
    ownUnseen++;
    spawnHeart();
    $('tkLikeCount').textContent = fmt((lastLikes || 0) + pending);
    if (!flushTimer) flushTimer = setTimeout(flush, 1500);
  }
  function flush() {
    flushTimer = null;
    if (!pending || !sid) return;
    var n = Math.min(pending, 20);
    pending -= n;
    db().collection('live_rooms').doc(sid)
      .set({ likes: firebase.firestore.FieldValue.increment(n) }, { merge: true })
      .catch(function () { ownUnseen = Math.max(0, ownUnseen - n); });
    if (pending) flushTimer = setTimeout(flush, 1500);
  }
  function spawnHeart() {
    var h = document.createElement('span');
    h.className = 'tk-heart';
    h.textContent = ['❤️', '💖', '💛', '🧡'][Math.floor(Math.random() * 4)];
    h.style.setProperty('--dx', (Math.random() * 90 - 60) + 'px');
    $('tkOverlay').appendChild(h);
    setTimeout(function () { h.remove(); }, 2300);
  }
  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n); }

  // ---------- Feed (comments + joined) ----------
  function addFeed(name, text, cls) {
    var feed = $('tkFeed'); if (!feed) return;
    var m = document.createElement('div');
    m.className = 'tk-msg' + (cls ? ' ' + cls : '');
    if (name) { var b = document.createElement('b'); b.textContent = name; m.appendChild(b); }
    m.appendChild(document.createTextNode(text));
    feed.appendChild(m);
    while (feed.children.length > 6) feed.removeChild(feed.firstChild);
    setTimeout(function () { m.style.opacity = '0'; setTimeout(function () { m.remove(); }, 650); }, 12000);
  }

  // ---------- Per-live listeners ----------
  function stopAll() {
    unsubs.forEach(function (u) { try { u(); } catch (e) {} });
    unsubs = [];
    clearInterval(hbTimer); hbTimer = null;
    if (sid && me) { db().collection('live_rooms').doc(sid).collection('presence').doc(me.uid).delete().catch(function () {}); }
    if (pending) flush();
    sid = null; lastLikes = null; presenceFirst = true; ownUnseen = 0; pending = 0;
    var c = $('tkLikeCount'); if (c) c.textContent = '0';
    var v = $('tkViewers'); if (v) v.textContent = '0';
  }

  function startFor(newSid) {
    stopAll();
    sid = newSid;
    var name = me.displayName || (LMCC.userProfile() && LMCC.userProfile().displayName) || 'Member';
    var room = db().collection('live_rooms').doc(sid);

    // Likes
    unsubs.push(room.onSnapshot(function (snap) {
      var likes = (snap.exists && snap.data().likes) || 0;
      if (lastLikes === null) { lastLikes = likes; }
      else if (likes > lastLikes) {
        var d = likes - lastLikes;
        var others = Math.max(0, d - ownUnseen);
        ownUnseen = Math.max(0, ownUnseen - d);
        for (var i = 0; i < Math.min(others, 12); i++) setTimeout(spawnHeart, i * 120);
        lastLikes = likes;
      }
      $('tkLikeCount').textContent = fmt(lastLikes + pending);
    }, function () {}));

    // Presence: viewer count + joined notices
    var pres = room.collection('presence');
    var beat = function (first) {
      var data = { displayName: name, lastSeen: firebase.firestore.FieldValue.serverTimestamp() };
      if (first) data.joinedAt = firebase.firestore.FieldValue.serverTimestamp();
      pres.doc(me.uid).set(data, { merge: true }).catch(function () {});
    };
    beat(true);
    hbTimer = setInterval(beat, 25000);
    unsubs.push(pres.onSnapshot(function (snap) {
      var latest = 0, rows = [];
      snap.forEach(function (d) {
        var t = d.data().lastSeen && d.data().lastSeen.toMillis ? d.data().lastSeen.toMillis() : null;
        rows.push(t); if (t && t > latest) latest = t;
      });
      var n = rows.filter(function (t) { return t == null || latest - t < 75000; }).length;
      $('tkViewers').textContent = n;
      var w = $('viewerCountWrap'), num = $('viewerCountNum');
      if (num) num.textContent = n; if (w) w.hidden = false;
      if (!presenceFirst) {
        snap.docChanges().forEach(function (ch) {
          if (ch.type === 'added' && ch.doc.id !== me.uid) addFeed('', (ch.doc.data().displayName || 'Someone') + ' joined', 'join');
        });
      }
      presenceFirst = false;
    }, function () {}));
  }

  function begin() {
    if (started) return;
    me = firebase.auth().currentUser;
    if (!me || !window.LMCC || !LMCC.canWatchLive || !LMCC.canWatchLive()) return;
    started = true;
    build();

    // Live comments over the video
    commentsFirst = true;
    LMCC.listenLiveComments(function (items) {
      if (commentsFirst) { items.slice(-3).forEach(function (c) { addFeed(c.displayName || 'Member', c.text); }); commentsFirst = false; return; }
      var seen = begin._seen = begin._seen || {};
      items.forEach(function (c) {
        if (!seen[c.id]) { seen[c.id] = 1; if (begin._ready) addFeed(c.displayName || 'Member', c.text); }
      });
      begin._ready = true;
    });

    // Follow the live session (new session => fresh likes + viewers)
    LMCC.listenLiveStream(function (live) {
      if (!live || live.active === false) { if (sid) stopAll(); return; }
      var key = live.sessionId || 'general';
      if (key !== sid) startFor(key);
    });
  }

  window.addEventListener('pagehide', stopAll);
  document.addEventListener('lmcc:auth', function () { setTimeout(begin, 300); });
  document.addEventListener('DOMContentLoaded', function () { build(); setTimeout(begin, 2000); });
})();
