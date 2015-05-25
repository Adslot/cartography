Cartography
===========


[![Build Status](https://secure.travis-ci.org/Adslot/cartography.png?branch=master)](http://travis-ci.org/Adslot/cartography)

Javascript Object to Object mapper

Cartography takes an input Object and translates it into a new Object with a
different structure as specified by a schema.
It can also be used for validating input structures.


```coffeescript

  theInput =
    id: 123
    userName: 'HappyLand'
    color:
      definition: '#7ff'
    day: 'Mon'
    month: 'Aug'

  theDesiredOutput =
    id: 123
    name: 'HappyLand'
    base:
      color: '#7FF'
      type: 'default'
      time: 'Mon - Aug'


  # enters Cartography
  {same, from, map, filters} = require 'cartography'
  {required, optional, isString} = filters

  theSchemaToTranslateOneIntoTheOther =
    id: same required
    name: from 'userName', isString
    base:
      color: from 'color.definition', isString, (v) -> v.toUpperCase()
      type: same optional
      time: (inputObject) -> "#{inputObject.day} - #{inputObject.month}"

  assert.deepEqual map(theInput, theSchemaToTranslateOneIntoTheOther), theDesiredOutput
```
(All examples are in CoffeeScript, but Cartography is pure JavaScript.)

The schema's structure resembles that of the output Object: it has the
same attribute names and the same nested structure (if any), but each
attribute value describes how obtain the final output value.

Each attribute value can be one of three things: a list of filters, another
schema object or a custom function.


**List of filters** are created by the factory methods `from` and `same`.
`from`'s first argument is a path along the input Object to be used as initial
value.
This could be any attribute name ('address', 'id', 'account') or path to a
nested attribute ('account.emailAddress', 'permissions.write.quota').
All the remainder arguments are filters, applied from left to right to the
retrieved initial value.

`same` works not unlike `from`, but assumes that the input attribute name is
the same as the output attribute name: `id: same required` is equivalent to
`id: from 'id', required`.

A *filter* can be any function that accepts an argument as its input value
and returns an output value.
Filters can be used for checking the input validity by throwing a
`CartographyError` if the input is not valid and returning it normally
otherwise.
`CartographyError`s are collected by the `map` method and decorated with the
full path of the input value that caused the error.


**Custom functions** are passed the input Object as argument and their output
is used as final value for the output attribute.
```
cartographyCarSchema =
  manifacturer: -> 'Adslot'
  name: (car) -> "#{car.model} #{car.variant}"
```


Built-in filters
----------------
* `optional`
* `required`
* `parseJSON`
* `isString`
* `isNumber`
* `isInteger`


Built-in filter factories
-------------------------
* `filters.array`
```coffeescript
input =
  aListOfStuff: [1, 4, 5]

schema =
  list: from 'aListOfStuff', filters.array filters.isInteger, (n) -> "#{n}.0"

assert.deepEqual map(input, schema),
  list: ['1.0', '4.0', '5.0']
```
`filters.array` ensures that the value is an Array and applies the subsequent filters to each element of the value.


* `filters.object`
```coffeescript
input =
  someHash:
    a: 1
    b: 'hello!'
    c: ['blue', 'black']

schema =
  keys: from 'someHash', filters.object
    a: same, filters.isNumber
    b: same, filters.isString, (s) -> "**#{s}**"
    c: same, filters.array filters.isString

assert.deepEqual map(input, schema),
  keys:
    a: 1
    b: '**hello!**'
    a: ['blue', 'black']
```
`filters.object` creates a filter that passes the value through `cartography.map` with the given nested schema.


* `filters.assert`
```
isEven = filters.assert ((n) -> n % 2 is 0), 'must be even'
```
`filters.assert` returns a filter that asserts for the given condition, producing a CartographyError with the provided
message if the condition is not met.


* `filters.isOneOf`
```
isPrimaryColor = filters.isOneOf ['red', 'green', 'blue']
```
`filters.isOneOf` creates a filter that checks whether the value belongs to the given list.

