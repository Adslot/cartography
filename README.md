Cartography
===========

[![Build Status](https://secure.travis-ci.org/Adslot/cartography.png?branch=master)](http://travis-ci.org/Adslot/cartography)

Javascript Object to Object mapper

Cartography takes an input Object and translates it into a new Object with a
different structure according to a schema.
It can also be used for validating input structures.

```coffeescript
{same, from, map, filters, CartographyError} = require 'cartography'
{required, isInteger, isOneOf} = filter

isPositive = (v) -> if v > 0 then v else throw new CartographyError 'must be positive'

cartographyUserSchema =
  id: same isInteger
  username: from 'email', required, (s) -> s.toLowerCase()
  password: same required, isString
  provider: -> 'Adslot'
  maxShare: from 'sales.salePercentage', parseInt, isInteger, isPositive
  address:
    streetName: from 'addressStreet', required, isString
    streetNumber: from 'addressNumber', required, isString
    state: from 'addressState', isOneOf ['QLD', 'SA', 'ACT', 'NSW', 'VIC']

userInDBFormat = map userInTransferFormat, cartographyUserSchema
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

Some filters are provided in the `filters` Object.


**Custom functions** are passed the input Object as argument and their output
is used as final value for the output attribute.
```
cartographyCarSchema =
  manifacturer: -> 'Adslot'
  name: (car) -> "#{car.model} #{car.variant}"
```


Example usage
-------------
```
inputUser =
  id: 3
  email: 'joe.lizard@reptiles.com'
  password: '12345'
  sales:
    saleCount: 56
    salePercentage: 23
  addressStreet: 'rock st'
  addressNumber: '21/a'
  addressState: 'VIC'

outputUser = map cartographyUserSchema, inputUser

 * outputUser will yield:
  id: 3
  username: 'joe.lizard@reptiles.com'
  password: '12345'
  provider: 'Adslot'
  maxShare: 23
  address:
    streetName: 'rock st'
    streetNumber: '21/a'
    state: 'VIC'
```

If `inputUser` contained no `sales` attribute or no `salePercentage` within
`sales`, `map()` would throw a `CartographyError` with a
"sales.salePercentage: is required" `message`.


Asynchronous version
--------------------
`asyncMap` is a fully asynchronous version of `map`, which will return
`CartographyError`s to the provided callback instead of throwing them.
In addition to the usual synchronous filters and custom functions, `asyncMap`
can use asynchronous filters and asynchronous custom functions provided they
are wrapped by the `async` function decorator.
The `asyncArray` filter should also be used in place of `array`.



TODO
----
Improve this README
