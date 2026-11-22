'use strict';
const LANGS = ['vi', 'zh', 'en'];
const DEFAULT_LANG = 'vi';

// Lấy trường đa ngôn ngữ, quay về tiếng Việt nếu bản dịch trống
const L = (row, field, lang) => {
  if (!row) return '';
  return String(row[`${field}_${lang}`] || '').trim() || String(row[`${field}_${DEFAULT_LANG}`] ?? row[field] ?? '');
};

const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'muc';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Văn bản thuần -> HTML an toàn: đoạn, danh sách gạch đầu dòng, **đậm**
const richText = (s) => {
  const lines = esc(s).split(/\r?\n/);
  let html = '';
  let list = false;
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>');
  const close = () => { if (list) { html += `</${list}>`; list = false; } };
  for (const raw of lines) {
    const line = raw.trim();
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    const m = line.match(/^[-*•]\s+(.*)$/);
    const o = line.match(/^\d+[.)]\s+(.*)$/);
    if (h) {
      close();
      html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    } else if (m || o) {
      const tag = m ? 'ul' : 'ol';
      if (list !== tag) { close(); html += `<${tag}>`; list = tag; }
      html += `<li>${inline((m || o)[1])}</li>`;
    } else {
      close();
      if (line) html += `<p>${inline(line)}</p>`;
    }
  }
  close();
  return html;
};

const splitList = (s) =>
  String(s || '')
    .split(/\r?\n|,|;/)
    .map((x) => x.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

const normPhone = (p) => String(p || '').replace(/[^\d+]/g, '');
const validPhone = (p) => /^(\+?84|0)\d{8,10}$|^\+?\d{8,15}$/.test(normPhone(p));
const validEmail = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const fmtDate = (d, lang) => {
  if (!d) return '';
  const dt = new Date(String(d).replace(' ', 'T') + (String(d).length <= 10 ? 'T00:00:00' : 'Z'));
  if (isNaN(dt)) return d;
  const loc = { vi: 'vi-VN', zh: 'zh-TW', en: 'en-GB' }[lang] || 'vi-VN';
  return dt.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
};

module.exports = { LANGS, DEFAULT_LANG, L, slugify, esc, richText, splitList, normPhone, validPhone, validEmail, fmtDate };
