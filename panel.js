/**
 * The GraphQL panel: a table of operations on the left, the selected one on the right.
 * Entries arrive from chrome.devtools.network (or from demo/har.js when opened as a page).
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $("rows");
  var emptyEl = $("empty");
  var countEl = $("count");
  var filterEl = $("filter");
  var preserveEl = $("preserve");
  var detailsEl = $("details");
  var listEl = $("list");
  var gutterEl = $("gutter");
  var typeEl = $("type");
  var errorsEl = $("errors");
  var headers = Array.prototype.slice.call(document.querySelectorAll("#table th[data-sort]"));
  var panes = { query : $("pane-query"), response : $("pane-response"), headers : $("pane-headers") };
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll("#details-tabs .tab"));

  // localStorage may be unavailable; the panel works without it
  var remember = function (key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (err) {
      return null;
    }
  };

  var rows = [];          // { entry, op, group, status, size, time, url, res, tr }
  var seen = {};          // entries already listed (getHAR and onRequestFinished can overlap)
  var learned = {};       // persisted query hash → document, from a request that carried both
  var selected = null;
  var rendered = {};      // which details panes show the selected row (they render on demand)
  var pane = remember("pane") || "query";
  var pretty = remember("pretty") != "0";
  var filter = "";
  var typeFilter = "";
  var onlyErrors = false;
  var sort = { key : null, dir : 1 };

  /* ---- theme: DevTools' own, then the OS ---- */

  var devtools = typeof chrome != "undefined" && chrome.devtools ? chrome.devtools : null;
  var wanted = /[?&]theme=(dark|light)/.exec(location.search);
  // Chrome says "default" / "dark", Firefox "light" / "dark" (and tells when it changes)
  var applyTheme = function (name) {
    document.documentElement.setAttribute("data-theme", name == "dark" ? "dark" : "light");
  };
  if (wanted) {
    applyTheme(wanted[1]);
  } else if (devtools && devtools.panels && devtools.panels.themeName) {
    applyTheme(devtools.panels.themeName);
    if (devtools.panels.onThemeChanged) devtools.panels.onThemeChanged.addListener(applyTheme);
  }

  /* ---- rows ---- */

  function key(entry) {
    return [entry.startedDateTime, entry.request && entry.request.url, entry.time, entry.request && entry.request.postData && entry.request.postData.text].join("|");
  }

  function add(entry) {
    if (!entry || !entry.request) return;
    var ops = har.operations(entry);
    if (!ops.length) return;
    var k = key(entry);
    if (seen[k]) return;
    seen[k] = true;

    // Apollo's APQ retry carries the hash and the document: from then on the hash alone is enough
    ops = ops.map(function (op) {
      if (op.query && op.persisted) {
        learned[op.persisted] = op.query;
        teach(op.persisted);
      } else if (!op.query && op.persisted && learned[op.persisted]) {
        op = har.withQuery(op, learned[op.persisted]);
      }
      return op;
    });

    var group = { entry : entry, text : null, loaded : false, rows : [] };
    ops.forEach(function (op) {
      var row = {
        entry : entry,
        op : op,
        group : group,
        status : entry.response ? entry.response.status : 0,
        size : har.size(entry),
        time : entry.time,
        url : entry.request.url,
        res : null,
        tr : null
      };
      rows.push(row);
      group.rows.push(row);
      render(row);
    });
    load(group);
    if (sort.key) applySort();
    update();
  }

  /* rows listed earlier with only this hash get the document too */
  function teach(hash) {
    rows.forEach(function (row) {
      if (row.op.persisted == hash && !row.op.query) {
        row.op = har.withQuery(row.op, learned[hash]);
        render(row);
        if (row === selected) showDetails(row);
      }
    });
  }

  /* the body comes separately and once per entry; a batch shares it between its rows */
  function load(group) {
    if (typeof group.entry.getContent != "function") {
      group.loaded = true;
      return;
    }
    group.entry.getContent(function (content, encoding) {
      var text = typeof content == "string" ? content : "";
      if (encoding == "base64") {
        try { text = decodeURIComponent(escape(atob(text))); } catch (e) { /* keep as is */ }
      }
      group.text = text;
      group.loaded = true;
      group.rows.forEach(function (row) {
        row.res = har.response(text, row.op);
        if (row.size === null) row.size = utf8Length(text);
        render(row);
      });
      if (selected && selected.group === group) showDetails(selected);
      update();
    });
  }

  function utf8Length(s) {
    try {
      return new TextEncoder().encode(s).length;
    } catch (e) {
      return s.length;
    }
  }

  function cell(tr, cls, text, title) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    td.textContent = text;
    if (title) td.title = title;
    tr.appendChild(td);
    return td;
  }

  function statusText(row) {
    if (!row.status) return "(failed)";
    var s = String(row.status);
    if (row.res && row.res.errors) s += " · " + row.res.errors + (row.res.errors == 1 ? " error" : " errors");
    return s;
  }

  function render(row) {
    var tr = row.tr || document.createElement("tr");
    tr.innerHTML = "";
    var op = row.op;
    var name = cell(tr, "", op.label || "—", op.query || op.persisted || op.documentId || "");
    if (op.batch && row.group.rows.length > 1) {
      var n = document.createElement("span");
      n.className = "muted";
      n.textContent = " " + (op.index + 1) + "/" + row.group.rows.length;
      name.appendChild(n);
    }
    cell(tr, op.type ? "" : "muted", op.type || (op.persisted || op.documentId ? "persisted" : ""));
    cell(tr, "", statusText(row), row.entry.response && row.entry.response.statusText || "");
    cell(tr, "num", row.size === null ? "" : format.bytes(row.size), row.size === null ? "" : row.size + " bytes");
    cell(tr, "num", format.ms(row.time), har.timings(row.entry));
    cell(tr, "muted", format.path(row.url), row.url);
    tr.classList.toggle("error", row.status >= 400 || !row.status || !!(row.res && row.res.errors));
    tr.classList.toggle("selected", row === selected);
    tr.hidden = !matches(row);
    if (!row.tr) {
      row.tr = tr;
      tr.addEventListener("click", function () { select(row); });
      rowsEl.appendChild(tr);
    }
  }

  function failed(row) {
    return row.status >= 400 || !row.status || !!(row.res && row.res.errors);
  }

  function matches(row) {
    if (onlyErrors && !failed(row)) return false;
    if (typeFilter && (row.op.type || "persisted") != typeFilter) return false;
    if (!filter) return true;
    var hay = [row.op.label, row.op.type, row.url, JSON.stringify(row.op.variables)].join("\n").toLowerCase();
    return hay.indexOf(filter) >= 0;
  }

  /* rows in display order: as they arrived, or by the sorted column */
  function order() {
    if (!sort.key) return rows;
    var key = sort.key;
    var value = function (row) {
      switch (key) {
        case "name": return (row.op.label || "").toLowerCase();
        case "type": return row.op.type || (row.op.persisted || row.op.documentId ? "persisted" : "");
        case "status": return (row.status || 0) + (row.res && row.res.errors ? 0.5 : 0);
        case "size": return row.size === null ? -1 : row.size;
        case "time": return typeof row.time == "number" ? row.time : -1;
        default: return row.url;
      }
    };
    return rows.slice().sort(function (a, b) {
      var x = value(a), y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }

  function applySort() {
    order().forEach(function (row) { rowsEl.appendChild(row.tr); });
    headers.forEach(function (th) {
      th.classList.toggle("sort-asc", th.getAttribute("data-sort") == sort.key && sort.dir > 0);
      th.classList.toggle("sort-desc", th.getAttribute("data-sort") == sort.key && sort.dir < 0);
    });
  }

  function visible() {
    return order().filter(matches);
  }

  function refilter() {
    rows.forEach(function (row) { row.tr.hidden = !matches(row); });
    update();
  }

  /* "12 requests · 2 errors · 1.2 MB · 4.3 s" for the rows in view */
  function update() {
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) {
      countEl.textContent = "";
      return;
    }
    var shown = visible();
    var errors = 0, size = 0, time = 0;
    shown.forEach(function (row) {
      if (failed(row)) errors++;
      if (row.size !== null) size += row.size;
      if (typeof row.time == "number" && row.time > 0) time += row.time;
    });
    var parts = [(shown.length == rows.length ? rows.length : shown.length + " / " + rows.length) + (rows.length == 1 ? " request" : " requests")];
    if (errors) parts.push(errors + (errors == 1 ? " error" : " errors"));
    if (size) parts.push(format.bytes(size));
    if (time) parts.push(format.ms(time));
    countEl.textContent = parts.join(" \u00b7 ");
    countEl.title = "size and time are sums over the rows in view";
  }

  function clear() {
    rows = [];
    seen = {};
    rowsEl.innerHTML = "";
    select(null);
    update();
  }

  /* ---- selection and details ---- */

  function select(row) {
    if (selected && selected.tr) selected.tr.classList.remove("selected");
    selected = row;
    if (!row) {
      detailsEl.hidden = true;
      return;
    }
    row.tr.classList.add("selected");
    detailsEl.hidden = false;
    showDetails(row);
    if (row.tr.scrollIntoViewIfNeeded) row.tr.scrollIntoViewIfNeeded(false);
    else row.tr.scrollIntoView({ block : "nearest" });
  }

  function showPane(name) {
    pane = name;
    remember("pane", name);
    tabButtons.forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-pane") == name); });
    Object.keys(panes).forEach(function (p) { panes[p].hidden = p != name; });
    if (selected && !rendered[name]) renderPane(name, selected);
  }

  /* only the visible pane is built; the others wait for their tab (big responses stay cheap to step through) */
  function showDetails(row) {
    rendered = {};
    renderPane(pane, row);
  }

  function renderPane(name, row) {
    rendered[name] = true;
    if (name == "query") renderQuery(row);
    else if (name == "response") renderResponse(row);
    else renderHeaders(row);
  }

  /*
   * A coloured view of a query or a JSON text: foldable line by line when it is not too big,
   * a plain highlight beyond fold.LIMIT lines, escaped text beyond json.LIMIT bytes.
   */
  function view(kind, text) {
    if (kind == "plain" || text.length > json.LIMIT) return { html : format.escape(text), plain : true };
    if (fold.lines(text) > fold.LIMIT) return { html : kind == "graphql" ? graphql.highlight(text) : json.highlight(text) };
    var tokens = kind == "graphql" ? graphql.classify(graphql.tokens(text)) : json.tokens(text);
    return { html : fold.render(tokens, kind == "json"), foldable : true };
  }

  /* A titled block of the details pane: head with a note and buttons, the view under it */
  function section(title, note, v, copyText, extra) {
    var nested = v.foldable && v.html.indexOf('data-depth="1"') >= 0;
    var html = '<div class="section"><div class="section-head"><span>' + format.escape(title) + "</span>"
      + (note ? '<span class="note">' + format.escape(note) + "</span>" : "")
      + '<span class="buttons">'
      + (extra ? '<button type="button" class="copy extra' + (extra.active ? " active" : "") + '" title="' + format.escape(extra.title) + '">' + format.escape(extra.label) + "</button>" : "")
      + (nested ? '<button type="button" class="copy fold-all" data-fold="collapse" title="Collapse all">\u2212</button><button type="button" class="copy fold-all" data-fold="expand" title="Expand all">+</button>' : "")
      + (copyText !== null ? '<button type="button" class="copy">Copy</button>' : "")
      + "</span></div>"
      + '<div class="code' + (v.plain ? " plain" : "") + (v.foldable ? " foldable" : "") + '">' + v.html + "</div></div>";
    var el = document.createElement("div");
    el.innerHTML = html;
    var node = el.firstChild;
    var button = node.querySelector(".copy:not(.fold-all):not(.extra)");
    if (button) {
      button.addEventListener("click", function () {
        copy(copyText, button);
      });
    }
    if (extra) node.querySelector(".extra").addEventListener("click", extra.onClick);
    return node;
  }

  /* ---- folding: which lines are hidden follows from which fold lines are collapsed ---- */

  function relayout(code) {
    var lines = code.children;
    var ends = [];
    for (var i = 0; i < lines.length; i++) {
      while (ends.length && i >= ends[ends.length - 1]) ends.pop();
      lines[i].hidden = ends.length > 0;
      if (lines[i].classList.contains("collapsed")) ends.push(+lines[i].getAttribute("data-end"));
    }
  }

  function foldAll(code, collapse) {
    var lines = code.querySelectorAll(".line[data-end]");
    // the outermost bracket stays open, and so does a lone wrapper under it ({ "data": { … } })
    var wrappers = code.querySelectorAll('.line[data-depth="1"]').length;
    var from = wrappers == 1 ? 2 : 1;
    for (var i = 0; i < lines.length; i++) {
      lines[i].classList.toggle("collapsed", collapse && +lines[i].getAttribute("data-depth") >= from);
    }
    relayout(code);
  }

  detailsEl.addEventListener("click", function (e) {
    var t = e.target;
    if (t.classList.contains("toggle") || t.classList.contains("ellipsis")) {
      var line = t.closest(".line");
      line.classList.toggle("collapsed");
      relayout(line.parentNode);
    } else if (t.classList.contains("fold-all")) {
      foldAll(t.closest(".section").querySelector(".code"), t.getAttribute("data-fold") == "collapse");
    }
  });

  function copy(text, button, label) {
    var done = function () {
      button.textContent = "Copied";
      button.classList.add("done");
      setTimeout(function () {
        button.textContent = label || "Copy";
        button.classList.remove("done");
      }, 1200);
    };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* nothing to do */ }
      document.body.removeChild(ta);
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function renderQuery(row) {
    var op = row.op;
    var q = panes.query;
    q.innerHTML = "";
    if (op.query !== null) {
      var printed = graphql.print(op.query);
      var tidy = printed == op.query.trim();       // nothing to prettify
      var text = pretty || tidy ? printed : op.query;
      var note = op.learned ? "document learned from an earlier request with this hash"
        : op.operationName ? "operationName: " + op.operationName : op.multiple ? "several operations, no operationName" : "";
      var toggle = tidy ? null : {
        label : pretty ? "as sent" : "pretty",
        title : pretty ? "Show the document exactly as it was sent" : "Reformat the document",
        active : false,
        onClick : function () {
          pretty = !pretty;
          remember("pretty", pretty ? "1" : "0");
          renderQuery(row);
        }
      };
      q.appendChild(section("Query", note, view("graphql", text), text, toggle));
    } else {
      var what = op.persisted ? "sha256Hash: " + op.persisted : "documentId: " + op.documentId;
      q.appendChild(section("Persisted query", op.operationName ? "operationName: " + op.operationName : "",
        view("plain", what + "\nThe document itself was not sent \u2014 the server knows it by this key."), op.persisted || op.documentId));
    }
    var vars = json.pretty(op.variables);
    if (vars != "{}") {
      q.appendChild(section("Variables", "", view("json", vars), vars));
    }
    if (op.extensions) {
      var ext = json.pretty(op.extensions);
      q.appendChild(section("Extensions", "", view("json", ext), ext));
    }
  }

  function renderResponse(row) {
    var r = panes.response;
    r.innerHTML = "";
    if (!row.group.loaded) {
      r.appendChild(section("Response", "", view("plain", "Loading\u2026"), null));
    } else if (!row.res || row.res.text === "") {
      r.appendChild(section("Response", statusText(row), view("plain", "(empty)"), null));
    } else {
      var res = row.res;
      if (res.errors && res.value && Array.isArray(res.value.errors)) {
        var box = document.createElement("div");
        box.className = "errors";
        res.value.errors.forEach(function (err) {
          var line = document.createElement("div");
          var path = err && Array.isArray(err.path) ? " \u2014 at " + err.path.join(".") : "";
          line.textContent = (err && err.message ? err.message : JSON.stringify(err)) + path;
          box.appendChild(line);
        });
        r.appendChild(box);
      }
      var isJson = res.value !== undefined;
      var text = isJson ? json.pretty(res.value) : res.text;
      var note = [format.bytes(row.size), format.ms(row.time), har.serverTiming(row.entry.response && row.entry.response.headers)].filter(Boolean).join(" \u00b7 ");
      r.appendChild(section("Response", note, view(isJson ? "json" : "plain", text), text));
    }
  }

  function renderHeaders(row) {
    var h = panes.headers;
    h.innerHTML = "";
    var e = row.entry;
    h.appendChild(kv("General", [
      ["Request URL", e.request.url],
      ["Method", e.request.method],
      ["Status", (e.response ? e.response.status + " " + (e.response.statusText || "") : "").trim() || "(failed)"],
      ["Protocol", e.request.httpVersion || ""],
      ["Started", e.startedDateTime ? new Date(e.startedDateTime).toLocaleTimeString() : ""],
      ["Time", format.ms(e.time)],
      ["Timing", har.timings(e)],
      ["Server timing", har.serverTiming(e.response && e.response.headers)],
      ["Size", row.size === null ? "" : format.bytes(row.size) + " (" + row.size + " bytes)"]
    ], "Copy as cURL", har.curl(e)));
    h.appendChild(kv("Request headers", (e.request.headers || []).map(function (x) { return [x.name, x.value]; }), "Copy", har.headerLines(e.request.headers)));
    h.appendChild(kv("Response headers", (e.response && e.response.headers || []).map(function (x) { return [x.name, x.value]; }), "Copy", har.headerLines(e.response && e.response.headers)));
  }

  function kv(title, pairs, copyLabel, copyText) {
    var el = document.createElement("div");
    el.className = "section";
    el.innerHTML = '<div class="section-head"><span>' + format.escape(title) + "</span>"
      + (copyLabel ? '<button type="button" class="copy">' + format.escape(copyLabel) + "</button>" : "") + "</div>";
    var button = el.querySelector(".copy");
    if (button) {
      button.addEventListener("click", function () { copy(copyText, button, copyLabel); });
    }
    var dl = document.createElement("dl");
    dl.className = "kv";
    pairs.forEach(function (p) {
      if (p[1] === "" || p[1] === undefined) return;
      var dt = document.createElement("dt");
      dt.textContent = p[0];
      var dd = document.createElement("dd");
      dd.textContent = p[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    el.appendChild(dl);
    return el;
  }

  /* ---- events ---- */

  tabButtons.forEach(function (b) {
    b.addEventListener("click", function () { showPane(b.getAttribute("data-pane")); });
  });
  $("close").addEventListener("click", function () {
    select(null);
    listEl.focus();
  });
  $("clear").addEventListener("click", clear);

  filterEl.addEventListener("input", function () {
    filter = filterEl.value.trim().toLowerCase();
    refilter();
  });
  typeEl.addEventListener("change", function () {
    typeFilter = typeEl.value;
    refilter();
  });
  errorsEl.addEventListener("click", function () {
    onlyErrors = !onlyErrors;
    errorsEl.classList.toggle("active", onlyErrors);
    refilter();
  });

  // a column header sorts: ascending, descending, then back to arrival order
  headers.forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.getAttribute("data-sort");
      if (sort.key != k) sort = { key : k, dir : 1 };
      else if (sort.dir > 0) sort.dir = -1;
      else sort = { key : null, dir : 1 };
      applySort();
    });
  });

  preserveEl.checked = remember("preserve") == "1";
  preserveEl.addEventListener("change", function () {
    remember("preserve", preserveEl.checked ? "1" : "0");
  });

  listEl.addEventListener("keydown", function (e) {
    if (e.key != "ArrowDown" && e.key != "ArrowUp" && e.key != "Escape") return;
    if (e.key == "Escape") {
      select(null);
      return;
    }
    var list = visible();
    if (!list.length) return;
    var i = list.indexOf(selected);
    var next = e.key == "ArrowDown" ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
    select(list[next]);
    e.preventDefault();
  });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key == "f" && !e.shiftKey && !e.altKey) {
      filterEl.focus();
      filterEl.select();
      e.preventDefault();
    }
  });

  // the divider between the list and the details
  var width = parseInt(remember("details-width"), 10);
  if (width > 0) detailsEl.style.width = width + "px";
  gutterEl.addEventListener("mousedown", function (e) {
    e.preventDefault();
    gutterEl.classList.add("dragging");
    document.body.classList.add("dragging");
    var move = function (ev) {
      var w = Math.max(240, Math.min(document.body.clientWidth * 0.85, document.body.clientWidth - ev.clientX));
      detailsEl.style.width = w + "px";
    };
    var up = function () {
      gutterEl.classList.remove("dragging");
      document.body.classList.remove("dragging");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      remember("details-width", detailsEl.offsetWidth);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });

  showPane(panes[pane] ? pane : "query");
  update();

  /* ---- source of entries ---- */

  if (devtools && devtools.network) {
    devtools.network.onRequestFinished.addListener(add);
    // requests recorded since DevTools opened, before this panel was shown
    if (devtools.network.getHAR) {
      devtools.network.getHAR(function (log) {
        (log && log.entries || []).forEach(add);
      });
    }
    if (devtools.network.onNavigated) {
      devtools.network.onNavigated.addListener(function () {
        if (!preserveEl.checked) clear();
      });
    }
  } else {
    // opened as a plain page: show the sample traffic from demo/har.js
    window.demo = function (entries) { entries.forEach(add); };
    var s = document.createElement("script");
    s.src = "demo/har.js";
    document.body.appendChild(s);
  }
})();
