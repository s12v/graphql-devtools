/*
 * Sample traffic for panel.html opened outside DevTools (development, screenshots, the demo page).
 * Shapes follow what chrome.devtools.network hands over: HAR entries with getContent().
 */
(function () {
  var t0 = Date.now();
  var n = 0;

  function entry(o) {
    var reqHeaders = [
      { name : ":authority", value : format.host(o.url) },
      { name : ":method", value : o.method || "POST" },
      { name : "accept", value : "application/json" },
      { name : "content-type", value : o.mime || "application/json" },
      { name : "authorization", value : "Bearer ghp_************************" },
      { name : "user-agent", value : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" }
    ];
    var body = typeof o.body == "string" ? o.body : JSON.stringify(o.body);
    var content = typeof o.content == "string" ? o.content : JSON.stringify(o.content);
    return {
      startedDateTime : new Date(t0 + (n++) * 137).toISOString(),
      time : o.time,
      request : {
        method : o.method || "POST",
        url : o.url,
        httpVersion : "h2",
        headers : reqHeaders,
        postData : o.body === undefined ? undefined : { mimeType : o.mime || "application/json", text : body }
      },
      response : {
        status : o.status === undefined ? 200 : o.status,
        statusText : o.status == 500 ? "Internal Server Error" : o.status == 401 ? "Unauthorized" : o.status === 0 ? "" : "OK",
        httpVersion : "h2",
        headers : [
          { name : "content-type", value : "application/json; charset=utf-8" },
          { name : "content-encoding", value : "gzip" },
          { name : "cache-control", value : "no-cache" },
          { name : "x-request-id", value : "c0ffee-" + (1000 + n) }
        ],
        content : { size : o.size === undefined ? content.length : o.size, mimeType : "application/json" },
        bodySize : -1,
        _transferSize : Math.round(content.length / 3) + 220
      },
      getContent : function (cb) { setTimeout(function () { cb(content, undefined); }, 30); }
    };
  }

  var viewer = "query Viewer {\n  viewer {\n    login\n    name\n    avatarUrl(size: 64)\n    repositories(first: 3, orderBy: {field: PUSHED_AT, direction: DESC}) {\n      totalCount\n      nodes {\n        nameWithOwner\n        stargazerCount\n        primaryLanguage { name }\n      }\n    }\n  }\n}";
  var repo = "query Repository($owner: String!, $name: String!, $n: Int = 5) {\n  repository(owner: $owner, name: $name) {\n    id\n    description\n    stargazers { totalCount }\n    issues(states: OPEN, first: $n) @include(if: true) {\n      nodes { ...IssueFields }\n    }\n  }\n}\n\nfragment IssueFields on Issue {\n  number\n  title\n  createdAt\n}";
  var star = "mutation Star($id: ID!) {\n  addStar(input: {starrableId: $id, clientMutationId: \"panel\"}) {\n    starrable {\n      ... on Repository { nameWithOwner stargazerCount }\n    }\n  }\n}";

  window.demo([
    entry({ url : "https://api.github.com/graphql", body : { query : viewer }, time : 212.4,
      content : { data : { viewer : { login : "s12v", name : "Sergey Novikov", avatarUrl : "https://avatars.githubusercontent.com/u/1462574?s=64&v=4",
        repositories : { totalCount : 42, nodes : [
          { nameWithOwner : "s12v/hasher", stargazerCount : 31, primaryLanguage : { name : "JavaScript" } },
          { nameWithOwner : "s12v/graphql-devtools", stargazerCount : 22, primaryLanguage : { name : "JavaScript" } },
          { nameWithOwner : "s12v/ppgen", stargazerCount : 7, primaryLanguage : { name : "JavaScript" } } ] } } } } }),
    entry({ url : "https://api.github.com/graphql", body : { query : repo, operationName : "Repository", variables : { owner : "s12v", name : "graphql-devtools", n : 3 } }, time : 348.9,
      content : { data : { repository : { id : "MDEwOlJlcG9zaXRvcnkxMTEyMjA3NDA=", description : "Chrome DevTools extension for GraphQL", stargazers : { totalCount : 22 },
        issues : { nodes : [ { number : 30, title : "Size Column Shows Negative Bytes", createdAt : "2021-09-02T16:41:08Z" },
          { number : 28, title : "Add ability to collapse/expand fragments of query and result", createdAt : "2021-07-27T06:48:18Z" },
          { number : 27, title : "Add columns with query name and variables to table with queries list", createdAt : "2021-07-27T06:45:28Z" } ] } } } } }),
    entry({ url : "https://api.github.com/graphql", body : { query : star, variables : { id : "MDEwOlJlcG9zaXRvcnkxMTEyMjA3NDA=" } }, time : 401.2,
      content : { data : { addStar : null }, errors : [ { message : "Resource not accessible by integration", type : "FORBIDDEN", path : ["addStar"], locations : [ { line : 2, column : 3 } ] } ] } }),
    entry({ url : "https://api.example.com/graphql", body : [
        { query : "query Me { me { id email } }" },
        { query : "query Notifications($unread: Boolean) { notifications(unread: $unread) { id text } }", variables : { unread : true } } ], time : 96.5,
      content : [ { data : { me : { id : "u_1", email : "me@example.com" } } }, { data : { notifications : [ { id : "n_1", text : "New comment on hasher#33" } ] } } ] }),
    entry({ url : "https://api.example.com/graphql", body : { operationName : "Feed", variables : { first : 10, after : null },
        extensions : { persistedQuery : { version : 1, sha256Hash : "ecf4edb46db40b5132295c0291d62fb65d6759a9eedfa4d5d612dd5ec54a6b38" } } }, time : 44.1,
      content : { errors : [ { message : "PersistedQueryNotFound", extensions : { code : "PERSISTED_QUERY_NOT_FOUND" } } ] } }),
    entry({ url : "https://api.example.com/graphql?query=" + encodeURIComponent("{ health { status version } }"), method : "GET", time : 18.7,
      content : { data : { health : { status : "ok", version : "3.4.1" } } } }),
    entry({ url : "https://api.example.com/graphql", body : { query : "subscription OnMessage($room: ID!) { message(room: $room) { id text } }", variables : { room : "42" } }, status : 500, time : 1530.2,
      content : "<html><body><h1>502 Bad Gateway</h1></body></html>" }),
    entry({ url : "https://gql.twitch.tv/gql", mime : "text/plain;charset=UTF-8", body : '[{"operationName":"ChannelShell","variables":{"login":"monstercat"},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"580ab410bcd0c1ad194224957ae2241e5d252b2c5173d8e0cce9d32d5bb14efe"}}}]', time : 77.3,
      content : [ { data : { userOrError : { id : "27446517", login : "monstercat", displayName : "Monstercat" } } } ] })
  ]);
})();
