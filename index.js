var cartography = (function() {

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

  function isCartographyError(err) {return err instanceof CartographyError;}


  function runFiltersOn(value, filters, decorateMessage) {
    try {
      return filters.reduce(function(value, filter) {return filter(value);}, value);
    } catch (exception) {
      if (exception instanceof FilterChainBreak) return exception.value;
      if (isCartographyError(exception)) exception.message = decorateMessage(exception.message);
      throw exception;
    }
  }


  function addSeparator(sourceAttributePath, message) {
    // check that message is like "foo: bar" and neither ": bar" nor "[0]: bar"
    var sep = /^[^[:].*:/.test(message) ? '.' : '';
    return sourceAttributePath + sep + message;
  }


  // Main mapping function
  function map(source, schema) {

    // Build destination attribute via a filters chain
    function runFilters(args, destinationAttribute) {
      var sourceAttributePath, filters, value;

      // First argument is the source attribute path, all others are filter functions
      if (typeof args[0] === 'string') {
        var sourceAttributePath = args[0];
        var filters = args.slice(1);
        var value = sourceAttributePath.split('.').reduce(function(o, step) {return (o || {})[step];}, source);
      }
      // All arguments are filter functions
      else
      {
        var sourceAttributePath = destinationAttribute;
        var filters = args;
        var value = (source || {})[sourceAttributePath];
      }

      function formatError (message) {return addSeparator(sourceAttributePath, message);}
      return runFiltersOn(value, filters, formatError);
    }

    // Build destination attribute via a custom function
    function callCustomFunction(fn) {return fn(source);}

    // Destination attribute is an Object with a nested schema
    function goRecursive(schema) {return map(source, schema);}

    // Error: a string was used. Throw an exception
    function rejectString(s, destinationAttribute) {throw new Error('invalid schema for `'+destinationAttribute+'`');}

    var destination = {};
    var length = 0;
    for (var destinationAttribute in schema) {

      var value = schema[destinationAttribute];

      var method =
        Array.isArray(value) ? runFilters :
        typeof value === 'function' ? callCustomFunction :
        typeof value === 'string' ? rejectString :
        goRecursive;

      var value = method(value, destinationAttribute);
      if (value != null) {
        destination[destinationAttribute] = value;
        length++;
      }
    }

    if (length) return destination;
    return undefined;
  }


  function flatten(array, flat, start) {
    var type = Object.prototype.toString.call(array);
    if (type !== '[object Array]' && type !== '[object Arguments]')
      throw new Error('filter must be function or Array, but ' +type+ ' found');

    for (var i = start; i < array.length; i++) {
      var e = array[i];
      if (typeof e === 'function') flat.push(e); else flatten(e, flat, 0);
    }

    return flat;
  }


  function same() {return flatten(arguments, [], 0);}


  function from() {
    var path = arguments[0];
    if (typeof path !== 'string') throw new Error('first argument must be a string');
    return [path].concat(flatten(arguments, [], 1));
  }


  function assertFactory(test, message) {
    return function(v) {
      if (test(v)) return v;
      throw new CartographyError(typeof message === 'function' ? message(v) : message);
    };
  }


  var filters = {


    array: function() {
      var filters = flatten(arguments, [], 0);
      return function(a) {
        if (!Array.isArray(a)) throw new CartographyError('must be an Array');

        return a.map(function(element, index) {
          return runFiltersOn(element, filters, function(message) {return addSeparator('['+index+']', message);});
        });
      };
    },


    object: function(schema) {
      return function(v) {
        return map(v, schema);
      };
    },


    optional: function(v) {
      if (v != null) return v;
      throw new FilterChainBreak;
    },


    defaults: function(defaultValue) {
      return function(v) {
        if (v != null) return v;
        throw new FilterChainBreak(defaultValue);
      };
    },


    required: assertFactory(function(v) {return v != null;}, 'is required'),


    assert: assertFactory,


    parseJSON: function(s) {
      try {
        return JSON.parse(s);
      } catch (e) {
        throw new CartographyError("invalid JSON: " + e.message);
      }
    },


    isOneOf: function(valids) {
      return assertFactory(function(v) {
        return ~valids.indexOf(v);
      }, 'unrecognized value');
    },


    isString: assertFactory(function(v) {
      //return Object.prototype.toString.call(v) === '[object String]'
      return typeof v === 'string';
    }, 'must be a string'),


    isNumber: assertFactory(function(v) {
      //return Object.prototype.toString.call(v) === '[object Number]' && !isNaN(v)
      return typeof v === 'number' && !isNaN(v);
    }, 'must be a number'),


    isInteger: assertFactory(function(v) {
      //return v === Math.floor(v) && Object.prototype.toString.call(v) === '[object Number]'
      return v === Math.floor(v) && typeof v === 'number';
    }, 'must be an integer number')
  };


  var exports = {
    CartographyError: CartographyError,
    FilterChainBreak: FilterChainBreak,
    isCartographyError: isCartographyError,
    map: map,
    same: same,
    from: from,
    filters: filters
  };
  if (typeof module !== 'undefined') module.exports = exports;
  return exports;
})();
