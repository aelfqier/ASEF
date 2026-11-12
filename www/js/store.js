/* ASEF: saves data on the phone (Capacitor Preferences), or in the browser's localStorage when run on the web. */
(function (root) {
  "use strict";
  const KEY = "asef-data";
  const SNAP_KEY = "asef-snapshots";
  const cap = root.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const Prefs = isNative && cap.Plugins && cap.Plugins.Preferences ? cap.Plugins.Preferences : null;

  async function readKey(key) {
    if (Prefs) { const { value } = await Prefs.get({ key }); return value; }
    try { return root.localStorage.getItem(key); } catch (_) { return null; }
  }
  const read = () => readKey(KEY);

  async function readSnapshots() {
    try { const v = JSON.parse(await readKey(SNAP_KEY)); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  async function writeSnapshots(list) {
    const value = JSON.stringify(list);
    try { if (Prefs) await Prefs.set({ key: SNAP_KEY, value }); else root.localStorage.setItem(SNAP_KEY, value); }
    catch (e) { console.error("ASEF snapshot failed", e); }
  }

  /* Fingerprint / Face ID through the NativeBiometric plugin; absent in a browser. */
  const Bio = isNative && cap.Plugins && cap.Plugins.NativeBiometric ? cap.Plugins.NativeBiometric : null;
  async function biometryAvailable() {
    if (!Bio) return null;
    try {
      const r = await Bio.isAvailable({ useFallback: false });
      if (!r || !r.isAvailable) return null;
      // biometryType: 1 Touch ID, 2 Face ID, 3 fingerprint, 4 face, 5 iris, 6 several
      return r.biometryType === 2 ? "Face ID" : r.biometryType === 1 ? "Touch ID" : r.biometryType === 4 ? "face unlock" : "fingerprint";
    } catch (_) { return null; }
  }
  async function verifyBiometry() {
    if (!Bio) return false;
    try { await Bio.verifyIdentity({ reason: "Unlock ASEF", title: "Unlock ASEF", subtitle: "", description: "", negativeButtonText: "Use PIN", useFallback: false }); return true; }
    catch (_) { return false; }
  }

  // Writes are queued so a quick edit right after another never lands out of order.
  let chain = Promise.resolve();
  function write(state) {
    const value = JSON.stringify(state);
    chain = chain.then(async () => {
      if (Prefs) await Prefs.set({ key: KEY, value });
      else root.localStorage.setItem(KEY, value);
    }).catch((e) => { console.error("ASEF save failed", e); });
    return chain;
  }

  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Shares a file through the phone's share sheet (Drive, WhatsApp, email); downloads it in a browser.
  async function saveFile(name, text, mime) {
    const P = cap && cap.Plugins;
    if (isNative && P && P.Filesystem && P.Share) {
      const { uri } = await P.Filesystem.writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
      try { await P.Share.share({ title: name, files: [uri] }); } catch (e) { if (!/cancel/i.test(String(e && e.message))) throw e; }
      return;
    }
    download(name, text, mime);
  }

  /* Prices: with CapacitorHttp on, fetch goes through the phone's own network stack (no browser CORS rules). */
  async function fetchJson(url, ms) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), ms || 12000);
    try {
      const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { if (timer) clearTimeout(timer); }
  }

  /* Notifications (bill reminders). Every one ASEF schedules carries extra.asef, so a reschedule replaces them all. */
  const Notes = isNative && cap.Plugins && cap.Plugins.LocalNotifications ? cap.Plugins.LocalNotifications : null;
  async function notifyPermission(ask) {
    if (!Notes) return "unavailable";
    try {
      let p = await Notes.checkPermissions();
      if (ask && p.display !== "granted" && p.display !== "denied") p = await Notes.requestPermissions();
      return p.display === "granted" ? "granted" : p.display === "denied" ? "denied" : "prompt";
    } catch (_) { return "denied"; }
  }
  // items: [{ id, at: "YYYY-MM-DDTHH:MM:SS" local time, title, body }]
  async function scheduleReminders(items, ask) {
    if (!Notes) return "unavailable";
    try {
      const pending = await Notes.getPending();
      const ours = (pending.notifications || []).filter((n) => n.extra && n.extra.asef);
      if (ours.length) await Notes.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
      if (!items.length) return "none";
      const perm = await notifyPermission(ask);
      if (perm !== "granted") return perm;
      const now = Date.now();
      const list = items.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true }, extra: { asef: 1 } }))
        .filter((n) => n.schedule.at.getTime() > now);
      if (list.length) await Notes.schedule({ notifications: list });
      return "granted";
    } catch (e) { console.error("ASEF reminders", e); return "error"; }
  }

  /* Links from the widget, shortcuts and quick actions (asef://add?type=…). */
  const AppP = isNative && cap.Plugins && cap.Plugins.App ? cap.Plugins.App : null;
  function onAppLink(fn) {
    if (!AppP) return;
    try {
      AppP.addListener("appUrlOpen", (e) => fn(e && e.url));
      AppP.getLaunchUrl().then((r) => { if (r && r.url) fn(r.url); }).catch(() => {});
    } catch (_) { /* optional */ }
  }

  // A file given as base64 (the PDF report).
  async function saveBase64(name, base64, mime) {
    const P = cap && cap.Plugins;
    if (isNative && P && P.Filesystem && P.Share) {
      const { uri } = await P.Filesystem.writeFile({ path: name, data: base64, directory: "CACHE" });
      try { await P.Share.share({ title: name, files: [uri] }); } catch (e) { if (!/cancel/i.test(String(e && e.message))) throw e; }
      return;
    }
    const bin = atob(base64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const platform = isNative && cap.getPlatform ? cap.getPlatform() : "web";
  root.ASEFStore = { read, write, saveFile, isNative, platform, readSnapshots, writeSnapshots, biometryAvailable, verifyBiometry,
    fetchJson, notifyPermission, scheduleReminders, onAppLink, saveBase64, canNotify: !!Notes };
})(typeof self !== "undefined" ? self : this);
