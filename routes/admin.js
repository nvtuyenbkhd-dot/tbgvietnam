'use strict';
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { all, get, run, getSettings, setSetting } = require('../lib/db');
const { slugify, esc } = require('../lib/helpers');
const { PROGRAM_LABEL } = require('../lib/notify');

const LANG_TABS = [['vi', 'Tiếng Việt'], ['zh', '繁體中文'], ['en', 'English']];
const PROG_OPTS = [['study', 'Du học'], ['labor', 'Xuất khẩu lao động'], ['engineer', 'Kỹ sư Đài Loan'], ['other', 'Khác']];

// ---- Cấu hình các mục quản lý (một chỗ duy nhất; form và danh sách tự sinh từ đây) ----
const RES = {
  schools: {
    label: 'Trường du học', hint: 'Thông tin tuyển sinh các trường', table: 'schools', hasSlug: true, slugFrom: 'name_vi', hasUpdated: true,
    cols: [['name_vi', 'Tên trường'], ['city', 'Thành phố'], ['featured', 'Nổi bật', 'bool'], ['published', 'Hiển thị', 'bool']],
    order: 'featured DESC, sort, id DESC',
    fields: [
      { n: 'name', label: 'Tên trường', ml: true, req: true },
      { n: 'city', label: 'Thành phố' },
      { n: 'type', label: 'Loại hình', type: 'select', opts: [['university', 'Đại học'], ['college', 'Cao đẳng / Học viện'], ['language', 'Trung tâm ngôn ngữ']] },
      { n: 'image', label: 'Ảnh đại diện', type: 'image' },
      { n: 'summary', label: 'Giới thiệu', ml: true, type: 'textarea' },
      { n: 'majors', label: 'Ngành đào tạo (mỗi dòng một ngành)', ml: true, type: 'textarea' },
      { n: 'requirements', label: 'Điều kiện nhập học (mỗi dòng bắt đầu bằng "- ")', ml: true, type: 'textarea' },
      { n: 'scholarship', label: 'Học bổng', ml: true, type: 'textarea' },
      { n: 'tuition', label: 'Học phí', help: 'Ví dụ: 80.000 - 120.000 NT$/năm' },
      { n: 'intake', label: 'Kỳ nhập học', help: 'Ví dụ: Tháng 9, Tháng 2' },
      { n: 'deadline', label: 'Hạn nộp hồ sơ' },
      { n: 'website', label: 'Website trường (https://...)', type: 'url' },
      { n: 'sort', label: 'Thứ tự (số nhỏ hiện trước)', type: 'number' },
      { n: 'featured', label: 'Hiển thị ở trang chủ (nổi bật)', type: 'check' },
      { n: 'published', label: 'Đang hiển thị trên website', type: 'check', def: 1 },
    ],
  },
  jobs: {
    label: 'Đơn hàng / Vị trí tuyển dụng', hint: 'Xuất khẩu lao động và Kỹ sư Đài Loan', table: 'jobs', hasSlug: true, slugFrom: 'title_vi', hasUpdated: true,
    cols: [['title_vi', 'Vị trí'], ['category', 'Chương trình', 'cat'], ['location', 'Địa điểm'], ['published', 'Hiển thị', 'bool']],
    order: 'id DESC',
    fields: [
      { n: 'category', label: 'Chương trình', type: 'select', opts: [['labor', 'Xuất khẩu lao động'], ['engineer', 'Kỹ sư Đài Loan']], req: true },
      { n: 'title', label: 'Tên vị trí / đơn hàng', ml: true, req: true },
      { n: 'industry', label: 'Ngành nghề', help: 'Dùng cho bộ lọc. Ví dụ: Cơ khí' },
      { n: 'location', label: 'Địa điểm làm việc', help: 'Ví dụ: Đài Trung' },
      { n: 'salary', label: 'Mức lương', help: 'Ví dụ: 48.000 NT$/tháng + tăng ca' },
      { n: 'headcount', label: 'Số lượng tuyển' },
      { n: 'gender', label: 'Giới tính' },
      { n: 'age', label: 'Độ tuổi' },
      { n: 'deadline', label: 'Hạn nộp hồ sơ', type: 'date' },
      { n: 'image', label: 'Ảnh minh hoạ (không bắt buộc)', type: 'image' },
      { n: 'description', label: 'Mô tả công việc', ml: true, type: 'textarea' },
      { n: 'requirements', label: 'Yêu cầu (mỗi dòng bắt đầu bằng "- ")', ml: true, type: 'textarea' },
      { n: 'benefits', label: 'Quyền lợi (mỗi dòng bắt đầu bằng "- ")', ml: true, type: 'textarea' },
      { n: 'featured', label: 'Hiển thị ở trang chủ (nổi bật)', type: 'check' },
      { n: 'published', label: 'Đang hiển thị trên website', type: 'check', def: 1 },
    ],
  },
  posts: {
    label: 'Tin tức & cẩm nang', hint: 'Bài viết hiển thị trên website', table: 'posts', hasSlug: true, slugFrom: 'title_vi', hasUpdated: true,
    cols: [['title_vi', 'Tiêu đề'], ['category', 'Chuyên mục'], ['published_at', 'Ngày đăng'], ['published', 'Hiển thị', 'bool']],
    order: 'published_at DESC, id DESC',
    fields: [
      { n: 'title', label: 'Tiêu đề', ml: true, req: true },
      { n: 'category', label: 'Chuyên mục', type: 'select', opts: [['news', 'Tin tức'], ['guide', 'Cẩm nang'], ['story', 'Câu chuyện']] },
      { n: 'excerpt', label: 'Tóm tắt', ml: true, type: 'textarea' },
      { n: 'body', label: 'Nội dung (dòng "- " là gạch đầu dòng, **chữ đậm**)', ml: true, type: 'textarea', tall: true },
      { n: 'image', label: 'Ảnh đại diện', type: 'image' },
      { n: 'published_at', label: 'Ngày đăng', type: 'date' },
      { n: 'published', label: 'Đang hiển thị trên website', type: 'check', def: 1 },
    ],
  },
  stories: {
    label: 'Chia sẻ của học viên', hint: 'Hiển thị ở trang chủ', table: 'stories', hasSlug: false, hasUpdated: false,
    cols: [['name', 'Tên'], ['program', 'Chương trình', 'cat'], ['published', 'Hiển thị', 'bool']],
    order: 'sort, id DESC',
    fields: [
      { n: 'name', label: 'Tên (có thể ẩn danh)', req: true },
      { n: 'program', label: 'Chương trình', type: 'select', opts: PROG_OPTS.slice(0, 3) },
      { n: 'detail', label: 'Thông tin thêm', help: 'Ví dụ: Kỹ sư cơ khí, Đài Trung, 2024' },
      { n: 'quote', label: 'Lời chia sẻ (chỉ đăng khi người đó đồng ý)', ml: true, type: 'textarea' },
      { n: 'image', label: 'Ảnh (chỉ khi người đó đồng ý)', type: 'image' },
      { n: 'sort', label: 'Thứ tự', type: 'number' },
      { n: 'published', label: 'Đang hiển thị trên website', type: 'check', def: 1 },
    ],
  },
};
const colsOf = (f) => (f.ml ? LANG_TABS.map(([l]) => `${f.n}_${l}`) : [f.n]);

