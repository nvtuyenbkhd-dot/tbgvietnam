(function () {
  'use strict';

  // Ghi nhận bấm gọi / Zalo / Messenger
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-track]');
    if (a && window.lpTrack) window.lpTrack(a.getAttribute('data-track'), { channel: a.getAttribute('data-channel') });
  });

  // Form đăng ký (gửi bằng fetch, trả JSON)
  document.querySelectorAll('[data-lp-form]').forEach(function (form) {
    var src = form.querySelector('[data-source]');
    if (src) src.value = location.href;
    var status = form.querySelector('[data-status]');
    var ok = form.querySelector('[data-ok]');
    var btn = form.querySelector('button[type="submit"]');
    var label = btn.textContent;

    function clear() {
      form.querySelectorAll('.fld.is-bad').forEach(function (f) { f.classList.remove('is-bad'); });
      form.querySelectorAll('[data-err-for]').forEach(function (p) { p.textContent = ''; });
      status.textContent = '';
    }
    form.addEventListener('submit', function (e) {
      if (!window.fetch) return;
      e.preventDefault(); clear();
      btn.disabled = true; btn.textContent = 'Đang gửi...';
      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)).toString(),
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false, errors: { _: 'Không gửi được, vui lòng gọi hotline.' } }; }); })
        .then(function (d) {
          if (d.ok) {
            if (window.lpTrack) window.lpTrack('Lead');
            Array.prototype.forEach.call(form.children, function (c) { if (c !== ok) c.hidden = true; });
            ok.hidden = false; ok.focus();
          } else {
            var errs = d.errors || { _: 'Không gửi được, vui lòng gọi hotline.' };
            var first = null;
            Object.keys(errs).forEach(function (k) {
              var p = form.querySelector('[data-err-for="' + k + '"]');
              if (p && form.elements[k]) { p.textContent = errs[k]; form.elements[k].closest('.fld').classList.add('is-bad'); first = first || form.elements[k]; }
              else status.textContent = errs[k];
            });
            if (first) first.focus();
          }
        })
        .catch(function () { status.textContent = 'Mất kết nối, vui lòng thử lại hoặc gọi hotline.'; })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
  });

  // Bộ lọc dạng tab (trang Du học: chọn hệ; trang Kỹ sư: chọn ngành)
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tabs = root.querySelectorAll('[role="tab"]');
    var panels = root.querySelectorAll('[role="tabpanel"]');
    function select(tab, focus) {
      tabs.forEach(function (t) { var on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
      panels.forEach(function (p) { p.hidden = p.id !== tab.getAttribute('aria-controls'); });
      var pre = root.getAttribute('data-sync');
      var sel = pre && document.querySelector(pre);
      var v = tab.getAttribute('data-value');
      if (sel && v) Array.prototype.forEach.call(sel.options, function (o) { if (o.value === v) sel.value = v; });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (n === null) return; e.preventDefault(); select(tabs[(n + tabs.length) % tabs.length], true);
      });
    });
  });

  // Lọc thẻ theo ngành (trang Kỹ sư)
  var chips = document.querySelectorAll('[data-chip]');
  if (chips.length) {
    var cards = document.querySelectorAll('[data-industry]');
    var more = document.querySelector('[data-more]');
    var LIMIT = 9;
    var current = '';
    var expanded = false;
    var render = function () {
      var shown = 0;
      cards.forEach(function (c) {
        var match = !current || c.getAttribute('data-industry') === current;
        var vis = match && (expanded || shown < LIMIT);
        if (match) shown++;
        c.hidden = !vis;
      });
      if (more) more.hidden = expanded || shown <= LIMIT;
    };
    chips.forEach(function (ch) {
      ch.addEventListener('click', function () {
        current = ch.getAttribute('data-chip'); expanded = false;
        chips.forEach(function (x) { x.setAttribute('aria-pressed', x === ch); });
        render();
      });
    });
    if (more) more.addEventListener('click', function () { expanded = true; render(); });
    render();
  }
})();
