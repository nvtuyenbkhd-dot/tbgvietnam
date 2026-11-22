'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { all, get, run } = require('../lib/db');
const { makeT } = require('../lib/i18n');
const { notifyLead } = require('../lib/notify');
const H = require('../lib/helpers');
const SEO = require('../lib/seo');

const router = express.Router({ mergeParams: true });
const PAGE = 12;
const PROGRAMS = ['study', 'labor', 'engineer', 'other'];
// đường dẫn giữ nguyên giữa các ngôn ngữ để chuyển ngôn ngữ đơn giản và SEO ổn định
const JOB_PATH = { labor: 'xuat-khau-lao-dong', engineer: 'ky-su-dai-loan' };

router.use((req, res, next) => {
  const lang = req.params.lang;
  const t = makeT(lang);
  Object.assign(res.locals, {
    lang, t, L: (row, f) => H.L(row, f, lang), u: (p = '/') => `/${lang}${p}`,
    richText: H.richText, splitList: H.splitList, fmtDate: (d) => H.fmtDate(d, lang), esc: H.esc,
    JOB_PATH, langs: H.LANGS, path: req.path === '/' ? '' : req.path,
    pageTitle: '', pageDesc: '', pageImage: '', query: req.query, jsonLd: null,
  });
  res.set('Content-Language', lang === 'zh' ? 'zh-Hant' : lang);
  next();
});

const pub = (extra = '') => `published=1 ${extra}`;
// Bài hẹn giờ: chỉ hiện khi publish_at (UTC, ISO) đã tới; để trống = hiện ngay
const POST_LIVE = "published=1 AND (publish_at='' OR publish_at IS NULL OR publish_at<=strftime('%Y-%m-%dT%H:%M:%SZ','now'))";
const POST_ORDER = "CASE WHEN publish_at='' OR publish_at IS NULL THEN published_at||'T00:00:00Z' ELSE publish_at END DESC, id DESC";
const distinct = (table, col, where = '1=1', ...a) =>
  all(`SELECT DISTINCT ${col} v FROM ${table} WHERE published=1 AND ${where} AND ${col}<>'' ORDER BY ${col}`, ...a).map((r) => r.v);
const pageOf = (req) => Math.max(1, parseInt(req.query.page, 10) || 1);

// ---------------- Trang chủ ----------------
router.get('/', (req, res) => {
  const featuredSchools = all(`SELECT * FROM schools WHERE ${pub()} ORDER BY featured DESC, sort, id DESC LIMIT 4`);
  const featuredLabor = all(`SELECT * FROM jobs WHERE ${pub("AND category='labor'")} ORDER BY featured DESC, id DESC LIMIT 3`);
  const featuredEng = all(`SELECT * FROM jobs WHERE ${pub("AND category='engineer'")} ORDER BY featured DESC, id DESC LIMIT 3`);
  const stories = all(`SELECT * FROM stories WHERE ${pub()} ORDER BY sort, id DESC LIMIT 3`);
  const posts = all(`SELECT * FROM posts WHERE ${POST_LIVE} ORDER BY ${POST_ORDER} LIMIT 3`);
  const counts = {
    schools: get('SELECT COUNT(*) c FROM schools WHERE published=1').c,
    labor: get("SELECT COUNT(*) c FROM jobs WHERE published=1 AND category='labor'").c,
    engineer: get("SELECT COUNT(*) c FROM jobs WHERE published=1 AND category='engineer'").c,
  };
  res.render('home', {
    page: 'home', pageTitle: '', pageDesc: res.locals.t('meta.description'),
    featuredSchools, featuredLabor, featuredEng, stories, posts, counts,
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'Organization', name: 'CTCP Tập đoàn TB Việt Nam (TB GROUP)', alternateName: '越南TB集團股份公司',
      url: res.locals.siteUrl, telephone: res.locals.S.hotline_tel || undefined, address: res.locals.S.addr_hq || undefined,
    },
  });
});