const SETTING_FIELDS = [
  ['hotline', 'Hotline hiển thị (ví dụ 0982.735.714)'], ['hotline_tel', 'Số gọi/Zalo (chỉ chữ số, ví dụ 0982735714)'], ['zalo', 'Số Zalo (chỉ chữ số)'],
  ['email', 'Email liên hệ'], ['facebook', 'Link Facebook (cũ, không còn dùng)'],
  ['social_fb_page', 'Link Fanpage Facebook (https://...)'], ['social_tiktok', 'Link TikTok (https://...)'], ['social_youtube', 'Link YouTube (https://...)'], ['social_fb_group', 'Link nhóm Facebook (https://...)'],
  ['hours_vi', 'Giờ làm việc'],
  ['pixel_meta', 'Landing: Meta Pixel ID (chỉ chữ số)'], ['pixel_tiktok', 'Landing: TikTok Pixel ID (ví dụ C1ABCDEF...)'],
  ['ga4_id', 'Landing: Google Analytics 4 (G-XXXXXXXXXX)'], ['gads_id', 'Landing: Google Ads (AW-123456789)'], ['gads_label', 'Landing: Google Ads nhãn chuyển đổi (phần sau dấu / )'],
  ['lp_study_phone', 'Landing Du học: số điện thoại/Zalo riêng (để trống = dùng hotline chung)'], ['lp_study_zalo', 'Landing Du học: số Zalo riêng'], ['lp_study_messenger', 'Landing Du học: link Messenger (https://m.me/...)'],
  ['lp_engineer_phone', 'Landing Kỹ sư: số điện thoại riêng'], ['lp_engineer_zalo', 'Landing Kỹ sư: số Zalo riêng'], ['lp_engineer_messenger', 'Landing Kỹ sư: link Messenger (https://m.me/...)'],
  ['lp_labor_phone', 'Landing XKLĐ: số điện thoại riêng'], ['lp_labor_zalo', 'Landing XKLĐ: số Zalo riêng'], ['lp_labor_messenger', 'Landing XKLĐ: link Messenger (https://m.me/...)'],
  ['addr_hq', 'Địa chỉ trụ sở chính'], ['addr_hcm', 'Văn phòng TP. HCM'], ['addr_tw', 'Văn phòng Đài Loan'],
  ['show_stats', 'Hiện khối số liệu ở trang chủ (1 = hiện, 0 = ẩn). Chỉ bật khi số liệu bên dưới là THẬT.'],
  ['stat_years', 'Số liệu: Năm kinh nghiệm'], ['stat_students', 'Số liệu: Học viên đã xuất cảnh'], ['stat_partners', 'Số liệu: Đối tác Đài Loan'], ['stat_offices', 'Số liệu: Số văn phòng'],
];

