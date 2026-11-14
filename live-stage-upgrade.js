/*
 * LMCC Admin Live Studio Upgrade  (loaded at the bottom of admin.html — no other edit needed)
 *
 * Adds to the "Website Live Studio":
 *  - Front / back camera flip (works before AND during a live; viewers switch automatically)
 *  - Zoom (real camera zoom where the phone supports it, otherwise preview-only zoom)
 *  - Fit / Fill / Full screen preview (comments + joins stay visible in full screen)
 *  - Live viewers list + "X joined" notices
 *  - Live comments with Reply / Delete / Block
 *  - Block a user from likes + commenting (client side, see live-block-patch.js for the viewer side)
 *  - Quality control: Auto / 360p / 720p / 1080p, with automatic bitrate adaption
 *  - Anti-freeze: monitors packet loss and lowers/raises bitrate automatically, keeps screen awake
 *
 * IMPORTANT: the Website Live Studio is peer-to-peer, so every viewer uses the admin's upload.
 * For 200+ viewers use the YouTube Live or HLS/CDN cards already in the dashboard.
 */
(function () {
  var COMMENT_COLLECTIONS = ['live_comments', 'liveComments']; // used only if LMCC.deleteLiveComment is missing
  var P2P_COMFORT_LIMIT = 25;

  var QUALITY = {
    '360':  { w: 640,  h: 360,  fps: 24, bps: 700000 },
    '720':  { w: 1280, h: 720,  fps: 30, bps: 2000000 },
    '1080': { w: 1920, h: 1080, fps: 30, bps: 3800000 }
  };

  /* ---------- track every peer connection the studio creates ---------- */
  var pcs = [];
  var NativePC = window.RTCPeerConnection;
  if (NativePC) {
    var Wrapped = function (a, b) {
      var pc = new NativePC(a, b);
      pcs.push(pc);
      return pc;
    };
    Wrapped.prototype = NativePC.prototype;
    if (NativePC.generateCertificate) Wrapped.generateCertificate = NativePC.generateCertificate.bind(NativePC);
    window.RTCPeerConnection = Wrapped;
  }
  function livePcs() {
    pcs = pcs.filter(function (p) { return p.connectionState !== 'closed'; });
    return pcs.filter(function (p) { return p.connectionState === 'connected' || p.connectionState === 'connecting'; });
  }

  /* ---------- state ---------- */
  var S = {
    mode: 'camera', facing: 'user', quality: 'auto', fill: false, zoom: 1, hwZoom: false,
    sid: null, uploadMbps: 8, factor: 1, wake: null, blocked: {}, viewers: {},
    presenceFirst: true, commentsSeen: {}, commentsReady: false, replyTo: ''
  };

  function $(id) { return document.getElementById(id); }
  function db() { return firebase.firestore(); }
  function prev() { return $('studioPreview'); }
  function stream() { var p = prev(); return p && p.srcObject; }
  function vTrack() { var s = stream(); return s && s.getVideoTracks()[0]; }
  function el(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') e.textContent = props[k];
      else if (k === 'style') e.style.cssText = props[k];
      else if (k === 'class') e.className = props[k];
      else e.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  /* ---------- UI ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.lsu-stage{position:relative;background:#000;border-radius:10px;overflow:hidden;margin:.8rem 0}' +
    '.lsu-stage video{width:100%;max-height:340px;aspect-ratio:16/9;object-fit:contain;display:block;margin:0!important;border-radius:0!important;transform-origin:center;transition:transform .1s}' +
    '.lsu-stage.fill video{object-fit:cover}' +
    '.lsu-stage.full{position:fixed;inset:0;z-index:99998;margin:0;border-radius:0;display:flex;align-items:center;justify-content:center}' +
    '.lsu-stage.full video{max-height:none;height:100%;aspect-ratio:auto}' +
    '.lsu-ov{position:absolute;left:8px;bottom:8px;right:8px;display:flex;flex-direction:column;gap:4px;pointer-events:none;max-height:40%;overflow:hidden;justify-content:flex-end}' +
    '.lsu-ov div{background:rgba(0,0,0,.55);color:#fff;border-radius:12px;padding:.25rem .6rem;font-size:.82rem;width:fit-content;max-width:85%;word-break:break-word}' +
    '.lsu-ov div.j{background:rgba(27,90,57,.85)}.lsu-ov b{color:#f0d78c;margin-right:.3rem}' +
    '.lsu-badge{position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;font-weight:700;font-size:.78rem;padding:.25rem .6rem;border-radius:999px}' +
    '.lsu-fsx{position:absolute;top:8px;right:8px;display:none}.lsu-stage.full .lsu-fsx{display:block}' +
    '.lsu-bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.4rem 0}' +
    '.lsu-bar label{font-size:.85rem;display:flex;align-items:center;gap:.35rem}' +
    '.lsu-bar select,.lsu-bar input[type=number]{padding:.35rem .5rem;border:1.5px solid #ddd;border-radius:8px;font:inherit;font-size:.85rem}' +
    '.lsu-box{border:1px solid #e3dccb;border-radius:10px;padding:.7rem .8rem;margin-top:.8rem;background:#fff}' +
    '.lsu-box h4{margin:0 0 .5rem;font-size:.95rem}' +
    '.lsu-list{max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:.35rem}' +
    '.lsu-row{display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start;padding:.35rem 0;border-bottom:1px solid #f0ebdd;font-size:.88rem}' +
    '.lsu-row .t{flex:1;word-break:break-word}.lsu-row .t b{color:#1b5a39}' +
    '.lsu-row .a{display:flex;gap:.25rem;flex-wrap:wrap}' +
    '.lsu-mini{border:1px solid #1b5a39;background:#fff;color:#1b5a39;border-radius:6px;padding:.15rem .5rem;font-size:.75rem;cursor:pointer}' +
    '.lsu-mini.red{border-color:#c5221f;color:#c5221f}' +
    '.lsu-warn{background:#fff4e5;border:1px solid #f0b35c;color:#7a4a00;border-radius:8px;padding:.5rem .7rem;font-size:.85rem;margin-top:.5rem}';
  document.head.appendChild(css);

  function build() {
    var video = prev();
    if (!video || $('lsuStage')) return;

    // wrap the preview in a stage that supports fullscreen + overlay
    var stage = el('div', { id: 'lsuStage', class: 'lsu-stage' });
    video.parentNode.insertBefore(stage, video);
    stage.appendChild(video);
    stage.appendChild(el('div', { class: 'lsu-badge', id: 'lsuBadge', text: '👁 0 watching' }));
    stage.appendChild(el('button', { type: 'button', class: 'btn btn-outline-dark btn-sm lsu-fsx', id: 'lsuExit', text: 'Close ✕' }));
    stage.appendChild(el('div', { class: 'lsu-ov', id: 'lsuOv' }));

    var controls = el('div', { id: 'lsuControls' });
    controls.innerHTML =
      '<div class="lsu-bar">' +
        '<button type="button" class="btn btn-green btn-sm" id="lsuFlip">🔄 Flip camera</button>' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="lsuFill">Fill</button>' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="lsuFull">⛶ Full screen</button>' +
        '<label>Quality <select id="lsuQuality"><option value="auto">Auto (recommended)</option><option value="360">360p – weak network</option><option value="720">720p HD</option><option value="1080">1080p Full HD</option></select></label>' +
      '</div>' +
      '<div class="lsu-bar">' +
        '<label style="flex:1;min-width:220px">🔍 Zoom <input type="range" id="lsuZoom" min="1" max="3" step="0.1" value="1" style="flex:1"> <span id="lsuZoomTxt">1.0×</span></label>' +
        '<label>My upload (Mbps) <input type="number" id="lsuUp" min="1" max="500" step="1" value="8" style="width:70px"></label>' +
      '</div>' +
      '<div id="lsuInfo" style="font-size:.82rem;color:#6b7c6f"></div>' +
      '<div id="lsuWarn" class="lsu-warn" style="display:none"></div>' +
      '<div class="lsu-box"><h4>💬 Live comments <span id="lsuCCount" style="font-weight:400;color:#6b7c6f"></span></h4>' +
        '<div class="lsu-list" id="lsuComments"><span style="color:#6b7c6f;font-size:.85rem">Comments appear here during the live.</span></div>' +
        '<form id="lsuReplyForm" class="lsu-bar" style="margin-bottom:0"><input id="lsuReply" maxlength="500" placeholder="Reply to the live chat…" style="flex:1;min-width:150px;padding:.5rem .8rem;border:1.5px solid #ddd;border-radius:999px;font:inherit"><button class="btn btn-primary btn-sm" type="submit">Send</button></form>' +
      '</div>' +
      '<div class="lsu-box"><h4>👥 Viewers <span id="lsuVCount" style="font-weight:400;color:#6b7c6f"></span></h4><div class="lsu-list" id="lsuViewers"><span style="color:#6b7c6f;font-size:.85rem">Nobody yet.</span></div></div>' +
      '<div class="lsu-box"><h4>🚫 Blocked (no likes / no comments)</h4><div class="lsu-list" id="lsuBlocked"><span style="color:#6b7c6f;font-size:.85rem">No one blocked.</span></div></div>';
    var anchor = $('recProgress');
    anchor.parentNode.insertBefore(controls, anchor.nextSibling);

    $('lsuFlip').addEventListener('click', flipCamera);
    $('lsuFill').addEventListener('click', function () {
      S.fill = !S.fill; stage.classList.toggle('fill', S.fill); this.textContent = S.fill ? 'Fit' : 'Fill';
    });
    $('lsuFull').addEventListener('click', toggleFull);
    $('lsuExit').addEventListener('click', toggleFull);
    $('lsuQuality').addEventListener('change', function () { S.quality = this.value; applyQuality(true); });
    $('lsuZoom').addEventListener('input', function () { setZoom(parseFloat(this.value)); });
    $('lsuUp').addEventListener('change', function () { S.uploadMbps = Math.max(1, parseFloat(this.value) || 8); adapt(); });
    $('lsuReplyForm').addEventListener('submit', sendReply);

    // remember whether admin picked camera or screen
    var bc = $('btnCam'), bs = $('btnScreen');
    if (bc) bc.addEventListener('click', function () { S.mode = 'camera'; setTimeout(afterStreamChange, 700); });
    if (bs) bs.addEventListener('click', function () { S.mode = 'screen'; setTimeout(afterStreamChange, 700); });
    var go = $('btnGoNativeLive');
    if (go) go.addEventListener('click', function () { keepAwake(); setTimeout(startRoomListeners, 1200); });
    var end = $('btnEndNativeLive');
    if (end) end.addEventListener('click', function () { releaseAwake(); });

    // keep the overlay in sync with the real preview size in full screen
    document.addEventListener('fullscreenchange', function () {
      if (!document.fullscreenElement) stage.classList.remove('full');
    });
  }

  function afterStreamChange() {
    initZoomControl();
    applyQuality(false);
    updateMirror();
    var f = $('lsuFlip'); if (f) f.disabled = S.mode === 'screen';
  }

  function toggleFull() {
    var stage = $('lsuStage');
    var on = !stage.classList.contains('full');
    stage.classList.toggle('full', on);
    if (on && stage.requestFullscreen) stage.requestFullscreen().catch(function () {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(function () {});
    $('lsuFull').textContent = on ? '⛶ Exit full screen' : '⛶ Full screen';
  }

  /* ---------- camera flip ---------- */
  async function flipCamera() {
    var s = stream();
    if (!s) return alert('Open the camera first.');
    if (S.mode === 'screen') return alert('Flip works with the camera, not screen sharing.');
    var next = S.facing === 'user' ? 'environment' : 'user';
    var q = QUALITY[S.quality === 'auto' ? '720' : S.quality];
    var btn = $('lsuFlip'); btn.disabled = true;
    var old = vTrack();
    try {
      if (old) { s.removeTrack(old); old.stop(); } // many phones cannot open two cameras at once
      var ns;
      try {
        ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: next }, width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps } } });
      } catch (e) {
        ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next }, width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps } } });
      }
      var nt = ns.getVideoTracks()[0];
      try { nt.contentHint = 'motion'; } catch (e) {}
      s.addTrack(nt);
      S.facing = next;
      await replaceInAllPcs(nt);
      prev().srcObject = s; prev().play().catch(function () {});
      nt.addEventListener('ended', function () { /* camera lost */ info('Camera stopped. Press Open camera again.'); });
      S.zoom = 1; initZoomControl(); applyQuality(false); updateMirror();
      info('Now using the ' + (next === 'user' ? 'FRONT' : 'BACK') + ' camera.');
    } catch (err) {
      alert('Could not switch camera: ' + (err.message || err));
      // try to get the old facing back so the live does not stay black
      try {
        var rb = await navigator.mediaDevices.getUserMedia({ video: true });
        var rt = rb.getVideoTracks()[0]; s.addTrack(rt); await replaceInAllPcs(rt);
      } catch (e) {}
    }
    btn.disabled = false;
  }

  async function replaceInAllPcs(track) {
    var jobs = [];
    pcs.forEach(function (pc) {
      if (pc.connectionState === 'closed') return;
      pc.getSenders().forEach(function (sn) {
        if ((sn.track && sn.track.kind === 'video') || (!sn.track && false)) jobs.push(sn.replaceTrack(track).catch(function () {}));
      });
    });
    await Promise.all(jobs);
  }

  function updateMirror() { applyPreviewTransform(); }

  /* ---------- zoom ---------- */
  function initZoomControl() {
    var t = vTrack(), r = $('lsuZoom'); if (!r) return;
    var caps = t && t.getCapabilities ? t.getCapabilities() : {};
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      S.hwZoom = true; r.min = caps.zoom.min; r.max = Math.min(caps.zoom.max, 10); r.step = caps.zoom.step || 0.1; r.value = caps.zoom.min; S.zoom = caps.zoom.min;
    } else {
      S.hwZoom = false; r.min = 1; r.max = 3; r.step = 0.1; r.value = 1; S.zoom = 1;
    }
    setZoom(S.zoom);
  }
  function setZoom(z) {
    S.zoom = z;
    var t = vTrack();
    if (S.hwZoom && t) { t.applyConstraints({ advanced: [{ zoom: z }] }).catch(function () {}); }
    applyPreviewTransform();
    var txt = $('lsuZoomTxt'); if (txt) txt.textContent = z.toFixed(1) + '×' + (S.hwZoom ? '' : ' (preview only)');
  }
  function applyPreviewTransform() {
    var v = prev(); if (!v) return;
    var mirror = (S.mode === 'camera' && S.facing === 'user') ? ' scaleX(-1)' : '';
    var digital = S.hwZoom ? 1 : S.zoom;
    v.style.transform = 'scale(' + digital + ')' + mirror;
  }

  /* ---------- quality + adaptive bitrate ---------- */
  function perViewerBps() {
    var n = Math.max(1, livePcs().length);
    var budget = S.uploadMbps * 1000000 * 0.7;       // leave 30% head-room so it never saturates
    var share = budget / n;
    var base = S.quality === 'auto' ? QUALITY['720'].bps * 1.4 : QUALITY[S.quality].bps;
    var bps = Math.min(base, share) * S.factor;
    return Math.max(150000, Math.round(bps));
  }
  function applyQuality(constrainTrack) {
    var t = vTrack();
    if (constrainTrack && t && S.mode === 'camera' && S.quality !== 'auto') {
      var q = QUALITY[S.quality];
      t.applyConstraints({ width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps } }).catch(function () {});
    }
    if (constrainTrack && t && S.mode === 'camera' && S.quality === 'auto') {
      var a = QUALITY['720'];
      t.applyConstraints({ width: { ideal: a.w }, height: { ideal: a.h }, frameRate: { ideal: a.fps } }).catch(function () {});
    }
    try { if (t) t.contentHint = S.mode === 'screen' ? 'detail' : 'motion'; } catch (e) {}
    adapt();
  }
  function adapt() {
    var bps = perViewerBps();
    var scale = bps >= 1500000 ? 1 : (bps >= 700000 ? 1.5 : (bps >= 350000 ? 2 : 3));
    if (S.quality !== 'auto') scale = 1;
    pcs.forEach(function (pc) {
      if (pc.connectionState === 'closed') return;
      pc.getSenders().forEach(function (sn) {
        if (!sn.track || sn.track.kind !== 'video') return;
        try {
          var p = sn.getParameters();
          if (!p.encodings || !p.encodings.length) p.encodings = [{}];
          p.encodings[0].maxBitrate = bps;
          p.encodings[0].scaleResolutionDownBy = scale;
          p.degradationPreference = 'maintain-framerate';   // stay smooth rather than freeze
          sn.setParameters(p).catch(function () {});
        } catch (e) {}
      });
    });
    refreshInfo(bps, scale);
  }
  function refreshInfo(bps, scale) {
    var n = livePcs().length;
    info('Direct viewers: ' + n + ' · per-viewer video ≈ ' + Math.round(bps / 1000) + ' kbps' + (scale > 1 ? ' (resolution ÷' + scale + ')' : '') +
      ' · ' + (S.mode === 'screen' ? 'screen' : (S.facing === 'user' ? 'front' : 'back') + ' camera'));
    var warn = $('lsuWarn'), pres = Object.keys(S.viewers).length;
    var big = Math.max(n, pres);
    if (big > P2P_COMFORT_LIMIT) {
      warn.style.display = 'block';
      warn.textContent = big + ' people are connected. The website studio sends a separate video to every viewer from this device, so it will lag. For 200+ viewers use the YouTube Live card (or HLS/CDN) above.';
    } else warn.style.display = 'none';
  }
  function info(t) { var i = $('lsuInfo'); if (i) i.textContent = t; }

  // health check every 5s: lower quality on packet loss, recover slowly
  async function health() {
    var worstLoss = 0, limited = false;
    for (var i = 0; i < pcs.length; i++) {
      var pc = pcs[i];
      if (pc.connectionState !== 'connected') continue;
      try {
        var stats = await pc.getStats();
        stats.forEach(function (r) {
          if (r.type === 'remote-inbound-rtp' && r.kind === 'video' && typeof r.fractionLost === 'number') worstLoss = Math.max(worstLoss, r.fractionLost);
          if (r.type === 'outbound-rtp' && r.kind === 'video' && r.qualityLimitationReason === 'bandwidth') limited = true;
        });
      } catch (e) {}
    }
    var old = S.factor;
    if (worstLoss > 0.08 || limited) S.factor = Math.max(0.3, S.factor * 0.75);
    else if (worstLoss < 0.02) S.factor = Math.min(1, S.factor * 1.1);
    if (Math.abs(old - S.factor) > 0.01 || livePcs().length) adapt();
  }
  setInterval(health, 5000);

  /* ---------- keep screen awake ---------- */
  async function keepAwake() {
    try { if (navigator.wakeLock) S.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function releaseAwake() { try { if (S.wake) S.wake.release(); } catch (e) {} S.wake = null; }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && stream() && !S.wake) keepAwake();
  });

  /* ---------- room listeners: viewers, comments, blocked ---------- */
  var unsubs = [];
  function stopRoomListeners() { unsubs.forEach(function (u) { try { u(); } catch (e) {} }); unsubs = []; }

  function startRoomListeners() {
    if (!window.LMCC || !LMCC.listenLiveStream) return;
    LMCC.listenLiveStream(function (live) {
      if (!live || live.active === false) { if (S.sid) { stopRoomListeners(); S.sid = null; S.viewers = {}; } return; }
      var key = live.sessionId || 'general';
      if (key === S.sid) return;
      stopRoomListeners();
      S.sid = key; S.presenceFirst = true; S.viewers = {};
      watchRoom(key);
    });
  }

  function watchRoom(sid) {
    var room = db().collection('live_rooms').doc(sid);

    unsubs.push(room.collection('presence').onSnapshot(function (snap) {
      var latest = 0, rows = [];
      snap.forEach(function (d) {
        var t = d.data().lastSeen && d.data().lastSeen.toMillis ? d.data().lastSeen.toMillis() : null;
        rows.push({ id: d.id, name: d.data().displayName || 'Member', t: t }); if (t && t > latest) latest = t;
      });
      var active = rows.filter(function (r) { return r.t == null || latest - r.t < 75000; });
      S.viewers = {}; active.forEach(function (r) { S.viewers[r.id] = r.name; });
      if (!S.presenceFirst) {
        snap.docChanges().forEach(function (ch) {
          if (ch.type === 'added') overlay('', (ch.doc.data().displayName || 'Someone') + ' joined', true);
        });
      }
      S.presenceFirst = false;
      renderViewers(); adapt();
    }, function () {}));

    unsubs.push(room.collection('blocked').onSnapshot(function (snap) {
      S.blocked = {}; snap.forEach(function (d) { S.blocked[d.id] = d.data().name || 'Member'; });
      renderBlocked(); renderViewers();
    }, function () {}));

    S.commentsSeen = {}; S.commentsReady = false;
    var u = LMCC.listenLiveComments(function (items) {
      items = items || [];
      renderComments(items);
      items.forEach(function (c) {
        if (!S.commentsSeen[c.id]) { S.commentsSeen[c.id] = 1; if (S.commentsReady) overlay(c.displayName || 'Member', c.text); }
      });
      S.commentsReady = true;
    });
    if (typeof u === 'function') unsubs.push(u);
  }

  function uidOf(c) { return c.uid || c.userId || c.authorUid || c.user || ''; }

  function renderViewers() {
    var box = $('lsuViewers'); if (!box) return;
    var ids = Object.keys(S.viewers);
    $('lsuVCount').textContent = '(' + ids.length + ')';
    $('lsuBadge').textContent = '👁 ' + ids.length + ' watching';
    box.textContent = '';
    if (!ids.length) { box.appendChild(el('span', { style: 'color:#6b7c6f;font-size:.85rem', text: 'Nobody yet.' })); return; }
    ids.forEach(function (id) {
      var blocked = !!S.blocked[id];
      box.appendChild(el('div', { class: 'lsu-row' }, [
        el('div', { class: 't', text: S.viewers[id] + (blocked ? '  (blocked)' : '') }),
        el('div', { class: 'a' }, [ blockBtn(id, S.viewers[id]) ])
      ]));
    });
  }

  function blockBtn(uid, name) {
    var blocked = !!S.blocked[uid];
    var b = el('button', { type: 'button', class: 'lsu-mini red', text: blocked ? 'Unblock' : 'Block' });
    b.addEventListener('click', function () { toggleBlock(uid, name); });
    return b;
  }

  async function toggleBlock(uid, name) {
    if (!uid) return alert('This comment has no user id, so it cannot be blocked.');
    if (!S.sid) return alert('Go live first.');
    var ref = db().collection('live_rooms').doc(S.sid).collection('blocked').doc(uid);
    try {
      if (S.blocked[uid]) await ref.delete();
      else { if (!confirm('Block ' + name + ' from liking and commenting in this live?')) return; await ref.set({ name: name || 'Member', at: firebase.firestore.FieldValue.serverTimestamp() }); }
    } catch (e) { alert(e.message || 'Failed — publish the Firestore rules for live_rooms/{room}/blocked.'); }
  }

  function renderBlocked() {
    var box = $('lsuBlocked'); if (!box) return;
    box.textContent = '';
    var ids = Object.keys(S.blocked);
    if (!ids.length) { box.appendChild(el('span', { style: 'color:#6b7c6f;font-size:.85rem', text: 'No one blocked.' })); return; }
    ids.forEach(function (id) {
      box.appendChild(el('div', { class: 'lsu-row' }, [ el('div', { class: 't', text: S.blocked[id] }), el('div', { class: 'a' }, [ blockBtn(id, S.blocked[id]) ]) ]));
    });
  }

  function renderComments(items) {
    var box = $('lsuComments'); if (!box) return;
    $('lsuCCount').textContent = '(' + items.length + ')';
    box.textContent = '';
    if (!items.length) { box.appendChild(el('span', { style: 'color:#6b7c6f;font-size:.85rem', text: 'No comments yet.' })); return; }
    items.slice(-60).reverse().forEach(function (c) {
      var name = c.displayName || 'Member', uid = uidOf(c);
      var reply = el('button', { type: 'button', class: 'lsu-mini', text: 'Reply' });
      reply.addEventListener('click', function () {
        S.replyTo = '@' + name + ' ';
        var inp = $('lsuReply'); inp.value = S.replyTo; inp.focus();
      });
      var del = el('button', { type: 'button', class: 'lsu-mini red', text: 'Delete' });
      del.addEventListener('click', function () { deleteComment(c.id); });
      var acts = [reply, del];
      if (uid) acts.push(blockBtn(uid, name));
      var textBox = el('div', { class: 't' }, [ el('b', { text: name + ': ' }), document.createTextNode(c.text || '') ]);
      box.appendChild(el('div', { class: 'lsu-row' }, [ textBox, el('div', { class: 'a' }, acts) ]));
    });
  }

  async function deleteComment(id) {
    if (!confirm('Delete this comment?')) return;
    try {
      if (LMCC.deleteLiveComment) { await LMCC.deleteLiveComment(id); return; }
      var d = db(), paths = COMMENT_COLLECTIONS.map(function (n) { return d.collection(n).doc(id); });
      if (S.sid) paths.push(d.collection('live_rooms').doc(S.sid).collection('comments').doc(id));
      for (var i = 0; i < paths.length; i++) {
        var snap = await paths[i].get();
        if (snap.exists) { await paths[i].delete(); return; }
      }
      alert('Could not find that comment. Add a deleteLiveComment(id) function to js/app.js, or set COMMENT_COLLECTIONS at the top of live-stage-upgrade.js.');
    } catch (e) { alert(e.message || 'Delete failed — check Firestore rules allow admin to delete comments.'); }
  }

  async function sendReply(e) {
    e.preventDefault();
    var inp = $('lsuReply'), t = inp.value.trim();
    if (!t) return;
    try { await LMCC.postLiveComment(t); inp.value = ''; S.replyTo = ''; } catch (err) { alert(err.message || 'Could not send'); }
  }

  function overlay(name, text, join) {
    var ov = $('lsuOv'); if (!ov) return;
    var d = el('div', { class: join ? 'j' : '' });
    if (name) d.appendChild(el('b', { text: name }));
    d.appendChild(document.createTextNode(text));
    ov.appendChild(d);
    while (ov.children.length > 5) ov.removeChild(ov.firstChild);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 12000);
  }

  /* ---------- boot ---------- */
  function boot() {
    build();
    // if the admin refreshed while a live was already running, still show the room
    document.addEventListener('lmcc:auth', function () { setTimeout(startRoomListeners, 800); });
    setTimeout(startRoomListeners, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
