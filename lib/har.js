/**
 * GraphQL operations out of a HAR entry (what chrome.devtools.network hands over), in every
 * shape they travel over HTTP: a JSON body, a batch array, a GET query string, an
 * application/graphql body, a form / multipart upload (the "operations" field), and persisted
 * queries that carry only a hash or a document id (Apollo, Relay, Facebook / Instagram).
 */
var har = {
  /* a hex digest where a document was expected: the server knows the query by it */
  HASH : /^[0-9a-f]{32}$|^[0-9a-f]{40}$|^[0-9a-f]{64}$/i,

  header : function (headers, name) {
    name = name.toLowerCase();
    for (var i = 0; headers && i < headers.length; i++) {
      if (String(headers[i].name).toLowerCase() == name) return headers[i].value;
    }
    return null;
  },

  /* media type of a Content-Type header, lower-case, without parameters */
  mime : function (headers) {
    var ct = this.header(headers, "content-type");
    return ct ? ct.split(";")[0].trim().toLowerCase() : "";
  },

  /* The raw request objects, before any checks: whatever looks like a GraphQL payload */
  payloads : function (entry) {
    var req = entry && entry.request || {};
    var mime = this.mime(req.headers);
    var post = req.postData || {};
    var text = typeof post.text == "string" ? post.text : "";
    var urlParams = this.queryParams(req.url);
    var fromUrl = this.fromParams(urlParams);

    if (mime == "application/graphql") {
      var body = { query : text };
      if (typeof urlParams.variables == "string") body.variables = urlParams.variables;
      if (typeof urlParams.operationName == "string") body.operationName = urlParams.operationName;
      return [body];
    }
    if (mime == "multipart/form-data") {
      var parts = this.multipart(text, this.header(req.headers, "content-type"));
      if (!parts && Array.isArray(post.params)) parts = this.paramsMap(post.params);
      var operations = parts && parts.operations !== undefined ? this.parse(parts.operations) : undefined;
      if (operations !== undefined) return this.list(operations);
      var form = parts && this.fromParams(parts);
      return form ? [form] : [];
    }
    if (mime == "application/x-www-form-urlencoded") {
      var fields = Array.isArray(post.params) ? this.paramsMap(post.params) : this.queryParams("?" + text);
      var formBody = this.fromParams(fields);
      return formBody ? [formBody] : [];
    }
    if (/^\s*[\[{]/.test(text)) {
      var parsed = this.parse(text);
      if (parsed !== undefined) return this.list(parsed);
    }
    if (fromUrl) return [fromUrl];
    // GitHub's web client: the JSON body travels in a ?body= parameter
    if (typeof urlParams.body == "string" && /^\s*[\[{]/.test(urlParams.body)) {
      var inUrl = this.parse(urlParams.body);
      if (inUrl !== undefined) return this.list(inUrl);
    }
    // X / Twitter: /i/api/graphql/<queryId>/<OperationName>?variables=…
    var inPath = /\/graphql\/([A-Za-z0-9_-]{6,})\/([_A-Za-z][_0-9A-Za-z]*)(?:[?#]|$)/.exec(String(req.url || ""));
    if (inPath && typeof urlParams.variables == "string") {
      return [{ documentId : inPath[1], operationName : inPath[2], variables : urlParams.variables }];
    }
    return [];
  },

  /* a batch (JSON array) is remembered on the list: its response is an array too */
  list : function (value) {
    var out = Array.isArray(value) ? value.slice() : [value];
    out.batch = Array.isArray(value);
    return out;
  },

  parse : function (text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return undefined;
    }
  },

  queryParams : function (url) {
    var out = {};
    try {
      var search = String(url || "");
      search = search.indexOf("?") >= 0 ? search.slice(search.indexOf("?")) : "";
      new URLSearchParams(search).forEach(function (value, key) {
        if (!(key in out)) out[key] = value;
      });
    } catch (e) { /* not a URL */ }
    return out;
  },

  paramsMap : function (params) {
    var out = {};
    params.forEach(function (p) {
      if (p && p.name !== undefined && !(p.name in out)) out[p.name] = p.value === undefined ? "" : String(p.value);
    });
    return out;
  },

  /* GET / form transport: query, variables, operationName, extensions as strings → a body object */
  fromParams : function (fields) {
    if (!fields) return null;
    var body = {};
    if (typeof fields.query == "string") body.query = fields.query;
    if (typeof fields.operationName == "string") body.operationName = fields.operationName;
    if (typeof fields.variables == "string") body.variables = fields.variables;
    if (typeof fields.extensions == "string") {
      var ext = this.parse(fields.extensions);
      if (ext !== undefined) body.extensions = ext;
    }
    ["doc_id", "documentId", "query_hash"].forEach(function (k) {
      if (typeof fields[k] == "string") body[k] = fields[k];
    });
    // Facebook / Instagram name the operation in a field of their own
    if (body.operationName === undefined && typeof fields.fb_api_req_friendly_name == "string") body.operationName = fields.fb_api_req_friendly_name;
    return body.query !== undefined || body.extensions !== undefined || body.doc_id !== undefined || body.documentId !== undefined || body.query_hash !== undefined ? body : null;
  },

  /* Minimal multipart/form-data reader: { fieldName: text } for the parts that have a name */
  multipart : function (text, contentType) {
    var m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
    if (!m || !text) return null;
    var boundary = (m[1] || m[2]).trim();
    var out = {};
    var found = false;
    text.split("--" + boundary).forEach(function (part) {
      var split = part.indexOf("\r\n\r\n");
      var nl = "\r\n";
      if (split < 0) {
        split = part.indexOf("\n\n");
        nl = "\n";
      }
      if (split < 0) return;
      var head = part.slice(0, split);
      var name = /name="([^"]*)"/i.exec(head);
      if (!name) return;
      var body = part.slice(split + nl.length * 2);
      if (body.slice(-nl.length) == nl) body = body.slice(0, -nl.length);
      out[name[1]] = body;
      found = true;
    });
    return found ? out : null;
  },

  /* variables come as an object, a JSON string (older clients), or nothing */
  variables : function (v) {
    if (v === null || v === undefined || v === "") return {};
    if (typeof v == "object") return v;
    if (typeof v == "string") {
      var parsed = this.parse(v);
      return parsed !== undefined && typeof parsed == "object" && parsed !== null ? parsed : { "": v };
    }
    return {};
  },

  /*
   * One operation per payload: { query, variables, operationName, extensions, persisted, documentId,
   * type, name, label, index, batch }. null when the payload is not GraphQL.
   */
  operation : function (raw, index, batch) {
    if (raw === null || typeof raw != "object" || Array.isArray(raw)) return null;
    var query = typeof raw.query == "string" && graphql.operations(raw.query).length ? raw.query : null;
    var extensions = raw.extensions && typeof raw.extensions == "object" ? raw.extensions : null;
    var persisted = extensions && extensions.persistedQuery && typeof extensions.persistedQuery.sha256Hash == "string" ? extensions.persistedQuery.sha256Hash : null;
    var documentId = ["documentId", "doc_id", "query_hash", "id"].map(function (k) { return typeof raw[k] == "string" ? raw[k] : null; }).filter(Boolean)[0] || null;
    // GitHub's web client sends the document's hash in "query" and the name in "persistedQueryName"
    if (query === null && documentId === null && typeof raw.query == "string" && this.HASH.test(raw.query)) documentId = raw.query;
    var operationName = ["operationName", "persistedQueryName", "fb_api_req_friendly_name"].map(function (k) { return typeof raw[k] == "string" ? raw[k] : ""; }).filter(Boolean)[0] || null;
    if (query === null && persisted === null && !(documentId && (operationName || "variables" in raw))) return null;

    var d = query !== null ? graphql.describe(query, operationName) : { type : "", name : operationName, fields : [], multiple : false };
    var label = graphql.label(d) || (persisted ? "persisted " + persisted.slice(0, 8) + "…" : documentId ? "#" + documentId : "");
    return {
      query : query,
      variables : this.variables(raw.variables),
      operationName : operationName,
      extensions : extensions,
      persisted : persisted,
      documentId : documentId,
      type : d.type,
      name : d.name,
      label : label,
      multiple : d.multiple,
      index : index,
      batch : batch
    };
  },

  /*
   * A persisted operation with the document learned from another request that carried the same
   * hash together with its query (Apollo's APQ retry): the row gets a query, a type and a name.
   */
  withQuery : function (op, query) {
    var d = graphql.describe(query, op.operationName);
    var out = {};
    for (var k in op) out[k] = op[k];
    out.query = query;
    out.type = d.type;
    out.name = d.name;
    out.label = graphql.label(d) || op.label;
    out.multiple = d.multiple;
    out.learned = true;
    return out;
  },

  /* HAR timings as "wait 210 ms · receive 12 ms" — the phases that took time; "" when unknown */
  timings : function (entry) {
    var t = entry && entry.timings;
    if (!t) return "";
    return ["blocked", "dns", "connect", "ssl", "send", "wait", "receive"].filter(function (k) {
      return typeof t[k] == "number" && (t[k] > 0 || (t[k] == 0 && (k == "wait" || k == "receive")));
    }).map(function (k) { return k + " " + format.ms(t[k]); }).join(" \u00b7 ");
  },

  /* Server-Timing: "db;dur=53, app;desc=\"x\";dur=47.2" → "db 53 ms · app 47 ms"; "" without the header */
  serverTiming : function (headers) {
    var value = this.header(headers, "server-timing");
    if (!value) return "";
    return value.split(",").map(function (metric) {
      var parts = metric.trim().split(";");
      var name = parts[0].trim();
      var dur = null;
      var desc = "";
      parts.slice(1).forEach(function (p) {
        var kv = p.trim().split("=");
        if (kv[0] == "dur") dur = parseFloat(kv[1]);
        if (kv[0] == "desc") desc = kv.slice(1).join("=").replace(/^"|"$/g, "");
      });
      return name ? name + (desc ? " (" + desc + ")" : "") + (dur !== null && !isNaN(dur) ? " " + format.ms(dur) : "") : "";
    }).filter(Boolean).join(" \u00b7 ");
  },

  /* All GraphQL operations of a request; [] for anything else */
  operations : function (entry) {
    var payloads = this.payloads(entry);
    var out = [];
    for (var i = 0; i < payloads.length; i++) {
      var op = this.operation(payloads[i], i, payloads.batch === true);
      if (op) out.push(op);
    }
    return out;
  },

  isGraphQL : function (entry) {
    return this.operations(entry).length > 0;
  },

  /* The request as a curl command line, the way the Network panel's "Copy as cURL" makes one */
  curl : function (entry) {
    var req = entry && entry.request || {};
    var quote = function (s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; };
    var parts = ["curl " + quote(req.url || "")];
    if (req.method && req.method != "GET" && req.method != "POST") parts.push("-X " + req.method);
    (req.headers || []).forEach(function (h) {
      var name = String(h.name);
      if (name.charAt(0) == ":" || name.toLowerCase() == "content-length") return;   // HTTP/2 pseudo-headers, and curl sets the length itself
      parts.push("-H " + quote(name + ": " + h.value));
    });
    var text = req.postData && typeof req.postData.text == "string" ? req.postData.text : "";
    if (text) parts.push("--data-raw " + quote(text));
    else if (req.method == "POST") parts.push("-X POST");
    return parts.join(" \\\n  ");
  },

  /* headers the browser sets itself — fetch() refuses them, and they would be wrong anyway */
  UNSENDABLE : /^(:|accept-charset$|accept-encoding$|access-control-|connection$|content-length$|cookie2?$|date$|dnt$|expect$|host$|keep-alive$|origin$|referer$|set-cookie$|te$|trailer$|transfer-encoding$|upgrade$|via$|user-agent$|proxy-|sec-)/i,

  /*
   * The request as a fetch() the page can make again: { url, method, headers, body, credentials }.
   * With a body given, that one is sent instead of the recorded one (Edit & resend). Cookies go
   * along only when the recorded request carried some: "include" on a cross-origin call to a server
   * that answers Access-Control-Allow-Origin: * fails the CORS check and the request never leaves.
   */
  replay : function (entry, body) {
    var req = entry && entry.request || {};
    var headers = {};
    var cookies = false;
    (req.headers || []).forEach(function (h) {
      if (/^cookie$/i.test(String(h.name)) && h.value) cookies = true;
      if (!this.UNSENDABLE.test(String(h.name))) headers[h.name] = h.value;
    }, this);
    var recorded = req.postData && typeof req.postData.text == "string" ? req.postData.text : null;
    return {
      url : req.url || "",
      method : req.method || "GET",
      headers : headers,
      body : body !== undefined ? body : recorded,
      credentials : cookies ? "include" : "same-origin"
    };
  },

  /* the replay as a statement for chrome.devtools.inspectedWindow.eval — runs in the page, as the page */
  replayCode : function (spec) {
    return "(function (r) { fetch(r.url, { method: r.method, headers: r.headers, body: r.body, credentials: r.credentials }).catch(function () {}); })(" + JSON.stringify(spec) + ")";
  },

  /*
   * The recorded JSON body with the document and variables replaced — for one operation of a batch,
   * that operation alone. A hash that no longer matches the document is dropped. null when the body
   * is not JSON (a form, a multipart upload, a GET), which cannot be edited here.
   */
  editedBody : function (entry, op, query, variables) {
    var req = entry && entry.request || {};
    var text = req.postData && typeof req.postData.text == "string" ? req.postData.text : "";
    var parsed = /^\s*[\[{]/.test(text) ? this.parse(text) : undefined;
    if (parsed === undefined) return null;
    var raw = Array.isArray(parsed) ? parsed[op.index] : parsed;
    if (raw === null || typeof raw != "object") return null;
    var out = {};
    for (var k in raw) out[k] = raw[k];
    if (query !== null && query !== undefined) {
      if (query !== raw.query) {
        out.query = query;
        if (out.extensions && typeof out.extensions == "object" && out.extensions.persistedQuery) {
          var ext = {};
          for (var e in out.extensions) if (e != "persistedQuery") ext[e] = out.extensions[e];
          if (Object.keys(ext).length) out.extensions = ext; else delete out.extensions;
        }
        var d = graphql.describe(query, null);
        if (typeof raw.operationName == "string" && raw.operationName && !d.multiple) out.operationName = d.name || raw.operationName;
      }
    }
    out.variables = variables;
    return JSON.stringify(out);
  },

  /* "name: value" per line */
  headerLines : function (headers) {
    return (headers || []).map(function (h) { return h.name + ": " + h.value; }).join("\n");
  },

  /* Response body size: what DevTools knows, in order of usefulness; null when it knows nothing */
  size : function (entry) {
    var res = entry && entry.response || {};
    var content = res.content || {};
    var candidates = [content.size, res.bodySize, res._transferSize];
    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] == "number" && candidates[i] >= 0) return candidates[i];
    }
    return null;
  },

  /*
   * The part of a response that belongs to one operation: element i of a batch response,
   * the whole body otherwise. { value, text, errors } — value undefined when not JSON.
   */
  response : function (text, op) {
    var value = this.parse(text || "");
    if (value !== undefined && op && op.batch && Array.isArray(value)) {
      value = value[op.index];
      text = value === undefined ? "" : JSON.stringify(value, null, 2);
    }
    var errors = value && typeof value == "object" && Array.isArray(value.errors) ? value.errors.length : 0;
    return { value : value, text : text || "", errors : errors };
  }
};
