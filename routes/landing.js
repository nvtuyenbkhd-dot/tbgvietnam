'use strict';
// 3 landing page quảng cáo (Du học / Kỹ sư Đài Loan / Xuất khẩu lao động).
// Chạy trên subdomain (du-hoc.*, ky-su.*, xkld.*) hoặc đường dẫn dự phòng /lp/<khoá>.
const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { all, get, run } = require('../lib/db');
const H = require('../lib/helpers');
const { notifyLead } = require('../lib/notify');

const PAGES = {
  study: {
    program: 'study', slug: 'du-hoc', view: 'lp/du-hoc', hosts: ['du-hoc', 'duhoc'], accent: '#076b1a', accent2: '#e8f5e9',
    title: 'Du học Đài Loan kỳ Xuân 2027 – Tự túc, Vừa học vừa làm, 1+4 | TB GROUP',
    desc: 'Tư vấn du học Đài Loan: phân biệt hệ tự túc, vừa học vừa làm, chuyên ban quốc tế, 1+4 và ngôn ngữ. Số liệu từ trang tuyển sinh chính thức của từng trường.',
    image: '/img/about/office1.jpg', label: 'Du học Đài Loan',
  },
  engineer: {
    program: 'engineer', slug: 'ky-su', view: 'lp/ky-su', hosts: ['ky-su', 'kysu'], accent: '#b45309', accent2: '#fff4e5',
    title: 'Kỹ sư & lao động kỹ thuật Đài Loan – Đơn tuyển đang mở | TB GROUP',
    desc: 'Đơn tuyển kỹ sư, lao động kỹ thuật làm việc tại Đài Loan: cơ điện, xây dựng, cơ khí, thang máy. Xem đơn, điều kiện và đăng ký tư vấn.',
    image: '/img/activity/air37.jpg', label: 'Kỹ sư Đài Loan',
  },
  labor: {
    program: 'labor', slug: 'xuat-khau-lao-dong', view: 'lp/xkld', hosts: ['xkld', 'xuat-khau-lao-dong', 'laodong'], accent: '#0f766e', accent2: '#e6f6f4',
    title: 'Xuất khẩu lao động Đài Loan – Quy trình, điều kiện, tư vấn miễn phí | TB GROUP',
    desc: 'Tìm hiểu quy trình đi làm việc tại Đài Loan từ A đến Z: điều kiện, các bước, giấy tờ, chi phí cần hỏi rõ trước khi ký. Đăng ký tư vấn.',
    image: '/img/activity/air9.jpg', label: 'Xuất khẩu lao động',
  },
};
const BY_SLUG = Object.fromEntries(Object.values(PAGES).map((p) => [p.slug, p]));
const BY_HOST = {};
for (const p of Object.values(PAGES)) for (const h of p.hosts) BY_HOST[h] = p;

const digits = (s) => String(s || '').replace(/\D/g, '');

// Liên hệ riêng cho từng trang (nhập trong /admin/settings: lp_<khoá>_phone/zalo/messenger); thiếu thì dùng chung
function contactFor(S, page) {
  const k = `lp_${page.program}_`;
  const phone = digits(S[k + 'phone']) || digits(S.hotline_tel);
  const zalo = digits(S[k + 'zalo']) || digits(S.zalo) || phone;
  const messenger = (S[k + 'messenger'] || S.social_fb_page || '').trim();
  const show = phone.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1.$2.$3');
  return { phone, phoneShow: S[k + 'phone'] ? show : S.hotline || show, zalo, messenger: /^https:\/\//.test(messenger) ? messenger : '' };
}

function trackFor(S) {
  const ok = (v, re) => (re.test(String(v || '').trim()) ? String(v).trim() : '');
  return {
    meta: ok(S.pixel_meta, /^\d{8,20}$/),
    tiktok: ok(S.pixel_tiktok, /^[A-Z0-9]{8,30}$/),
    ga4: ok(S.ga4_id, /^G-[A-Z0-9]{4,20}$/),
    gads: ok(S.gads_id, /^AW-\d{6,15}$/),
    gadsLabel: ok(S.gads_label, /^[\w-]{4,40}$/),
  };
}

const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ ok: false, errors: { _: 'Bạn gửi quá nhiều lần, vui lòng thử lại sau ít phút hoặc gọi hotline.' } }),
});

