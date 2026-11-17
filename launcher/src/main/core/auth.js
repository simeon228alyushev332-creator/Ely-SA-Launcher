'use strict';
// Вход через Ely.by (Yggdrasil-совместимый сервер авторизации).
// Логин и пароль уходят ТОЛЬКО на authserver.ely.by, лаунчер хранит лишь токены (шифруются safeStorage).
// Двухфакторная защита: если на аккаунте включён TOTP, пароль отправляется как «пароль:код».
const crypto = require('crypto');
const U = require('./util');

const AUTH = process.env.ELY_AUTH || 'https://authserver.ely.by'; // ELY_AUTH — только для тестов
const INJECTOR_URL = 'https://authserver.ely.by/api/authlib-injector';
const SKINS = 'https://skinsystem.ely.by/skins/';

async function post(path, body) {
  let r;
  try {
    r = await fetch(AUTH + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': U.UA, Accept: 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
    });
  } catch (e) { const x = new Error('network'); x.code = 'network'; throw x; }
  const text = await r.text(); let j = {}; try { j = text ? JSON.parse(text) : {}; } catch (_) {}
  return { status: r.status, ok: r.ok, json: j };
}
const errText = j => String((j && (j.errorMessage || j.error)) || '');

// Возвращает объект аккаунта {p:'ely', id, name, skin, accessToken, clientToken}
async function login({ login, password, token }) {
  login = String(login || '').trim(); password = String(password || '');
  if (!login || !password) throw new Error('elyBad');
  const clientToken = crypto.randomUUID().replace(/-/g, '');
  const r = await post('/auth/authenticate', {
    username: login, password: token ? password + ':' + String(token).trim() : password,
    clientToken, requestUser: true
  });
  if (!r.ok) {
    const m = errText(r.json);
    if (/two factor/i.test(m)) throw new Error('ely2fa');
    if (r.status === 429 || /too many/i.test(m)) throw new Error('elyRate');
    if (/invalid credentials|invalid username|invalid password|credentials/i.test(m) || r.status === 401 || r.status === 403) throw new Error('elyBad');
    throw new Error('Ely.by: ' + (m || 'HTTP ' + r.status));
  }
  const prof = r.json.selectedProfile;
  if (!prof || !prof.id || !prof.name) throw new Error('elyNoProfile');
  return { p: 'ely', id: prof.id, name: prof.name, skin: SKINS + encodeURIComponent(prof.name) + '.png', accessToken: r.json.accessToken, clientToken: r.json.clientToken || clientToken };
}

// Проверяет токен; при необходимости обновляет. Нет сети — пускаем с тем, что есть.
async function ensureFresh(store, acc) {
  if (!acc || acc.p !== 'ely' || !acc.accessToken) throw new Error('relogin');
  try {
    const v = await post('/auth/validate', { accessToken: acc.accessToken });
    if (v.status === 204 || v.ok) return acc;
    const rf = await post('/auth/refresh', { accessToken: acc.accessToken, clientToken: acc.clientToken });
    if (!rf.ok || !rf.json.accessToken) throw new Error('relogin');
    const prof = rf.json.selectedProfile || {};
    const n = { ...acc, accessToken: rf.json.accessToken, clientToken: rf.json.clientToken || acc.clientToken, name: prof.name || acc.name };
    store.saveAccount(n); return n;
  } catch (e) {
    if (e.code === 'network') return acc;
    throw new Error('relogin');
  }
}
async function signout(acc) { try { if (acc && acc.accessToken) await post('/auth/invalidate', { accessToken: acc.accessToken, clientToken: acc.clientToken }); } catch (_) {} }

module.exports = { login, ensureFresh, signout, INJECTOR_URL, SKINS };
