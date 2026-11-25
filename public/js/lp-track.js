(function () {
  'use strict';
  // Nạp mã theo dõi quảng cáo CHỈ khi đã nhập ID trong /admin/settings (trang chưa có ID thì không gọi bên thứ ba nào).
  var d = document.body.dataset;
  var program = d.program || '';
  var NAME = { study: 'Du hoc Dai Loan', engineer: 'Ky su Dai Loan', labor: 'Xuat khau lao dong Dai Loan' }[program] || program;

  function load(src) { var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }

  // Meta Pixel
  if (d.meta) {
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', d.meta); window.fbq('track', 'PageView');
  }

  // TikTok Pixel
  if (d.tiktok) {
    (function (w, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      ttq.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.load = function (id) { ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._i[id]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js'; ttq._t = ttq._t || {}; ttq._t[id] = +new Date(); load('https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + id + '&lib=' + t); };
      ttq.load(d.tiktok); ttq.page();
    })(window, 'ttq');
  }

  // Google (GA4 và/hoặc Google Ads) dùng chung gtag.js
  var gid = d.ga4 || d.gads;
  if (gid) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    if (d.ga4) window.gtag('config', d.ga4);
    if (d.gads) window.gtag('config', d.gads);
    load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gid));
  }

  // Sự kiện chuẩn: Lead (gửi form) và Contact (bấm gọi/Zalo/Messenger)
  window.lpTrack = function (event, extra) {
    extra = extra || {};
    try {
      if (window.fbq) window.fbq('track', event, { content_name: NAME, content_category: program });
      if (window.ttq) window.ttq.track(event === 'Lead' ? 'SubmitForm' : 'Contact', { content_name: NAME });
      if (window.gtag) {
        if (event === 'Lead') {
          if (d.ga4) window.gtag('event', 'generate_lead', { program: program });
          if (d.gads && d.gadsLabel) window.gtag('event', 'conversion', { send_to: d.gads + '/' + d.gadsLabel });
        } else if (d.ga4) {
          window.gtag('event', 'contact', { method: extra.channel || '', program: program });
        }
      }
    } catch (e) { /* theo dõi lỗi không được làm hỏng trang */ }
  };
})();