// Biểu tượng đường nét (24x24)
const ICONS = {
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2 3 8l6 3-3 3-3-.5L2 15l4 1 1 4 1.5-1-.5-3 3-3 3 6 1.8-1.8z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  map: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  build: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 10h5a1 1 0 0 1 1 1v10M2 21h20M8 8h2M8 12h2M8 16h2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20.5l1.3-4.5A8 8 0 1 1 21 12z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.1"/>',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const router = express.Router();
router.use((req, res, next) => {
  const page = req.lpPage;
  if (!page) return next('router');
  res.locals.page = page;
  res.locals.base = req.lpBase || '';
  res.locals.C = contactFor(res.locals.S, page);
  res.locals.track = trackFor(res.locals.S);
  res.locals.esc = H.esc;
  res.locals.ic = icon;
  res.locals.richText = H.richText;
  res.set('Content-Language', 'vi');
  next();
});

router.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\n'));

router.get('/', (req, res) => {
  const page = req.lpPage;
  const data = {};
  if (page.program === 'engineer') {
    const jobs = all("SELECT slug,title_vi,industry,location,salary,headcount FROM jobs WHERE category='engineer' AND published=1 ORDER BY id DESC");
    const ind = {};
    for (const j of jobs) ind[j.industry || 'Khác'] = (ind[j.industry || 'Khác'] || 0) + 1;
    data.jobs = jobs;
    data.industries = Object.entries(ind).sort((a, b) => b[1] - a[1]);
  }
  if (page.program === 'study') {
    data.schools = all("SELECT slug,name_vi,city,type,intake,deadline,image FROM schools WHERE published=1 ORDER BY name_vi");
  }
  const host = req.get('host');
  const canonical = req.lpBase === '' ? `https://${host}/` : `${res.locals.siteUrl}${req.lpBase}/`;
  res.render(page.view, { ...data, canonical, mainUrl: res.locals.siteUrl });
});

router.post('/dang-ky', limiter, (req, res) => {
  const page = req.lpPage;
  const fail = (errors, status = 422) => res.status(status).json({ ok: false, errors });
  const origin = req.get('origin');
  if (origin) { try { if (new URL(origin).host !== req.get('host')) return fail({ _: 'Không gửi được, vui lòng thử lại.' }, 403); } catch { return fail({ _: 'Không gửi được, vui lòng thử lại.' }, 403); } }
  if (req.body.company_site) return res.json({ ok: true }); // ô bẫy bot

  const lead = {
    name: clip(req.body.name, 100), phone: clip(req.body.phone, 30), email: '',
    program: page.program,
    ref_title: clip(req.body.ref_title, 200), message: clip(req.body.message, 1500), lang: 'vi',
    source: clip(req.body.source || req.get('referer') || '', 300),
  };
  const errors = {};
  if (lead.name.length < 2) errors.name = 'Vui lòng nhập họ tên.';
  if (!H.validPhone(lead.phone)) errors.phone = 'Số điện thoại chưa đúng, vui lòng kiểm tra lại.';
  if (Object.keys(errors).length) return fail(errors);

  const info = run('INSERT INTO leads(name,phone,email,program,ref_title,message,lang,source) VALUES(?,?,?,?,?,?,?,?)',
    lead.name, lead.phone, lead.email, lead.program, lead.ref_title, lead.message, lead.lang, lead.source);
  const saved = get('SELECT * FROM leads WHERE id=?', info.lastInsertRowid);
  notifyLead(saved).catch((e) => console.error('[notify]', e.message));
  return res.json({ ok: true });
});

// Mọi đường dẫn khác trên subdomain quay về trang chính của landing
router.use((req, res) => res.redirect(302, (req.lpBase || '') + '/'));

// Dùng khi gắn theo subdomain: du-hoc.<domain>, ky-su.<domain>, xkld.<domain>
function hostMiddleware(req, res, next) {
  const first = String(req.hostname || '').split('.')[0].toLowerCase();
  const page = BY_HOST[first];
  if (!page || String(req.hostname).split('.').length < 3) return next();
  req.lpPage = page; req.lpBase = '';
  return router(req, res, next);
}

// Đường dẫn dự phòng, dùng được ngay cả khi chưa trỏ subdomain: /lp/du-hoc, /lp/ky-su, /lp/xuat-khau-lao-dong
function pathMiddleware(req, res, next) {
  const page = BY_SLUG[req.params.key];
  if (!page) return next();
  req.lpPage = page; req.lpBase = `/lp/${page.slug}`;
  return router(req, res, next);
}

module.exports = { hostMiddleware, pathMiddleware, PAGES, contactFor, trackFor };