// ---------------- Du học ----------------
router.get('/du-hoc', (req, res) => {
  const { q = '', city = '', type = '' } = req.query;
  const where = ['published=1']; const args = [];
  if (q) { where.push('(name_vi LIKE ? OR name_zh LIKE ? OR name_en LIKE ? OR majors_vi LIKE ? OR majors_en LIKE ? OR majors_zh LIKE ? OR city LIKE ?)'); args.push(...Array(7).fill(`%${q}%`)); }
  if (city) { where.push('city = ?'); args.push(city); }
  if (['university', 'college', 'language'].includes(type)) { where.push('type = ?'); args.push(type); }
  const total = get(`SELECT COUNT(*) c FROM schools WHERE ${where.join(' AND ')}`, ...args).c;
  const page = Math.min(pageOf(req), Math.max(1, Math.ceil(total / PAGE)));
  const items = all(`SELECT * FROM schools WHERE ${where.join(' AND ')} ORDER BY featured DESC, sort, id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, ...args);
  res.render('study', {
    page: 'study', pageTitle: res.locals.t('study.title'), pageDesc: res.locals.t('study.sub'),
    items, total, pg: page, pages: Math.ceil(total / PAGE), cities: distinct('schools', 'city'), filters: { q, city, type },
  });
});

router.get('/du-hoc/:slug', (req, res, next) => {
  const item = get('SELECT * FROM schools WHERE slug=? AND published=1', req.params.slug);
  if (!item) return next('route');
  const others = all('SELECT * FROM schools WHERE published=1 AND id<>? ORDER BY featured DESC, sort LIMIT 3', item.id);
  const name = H.L(item, 'name', req.params.lang);
  res.render('school', {
    page: 'study', item, others, pageTitle: name, pageDesc: H.L(item, 'summary', req.params.lang).slice(0, 160),
    jsonLd: { '@context': 'https://schema.org', '@type': 'CollegeOrUniversity', name, url: item.website || undefined, address: item.city || undefined },
  });
});

// ---------------- Xuất khẩu lao động / Kỹ sư ----------------
// Giá trị lọc giữ tiếng Việt, nhãn hiển thị theo ngôn ngữ đang xem
function jobOpts(col, category, lang) {
  return all(`SELECT DISTINCT ${col} v, ${col}_en en, ${col}_zh zh FROM jobs WHERE published=1 AND category=? AND ${col}<>'' ORDER BY ${col}`, category)
    .map((r) => ({ v: r.v, label: (lang === 'en' ? r.en : lang === 'zh' ? r.zh : '') || r.v }));
}
function jobList(category) {
  return (req, res) => {
    const { q = '', industry = '', location = '' } = req.query;
    const where = ['published=1', 'category=?']; const args = [category];
    if (q) { where.push('(title_vi LIKE ? OR title_zh LIKE ? OR title_en LIKE ? OR industry LIKE ?)'); args.push(...Array(4).fill(`%${q}%`)); }
    if (industry) { where.push('industry=?'); args.push(industry); }
    if (location) { where.push('location=?'); args.push(location); }
    const total = get(`SELECT COUNT(*) c FROM jobs WHERE ${where.join(' AND ')}`, ...args).c;
    const page = Math.min(pageOf(req), Math.max(1, Math.ceil(total / PAGE)));
    const items = all(`SELECT * FROM jobs WHERE ${where.join(' AND ')} ORDER BY featured DESC, id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, ...args);
    res.render('jobs', {
      page: category, category, pageTitle: res.locals.t(`${category}.title`), pageDesc: res.locals.t(`${category}.sub`),
      items, total, pg: page, pages: Math.ceil(total / PAGE),
      industries: jobOpts('industry', category, req.params.lang), locations: jobOpts('location', category, req.params.lang),
      filters: { q, industry, location },
    });
  };
}
function jobDetail(category) {
  return (req, res, next) => {
    const item = get('SELECT * FROM jobs WHERE slug=? AND category=? AND published=1', req.params.slug, category);
    if (!item) return next('route');
    const others = all('SELECT * FROM jobs WHERE published=1 AND category=? AND id<>? ORDER BY featured DESC, id DESC LIMIT 3', category, item.id);
    const lang = req.params.lang;
    const title = H.L(item, 'title', lang);
    const location = H.L(item, 'location', lang);
    const salary = H.L(item, 'salary', lang);
    const description = H.L(item, 'description', lang);
    const canonical = `${res.locals.siteUrl}/${lang}/${JOB_PATH[category]}/${item.slug}`;
    const desc = SEO.truncate([title, location, salary, SEO.plain(description.split('\n')[0])].filter(Boolean).join('. '));
    res.render('job', {
      page: category, category, item, others, pageTitle: title, pageDesc: desc, pageImage: item.image || '',
      jsonLd: [
        SEO.jobPosting({ item, title, description, location, industry: H.L(item, 'industry', lang), canonical, lang }),
        SEO.breadcrumb([[res.locals.t('nav.home'), `${res.locals.siteUrl}/${lang}/`], [res.locals.t('nav.' + category), `${res.locals.siteUrl}/${lang}/${JOB_PATH[category]}`], [title, canonical]]),
      ],
    });
  };
}
for (const [cat, p] of Object.entries(JOB_PATH)) {
  router.get(`/${p}`, jobList(cat));
  router.get(`/${p}/:slug`, jobDetail(cat));
}

