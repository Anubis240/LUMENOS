'use strict';
// Machine-level capabilities for the main Lumen assistant, each behind an explicit,
// revocable, user-granted permission. Everything is off by default. File access is
// scoped to folders the user adds; there is no shell/command execution here.
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
// Share the ApiError class with providers.cjs so serve.cjs's `instanceof ApiError`
// check maps capability errors to their real status instead of a generic 500.
const { ApiError } = require('./providers.cjs');

const CAP_NAMES = ['system', 'files', 'web'];
const MAX_ROOTS = 12;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_LIST = 500;
const MAX_FETCH_BYTES = 512 * 1024;
const FETCH_TIMEOUT = 10000;
const AUDIT_MAX = 500;
const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.yaml', '.yml', '.xml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.sh', '.bat', '.ps1', '.ini', '.toml', '.cfg', '.conf', '.log', '.sql', '.env', '.gitignore', '']);

function createCapabilities({ directory }) {
  const file = path.join(directory, 'permissions.json');
  const auditFile = path.join(directory, 'permissions-audit.jsonl');
  let state = { system: false, files: false, web: false, roots: [], updatedAt: null };
  try {
    const raw = JSON.parse(fssync.readFileSync(file, 'utf8'));
    for (const c of CAP_NAMES) state[c] = !!raw[c];
    state.roots = Array.isArray(raw.roots) ? raw.roots.filter(r => typeof r === 'string').slice(0, MAX_ROOTS) : [];
    state.updatedAt = raw.updatedAt || null;
  } catch { /* defaults: all off */ }

  async function persist() {
    state.updatedAt = new Date().toISOString();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(file + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.rename(file + '.tmp', file);
  }

  const auditBuf = [];
  function audit(cap, ok, detail) {
    const line = JSON.stringify({ ts: new Date().toISOString(), cap, ok: !!ok, detail: String(detail || '').slice(0, 300) });
    auditBuf.push(line); if (auditBuf.length > AUDIT_MAX) auditBuf.shift();
    fs.appendFile(auditFile, line + '\n').catch(() => {});
  }
  function recentAudit(n = 40) {
    return auditBuf.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  }
  try {
    const existing = fssync.readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean);
    for (const l of existing.slice(-AUDIT_MAX)) auditBuf.push(l);
  } catch {}

  function need(cap) { if (!state[cap]) throw new ApiError(`Lumen does not have the "${cap}" permission. Turn it on in Settings → Permissions.`, 403); }

  function normalizedRoots() {
    return state.roots.map(r => { try { return path.resolve(r); } catch { return null; } }).filter(Boolean);
  }
  function insideRoot(target) {
    const resolved = path.resolve(target);
    return normalizedRoots().some(root => {
      const rel = path.relative(root, resolved);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    });
  }
  function guardPath(p) {
    if (typeof p !== 'string' || !p.trim() || p.includes('\0')) throw new ApiError('Provide a file path.');
    const target = path.resolve(p);
    if (!insideRoot(target)) throw new ApiError('That path is outside every folder you have granted. Add its folder in Settings → Permissions.', 403);
    return target;
  }

  // ---- adapters ----
  function systemInfo() {
    const now = new Date();
    const safe = (read, fallback = null) => { try { return read() ?? fallback; } catch { return fallback; } };
    const base = {
      time: now.toISOString(),
      localTime: now.toString(),
      timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      platform: process.platform,
      release: safe(() => os.release(), 'unknown'),
      arch: process.arch,
      nodeVersion: process.version,
    };
    if (!state.system) return base;
    const mem = safe(() => os.totalmem(), 0);
    const freeMem = safe(() => os.freemem(), 0);
    const cpus = safe(() => os.cpus(), []);
    return {
      ...base,
      hostname: safe(() => os.hostname()),
      cpuModel: cpus[0]?.model || null,
      cpuCount: cpus.length || null,
      memoryGB: mem ? Math.round(mem / 1073741824 * 10) / 10 : null,
      freeMemoryGB: freeMem ? Math.round(freeMem / 1073741824 * 10) / 10 : null,
      uptimeHours: safe(() => Math.round(os.uptime() / 3600 * 10) / 10),
      loadAvg: safe(() => os.loadavg?.()),
      user: safe(() => os.userInfo?.().username),
    };
  }

  async function listDir(p) {
    need('files');
    const target = p && p.trim() ? guardPath(p) : (normalizedRoots()[0] || null);
    if (!target) throw new ApiError('No folders are granted yet.', 403);
    if (!insideRoot(target)) throw new ApiError('That folder is outside your granted folders.', 403);
    let entries;
    try { entries = await fs.readdir(target, { withFileTypes: true }); }
    catch (e) { audit('files.list', false, target + ' :: ' + e.code); throw new ApiError(e.code === 'ENOENT' ? 'That folder does not exist.' : e.code === 'EACCES' ? 'Permission denied by the operating system.' : 'Could not read that folder.', e.code === 'ENOENT' ? 404 : 403); }
    const out = [];
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= MAX_LIST) break;
      if (e.isSymbolicLink()) continue;
      let size = null, mtime = null;
      try { const s = await fs.stat(path.join(target, e.name)); size = e.isFile() ? s.size : null; mtime = s.mtime.toISOString(); } catch {}
      out.push({ name: e.name, type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other', size, mtime });
    }
    audit('files.list', true, target + ' (' + out.length + ')');
    return { path: target, entries: out, truncated: entries.length > MAX_LIST };
  }

  async function readFile(p) {
    need('files');
    const target = guardPath(p);
    let stat;
    try { stat = await fs.lstat(target); } catch (e) { audit('files.read', false, target + ' :: ' + e.code); throw new ApiError('That file does not exist.', 404); }
    if (stat.isSymbolicLink() || !stat.isFile()) throw new ApiError('Only regular files can be read.', 400);
    if (stat.size > MAX_FILE_BYTES) throw new ApiError('That file is larger than the 256 KB read limit.', 413);
    if (!TEXT_EXT.has(path.extname(target).toLowerCase())) throw new ApiError('Only text files can be read.', 415);
    const buf = await fs.readFile(target);
    if (buf.includes(0)) throw new ApiError('That file is not text.', 415);
    audit('files.read', true, target + ' (' + stat.size + 'b)');
    return { path: target, size: stat.size, content: buf.toString('utf8') };
  }

  function isPrivateHost(host) {
    const h = host.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1') return true;
    if (net.isIP(h)) {
      if (h.startsWith('127.') || h.startsWith('10.') || h.startsWith('169.254.') || h.startsWith('192.168.')) return true;
      const m = h.match(/^172\.(\d+)\./); if (m && +m[1] >= 16 && +m[1] <= 31) return true;
      if (h === '0.0.0.0') return true;
    }
    return false;
  }
  async function fetchUrl(u) {
    need('web');
    let url;
    try { url = new URL(u); } catch { throw new ApiError('Provide a valid http or https URL.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new ApiError('Only http and https URLs are allowed.');
    if (isPrivateHost(url.hostname)) throw new ApiError('Requests to local or private-network addresses are blocked.', 403);
    let res;
    try {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT), headers: { 'User-Agent': 'LumenOS/0.4 (+capability:web)', 'Accept': 'text/*, application/json, */*;q=0.5' } });
    } catch (e) {
      audit('web.fetch', false, url.origin + ' :: ' + (e.name || e.message));
      throw new ApiError(e.name === 'TimeoutError' ? 'The site took too long to respond.' : 'Could not reach that site.', 502);
    }
    const type = res.headers.get('content-type') || '';
    const reader = res.body?.getReader();
    let total = 0; const chunks = [];
    if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > MAX_FETCH_BYTES) { await reader.cancel(); break; } chunks.push(Buffer.from(value)); }
    const body = Buffer.concat(chunks).toString('utf8');
    audit('web.fetch', res.ok, url.origin + url.pathname + ' -> ' + res.status);
    return { url: url.href, status: res.status, ok: res.ok, contentType: type, truncated: total > MAX_FETCH_BYTES, text: body.slice(0, 200000) };
  }

  // ---- management ----
  function describe() {
    return {
      system: state.system, files: state.files, web: state.web,
      roots: state.roots.slice(),
      granted: CAP_NAMES.filter(c => state[c]),
      updatedAt: state.updatedAt,
      recent: recentAudit(40),
    };
  }
  async function update(input) {
    if (!input || typeof input !== 'object') throw new ApiError('Send a permissions update.');
    for (const c of CAP_NAMES) if (c in input) { const v = !!input[c]; if (state[c] !== v) { state[c] = v; audit('grant.' + c, true, v ? 'granted' : 'revoked'); } }
    if ('roots' in input) {
      if (!Array.isArray(input.roots)) throw new ApiError('roots must be a list of folder paths.');
      const clean = [];
      for (const r of input.roots.slice(0, MAX_ROOTS)) {
        if (typeof r !== 'string' || !r.trim() || r.includes('\0')) continue;
        const abs = path.resolve(r.trim());
        try { const s = await fs.stat(abs); if (!s.isDirectory()) throw 0; } catch { throw new ApiError('Not a folder: ' + r, 400); }
        if (!clean.includes(abs)) clean.push(abs);
      }
      state.roots = clean;
      audit('grant.roots', true, clean.length + ' folder(s)');
    }
    await persist();
    return describe();
  }

  // Folder picker: directory names only, no grant required and no file contents ever.
  // This exists so the user can browse to a folder before deciding to grant it.
  function pickerRoots() {
    const roots = [];
    if (process.platform === 'win32') {
      for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { try { if (fssync.existsSync(l + ':\\')) roots.push(l + ':\\'); } catch {} }
      try { roots.push(path.resolve(os.homedir())); } catch {}
    } else {
      roots.push('/');
      try { roots.push(path.resolve(os.homedir())); } catch {}
    }
    return [...new Set(roots)];
  }
  async function browse(p) {
    if (!p || !String(p).trim()) return { path: '', parent: null, dirs: pickerRoots() };
    const target = path.resolve(String(p));
    if (String(p).includes('\0')) throw new ApiError('Invalid path.');
    let entries;
    try { entries = await fs.readdir(target, { withFileTypes: true }); }
    catch (e) { throw new ApiError(e.code === 'ENOENT' ? 'That folder does not exist.' : (e.code === 'EACCES' || e.code === 'EPERM') ? 'The operating system denied access to that folder.' : 'Could not open that folder.', e.code === 'ENOENT' ? 404 : 403); }
    const dirs = [];
    for (const e of entries) {
      if (dirs.length >= 1000) break;
      let isDir = false;
      try { isDir = e.isDirectory() && !e.isSymbolicLink(); } catch {}
      if (isDir && !e.name.startsWith('$')) dirs.push(e.name);
    }
    dirs.sort((a, b) => a.localeCompare(b));
    const parent = path.dirname(target);
    return { path: target, parent: parent === target ? null : parent, dirs };
  }

  // Single dispatch used by the model tool-loop, the Drive UI and the folder picker.
  async function run(name, args = {}) {
    switch (name) {
      case 'get_system_info': return systemInfo();
      case 'list_directory': return listDir(args.path);
      case 'read_file': return readFile(args.path);
      case 'fetch_url': return fetchUrl(args.url);
      case 'browse': return browse(args.path);
      default: throw new ApiError('Unknown capability: ' + name, 404);
    }
  }

  // Tool schemas for the model, filtered to what is currently granted.
  function toolSchemas() {
    const tools = [];
    if (state.system) tools.push({ name: 'get_system_info', description: 'Get the current date, time, timezone, OS and hardware details of the computer Lumen runs on.', parameters: { type: 'object', properties: {}, required: [] } });
    if (state.files) {
      tools.push({ name: 'list_directory', description: 'List files and folders inside one of the user-granted folders. Pass an absolute path within a granted folder; omit to list the first granted folder.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Absolute path of a folder within a granted folder' } }, required: [] } });
      tools.push({ name: 'read_file', description: 'Read a UTF-8 text file (max 256 KB) located within a user-granted folder.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Absolute path of a text file within a granted folder' } }, required: ['path'] } });
    }
    if (state.web) tools.push({ name: 'fetch_url', description: 'Fetch the contents of a public http(s) web page or API (GET only, text, max 512 KB). Local and private addresses are blocked.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'A public http or https URL' } }, required: ['url'] } });
    return tools;
  }

  // Short, always-safe context string injected into every chat system prompt.
  function ambientContext() {
    const s = systemInfo();
    let text = `Current date and time: ${s.localTime} (timezone ${s.timezone || 'unknown'}). Host OS: ${s.platform} ${s.release} (${s.arch}).`;
    const granted = CAP_NAMES.filter(c => state[c]);
    if (granted.length) text += ` The user has granted Lumen these machine permissions: ${granted.join(', ')}.`;
    if (state.files && state.roots.length) text += ` Granted folders: ${state.roots.join(' ; ')}.`;
    return text;
  }

  return { describe, update, run, toolSchemas, ambientContext, systemInfo, audit, get granted() { return CAP_NAMES.filter(c => state[c]); } };
}

module.exports = { createCapabilities, ApiError };
