Cartography
===========

[![NPM version][npm-image]][npm-url]
![Build Status](https://github.com/Adslot/cartography/workflows/Node.js%20CI/badge.svg)

Javascript Object to Object mapper

Cartography takes an input Object and translates it into a new Object with a
different structure as specified by a schema.
It can also be used for validating input structures.


```javascript

  var theInput = {
    id: 123,
    userName: 'HappyLand',
    color: {
      definition: '#7ff'
    },
    day: 'Mon',
    month: 'Aug',
  }

  var theDesiredOutput = {
    id: 123,
    name: 'HappyLand',
    base: {
      color: '#7FF',
      time: 'Mon - Aug'
    }
  }

  // let's use Cartography
  var f = cartography.filters

  var theSchemaToTranslateOneIntoTheOther = {
    id: [f.required, f.isInteger],
    name: ['userName', f.isString],
    base: {
      color: ['color.definition', f.isString, function(v) {return v.toUpperCase()}],
      time: function(inputObject) {return inputObject.day +' - '+ inputObject.month}
    }
  }

  assert.deepEqual(cartography.map(theInput, theSchemaToTranslateOneIntoTheOther), theDesiredOutput)
```

The schema's structure is the same as that of the output Object: it has the
same attribute names and the same nested structure (if any), but each
attribute value describes how obtain the final output value.

Each attribute value can be one of three things: a list of filters, another
schema Object or a custom function.

**Lists of filters** are Arrays of filters.
If the name of the desired output attribute does not match the name and path of the source attribute,
a different path string can be specified as the first element of the Array.
This could be any attribute name (`'address'`, `'id'`, `'account'`) or path to a
nested attribute (`'account.emailAddress'`, `'permissions.write.quota'`).

A **filter** can be any function that accepts a single argument as its input value
and returns the transformed value.
Filters are executed on the input value one after the other.

When the input is not valid, a filter can throw a `CartographyError`:
`CartographyError`s are collected by the `map` method and decorated with the
full path of the input value that caused the error.

A convenient way to create validation filters is to use the `.filters.assert` factory.


**Custom functions** are passed the input Object as argument and their output
is used as final value for the output attribute.
```javascript
var cartographyCarSchema = {
  manifacturer: function(){return 'Adslot'},
  name: function(car){return car.model +' '+ car.variant}
}
```


MAIN API
--------

### map(source, schema)
Translates the `source` object according to the given `schema` and returns the result.
Any field of the schema whose final value is `undefined` will not appear in the result.
If no fields have defined values, `map` will return `undefined` rather than an empty Object.


### mapArray(source, schema, [arrayFilters])
Translates all elements the `source` array according to the given `schema` and returns the result.
The `schema` can be an array of filters or a schema (that applies to an array of objects).
The optional `arrayFilters` is an array of filters that apply to the source array before
the translation of the elements.


### CartographyError(message)
This is the error that should be thrown when a filter encounters an invalid value.
Cartography will add the full path of the invalid input to the error message.


### isCartographyError(object)
Returns `true` if the given argument is a `CartographyError`.


### FilterChainBreak(finalValue)
Is a special Error used to interrupt the chain of filters.
If a filter throws this, all subsequent filters are ignored and the final attribute value
is set to `finalValue`.
`FilterChainBreak` is used internally by `filters.optional` and `filters.default`.


### from(sourcePath, filters...), same(filters...)
These are two helpers to create lists of filters.
They have three main advantages:

1. They validate the input
2. They flatten nested arrays
3. They may or may not look nicer than Arrays in CoffeeScript

```coffeescript
  {from, same, filters: {required, isString}} = cartography

  theSchemaToTranslateOneIntoTheOther =
    id: same required, isInteger
    name: from 'userName', isString
    base:
      color: from 'color.definition', isString, (v) -> v.toUpperCase()
      time: (inputObject) -> "#{inputObject.day} - #{inputObject.month}"
```


Built-in filters
----------------

### filters.optional
If the value is `null` or `undefined` it will directly assign `undefined` to the target attribute,
preventing any subsequent filter from being executed on the value.
Otherwise, it will pass the value as it is to the next filter.


### filters.defaults(defaultValue)
If the value is `null` or `undefined` it will directly assign `defaultValue` to the target attribute,
preventing any subsequent filter from being executed on the value.
Otherwise, it will pass the value as it is to the next filter.


### filters.required
Throws if the value is `null` or `undefined`.


### filters.array(filters...)
```javascript
var input = {
  aListOfStuff: [1, 4, 5]
}

var schema = {
  list: ['aListOfStuff', filters.array(filters.isInteger, function(n){return n+'.0'})]
}

var expectedOutput = {
  list: ['1.0', '4.0', '5.0']
}

assert.deepEqual(cartography.map(input, schema), expectedOutput)
```
`filters.array` ensures that the value is an Array and applies the specified `filters`, if any, to each element of the value.
If `filters` contain any nested Array, they will be flattened.


### filters.object(schema)
```javascript
var input = {
  someHash: {
    a: 1,
    b: 'hello!',
    c: ['blue', 'black'],
  }
}

var schema = {
  keys: ['someHash', filters.object({
    a: [filters.isNumber],
    b: [filters.isString, function(s) {return '**'+ s +'**'}],
    c: [filters.array(filters.isString)]
  })]
}

var expectedOutput = {
  keys: {
    a: 1,
    b: '**hello!**',
    c: ['blue', 'black']
  }
}

assert.deepEqual(map(input, schema), expectedOutput)
```
`filters.object` creates a filter that passes the value through `cartography.map` with the given nested schema.


### filters.assert(condition, errorMessage)
```javascript
var isEven = filters.assert(function(n){return n % 2 === 0}, 'must be even')
```
Returns a filter that asserts for the given condition, producing a `CartographyError` with the provided
message if the condition is not met.


### filters.parseJSON
Converts a JSON string into a JavaScript Object.


### filters.isString
Throws if the value is not a [primitive][MDN] string.


### filters.isNumber
Throws if the value is not a [primitive][MDN] number.


### filters.isInteger
Throws if the value is not an integer and a [primitive][MDN] number.


### filters.isOneOf(list)
```
isPrimaryColor = filters.isOneOf ['red', 'green', 'blue']
```
Returns a filter that checks whether the value belongs to the given list.


[MDN]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String#Distinction_between_string_primitives_and_String_objects
[npm-url]: https://npmjs.org/package/cartography
[npm-image]: https://badge.fury.io/js/cartography.svg
[daviddm-url]: https://david-dm.org/adslot/cartography.svg?theme=shields.io
[daviddm-image]: https://david-dm.org/adslot/cartography