// ---------------- Tin tức ----------------
router.get('/tin-tuc', (req, res) => {
  const cat = ['news', 'guide', 'story'].includes(req.query.cat) ? req.query.cat : '';
  const where = cat ? `${POST_LIVE} AND category=?` : POST_LIVE;
  const args = cat ? [cat] : [];
  const total = get(`SELECT COUNT(*) c FROM posts WHERE ${where}`, ...args).c;
  const page = Math.min(pageOf(req), Math.max(1, Math.ceil(total / PAGE)));
  const items = all(`SELECT * FROM posts WHERE ${where} ORDER BY ${POST_ORDER} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, ...args);
  res.render('news', { page: 'news', items, cat, total, pg: page, pages: Math.ceil(total / PAGE), pageTitle: res.locals.t('news.title'), pageDesc: res.locals.t('news.sub') });
});
router.get('/tin-tuc/:slug', (req, res, next) => {
  const item = get(`SELECT * FROM posts WHERE slug=? AND ${POST_LIVE}`, req.params.slug);
  if (!item) return next('route');
  const related = all(`SELECT * FROM posts WHERE ${POST_LIVE} AND id<>? ORDER BY ${POST_ORDER} LIMIT 3`, item.id);
  const title = H.L(item, 'title', req.params.lang);
  res.render('post', {
    page: 'news', item, related, pageTitle: title, pageDesc: H.L(item, 'excerpt', req.params.lang), pageImage: item.image,
    ogType: 'article', publishedTime: item.publish_at || item.published_at,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'Article', headline: title, description: H.L(item, 'excerpt', req.params.lang),
      datePublished: item.published_at, dateModified: (item.updated_at || item.published_at).slice(0, 10),
      image: item.image ? res.locals.siteUrl + item.image : undefined, inLanguage: req.params.lang,
      author: { '@type': 'Organization', name: 'TB GROUP' },
      publisher: { '@type': 'Organization', name: 'TB GROUP' },
      mainEntityOfPage: `${res.locals.siteUrl}/${req.params.lang}/tin-tuc/${item.slug}`,
    },
    SEO.breadcrumb([[res.locals.t('nav.home'), `${res.locals.siteUrl}/${req.params.lang}/`], [res.locals.t('nav.news'), `${res.locals.siteUrl}/${req.params.lang}/tin-tuc`], [title, `${res.locals.siteUrl}/${req.params.lang}/tin-tuc/${item.slug}`]])],
  });
});

router.get('/ve-chung-toi', (req, res) =>
  res.render('about', { page: 'about', pageTitle: res.locals.t('about.title'), pageDesc: res.locals.t('about.sub') }));
router.get('/lien-he', (req, res) =>
  res.render('contact', { page: 'contact', pageTitle: res.locals.t('contact.title'), pageDesc: res.locals.t('contact.sub') }));
router.get('/404', (req, res) => res.status(404).render('404', { page: '', pageTitle: res.locals.t('common.page_not_found') }));
router.get('/dang-ky/cam-on', (req, res) =>
  res.render('thanks', { page: '', pageTitle: res.locals.t('form.ok_title'), noindex: true }));

// ---------------- Biểu mẫu đăng ký ----------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    const msg = makeT(req.params.lang)('form.err_rate');
    return req.accepts(['html', 'json']) === 'json' ? res.status(429).json({ ok: false, errors: { _: msg } }) : res.status(429).send(msg);
  },
});
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);

router.post('/dang-ky', limiter, (req, res) => {
  const lang = req.params.lang;
  const t = makeT(lang);
  const wantsJson = req.accepts(['html', 'json']) === 'json';
  const fail = (errors, status = 400) =>
    wantsJson ? res.status(status).json({ ok: false, errors }) : res.status(status).send(Object.values(errors).join('\n'));

  // chặn gửi chéo site và bot (ô ẩn)
  const origin = req.get('origin');
  if (origin) { try { if (new URL(origin).host !== req.get('host')) return fail({ _: t('form.err_generic') }, 403); } catch { return fail({ _: t('form.err_generic') }, 403); } }
  if (req.body.company_site) return wantsJson ? res.json({ ok: true }) : res.redirect(303, `/${lang}/dang-ky/cam-on`);

  const lead = {
    name: clip(req.body.name, 100), phone: clip(req.body.phone, 30), email: clip(req.body.email, 120),
    program: PROGRAMS.includes(req.body.program) ? req.body.program : 'other',
    ref_title: clip(req.body.ref_title, 200), message: clip(req.body.message, 1500), lang,
    source: clip(req.body.source || req.get('referer') || '', 300),
  };
  const errors = {};
  if (lead.name.length < 2) errors.name = t('form.err_name');
  if (!H.validPhone(lead.phone)) errors.phone = t('form.err_phone');
  if (!H.validEmail(lead.email)) errors.email = t('form.err_email');
  if (Object.keys(errors).length) return fail(errors, 422);

  const info = run('INSERT INTO leads(name,phone,email,program,ref_title,message,lang,source) VALUES(?,?,?,?,?,?,?,?)',
    lead.name, lead.phone, lead.email, lead.program, lead.ref_title, lead.message, lead.lang, lead.source);
  const saved = get('SELECT * FROM leads WHERE id=?', info.lastInsertRowid);
  notifyLead(saved).catch((e) => console.error('[notify]', e.message)); // không chặn phản hồi cho khách

  return wantsJson ? res.json({ ok: true }) : res.redirect(303, `/${lang}/dang-ky/cam-on`);
});

module.exports = router;
