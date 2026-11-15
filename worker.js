// ElySA Launcher — бэкенд сайта (Cloudflare Worker).
// Маршруты:
//   /download/windows|macos|linux  -> редирект на файл из последнего GitHub Release
//   /api/launcher                  -> {version, tag, url, assets}  (для кнопки «Обновить лаунчер»)
//   /api/search?src=modrinth|curseforge&q=&type=&loader=&version=&offset=
//   /api/versions?src=&id=&loader=&version=
// Всё остальное отдают статические файлы из ./site (binding ASSETS).
// Переменные (Settings → Variables and Secrets): GITHUB_REPO (необязательно), GITHUB_TOKEN (необязательно, Secret),
// CF_API_KEY (Secret, нужен только для CurseForge).

const DEFAULT_REPO = 'simeon228alyushev332-creator/Ely-SA-Launcher';
const UA = 'ElySA-Launcher-site/1.0 (+https://github.com/' + DEFAULT_REPO + ')';
const MR = 'https://api.modrinth.com/v2';
const CF = 'https://api.curseforge.com/v1';
const OS_FILE = { windows: /\.exe$/i, macos: /\.dmg$/i, linux: /\.appimage$/i };
const CF_CLASS = { mod: 6, modpack: 4471, resourcepack: 12, shader: 6552 };
const CF_LOADER = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const LOADER_NAMES = ['fabric', 'forge', 'neoforge', 'quilt'];

const json = (data, status = 200, cache = 300) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status === 200 ? `public, max-age=${cache}` : 'no-store' }
});
const fail = (status, error) => json({ error }, status);

async function getJSON(url, headers = {}, ttl = 300) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

// ---------- GitHub Releases ----------
async function latestRelease(env) {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const h = env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + env.GITHUB_TOKEN } : {};
  return getJSON(`https://api.github.com/repos/${repo}/releases/latest`, { 'X-GitHub-Api-Version': '2022-11-28', ...h }, 300);
}
async function handleLauncher(env) {
  const rel = await latestRelease(env);
  return json({
    version: String(rel.tag_name || '').replace(/^v/i, ''), tag: rel.tag_name, url: rel.html_url, published: rel.published_at,
    assets: (rel.assets || []).map(a => ({ name: a.name, size: a.size, url: a.browser_download_url }))
  });
}
async function handleDownload(env, os) {
  const re = OS_FILE[os]; if (!re) return fail(404, 'Unknown platform');
  const rel = await latestRelease(env);
  const a = (rel.assets || []).find(x => re.test(x.name));
  if (!a) return fail(404, `В релизе ${rel.tag_name || ''} нет файла для ${os}`);
  return new Response(null, { status: 302, headers: { Location: a.browser_download_url, 'Cache-Control': 'public, max-age=300' } });
}

// ---------- Modrinth ----------
async function mrSearch(p) {
  const type = p.get('type') || 'mod', loader = p.get('loader'), version = p.get('version'), q = p.get('q') || '';
  const facets = [[`project_type:${type}`]];
  if (loader && (type === 'mod' || type === 'modpack')) facets.push([`categories:${loader}`]);
  if (version) facets.push([`versions:${version}`]);
  const u = `${MR}/search?` + new URLSearchParams({ query: q, facets: JSON.stringify(facets), limit: '24', offset: p.get('offset') || '0', index: q ? 'relevance' : 'downloads' });
  const d = await getJSON(u);
  return { total: d.total_hits, results: d.hits.map(h => ({ src: 'modrinth', id: h.project_id, title: h.title, desc: h.description, icon: h.icon_url, downloads: h.downloads, author: h.author, type: h.project_type, url: `https://modrinth.com/${h.project_type}/${h.slug}` })) };
}
async function mrVersions(p) {
  const id = p.get('id'); if (!id) throw Object.assign(new Error('id required'), { status: 400 });
  const q = new URLSearchParams(); if (p.get('loader')) q.set('loaders', JSON.stringify([p.get('loader')])); if (p.get('version')) q.set('game_versions', JSON.stringify([p.get('version')]));
  const list = await getJSON(`${MR}/project/${encodeURIComponent(id)}/version?` + q);
  return { versions: list.map(v => { const f = v.files.find(x => x.primary) || v.files[0] || {}; return { id: v.id, name: v.name || v.version_number, mc: v.game_versions, loaders: v.loaders, url: f.url || '', file: f.filename || '', sha1: (f.hashes || {}).sha1 || '', date: v.date_published, deps: (v.dependencies || []).filter(d => d.dependency_type === 'required' && d.project_id).map(d => d.project_id) }; }) };
}

