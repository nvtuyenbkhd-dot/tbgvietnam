'use strict';
const fs = require('fs');
const path = require('path');
const { LANGS, DEFAULT_LANG } = require('./helpers');

const dict = {};
for (const l of LANGS) dict[l] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${l}.json`), 'utf8'));

const dig = (obj, key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

function makeT(lang) {
  return (key) => {
    const v = dig(dict[lang], key);
    if (v !== undefined) return v;
    const f = dig(dict[DEFAULT_LANG], key);
    return f !== undefined ? f : key;
  };
}

module.exports = { makeT, dict };
