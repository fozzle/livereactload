"use strict";

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _lodash = require("lodash");

var _lodash2 = _interopRequireDefault(_lodash);

var _umd = require("umd");

var _umd2 = _interopRequireDefault(_umd);

var _through = require("through2");

var _through2 = _interopRequireDefault(_through);

var _md = require("md5");

var _md2 = _interopRequireDefault(_md);

var _fs = require("fs");

var _path = require("path");

var _server = require("./server");

var _console = require("./console");

var _reloading = require("../reloading");

var _reloading2 = _interopRequireDefault(_reloading);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function LiveReactloadPlugin(b) {
  var opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var _opts$port = opts.port;
  var port = _opts$port === undefined ? 4474 : _opts$port;
  var _opts$host = opts.host;
  var host = _opts$host === undefined ? null : _opts$host;
  var _opts$client = opts.client;
  var client = _opts$client === undefined ? true : _opts$client;
  var _opts$dedupe = opts.dedupe;
  var dedupe = _opts$dedupe === undefined ? true : _opts$dedupe;
  var _opts$debug = opts.debug;
  var debug = _opts$debug === undefined ? false : _opts$debug;
  var _opts$sslCert = opts['ssl-cert'];
  var sslCert = _opts$sslCert === undefined ? null : _opts$sslCert;
  var _opts$sslKey = opts['ssl-key'];
  var sslKey = _opts$sslKey === undefined ? null : _opts$sslKey;

  // server is alive as long as watchify is running

  var server = opts.server !== false ? (0, _server.startServer)({ port: Number(port), sslCert: sslCert, sslKey: sslKey }) : null;

  var clientOpts = {
    // assuming that livereload package is in global mdule directory (node_modules)
    // and this file is in ./lib/babel-plugin folder
    nodeModulesRoot: (0, _path.resolve)(__dirname, "../../.."),
    port: Number(port),
    host: host,
    clientEnabled: client,
    debug: debug
  };

  b.on("reset", addHooks);
  addHooks();

  function addHooks() {
    // this cache object is preserved over single bundling
    // pipeline so when next bundling occurs, this cache
    // object is thrown away
    var mappings = {},
        pathById = {},
        pathByIdx = {};
    var entries = [];
    var standalone = null;

    var idToPath = function idToPath(id) {
      return pathById[id] || _lodash2.default.isString(id) && id || throws("Full path not found for id: " + id);
    };

    var idxToPath = function idxToPath(idx) {
      return pathByIdx[idx] || _lodash2.default.isString(idx) && idx || throws("Full path not found for index: " + idx);
    };

    if (server) {
      b.pipeline.on("error", server.notifyBundleError);
    }

    b.pipeline.get("record").push(_through2.default.obj(function transform(row, enc, next) {
      var s = _lodash2.default.get(row, "options._flags.standalone");
      if (s) {
        standalone = s;
      }
      next(null, row);
    }));

    b.pipeline.get("sort").push(_through2.default.obj(function transform(row, enc, next) {
      var id = row.id;
      var index = row.index;
      var file = row.file;

      pathById[id] = file;
      pathByIdx[index] = file;
      next(null, row);
    }));

    if (!dedupe) {
      b.pipeline.splice("dedupe", 1, _through2.default.obj());
      if (b.pipeline.get("dedupe")) {
        (0, _console.log)("Other plugins have added de-duplicate transformations. --no-dedupe is not effective");
      }
    } else {
      b.pipeline.splice("dedupe", 0, _through2.default.obj(function transform(row, enc, next) {
        var cloned = _lodash2.default.extend({}, row);
        if (row.dedupeIndex) {
          cloned.dedupeIndex = idxToPath(row.dedupeIndex);
        }
        if (row.dedupe) {
          cloned.dedupe = idToPath(row.dedupe);
        }
        next(null, cloned);
      }));
    }

    b.pipeline.get("label").push(_through2.default.obj(function transform(row, enc, next) {
      var id = row.id;
      var file = row.file;
      var source = row.source;
      var deps = row.deps;
      var entry = row.entry;

      if (entry) {
        entries.push(file);
      }
      mappings[file] = [source, deps, { id: file, hash: (0, _md2.default)(source), browserifyId: id }];
      next(null, row);
    }, function flush(next) {
      next();
    }));

    b.pipeline.get("wrap").push(_through2.default.obj(function transform(row, enc, next) {
      next(null);
    }, function flush(next) {
      var pathById = _lodash2.default.fromPairs(_lodash2.default.toPairs(mappings).map(function (_ref) {
        var _ref2 = _slicedToArray(_ref, 2);

        var file = _ref2[0];

        var _ref2$ = _slicedToArray(_ref2[1], 3);

        var s = _ref2$[0];
        var d = _ref2$[1];
        var id = _ref2$[2].browserifyId;
        return [id, file];
      }));
      var idToPath = function idToPath(id) {
        return pathById[id] || _lodash2.default.isString(id) && id || throws("Full path not found for id: " + id);
      };

      var withFixedDepsIds = _lodash2.default.mapValues(mappings, function (_ref3) {
        var _ref4 = _slicedToArray(_ref3, 3);

        var src = _ref4[0];
        var deps = _ref4[1];
        var meta = _ref4[2];
        return [src, _lodash2.default.mapValues(deps, idToPath), meta];
      });
      var args = [withFixedDepsIds, entries, clientOpts];
      var bundleSrc = "(" + _reloading2.default.toString() + ")(" + args.map(function (a) {
        return JSON.stringify(a, null, 2);
      }).join(", ") + ");";
      if (standalone) {
        bundleSrc = (0, _umd2.default)(standalone, "return " + bundleSrc);
      }

      this.push(new Buffer(bundleSrc, "utf8"));
      if (server) {
        server.notifyReload(withFixedDepsIds);
      }
      next();
    }));
  }

  function throws(msg) {
    throw new Error(msg);
  }
}

module.exports = LiveReactloadPlugin;