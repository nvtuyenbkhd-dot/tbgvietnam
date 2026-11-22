'use strict';
// Hỗ trợ SEO: mô tả meta, breadcrumb, JobPosting. Không đưa thông tin đối tác vào dữ liệu có cấu trúc.
const { richText } = require('./helpers');

const plain = (s) => String(s || '').replace(/^\s*[-*•]\s*/gm, '').replace(/\s+/g, ' ').trim();
const truncate = (s, n = 155) => {
  s = plain(s);
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.replace(/\s+\S*$/, '') + '…';
};

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
  };
}

// "48.000 Đài tệ/tháng" -> { value: 48000, unit: 'MONTH' }; "Từ 50.000..." -> { min: 50000 }
function salaryOf(vi) {
  const m = String(vi || '').match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  const unit = /ngày/i.test(vi) ? 'DAY' : 'MONTH';
  return /^\s*Từ/i.test(vi) ? { min: n, unit } : { value: n, unit };
}

function jobPosting({ item, title, description, location, industry, canonical, lang }) {
  const sal = salaryOf(item.salary);
  const ld = {
    '@context': 'https://schema.org', '@type': 'JobPosting', title,
    description: richText(description) || `<p>${plain(title)}</p>`,
    datePosted: String(item.created_at).slice(0, 10),
    employmentType: 'FULL_TIME', directApply: true, inLanguage: lang === 'zh' ? 'zh-Hant' : lang, url: canonical,
    identifier: { '@type': 'PropertyValue', name: 'TB GROUP', value: item.slug },
    industry: industry || undefined,
    hiringOrganization: { '@type': 'Organization', name: 'CTCP Tập đoàn TB Việt Nam (TB GROUP)', sameAs: canonical.replace(/\/(vi|zh|en)\/.*$/, '') },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: location, addressCountry: 'TW' } },
    applicantLocationRequirements: { '@type': 'Country', name: 'VN' },
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(item.deadline || '')) ld.validThrough = item.deadline;
  if (sal) {
    ld.baseSalary = { '@type': 'MonetaryAmount', currency: 'TWD', value: { '@type': 'QuantitativeValue', unitText: sal.unit,
      ...(sal.value ? { value: sal.value } : { minValue: sal.min }) } };
  }
  return ld;
}

module.exports = { truncate, breadcrumb, jobPosting, plain };
