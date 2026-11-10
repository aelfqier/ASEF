/* ASEF: saves data on the phone (Capacitor Preferences), or in the browser's localStorage when run on the web. */
(function (root) {
  "use strict";
  const KEY = "asef-data";
  const cap = root.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const Prefs = isNative && cap.Plugins && cap.Plugins.Preferences ? cap.Plugins.Preferences : null;

  async function read() {
    if (Prefs) { const { value } = await Prefs.get({ key: KEY }); return value; }
    try { return root.localStorage.getItem(KEY); } catch (_) { return null; }
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

  root.ASEFStore = { read, write, saveFile, isNative };
})(typeof self !== "undefined" ? self : this);
