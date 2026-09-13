/**
 * JSON for display: pretty-printing and colouring. The tokenizer is lenient — a response that
 * is not quite JSON still comes out readable, with the odd bits marked.
 */
var json = {
  /* Too big to colour token by token: shown as plain text instead */
  LIMIT : 1024 * 1024,

  /* Parsed value, or undefined when the text is not JSON */
  parse : function (text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return undefined;
    }
  },

  pretty : function (value) {
    return JSON.stringify(value, null, 2);
  },

  /* Pretty-print when the text parses, otherwise return it as is */
  format : function (text) {
    var value = this.parse(text);
    return value === undefined ? text : this.pretty(value);
  },

  tokens : function (src) {
    var out = [];
    var re = /("(?:[^"\\\n]|\\.)*"?)|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)\b|([{}\[\]:,])|(\s+)|([^\s"{}\[\]:,]+)/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      var type = m[1] ? "string" : m[2] ? "number" : m[3] ? "keyword" : m[4] ? "punct" : m[5] ? "space" : "error";
      out.push({ type : type, text : m[0] });
    }
    // a string right before a colon is a key
    for (var i = 0; i < out.length; i++) {
      if (out[i].type != "string") continue;
      for (var j = i + 1; j < out.length && out[j].type == "space"; j++);
      if (out[j] && out[j].type == "punct" && out[j].text == ":") out[i].type = "key";
    }
    return out;
  },

  highlight : function (src) {
    if (src.length > this.LIMIT) return format.escape(src);
    return this.tokens(src).map(function (t) {
      if (t.type == "space") return format.escape(t.text);
      return '<span class="t-' + t.type + '">' + format.escape(t.text) + "</span>";
    }).join("");
  }
};
