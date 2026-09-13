/**
 * Numbers the way the DevTools Network panel shows them: sizes in decimal units, times in ms / s.
 */
var format = {
  /* 478 → "478 B", 1500 → "1.5 kB", 2345678 → "2.3 MB"; null/negative → "" */
  bytes : function (n) {
    if (typeof n != "number" || !isFinite(n) || n < 0) return "";
    if (n < 1000) return n + " B";
    var units = ["kB", "MB", "GB"];
    var i = -1;
    do { n /= 1000; i++; } while (n >= 1000 && i < units.length - 1);
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + " " + units[i];
  },

  /* 448.23 → "448 ms", 1234 → "1.23 s", 65000 → "1.1 min" */
  ms : function (t) {
    if (typeof t != "number" || !isFinite(t) || t < 0) return "";
    if (t < 1000) return Math.round(t) + " ms";
    if (t < 60000) return (t / 1000).toFixed(2).replace(/\.?0+$/, "") + " s";
    return (t / 60000).toFixed(1).replace(/\.0$/, "") + " min";
  },

  /* "https://api.example.com/graphql?x=1" → "/graphql" (host in the title) */
  path : function (url) {
    try {
      var u = new URL(url);
      return u.pathname + u.search;
    } catch (e) {
      return url;
    }
  },

  host : function (url) {
    try {
      return new URL(url).host;
    } catch (e) {
      return "";
    }
  },

  /* HTML-escape for building markup from data */
  escape : function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&" : "&amp;", "<" : "&lt;", ">" : "&gt;", '"' : "&quot;" }[c];
    });
  }
};
