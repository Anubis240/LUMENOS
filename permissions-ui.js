(() => {
  'use strict';
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CAPS = [
    ['system', 'System information', 'Read the live date, time, timezone, OS version, hostname, CPU and memory of this computer.'],
    ['files', 'Files', 'List and read text files, but only inside the specific folders you add below. Read-only — nothing is ever written or deleted.'],
    ['web', 'Web access', 'Fetch public web pages and APIs (GET only). Requests to local or private-network addresses are always blocked.'],
  ];

  async function load() {
    const r = await fetch('/api/permissions', { cache: 'no-store' });
    if (!r.ok) throw new Error('Could not load permissions.');
    return r.json();
  }
  async function save(patch) {
    return window.lumenConnection.request('permissions', patch);
  }
  const joinPath = (dir, name) => { const sep = dir.includes('\\') ? '\\' : '/'; return dir.replace(/[\\/]+$/, '') + sep + name; };
  const cap = (name, args) => window.lumenConnection.request('capability', { name, args }).then(r => r.result);

  // Server-driven folder picker. Resolves to an absolute path string, or null if cancelled.
  function pickFolder() {
    return new Promise(resolve => {
      const stale = document.getElementById('folder-picker');
      if (stale) { try { stale.close(); } catch {} stale.remove(); }
      const dlg = document.createElement('dialog');
      dlg.id = 'folder-picker';
      document.body.appendChild(dlg);
      let current = '';
      let settled = false;
      const finish = v => { if (settled) return; settled = true; try { dlg.close(); } catch {} resolve(v); };
      dlg.innerHTML = `<div class="dialog-heading"><h2>Choose a folder</h2><button type="button" id="fp-x" aria-label="Close">×</button></div>
        <p class="fp-cwd">This computer</p>
        <div class="fp-list"><p class="muted">Loading…</p></div>
        <div class="dialog-actions"><button type="button" id="fp-cancel">Cancel</button><button type="button" class="primary" id="fp-use" disabled>Use this folder</button></div>`;
      dlg.querySelector('#fp-x').onclick = () => finish(null);
      dlg.querySelector('#fp-cancel').onclick = () => finish(null);
      dlg.querySelector('#fp-use').onclick = () => finish(current || null);
      dlg.addEventListener('close', () => finish(null), { once: true });
      async function show(p) {
        const list = dlg.querySelector('.fp-list');
        list.innerHTML = '<p class="muted">Reading…</p>';
        let data;
        try { data = await cap('browse', { path: p }); }
        catch (e) { list.innerHTML = `<p class="message-error">${esc(e.message)}</p>`; return; }
        current = data.path;
        dlg.querySelector('.fp-cwd').textContent = data.path || 'This computer';
        dlg.querySelector('#fp-use').disabled = !data.path;
        const rows = [];
        if (data.path && data.parent !== null) rows.push(`<button class="fp-item up" data-path="${esc(data.parent)}">⬆&nbsp;&nbsp;..</button>`);
        for (const d of data.dirs) {
          const full = data.path ? joinPath(data.path, d) : d;
          rows.push(`<button class="fp-item" data-path="${esc(full)}">${data.path ? '📁' : '💽'}&nbsp;&nbsp;${esc(d)}</button>`);
        }
        list.innerHTML = rows.join('') || '<p class="muted">No sub-folders here.</p>';
        list.querySelectorAll('.fp-item').forEach(b => b.onclick = () => show(b.dataset.path));
      }
      dlg.showModal();
      show('');
    });
  }

  async function render(el, ctx = {}) {
    const toast = ctx.toast || (() => {});
    el.innerHTML = '<h2>Permissions</h2><p class="muted">Loading…</p>';
    let state;
    try { state = await load(); } catch (e) { el.innerHTML = `<h2>Permissions</h2><p class="message-error">${esc(e.message)}</p>`; return; }

    el.innerHTML = `<h2>What Lumen may access</h2><p class="muted">Everything is off until you turn it on. Grants are stored on this device and every use is written to an audit log.</p>
      ${CAPS.map(([id, name, desc]) => `<div class="setting-row"><div><h3>${name}</h3><p>${desc}</p></div><button class="switch" role="switch" data-cap="${id}" aria-label="${name}" aria-checked="${state[id] ? 'true' : 'false'}"></button></div>`).join('')}
      <div class="perm-roots ${state.files ? '' : 'perm-dim'}">
        <h3>Folders Lumen can read</h3>
        <p class="muted">Only these folders (and their subfolders) are visible to the Files permission and the Drive browser. Enter a full path.</p>
        <ul id="perm-root-list">${(state.roots || []).map(r => `<li><code>${esc(r)}</code><button data-remove="${esc(r)}">Remove</button></li>`).join('') || '<li class="muted">No folders added.</li>'}</ul>
        <form id="perm-root-form" class="toolbar"><input id="perm-root-input" placeholder="Type a full path, or leave blank and click Browse…" autocomplete="off" spellcheck="false"><button type="button" id="perm-root-browse">Browse…</button><button class="primary" type="submit">Add folder</button></form>
      </div>
      <div class="setting-row"><div><h3>Drive browser</h3><p>Open the read-only file browser for your granted folders.</p></div><button id="perm-open-drive">Open Drive</button></div>
      <h3 style="margin-top:26px">Recent activity</h3>
      <div class="perm-audit">${(state.recent || []).length ? state.recent.map(a => `<div class="perm-audit-row"><span class="${a.ok ? 'ok' : 'bad'}">${a.ok ? '✓' : '✕'}</span><code>${esc(a.cap)}</code><span class="muted">${esc((a.detail || '').slice(0, 120))}</span><time>${esc((a.ts || '').replace('T', ' ').replace(/\..*/, ''))}</time></div>`).join('') : '<p class="muted">Nothing yet.</p>'}</div>
      <p class="notice">Lumen runs as a local service on your machine. These grants let the assistant read the things you allow so it can actually help — like a real desktop assistant. There is no command or shell execution, and no write access, from this screen.</p>`;

    el.querySelectorAll('[data-cap]').forEach(btn => btn.onclick = async () => {
      const id = btn.dataset.cap, next = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(next));
      try { await save({ [id]: next }); toast(next ? `${id} access granted.` : `${id} access revoked.`); render(el, ctx); }
      catch (e) { toast(e.message); render(el, ctx); }
    });
    const drive = el.querySelector('#perm-open-drive');
    if (drive) drive.onclick = () => ctx.openDrive ? ctx.openDrive() : null;
    el.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
      const keep = (state.roots || []).filter(r => r !== b.dataset.remove);
      try { await save({ roots: keep }); toast('Folder removed.'); render(el, ctx); } catch (e) { toast(e.message); }
    });
    const addRoot = async val => {
      if (!val) return;
      try { await save({ roots: [...(state.roots || []), val] }); toast('Folder added.'); render(el, ctx); }
      catch (err) { toast(err.message); }
    };
    const openPicker = async () => { const picked = await pickFolder(); if (picked) addRoot(picked); };
    const form = el.querySelector('#perm-root-form');
    if (form) form.onsubmit = async e => {
      e.preventDefault();
      const val = el.querySelector('#perm-root-input').value.trim();
      if (!val) { openPicker(); return; }
      addRoot(val);
    };
    const browse = el.querySelector('#perm-root-browse');
    if (browse) browse.onclick = openPicker;
  }

  window.lumenPermissionsUI = { render };
})();