module.exports = ({ uploadDir }) => {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.locals.esc = esc;
    res.locals.PROGRAM_LABEL = PROGRAM_LABEL;
    res.locals.flash = req.session.flash || null;
    req.session.flash = null;
    if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
    res.locals.csrf = req.session.csrf;
    res.locals.adminUser = req.session.uname || null;
    next();
  });

  const verifyCsrf = (req, res, next) => {
    const sent = String(req.body?._csrf || req.query._csrf || '');
    const ok = sent.length === req.session.csrf.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrf));
    if (!ok) { req.session.flash = { type: 'error', text: 'Phiên làm việc hết hạn, vui lòng thử lại.' }; return res.redirect(303, req.get('referer') || '/admin'); }
    next();
  };
  const requireAuth = (req, res, next) => (req.session.uid ? next() : res.redirect(303, '/admin/login'));

  // ---- Tải ảnh ----
  const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED[file.mimetype] || ''}`),
    }),
    limits: { fileSize: 4 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace('.jpeg', '.jpg');
      if (ALLOWED[file.mimetype] && ALLOWED[file.mimetype] === ext) return cb(null, true);
      cb(Object.assign(new Error('bad type'), { code: 'BAD_TYPE' }));
    },
  });
  const uploadOne = (req, res, next) =>
    upload.single('image_file')(req, res, (err) => {
      if (err) { req.session.flash = { type: 'error', text: err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh quá lớn (tối đa 4 MB).' : err.code === 'BAD_TYPE' ? 'Chỉ nhận ảnh JPG, PNG, WebP hoặc GIF.' : 'Không tải được ảnh.' }; return res.redirect(303, req.get('referer') || '/admin'); }
      next();
    });

  // ---- Đăng nhập ----
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
    handler: (req, res) => res.status(429).render('admin/login', { error: 'Thử quá nhiều lần. Vui lòng đợi 15 phút.' }) });
  const DUMMY = bcrypt.hashSync('dummy-password', 12);

  router.get('/login', (req, res) => (req.session.uid ? res.redirect('/admin') : res.render('admin/login', { error: null })));
  router.post('/login', loginLimiter, verifyCsrf, (req, res) => {
    const user = get('SELECT * FROM users WHERE username=?', String(req.body.username || '').trim());
    const ok = bcrypt.compareSync(String(req.body.password || ''), user ? user.password_hash : DUMMY) && user;
    if (!ok) return res.status(401).render('admin/login', { error: 'Sai tên đăng nhập hoặc mật khẩu.' });
    req.session = { uid: user.id, uname: user.username, csrf: crypto.randomBytes(24).toString('hex') }; // đổi phiên sau đăng nhập
    res.redirect(303, '/admin');
  });
  router.post('/logout', verifyCsrf, (req, res) => { req.session = null; res.redirect(303, '/admin/login'); });

  router.use(requireAuth);

  // ---- Tổng quan ----
  router.get('/', (req, res) => {
    const byStatus = Object.fromEntries(all('SELECT status, COUNT(*) c FROM leads GROUP BY status').map((r) => [r.status, r.c]));
    res.render('admin/dashboard', {
      nav: 'dash', byStatus,
      week: get("SELECT COUNT(*) c FROM leads WHERE created_at >= datetime('now','-7 days')").c,
      latest: all('SELECT * FROM leads ORDER BY id DESC LIMIT 8'),
      counts: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, get(`SELECT COUNT(*) c FROM ${r.table}`).c])),
      RES,
    });
  });

  // ---- Khách đăng ký ----
  const STATUS = [['new', 'Mới'], ['contacted', 'Đã liên hệ'], ['done', 'Hoàn tất'], ['spam', 'Rác']];
  function leadQuery(q) {
    const where = ['1=1']; const args = [];
    if (STATUS.some(([k]) => k === q.status)) { where.push('status=?'); args.push(q.status); }
    if (PROG_OPTS.some(([k]) => k === q.program)) { where.push('program=?'); args.push(q.program); }
    if (q.q) { where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR message LIKE ?)'); args.push(...Array(4).fill(`%${q.q}%`)); }
    return { where: where.join(' AND '), args };
  }
  router.get('/leads', (req, res) => {
    const { where, args } = leadQuery(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const total = get(`SELECT COUNT(*) c FROM leads WHERE ${where}`, ...args).c;
    res.render('admin/leads', {
      nav: 'leads', STATUS, PROG_OPTS, f: req.query, total, page, pages: Math.max(1, Math.ceil(total / 30)),
      items: all(`SELECT * FROM leads WHERE ${where} ORDER BY id DESC LIMIT 30 OFFSET ${(page - 1) * 30}`, ...args),
    });
  });
  const csvCell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // chống chèn công thức khi mở bằng Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  router.get('/leads/export.csv', (req, res) => {
    const { where, args } = leadQuery(req.query);
    const rows = all(`SELECT * FROM leads WHERE ${where} ORDER BY id DESC`, ...args);
    const head = ['ID', 'Thời gian (UTC)', 'Họ tên', 'Điện thoại', 'Email', 'Chương trình', 'Quan tâm', 'Lời nhắn', 'Ngôn ngữ', 'Trạng thái', 'Ghi chú'];
    const lines = [head.map(csvCell).join(',')].concat(rows.map((r) =>
      [r.id, r.created_at, r.name, r.phone, r.email, PROGRAM_LABEL[r.program] || r.program, r.ref_title, r.message, r.lang, (STATUS.find(([k]) => k === r.status) || [])[1] || r.status, r.note].map(csvCell).join(',')));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="dang-ky-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.send('﻿' + lines.join('\r\n'));
  });
  router.post('/leads/:id', verifyCsrf, (req, res) => {
    const status = STATUS.some(([k]) => k === req.body.status) ? req.body.status : 'new';
    run('UPDATE leads SET status=?, note=? WHERE id=?', status, String(req.body.note || '').slice(0, 1000), Number(req.params.id));
    req.session.flash = { type: 'ok', text: 'Đã cập nhật.' };
    res.redirect(303, req.body.back || '/admin/leads');
  });
  router.post('/leads/:id/delete', verifyCsrf, (req, res) => {
    run('DELETE FROM leads WHERE id=?', Number(req.params.id));
    req.session.flash = { type: 'ok', text: 'Đã xoá đăng ký.' };
    res.redirect(303, '/admin/leads');
  });

  // ---- CRUD chung ----
  const resOf = (req, res, next) => { const r = RES[req.params.res]; if (!r) return res.redirect('/admin'); req.R = r; res.locals.R = r; res.locals.resKey = req.params.res; next(); };

  router.get('/c/:res', resOf, (req, res) => {
    const items = all(`SELECT * FROM ${req.R.table} ORDER BY ${req.R.order} LIMIT 500`);
    res.render('admin/list', { nav: req.params.res, items, RES });
  });
  router.get('/c/:res/new', resOf, (req, res) => {
    const item = {};
    for (const f of req.R.fields) if (f.def !== undefined) item[f.n] = f.def;
    if (req.params.res === 'jobs' && ['labor', 'engineer'].includes(req.query.category)) item.category = req.query.category;
    res.render('admin/form', { nav: req.params.res, item, isNew: true, LANG_TABS, RES });
  });
  router.get('/c/:res/:id', resOf, (req, res) => {
    const item = get(`SELECT * FROM ${req.R.table} WHERE id=?`, Number(req.params.id));
    if (!item) return res.redirect(`/admin/c/${req.params.res}`);
    res.render('admin/form', { nav: req.params.res, item, isNew: false, LANG_TABS, RES });
  });

  function uniqueSlug(table, base, selfId) {
    let slug = slugify(base); let i = 2; const root = slug;
    while (get(`SELECT id FROM ${table} WHERE slug=? AND id<>?`, slug, selfId || 0)) slug = `${root}-${i++}`;
    return slug;
  }
  function collect(R, body, file, existing) {
    const data = {};
    for (const f of R.fields) {
      if (f.type === 'image') { data[f.n] = file ? `/uploads/${file.filename}` : (existing?.[f.n] || ''); continue; }
      for (const c of colsOf(f)) {
        const raw = body[c];
        if (f.type === 'check') data[c] = body[c] ? 1 : 0;
        else if (f.type === 'number') data[c] = parseInt(raw, 10) || 0;
        else data[c] = String(raw ?? '').trim().slice(0, f.type === 'textarea' ? 20000 : 300);
      }
    }
    return data;
  }
  function validate(R, data) {
    for (const f of R.fields) if (f.req) { const c = f.ml ? `${f.n}_vi` : f.n; if (!data[c]) return `Vui lòng nhập: ${f.label}${f.ml ? ' (Tiếng Việt)' : ''}.`; }
    for (const f of R.fields) if (f.type === 'url' && data[f.n] && !/^https?:\/\//i.test(data[f.n])) return `${f.label} phải bắt đầu bằng http:// hoặc https://`;
    return null;
  }
  function save(req, res) {
    const R = req.R; const id = req.params.id ? Number(req.params.id) : null;
    const existing = id ? get(`SELECT * FROM ${R.table} WHERE id=?`, id) : null;
    const data = collect(R, req.body, req.file, existing);
    const err = validate(R, data);
    if (err) { req.session.flash = { type: 'error', text: err }; return res.redirect(303, req.get('referer') || `/admin/c/${req.params.res}`); }
    if (R.hasSlug) data.slug = uniqueSlug(R.table, String(req.body.slug || '').trim() || data[R.slugFrom], id);
    const cols = Object.keys(data);
    if (existing) {
      run(`UPDATE ${R.table} SET ${cols.map((c) => `${c}=?`).join(',')}${R.hasUpdated ? ", updated_at=datetime('now')" : ''} WHERE id=?`, ...cols.map((c) => data[c]), id);
    } else {
      run(`INSERT INTO ${R.table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, ...cols.map((c) => data[c]));
    }
    req.session.flash = { type: 'ok', text: 'Đã lưu.' };
    res.redirect(303, `/admin/c/${req.params.res}`);
  }
  router.post('/c/:res/new', resOf, uploadOne, verifyCsrf, save);
  router.post('/c/:res/:id', resOf, uploadOne, verifyCsrf, save);
  router.post('/c/:res/:id/delete', resOf, verifyCsrf, (req, res) => {
    run(`DELETE FROM ${req.R.table} WHERE id=?`, Number(req.params.id));
    req.session.flash = { type: 'ok', text: 'Đã xoá.' };
    res.redirect(303, `/admin/c/${req.params.res}`);
  });

  // ---- Cài đặt & mật khẩu ----
  router.get('/settings', (req, res) => res.render('admin/settings', { nav: 'settings', fields: SETTING_FIELDS, S: getSettings() }));
  router.post('/settings', verifyCsrf, (req, res) => {
    for (const [k] of SETTING_FIELDS) if (k in req.body) setSetting(k, String(req.body[k]).trim().slice(0, 500));
    req.session.flash = { type: 'ok', text: 'Đã lưu cài đặt.' };
    res.redirect(303, '/admin/settings');
  });
  router.get('/password', (req, res) => res.render('admin/password', { nav: 'password' }));
  router.post('/password', verifyCsrf, (req, res) => {
    const user = get('SELECT * FROM users WHERE id=?', req.session.uid);
    const { current = '', next = '', confirm = '' } = req.body;
    let msg = null;
    if (!bcrypt.compareSync(String(current), user.password_hash)) msg = 'Mật khẩu hiện tại không đúng.';
    else if (String(next).length < 10) msg = 'Mật khẩu mới cần ít nhất 10 ký tự.';
    else if (next !== confirm) msg = 'Mật khẩu xác nhận không khớp.';
    if (msg) req.session.flash = { type: 'error', text: msg };
    else { run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(String(next), 12), user.id); req.session.flash = { type: 'ok', text: 'Đã đổi mật khẩu.' }; }
    res.redirect(303, '/admin/password');
  });

  return router;
};
