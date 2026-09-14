/**
 * Code folding for the coloured views: tokens in, one <div class="line"> per source line out.
 * A line whose bracket closes on a later line gets a toggle in the gutter and an ellipsis with
 * a summary that shows while it is collapsed. Which lines hide is decided in the panel; here
 * only the ranges are computed — by tokens, so brackets inside strings and comments don't count.
 */
var fold = {
  /* more lines than this and the view stays a plain <pre> */
  LIMIT : 20000,

  OPEN : /^[\[{(]$/,
  CLOSE : /^[\]})]$/,

  /*
   * tokens: [{ type, role?, text }] covering the whole source (space tokens carry the newlines).
   * count: true to say how many keys / items a collapsed JSON bracket hides.
   */
  render : function (tokens, count) {
    var lines = [[]];
    var folds = {};
    var stack = [];
    var line = 0;

    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var top = stack[stack.length - 1];
      if (t.type == "punct" && this.OPEN.test(t.text)) {
        if (top) top.items = true;
        stack.push({ line : line, kind : t.text, commas : 0, items : false, depth : stack.length });
      } else if (t.type == "punct" && this.CLOSE.test(t.text)) {
        var open = stack.pop();
        // the outermost bracket that spans lines owns the line's fold
        if (open && open.line != line && (!folds[open.line] || folds[open.line].depth > open.depth)) {
          folds[open.line] = { end : line, depth : open.depth, kind : open.kind, children : open.items ? open.commas + 1 : 0 };
        }
      } else if (t.type == "punct" && t.text == ",") {
        if (top) top.commas++;
      } else if (t.type != "space" && t.type != "comment") {
        if (top) top.items = true;
      }

      var cls = t.type == "space" ? "" : t.role || t.type;
      var parts = t.text.split("\n");
      for (var p = 0; p < parts.length; p++) {
        if (p > 0) {
          lines.push([]);
          line++;
        }
        var text = parts[p].replace(/\r/g, "");
        if (text) lines[line].push({ cls : cls, text : text });
      }
    }

    var self = this;
    return lines.map(function (pieces, n) {
      var f = folds[n];
      var html = '<div class="line"' + (f ? ' data-end="' + f.end + '" data-depth="' + f.depth + '"' : "") + ">";
      html += '<span class="gutter">' + (f ? '<span class="toggle" title="Collapse"></span>' : "") + "</span>";
      html += pieces.map(function (pc) {
        return pc.cls ? '<span class="t-' + pc.cls + '">' + format.escape(pc.text) + "</span>" : format.escape(pc.text);
      }).join("");
      if (f) html += '<span class="ellipsis" title="Expand">' + self.summary(f, count) + "</span>";
      return html + "</div>";
    }).join("");
  },

  summary : function (f, count) {
    if (!count || f.kind == "(") return "…";
    var n = f.children;
    var unit = f.kind == "[" ? (n == 1 ? "item" : "items") : (n == 1 ? "key" : "keys");
    return "… " + n + " " + unit;
  },

  /* number of lines a text would render as */
  lines : function (text) {
    var n = 1;
    for (var i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) n++;
    return n;
  }
};
