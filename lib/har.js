/**
 * GraphQL operations out of a HAR entry (what chrome.devtools.network hands over), in every
 * shape they travel over HTTP: a JSON body, a batch array, a GET query string, an
 * application/graphql body, a form / multipart upload (the "operations" field), and persisted
 * queries that carry only a hash or a document id.
 */
var har = {
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
    return fromUrl ? [fromUrl] : [];
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
    if (typeof fields.doc_id == "string") body.doc_id = fields.doc_id;
    if (typeof fields.documentId == "string") body.documentId = fields.documentId;
    return body.query !== undefined || body.extensions !== undefined || body.doc_id !== undefined || body.documentId !== undefined ? body : null;
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
    var query = typeof raw.query == "string" ? raw.query : null;
    var extensions = raw.extensions && typeof raw.extensions == "object" ? raw.extensions : null;
    var persisted = extensions && extensions.persistedQuery && typeof extensions.persistedQuery.sha256Hash == "string" ? extensions.persistedQuery.sha256Hash : null;
    var documentId = ["documentId", "doc_id", "id"].map(function (k) { return typeof raw[k] == "string" ? raw[k] : null; }).filter(Boolean)[0] || null;
    var operationName = typeof raw.operationName == "string" && raw.operationName ? raw.operationName : null;
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
