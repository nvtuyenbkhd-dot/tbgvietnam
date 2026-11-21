(function () {
  'use strict';

  // Menu di động
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
    };
    burger.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  }

  // Biểu mẫu đăng ký: gửi bằng fetch, nếu lỗi thì quay về gửi form thường
  document.querySelectorAll('[data-lead-form]').forEach(function (form) {
    var src = form.querySelector('[data-source]');
    if (src) src.value = location.href;
    var status = form.querySelector('[data-status]');
    var ok = form.querySelector('[data-ok]');
    var btn = form.querySelector('button[type="submit"]');

    var clearErrors = function () {
      form.querySelectorAll('.field.is-bad').forEach(function (f) { f.classList.remove('is-bad'); });
      form.querySelectorAll('[data-err-for]').forEach(function (p) { p.textContent = ''; });
      if (status) status.textContent = '';
    };
    var showErrors = function (errors) {
      var first = null;
      Object.keys(errors).forEach(function (k) {
        var p = form.querySelector('[data-err-for="' + k + '"]');
        var input = form.elements[k];
        if (p) { p.textContent = errors[k]; if (input) { input.closest('.field').classList.add('is-bad'); input.setAttribute('aria-invalid', 'true'); first = first || input; } }
        else if (status) status.textContent = errors[k];
      });
      if (first) first.focus();
    };

    form.addEventListener('submit', function (e) {
      if (!window.fetch) return;
      e.preventDefault();
      clearErrors();
      btn.disabled = true; btn.textContent = form.dataset.sending;
      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams(new FormData(form)).toString(),
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false, errors: { _: form.dataset.err } }; }); })
        .then(function (d) {
          if (d.ok) { ok.hidden = false; ok.focus(); form.reset(); }
          else showErrors(d.errors || { _: form.dataset.err });
        })
        .catch(function () { if (status) status.textContent = form.dataset.err; })
        .then(function () { btn.disabled = false; btn.textContent = form.dataset.submit; });
    });

    var again = form.querySelector('[data-again]');
    if (again) again.addEventListener('click', function () { ok.hidden = true; form.querySelector('input[name="name"]').focus(); });
  });
})();
