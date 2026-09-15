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
  var groupEl = $("group");
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
  var grouped = remember("grouped") == "1";
  var groupEls = {};      // group key → its <tr>, in grouped mode
  var expanded = {};      // group key → true when its members are shown
  var pending = [];       // requests this panel asked the page to send, waiting to show up

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

    var mine = null;
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i];
      var body = entry.request.postData && typeof entry.request.postData.text == "string" ? entry.request.postData.text : null;
      if (p.url == entry.request.url && p.body == body && Date.parse(entry.startedDateTime) >= p.at - 2000) {
        mine = pending.splice(i, 1)[0];
        break;
      }
    }

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
        tr : null,
        resent : mine !== null
      };
      rows.push(row);
      group.rows.push(row);
      render(row);
    });
    load(group);
    if (grouped && mine) expanded[groupKey(group.rows[0])] = true;
    if (sort.key || grouped) layout();
    update();
    if (mine) select(group.rows[Math.min(mine.index || 0, group.rows.length - 1)]);
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
      if (grouped) layout();
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
    if (row.resent) {
      var mark = document.createElement("span");
      mark.className = "muted";
      mark.title = "sent again from this panel";
      mark.textContent = " \u21bb";
      name.appendChild(mark);
    }
    cell(tr, op.type ? "" : "muted", op.type || (op.persisted || op.documentId ? "persisted" : ""));
    cell(tr, "", statusText(row), row.entry.response && row.entry.response.statusText || "");
    cell(tr, "num", row.size === null ? "" : format.bytes(row.size), row.size === null ? "" : row.size + " bytes");
    cell(tr, "num", format.ms(row.time), har.timings(row.entry));
    cell(tr, "muted", format.path(row.url), row.url);
    tr.classList.toggle("error", failed(row));
    tr.classList.toggle("selected", row === selected);
    if (!grouped) tr.hidden = !matches(row);
    if (!row.tr) {
      row.tr = tr;
      tr.row = row;
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

  /* Arranges the table: rows in display order, hidden by the filters — or, grouped, one row per
     distinct operation with its members under it */
  function layout() {
    headers.forEach(function (th) {
      th.classList.toggle("sort-asc", th.getAttribute("data-sort") == sort.key && sort.dir > 0);
      th.classList.toggle("sort-desc", th.getAttribute("data-sort") == sort.key && sort.dir < 0);
    });
    if (!grouped) {
      Object.keys(groupEls).forEach(function (k) { groupEls[k].remove(); });
      groupEls = {};
      order().forEach(function (row) {
        row.tr.hidden = !matches(row);
        row.tr.classList.remove("member");
        rowsEl.appendChild(row.tr);
      });
      return;
    }
    var groups = [];
    var byKey = {};
    order().forEach(function (row) {
      if (!matches(row)) {
        row.tr.hidden = true;
        return;
      }
      var k = groupKey(row);
      if (!byKey[k]) {
        byKey[k] = { key : k, rows : [] };
        groups.push(byKey[k]);
      }
      byKey[k].rows.push(row);
    });
    if (sort.key) {
      // groups sort by their totals: errors, size in total, average time
      var key = sort.key;
      groups.forEach(function (g) { g.agg = aggregate(g); });
      groups.sort(function (a, b) {
        var x = groupValue(a, key), y = groupValue(b, key);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    var used = {};
    groups.forEach(function (g) {
      var tr = renderGroup(g);
      used[g.key] = true;
      rowsEl.appendChild(tr);
      g.rows.forEach(function (row) {
        row.tr.hidden = !expanded[g.key];
        row.tr.classList.add("member");
        rowsEl.appendChild(row.tr);
      });
    });
    Object.keys(groupEls).forEach(function (k) {
      if (!used[k]) {
        groupEls[k].remove();
        delete groupEls[k];
      }
    });
  }

  function groupKey(row) {
    return [row.op.label, row.op.type, row.url.split("?")[0]].join("\n");
  }

  function aggregate(g) {
    var a = { errors : 0, size : 0, time : 0, timed : 0, statuses : {} };
    g.rows.forEach(function (row) {
      if (failed(row)) a.errors++;
      if (row.size !== null) a.size += row.size;
      if (typeof row.time == "number" && row.time > 0) { a.time += row.time; a.timed++; }
      a.statuses[row.status || 0] = true;
    });
    return a;
  }

  function groupValue(g, key) {
    var first = g.rows[0];
    switch (key) {
      case "name": return (first.op.label || "").toLowerCase();
      case "type": return first.op.type || "persisted";
      case "status": return g.agg.errors;
      case "size": return g.agg.size;
      case "time": return g.agg.timed ? g.agg.time / g.agg.timed : -1;
      default: return first.url;
    }
  }

  /* "▸ Viewer ×12 · query · 2 errors · Σ size · avg time · URL" */
  function renderGroup(g) {
    var tr = groupEls[g.key] || document.createElement("tr");
    tr.innerHTML = "";
    tr.className = "group" + (expanded[g.key] ? " expanded" : "");
    var first = g.rows[0];
    var a = g.agg || aggregate(g);
    var errors = a.errors, size = a.size, time = a.time, timed = a.timed, statuses = a.statuses;
    var name = cell(tr, "", "", first.op.query || first.op.persisted || first.op.documentId || "");
    var arrow = document.createElement("span");
    arrow.className = "arrow";
    name.appendChild(arrow);
    name.appendChild(document.createTextNode(first.op.label || "\u2014"));
    var count = document.createElement("span");
    count.className = "muted";
    count.textContent = " \u00d7" + g.rows.length;
    name.appendChild(count);
    cell(tr, first.op.type ? "" : "muted", first.op.type || (first.op.persisted || first.op.documentId ? "persisted" : ""));
    var codes = Object.keys(statuses);
    cell(tr, "", errors ? errors + (errors == 1 ? " error" : " errors") : codes.length == 1 ? (codes[0] == "0" ? "(failed)" : codes[0]) : "mixed");
    cell(tr, "num", size ? format.bytes(size) : "", size + " bytes in total");
    cell(tr, "num", timed ? format.ms(time / timed) : "", "average \u00b7 " + format.ms(time) + " in total");
    cell(tr, "muted", format.path(first.url), first.url);
    tr.classList.toggle("error", errors > 0);
    if (!groupEls[g.key]) {
      groupEls[g.key] = tr;
      tr.addEventListener("click", function () {
        expanded[g.key] = !expanded[g.key];
        layout();
      });
    }
    return tr;
  }

  /* rows the user can step through: shown, in table order */
  function visible() {
    return Array.prototype.map.call(rowsEl.querySelectorAll("tr:not([hidden]):not(.group)"), function (tr) { return tr.row; });
  }

  function refilter() {
    layout();
    update();
  }

  /* "12 requests · 2 errors · 1.2 MB · 4.3 s" for the rows in view */
  function update() {
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) {
      countEl.textContent = "";
      return;
    }
    var shown = rows.filter(matches);
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
    groupEls = {};
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
    q.appendChild(actions(row));
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

  /* ---- Resend / Edit & resend: the page makes the request again; the answer arrives as a new row ---- */

  function actions(row) {
    var op = row.op;
    var bar = document.createElement("div");
    bar.className = "actions";
    var resendButton = document.createElement("button");
    resendButton.type = "button";
    resendButton.className = "copy";
    resendButton.textContent = "Resend";
    resendButton.title = "Send the same request again from the page";
    var armed = null;
    resendButton.addEventListener("click", function () {
      // a mutation changes things: ask twice
      if (op.type == "mutation" && !armed) {
        resendButton.textContent = "Resend the mutation?";
        resendButton.classList.add("danger");
        armed = setTimeout(function () {
          armed = null;
          resendButton.textContent = "Resend";
          resendButton.classList.remove("danger");
        }, 4000);
        return;
      }
      if (armed) clearTimeout(armed);
      resend(row, undefined, bar);
      resendButton.textContent = "Resend";
      resendButton.classList.remove("danger");
    });
    bar.appendChild(resendButton);
    if (har.editedBody(row.entry, op, op.query, op.variables) !== null) {
      var editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "copy";
      editButton.textContent = "Edit & resend";
      editButton.title = "Change the document or the variables and send";
      editButton.addEventListener("click", function () { editor(row); });
      bar.appendChild(editButton);
    }
    var note = document.createElement("span");
    note.className = "note";
    bar.appendChild(note);
    return bar;
  }

  function resend(row, body, bar) {
    var spec = har.replay(row.entry, body);
    pending.push({ url : spec.url, body : spec.body, at : Date.now(), index : row.op.index });
    var note = bar && bar.querySelector(".note");
    var say = function (text) { if (note) note.textContent = text; };
    if (devtools && devtools.inspectedWindow && devtools.inspectedWindow.eval) {
      devtools.inspectedWindow.eval(har.replayCode(spec), function (result, exception) {
        if (exception) say("could not send: " + (exception.value || exception.description || exception.code || "error"));
        else say("sent \u2014 the answer appears as a new row");
      });
    } else {
      // no page to ask (the demo): pretend the same answer came back
      say("sent \u2014 the answer appears as a new row");
      setTimeout(function () { simulate(row, spec); }, 200);
    }
  }

  function simulate(row, spec) {
    var e = row.entry;
    var copy = JSON.parse(JSON.stringify({ startedDateTime : new Date().toISOString(), time : e.time, request : e.request, response : e.response, timings : e.timings }));
    copy.time = Math.round(e.time * (0.8 + Math.random() * 0.4) * 10) / 10;
    if (spec.body !== null && copy.request.postData) copy.request.postData.text = spec.body;
    copy.getContent = function (cb) { cb(row.group.text || "", undefined); };
    add(copy);
  }

  /* the Query pane as a form: the document and the variables, Send and Cancel */
  function editor(row) {
    var op = row.op;
    var q = panes.query;
    q.innerHTML = "";
    var form = document.createElement("div");
    form.className = "editor";
    form.innerHTML = '<div class="section-head"><span>Edit &amp; resend</span>'
      + '<span class="note">' + (op.type == "mutation" ? "a mutation \u2014 it will run again" : "") + "</span>"
      + '<span class="buttons"><button type="button" class="copy send">Send</button><button type="button" class="copy cancel">Cancel</button></span></div>'
      + (op.query !== null
        ? '<label>Query</label><textarea class="edit-query" spellcheck="false"></textarea>'
        : '<div class="hint">A persisted query: the document stays on the server, only the variables can change.</div>')
      + '<label>Variables (JSON)</label><textarea class="edit-vars" spellcheck="false"></textarea>'
      + '<div class="error" hidden></div>';
    var queryEl = form.querySelector(".edit-query");
    var varsEl = form.querySelector(".edit-vars");
    var errorEl = form.querySelector(".error");
    var size = function (el) { el.rows = Math.min(30, Math.max(3, el.value.split("\n").length + 1)); };
    if (queryEl) {
      queryEl.value = pretty ? graphql.print(op.query) : op.query;
      size(queryEl);
    }
    varsEl.value = json.pretty(op.variables);
    size(varsEl);
    var send = function () {
      var vars = json.parse(varsEl.value.trim() === "" ? "{}" : varsEl.value);
      if (vars === undefined) {
        errorEl.textContent = "Variables are not valid JSON";
        errorEl.hidden = false;
        varsEl.focus();
        return;
      }
      var body = har.editedBody(row.entry, op, queryEl ? queryEl.value : null, vars);
      renderQuery(row);
      resend(row, body, q.querySelector(".actions"));
    };
    form.querySelector(".send").addEventListener("click", send);
    form.querySelector(".cancel").addEventListener("click", function () { renderQuery(row); });
    form.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key == "Enter") { send(); e.preventDefault(); }
      if (e.key == "Escape") { renderQuery(row); e.preventDefault(); }
    });
    [queryEl, varsEl].forEach(function (el) { if (el) el.addEventListener("input", function () { size(el); }); });
    q.appendChild(form);
    (queryEl || varsEl).focus();
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
      layout();
    });
  });

  groupEl.classList.toggle("on", grouped);
  groupEl.addEventListener("click", function () {
    grouped = !grouped;
    remember("grouped", grouped ? "1" : "0");
    groupEl.classList.toggle("on", grouped);
    if (grouped && selected) expanded[groupKey(selected)] = true;
    layout();
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
