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

  const platform = isNative && cap.getPlatform ? cap.getPlatform() : "web";
  root.ASEFStore = { read, write, saveFile, isNative, platform, readSnapshots, writeSnapshots, biometryAvailable, verifyBiometry };
})(typeof self !== "undefined" ? self : this);
