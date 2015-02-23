var cartography = (function(){

  // Try go get the async module from somewhere
  var _async =
    typeof require === "function" ? require('async') :
    typeof async !== 'undefined' ? async :
    null;


  // This can be thrown by a filter to prevent successive filters from being executed
  function FilterChainBreak(value) {this.value = value;}


  // This is thrown by a filter when an input is invalid
  // It is thrown and caught in a back recursion to add the path of the invalid input to the error message string
  function CartographyError(message) {
    Error.captureStackTrace(this);
    this.message = ": " + message;
  }
  CartographyError.prototype = Object.create(Error.prototype);
  CartographyError.prototype.name = 'CartographyError';

  function isCartographyError(err) {return err instanceof CartographyError;};


  // Turn a synchronous function into an asynchronous one
  function asyncWrap(f) {
    return function(v, cb) {
      try {v = f(v);} catch (exception) {return cb(exception);}
      cb(null, v);
    };
  };


  // Flag (and wrap) a function as asynchronous
  function asyncDecorator(fn) {
    function wrapper() {return fn.apply(null, arguments);};
    wrapper.isAsynchronous = true;
    return wrapper;
  };


  // Execute a filters chain
  function asyncRunFiltersOn (value, filters, decorateMessage, cb) {
    filters = filters.map(function(f) {return f.isAsynchronous ? f : asyncWrap(f);});
    _async.waterfall(
      [(function(cb) {cb(null, value);})].concat(filters),
      (function(err, value) {
        if (err) {
          if (err instanceof FilterChainBreak) return cb(null, err.value);
          if (isCartographyError(err)) err.message = decorateMessage(err.message);
          return cb(err);
        }
        cb(null, value);
      })
    );
  };


  function runFiltersOn(value, filters, decorateMessage) {
    try {
      return filters.reduce((function(value, filter) {return filter(value);}), value);
    } catch (exception) {
      if (exception instanceof FilterChainBreak) return exception.value;
      if (isCartographyError(exception)) exception.message = decorateMessage(exception.message);
      throw exception;
    }
  };


  // Main mapping function
  function asyncMap(source, schema, cb) {
    if (!_async) throw new Error('asyncMap requires caolan/async module');

    // Build destination attribute via a filters chain
    function runFilters(args, destinationAttribute, cb) {
      var sourceAttribute = args[0] || destinationAttribute;
      var filters = Array.prototype.slice.call(args, 1);

      var value = sourceAttribute.split('.').reduce((function(o, step) {return (o || {})[step];}), source);
      asyncRunFiltersOn(value, filters, (function(message) {return addSeparator(sourceAttribute, message);}), cb);
    };

    // Build destination attribute via a custom function
    function callCustomFunction(fn, attr, cb) {
      if (fn.isAsynchronous) fn(source, cb); else cb(null, fn(source));
    };

    // Destination attribute is an Object with a nested schema
    function goRecursive(schema, attr, cb) {
      asyncMap(source, schema, cb);
    };


    // Produce all values asynchronously
    var parallelTasks = {};
    for (var destinationAttribute in schema) {
      var value = schema[destinationAttribute];

      var method =
        Array.isArray(value) ? runFilters :
        typeof value === 'function' ? callCustomFunction :
        goRecursive;

      parallelTasks[destinationAttribute] = (function(method, destinationAttribute, value) {
        return function(cb) {method(value, destinationAttribute, cb);};
      })(method, destinationAttribute, value);
    }

    _async.parallel(parallelTasks, function(err, result) {
      if (err) return cb(err);

      // Delete null attributes
      for (var k in result) if (result[k] == null) delete result[k];

      // Return result only if there's at least one attribute
      for (var k in result) return cb(null, result);

      // Return undefined
      cb(null, undefined);
    });
  };


  function map(source, schema) {

    // Build destination attribute via a filters chain
    function runFilters(args, destinationAttribute) {
      var sourceAttribute = args[0] || destinationAttribute;
      var filters = Array.prototype.slice.call(args, 1);

      var value = sourceAttribute.split('.').reduce((function(o, step) {return (o || {})[step];}), source);
      return runFiltersOn(value, filters, function(message) {return addSeparator(sourceAttribute, message);});
    };

    // Build destination attribute via a custom function
    function callCustomFunction(fn) {return fn(source);};

    // Destination attribute is an Object with a nested schema
    function goRecursive(schema) {return map(source, schema);};

    var destination = {};
    var length = 0;
    for (var destinationAttribute in schema) {

      var value = schema[destinationAttribute];

      var method =
        Array.isArray(value) ? runFilters :
        typeof value === 'function' ? callCustomFunction :
        goRecursive;

      var value = method(value, destinationAttribute);
      if (value != null) {
        destination[destinationAttribute] = value;
        length++;
      }
    }

    if (length) return destination;
    return undefined;
  };


  function addSeparator(sourceAttribute, message) {
    // check that message is like "foo: bar" and neither ": bar" nor "[0]: bar"
    var sep = /^[^[:].*:/.test(message) ? '.' : '';
    return sourceAttribute + sep + message;
  };


  function flatten(array, flat) {
    if (flat == null) flat = [];

    var type = Object.prototype.toString.call(array);
    if (type !== '[object Array]' && type !== '[object Arguments]')
      throw new Error('Filter must be function or Array, but ' +type+ ' found');

    for (var i = 0; i < array.length; i++) {
      var e = array[i];
      if (typeof e === 'function') flat.push(e); else flatten(e, flat);
    }

    return flat;
  };


  function same() {return [''].concat(flatten(arguments));};


  function from() {return [arguments[0]].concat(flatten(Array.prototype.slice.call(arguments, 1)));};


  var filters = {

    asyncArray: function() {
      var filters = flatten(arguments);
      return asyncDecorator(function(a, cb) {
        if (!Array.isArray(a)) return cb(new CartographyError('must be an Array'));

        _async.timesSeries(a.length, function(index, cb) {
          asyncRunFiltersOn(a[index], filters, (function(message) {return addSeparator('['+index+']', message);}), cb);
        }, cb);
      });
    },

    array: function() {
      var filters = flatten(arguments);
      return function(a) {
        if (!Array.isArray(a)) throw new CartographyError('must be an Array');

        return a.map(function(element, index) {
          return runFiltersOn(element, filters, function(message) {return addSeparator('['+index+']', message);});
        });
      };
    },

    optional: function(v) {
      if (v != null) return v;
      throw new FilterChainBreak;
    },

    required: function(v) {
      if (v != null) return v;
      throw new CartographyError('is required');
    },

    isOneOf: function(valids) {
      return function(e) {
        if (~valids.indexOf(e)) return e;
        throw new CartographyError('unrecognized value');
      };
    },

    isString: function(s) {
      if (Object.prototype.toString.call(s) === '[object String]') return s;
      throw new CartographyError('must be a string');
    },

    parseJSON: function(s) {
      try {
        return JSON.parse(s);
      } catch (e) {
        throw new CartographyError("invalid JSON: " + e.message);
      }
    },

    isNumber: function(n) {
      if (Object.prototype.toString.call(n) === '[object Number]') return n;
      throw new CartographyError('must be a number');
    },

    isInteger: function(n) {
      if (n === Math.floor(n) && Object.prototype.toString.call(n) === '[object Number]') return n;
      throw new CartographyError('must be an integer number');
    }
  };


  if (typeof module === 'undefined') module = {};
  return module.exports = {
    CartographyError: CartographyError,
    FilterChainBreak: FilterChainBreak,
    isCartographyError: isCartographyError,
    async: asyncDecorator,
    asyncMap: asyncMap,
    map: map,
    same: same,
    from: from,
    filters: filters
  }
})();