// ---------- CurseForge ----------
const cfHeaders = env => { if (!env.CF_API_KEY) throw Object.assign(new Error('CurseForge не настроен: добавьте секрет CF_API_KEY'), { status: 503 }); return { 'x-api-key': env.CF_API_KEY }; };
async function cfSearch(env, p) {
  const type = p.get('type') || 'mod', loader = p.get('loader'), version = p.get('version'), q = p.get('q') || '';
  const s = new URLSearchParams({ gameId: '432', classId: String(CF_CLASS[type] || 6), pageSize: '24', index: p.get('offset') || '0', sortField: q ? '1' : '2', sortOrder: 'desc' });
  if (q) s.set('searchFilter', q); if (version) s.set('gameVersion', version);
  if (CF_LOADER[loader] && (type === 'mod' || type === 'modpack')) s.set('modLoaderType', String(CF_LOADER[loader]));
  const d = await getJSON(`${CF}/mods/search?` + s, cfHeaders(env));
  return { results: (d.data || []).map(m => ({ src: 'curseforge', id: String(m.id), title: m.name, desc: m.summary, icon: (m.logo || {}).thumbnailUrl || '', downloads: m.downloadCount, author: ((m.authors || [])[0] || {}).name || '', type, url: (m.links || {}).websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${m.slug}` })) };
}
async function cfVersions(env, p) {
  const id = p.get('id'); if (!/^\d+$/.test(id || '')) throw Object.assign(new Error('bad id'), { status: 400 });
  const s = new URLSearchParams({ pageSize: '50' }); if (p.get('version')) s.set('gameVersion', p.get('version')); if (CF_LOADER[p.get('loader')]) s.set('modLoaderType', String(CF_LOADER[p.get('loader')]));
  const d = await getJSON(`${CF}/mods/${id}/files?` + s, cfHeaders(env));
  return { versions: (d.data || []).map(f => ({
    id: String(f.id), name: f.displayName || f.fileName, file: f.fileName, url: f.downloadUrl || '', date: f.fileDate,
    sha1: ((f.hashes || []).find(h => h.algo === 1) || {}).value || '',
    mc: (f.gameVersions || []).filter(v => /^\d+\.\d+/.test(v)),
    loaders: (f.gameVersions || []).map(v => v.toLowerCase()).filter(v => LOADER_NAMES.includes(v)),
    deps: (f.dependencies || []).filter(x => x.relationType === 3).map(x => String(x.modId))
  })) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, p = url.searchParams;
    try {
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (path === '/api/launcher') return await handleLauncher(env);
        if (path.startsWith('/download/')) return await handleDownload(env, path.slice(10).replace(/\/$/, ''));
        if (path === '/api/search') return json(p.get('src') === 'curseforge' ? await cfSearch(env, p) : await mrSearch(p));
        if (path === '/api/versions') return json(p.get('src') === 'curseforge' ? await cfVersions(env, p) : await mrVersions(p));
        if (path.startsWith('/api/')) return fail(404, 'Not found');
      }
    } catch (e) { return fail(e.status && e.status < 600 ? (e.status === 404 ? 404 : e.status >= 500 || e.status === 400 ? e.status : 502) : 502, e.message || 'error'); }
    return env.ASSETS.fetch(request);
  }
};
