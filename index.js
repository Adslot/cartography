(function () {
  // This can be thrown by a filter to prevent successive filters from being executed
  function FilterChainBreak(value) {
    this.value = value;
  }

  // This is thrown by a filter when an input is invalid
  // It is thrown and caught in a back recursion to add the path of the invalid input to the error message string
  function CartographyError(message) {
    Error.captureStackTrace(this);
    this.message = ': ' + message;
  }
  CartographyError.prototype = Object.create(Error.prototype);
  CartographyError.prototype.name = 'CartographyError';

  function isCartographyError(err) {
    return err instanceof CartographyError;
  }

  function runFiltersOn(value, filters, decorateMessage) {
    try {
      return filters.reduce(function (v, filter) {
        return filter(v);
      }, value);
    } catch (exception) {
      if (exception instanceof FilterChainBreak) return exception.value;
      if (isCartographyError(exception)) exception.message = decorateMessage(exception.message);
      throw exception;
    }
  }

  function addSeparator(sourceAttributePath, message) {
    // check that message is like "foo: bar" and neither ": bar" nor "[0]: bar"
    const sep = /^[^[:].*:/.test(message) ? '.' : '';
    return sourceAttributePath + sep + message;
  }

  // Main mapping function
  function map(source, schema) {
    // Build destination attribute via a filters chain
    function runFilters(args, destinationAttribute) {
      let sourceAttributePath, filters, value;

      // First argument is the source attribute path, all others are filter functions
      if (typeof args[0] === 'string') {
        sourceAttributePath = args[0];
        filters = args.slice(1);
        value = sourceAttributePath.split('.').reduce(function (o, step) {
          return (o || {})[step];
        }, source);
      }
      // All arguments are filter functions
      else {
        sourceAttributePath = destinationAttribute;
        filters = args;
        value = (source || {})[sourceAttributePath];
      }

      function formatError(message) {
        return addSeparator(sourceAttributePath, message);
      }
      return runFiltersOn(value, filters, formatError);
    }

    // Build destination attribute via a custom function
    function callCustomFunction(fn) {
      return fn(source);
    }

    // Destination attribute is an Object with a nested schema
    function goRecursive(nestedSchema) {
      return map(source, nestedSchema);
    }

    // Error: a string was used. Throw an exception
    // eslint-disable-next-line no-unused-vars
    function rejectString(s, destinationAttribute) {
      throw new Error('invalid schema for `' + destinationAttribute + '`');
    }

    const destination = {};
    let length = 0;
    for (const destinationAttribute in schema) {
      let value = schema[destinationAttribute];

      const methodValue = typeof value === 'string' ? rejectString : goRecursive;
      const funcValue = typeof value === 'function' ? callCustomFunction : methodValue;

      const method = Array.isArray(value) ? runFilters : funcValue;

      value = method(value, destinationAttribute);
      if (value != null) {
        destination[destinationAttribute] = value;
        length++;
      }
    }

    if (length) return destination;
    return undefined;
  }

  function flatten(array, flat, start) {
    const type = Object.prototype.toString.call(array);
    if (type !== '[object Array]' && type !== '[object Arguments]')
      throw new Error('filter must be function or Array, but ' + type + ' found');

    for (let i = start; i < array.length; i++) {
      const e = array[i];
      if (typeof e === 'function') flat.push(e);
      else flatten(e, flat, 0);
    }

    return flat;
  }

  function same() {
    return flatten(arguments, [], 0);
  }

  function from() {
    const path = arguments[0];
    if (typeof path !== 'string') throw new Error('first argument must be a string');
    return [path].concat(flatten(arguments, [], 1));
  }

  function assertFactory(test, message) {
    return function (v) {
      if (test(v)) return v;
      throw new CartographyError(typeof message === 'function' ? message(v) : message);
    };
  }

  const filters = {
    array: function () {
      const arrayFilters = flatten(arguments, [], 0);
      return function (a) {
        if (!Array.isArray(a)) throw new CartographyError('must be an Array');

        return a.map(function (element, index) {
          return runFiltersOn(element, arrayFilters, function (message) {
            return addSeparator('[' + index + ']', message);
          });
        });
      };
    },

    object: function (schema) {
      return function (v) {
        return map(v, schema);
      };
    },

    optional: function (v) {
      if (v != null) return v;
      throw new FilterChainBreak();
    },

    defaults: function (defaultValue) {
      return function (v) {
        if (v != null) return v;
        throw new FilterChainBreak(defaultValue);
      };
    },

    required: assertFactory(function (v) {
      return v != null;
    }, 'is required'),

    assert: assertFactory,

    parseJSON: function (s) {
      try {
        return JSON.parse(s);
      } catch (e) {
        throw new CartographyError('invalid JSON: ' + e.message);
      }
    },

    isOneOf: function (valids) {
      return assertFactory(function (v) {
        return ~valids.indexOf(v);
      }, 'unrecognized value');
    },

    isString: assertFactory(function (v) {
      //return Object.prototype.toString.call(v) === '[object String]'
      return typeof v === 'string';
    }, 'must be a string'),

    isNumber: assertFactory(function (v) {
      //return Object.prototype.toString.call(v) === '[object Number]' && !isNaN(v)
      return typeof v === 'number' && !isNaN(v);
    }, 'must be a number'),

    isInteger: assertFactory(function (v) {
      //return v === Math.floor(v) && Object.prototype.toString.call(v) === '[object Number]'
      return v === Math.floor(v) && typeof v === 'number';
    }, 'must be an integer number'),

    isEmail: assertFactory(function (v) {
      return v?.match(
        // https://emailregex.com/
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}])|(([a-zA-Z\-\d]+\.)+[a-zA-Z]{2,}))$/
      );
    }, 'must be a valid email address'),

    isUrl: assertFactory(function (v) {
      return v?.match(
        // https://gist.github.com/dperini/729294
        /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\d\u00a1-\uffff][a-z\d\u00a1-\uffff_-]{0,62})?[a-z\d\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/
      );
    }, 'must be a valid URL'),
  };

  function mapArray(source, schema, arrayFilters = []) {
    const arraySchema = Array.isArray(schema) ? schema : filters.object(schema);
    const { array } = map({ array: source }, { array: same(arrayFilters, filters.array(arraySchema)) }) || {};
    return array;
  }

  const exports = {
    CartographyError,
    FilterChainBreak,
    isCartographyError,
    map,
    mapArray,
    same,
    from,
    filters,
  };
  if (typeof module !== 'undefined') module.exports = exports;
  return exports;
})();
