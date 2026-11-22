'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const { getSettings } = require('./lib/db');
const { LANGS, DEFAULT_LANG } = require('./lib/helpers');
try { require('./lib/bootstrap-admin').bootstrapAdmin(); } catch (e) { console.error('[admin]', e.message); }
try { console.log(`[content] đã nạp ${require('./lib/content').importPosts()} bài từ content/posts`); } catch (e) { console.error('[content]', e.message); }

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.SESSION_SECRET) {
  console.error('Thiếu SESSION_SECRET trong biến môi trường. Hãy đặt một chuỗi ngẫu nhiên dài (xem .env.example).');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'frame-src': ["'self'", 'https://www.google.com'],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '30d', index: false }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0, index: false }));

app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(
  cookieSession({
    name: 'tb_sess',
    keys: [process.env.SESSION_SECRET || 'dev-only-secret-change-me'],
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
  })
);

// Cài đặt website dùng chung (hotline, địa chỉ...)
app.use((req, res, next) => {
  // Địa chỉ/hotline mặc định của công ty; giá trị nhập trong trang quản trị (nếu có) sẽ ghi đè
  const COMPANY_DEFAULTS = {
    hotline: '0982.735.714',
    hotline_tel: '0982735714',
    zalo: '0982735714',
    addr_hq: 'Liền kề 24, NO7B, Khu đất dịch vụ Vạn Phúc, phường Hà Đông, thành phố Hà Nội',
    addr_hcm: 'Số 27/48/2/3 Bùi Tư Toàn, khu phố 53, phường An Lạc, TP. Hồ Chí Minh',
    addr_tw: '台中市中區自由路二段9號',
    addr_jp: '東京都新宿区新宿1-26-6',
    map_query: 'TB GROUP - Kỹ sư, Du học và XKLĐ, NO7-B, Khu đất dịch vụ Vạn Phúc, LK24, Hà Đông, Hà Nội',
  };
  const saved = getSettings();
  const S = { ...COMPANY_DEFAULTS };
  for (const [k, v] of Object.entries(saved)) if (v !== '' && v != null) S[k] = v;
  res.locals.S = S;
  res.locals.siteUrl = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  next();
});

app.use('/admin', require('./routes/admin')({ uploadDir }));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${res.locals.siteUrl}/sitemap.xml\n`);
});

// "/" -> ngôn ngữ phù hợp
app.get('/', (req, res) => {
  const pref = (req.headers['accept-language'] || '').toLowerCase();
  const lang = /^zh|,\s*zh/.test(pref) ? 'zh' : /^en|,\s*en/.test(pref) && !/vi/.test(pref) ? 'en' : DEFAULT_LANG;
  res.redirect(302, `/${lang}/`);
});

app.use('/sitemap.xml', require('./routes/sitemap'));
app.use('/:lang(vi|zh|en)', require('./routes/public'));

app.use((req, res) => {
  const lang = LANGS.includes(req.path.split('/')[1]) ? req.path.split('/')[1] : DEFAULT_LANG;
  if (req.path.endsWith('/404')) return res.status(404).type('text/plain').send('Not found');
  req.url = `/${lang}/404`; // hiển thị trang 404 đúng mã trạng thái, không chuyển hướng
  app.handle(req, res);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  const wantsJson = req.xhr || /json/.test(req.headers.accept || '') || req.path.endsWith('/dang-ky');
  if (wantsJson) return res.status(500).json({ ok: false, error: 'server' });
  res.status(500).type('text/plain').send('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
});

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(PORT, () => console.log(`TB GROUP website chạy tại http://localhost:${PORT}`));
}
module.exports = app;
