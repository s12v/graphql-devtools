/**
 * Just enough GraphQL to colour a document and name its operations: the lexical grammar
 * (names, punctuators, numbers, strings, block strings, comments) plus a shallow walk
 * over the top-level definitions. No validation — whatever the page sent is shown as is.
 */
var graphql = {
  KEYWORDS : /^(query|mutation|subscription|fragment|on|true|false|null)$/,

  /* The lexical grammar: returns [{ type, text }] covering the whole input (whitespace included) */
  tokens : function (src) {
    var out = [];
    var re = /("""(?:[^"]|"(?!""))*"""?)|("(?:[^"\\\n]|\\.)*"?)|(#[^\n]*)|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|([_A-Za-z][_0-9A-Za-z]*)|(\.\.\.|[!$&():=@\[\]{}|])|([\s,]+)|(.)/g;
    var m;
    while ((m = re.exec(src)) !== null) {
      var type = m[1] || m[2] ? "string" : m[3] ? "comment" : m[4] ? "number" : m[5] ? "name" : m[6] ? "punct" : m[7] ? "space" : "error";
      out.push({ type : type, text : m[0] });
    }
    return out;
  },

  /*
   * Names get a role from their surroundings: keyword, def (operation / fragment name), variable,
   * directive, type, argument, alias or field. Punctuation and literals keep their lexical type.
   */
  classify : function (tokens) {
    var depth = 0;            // nesting of ( [ {
    var stack = [];           // which bracket opened each level
    var prev = null;          // previous significant token
    var inVarDefs = false;    // inside the ( ) right after an operation name, at depth 1

    var next = function (i) {
      for (var j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type != "space" && tokens[j].type != "comment") return tokens[j];
      }
      return null;
    };

    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type == "space" || t.type == "comment") continue;
      var after = next(i);

      if (t.type == "punct") {
        if (t.text == "(" || t.text == "[" || t.text == "{") {
          if (t.text == "(" && depth == 0 && prev && (prev.role == "def" || prev.role == "keyword")) inVarDefs = true;
          stack.push(t.text);
          depth++;
        } else if (t.text == ")" || t.text == "]" || t.text == "}") {
          if (stack.pop() == "(" && depth == 1) inVarDefs = false;
          depth = Math.max(0, depth - 1);
        }
        prev = t;
        continue;
      }

      if (t.type == "name") {
        var word = t.text;
        if (prev && prev.type == "punct" && prev.text == "$") {
          t.role = prev.role = "variable";        // the sigil is coloured with the name
        } else if (prev && prev.type == "punct" && prev.text == "@") {
          t.role = prev.role = "directive";
        } else if (prev && prev.type == "punct" && prev.text == "..." && word != "on") {
          t.role = "fragment";
        } else if (prev && prev.role == "keyword" && /^(query|mutation|subscription|fragment)$/.test(prev.text)) {
          t.role = "def";
        } else if (prev && prev.role == "keyword" && prev.text == "on") {
          t.role = "type";
        } else if (inVarDefs && prev && prev.type == "punct" && (prev.text == ":" || prev.text == "[")) {
          t.role = "type";
        } else if (inVarDefs && prev && prev.type == "punct" && prev.text == "=") {
          t.role = /^(true|false|null)$/.test(word) ? "keyword" : "enum";
        } else if (depth == 0 && /^(query|mutation|subscription|fragment)$/.test(word)) {
          t.role = "keyword";
        } else if (word == "on" && prev && (prev.role == "def" || (prev.type == "punct" && prev.text == "..."))) {
          t.role = "keyword";
        } else if (after && after.type == "punct" && after.text == ":" && stack[stack.length - 1] == "(") {
          t.role = "argument";
        } else if (after && after.type == "punct" && after.text == ":" && stack[stack.length - 1] == "{" && (prev == null || prev.type != "punct" || /^[{}]$/.test(prev.text) || prev.text == ")" || prev.text == "]")) {
          // inside a selection set a "name:" is an alias; inside an object value it is a key
          t.role = this.inValue(stack) ? "key" : "alias";
        } else if (this.inValue(stack)) {
          t.role = /^(true|false|null)$/.test(word) ? "keyword" : "enum";
        } else {
          t.role = "field";
        }
        prev = t;
        continue;
      }
      prev = t;
    }
    return tokens;
  },

  /* true when the innermost { belongs to an object value (some ( or [ is open around it) */
  inValue : function (stack) {
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i] == "(" || stack[i] == "[") return true;
    }
    return false;
  },

  /* Colourised HTML: one <span class="t-…"> per token, whitespace kept verbatim */
  highlight : function (src) {
    var tokens = this.classify(this.tokens(src));
    return tokens.map(function (t) {
      var cls = t.role || t.type;
      if (t.type == "space") return format.escape(t.text);
      return '<span class="t-' + cls + '">' + format.escape(t.text) + "</span>";
    }).join("");
  },

  /*
   * Top-level operations of a document: [{ type, name, fields }] — type is query / mutation /
   * subscription (an anonymous "{ … }" is a query), name null when anonymous, fields the names
   * selected directly under the operation. Fragments are skipped.
   */
  operations : function (src) {
    var tokens = this.tokens(src).filter(function (t) { return t.type != "space" && t.type != "comment"; });
    var ops = [];
    var depth = 0;
    var current = null;       // the operation being read; false inside a fragment
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (depth == 0 && t.type == "name" && /^(query|mutation|subscription)$/.test(t.text)) {
        current = { type : t.text, name : null, fields : [] };
        if (tokens[i + 1] && tokens[i + 1].type == "name") current.name = tokens[++i].text;
        ops.push(current);
        continue;
      }
      if (depth == 0 && t.type == "name" && t.text == "fragment") {
        current = false;
        continue;
      }
      if (depth == 0 && t.type == "punct" && t.text == "{" && current === null) {
        current = { type : "query", name : null, fields : [] };
        ops.push(current);
      }
      if (t.type == "punct" && (t.text == "{" || t.text == "(" || t.text == "[")) {
        depth++;
        continue;
      }
      if (t.type == "punct" && (t.text == "}" || t.text == ")" || t.text == "]")) {
        depth--;
        if (depth == 0 && t.text == "}") current = null;   // the selection set closed the operation
        continue;
      }
      // the selection set of an operation is the first { after its name / variables at depth 1
      if (depth == 1 && current && t.type == "name" && tokens[i - 1] && !(tokens[i - 1].type == "punct" && tokens[i - 1].text == "...")) {
        var isField = tokens[i - 1].type == "punct" && (tokens[i - 1].text == "{" || tokens[i - 1].text == "}" || tokens[i - 1].text == ")" || tokens[i - 1].text == "]")
          || tokens[i - 1].type == "name" || tokens[i - 1].type == "string" || tokens[i - 1].type == "number";
        var alias = tokens[i + 1] && tokens[i + 1].type == "punct" && tokens[i + 1].text == ":";
        if (isField && this.insideSelection(tokens, i)) {
          current.fields.push(alias && tokens[i + 2] && tokens[i + 2].type == "name" ? tokens[i + 2].text : t.text);
          if (alias) i += 2;
        }
      }
    }
    return ops;
  },

  /* at depth 1: are we inside the operation's { } rather than its ( ) variable definitions? */
  insideSelection : function (tokens, i) {
    var depth = 0;
    for (var j = i - 1; j >= 0; j--) {
      var t = tokens[j];
      if (t.type != "punct") continue;
      if (t.text == "}" || t.text == ")" || t.text == "]") depth++;
      else if (t.text == "{" || t.text == "(" || t.text == "[") {
        if (depth == 0) return t.text == "{";
        depth--;
      }
    }
    return false;
  },

  /*
   * What to show for a request: { type, name, fields, multiple }. operationName picks the operation
   * from a multi-operation document; without it all names are listed.
   */
  describe : function (src, operationName) {
    var ops = this.operations(src || "");
    if (operationName) {
      for (var i = 0; i < ops.length; i++) {
        if (ops[i].name == operationName) return { type : ops[i].type, name : operationName, fields : ops[i].fields, multiple : false };
      }
      return { type : ops.length == 1 ? ops[0].type : "", name : operationName, fields : ops.length == 1 ? ops[0].fields : [], multiple : false };
    }
    if (ops.length == 0) return { type : "", name : null, fields : [], multiple : false };
    if (ops.length == 1) return { type : ops[0].type, name : ops[0].name, fields : ops[0].fields, multiple : false };
    var names = ops.map(function (op) { return op.name || "{ " + (op.fields[0] || "") + " }"; });
    return { type : ops[0].type, name : names.join(", "), fields : ops[0].fields, multiple : true };
  },

  /* Name column text: the operation name, or the first field of an anonymous one as "{ viewer }" */
  label : function (d) {
    if (d.name) return d.name;
    if (d.fields.length) return "{ " + d.fields[0] + (d.fields.length > 1 ? ", …" : "") + " }";
    return "";
  }
};
