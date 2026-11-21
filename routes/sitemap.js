'use strict';
const express = require('express');
const { all } = require('../lib/db');
const { LANGS } = require('../lib/helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const base = res.locals.siteUrl;
  const pages = ['/', '/du-hoc', '/xuat-khau-lao-dong', '/ky-su-dai-loan', '/tin-tuc', '/ve-chung-toi', '/lien-he'];
  const dyn = [
    ...all('SELECT slug, updated_at FROM schools WHERE published=1').map((r) => [`/du-hoc/${r.slug}`, r.updated_at]),
    ...all("SELECT slug, category, updated_at FROM jobs WHERE published=1").map((r) => [
      `/${r.category === 'engineer' ? 'ky-su-dai-loan' : 'xuat-khau-lao-dong'}/${r.slug}`, r.updated_at,
    ]),
    ...all("SELECT slug, updated_at FROM posts WHERE published=1 AND (publish_at='' OR publish_at IS NULL OR publish_at<=strftime('%Y-%m-%dT%H:%M:%SZ','now'))").map((r) => [`/tin-tuc/${r.slug}`, r.updated_at]),
  ];
  const urls = [...pages.map((p) => [p, null]), ...dyn];
  const alt = (p) =>
    LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l === 'zh' ? 'zh-Hant' : l}" href="${base}/${l}${p === '/' ? '/' : p}"/>`).join('');
  const body = urls
    .flatMap(([p, mod]) =>
      LANGS.map(
        (l) =>
          `<url><loc>${base}/${l}${p === '/' ? '/' : p}</loc>${mod ? `<lastmod>${String(mod).slice(0, 10)}</lastmod>` : ''}${alt(p)}</url>`
      )
    )
    .join('');
  res
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`);
});

module.exports = router;
