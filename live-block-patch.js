/*
 * Viewer-side companion for live-stage-upgrade.js
 * Add ONE line to live.html, AFTER live-tiktok-upgrade.js:
 *   <script src="live-block-patch.js"></script>
 *
 * When the admin blocks a member, that member no longer sees the like button / like count /
 * floating hearts, cannot double-tap to like, and the comment box is hidden.
 */
(function () {
  var css = document.createElement('style');
  css.textContent =
    'body.lmcc-blocked #tkLike,body.lmcc-blocked #tkLikeCount,body.lmcc-blocked .tk-heart,body.lmcc-blocked #tkForm{display:none!important}';
  document.head.appendChild(css);

  var sid = null, unsub = null, liveHooked = false;

  function watch(key) {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    var me = firebase.auth().currentUser;
    if (!me) return;
    unsub = firebase.firestore().collection('live_rooms').doc(key).collection('blocked').doc(me.uid)
      .onSnapshot(function (d) { document.body.classList.toggle('lmcc-blocked', d.exists); }, function () {});
  }

  function hook() {
    if (liveHooked || !window.LMCC || !LMCC.listenLiveStream || !window.firebase || !firebase.auth().currentUser) return;
    liveHooked = true;
    LMCC.listenLiveStream(function (live) {
      if (!live || live.active === false) { document.body.classList.remove('lmcc-blocked'); sid = null; return; }
      var key = live.sessionId || 'general';
      if (key !== sid) { sid = key; watch(key); }
    });
  }

  // stop double-tap likes for blocked members (runs before the main script's handler)
  document.addEventListener('dblclick', function (e) {
    if (document.body.classList.contains('lmcc-blocked') && e.target.closest('.live-player-wrap')) e.stopImmediatePropagation();
  }, true);

  setInterval(hook, 1000);
})();
