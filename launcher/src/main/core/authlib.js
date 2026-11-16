'use strict';
// authlib-injector: Java-агент, который подменяет серверы авторизации Mojang на Ely.by
// (скины, плащи, вход на серверы с Ely.by). Скачивается один раз в <shared>/authlib-injector.jar.
const fs = require('fs');
const path = require('path');
const U = require('./util');

async function ensure(shared, log = () => {}) {
  const jar = path.join(shared, 'authlib-injector.jar');
  const have = U.exists(jar) && fs.statSync(jar).size > 50000;
  const sources = [
    async () => { const j = await U.fetchJSON('https://authlib-injector.yushi.moe/artifact/latest.json', { timeout: 15000 }); return { url: j.download_url, sha256: (j.checksums || {}).sha256 }; },
    async () => { const j = await U.fetchJSON('https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest', { timeout: 15000 }); const a = (j.assets || []).find(x => /authlib-injector.*\.jar$/.test(x.name)); if (!a) throw new Error('no asset'); return { url: a.browser_download_url }; },
    async () => { const j = await U.fetchJSON('https://bmclapi2.bangbang93.com/mirrors/authlib-injector/artifact/latest.json', { timeout: 15000 }); return { url: j.download_url, sha256: (j.checksums || {}).sha256 }; }
  ];
  if (have && Date.now() - fs.statSync(jar).mtimeMs < 30 * 864e5) return jar; // свежий кэш
  let err;
  for (const src of sources) {
    try {
      const { url, sha256 } = await src();
      const buf = await U.fetchBuf(url);
      if (buf.length < 50000) throw new Error('too small');
      if (sha256 && require('crypto').createHash('sha256').update(buf).digest('hex') !== sha256) throw new Error('sha256 mismatch');
      fs.mkdirSync(shared, { recursive: true }); fs.writeFileSync(jar + '.part', buf); fs.renameSync(jar + '.part', jar);
      log('authlib-injector: OK'); return jar;
    } catch (e) { err = e; }
  }
  if (have) { log('authlib-injector: using cached copy (' + (err && err.message) + ')'); return jar; }
  throw new Error('Не удалось скачать authlib-injector: ' + (err && err.message));
}
module.exports = { ensure };
