assert = require 'assert'
fs = require 'fs'
cartography = require '../index'


describe 'cartography', ->

  {map, mapArray, from, same, filters, isCartographyError, CartographyError} = cartography

  testSchema =
    id: same()
    name: from 'userName', filters.defaults(0), filters.isString
    base:
      color: from 'color.definition', filters.isString, (v) -> v.toUpperCase()
      type: -> 'default'
      time: (input) -> "#{input.day} - #{input.month}"
    failure: same filters.optional, filters.assert(((v) -> !v), (v) -> "#{v} should be falsy"), -> 'hello'

  anInput = ->
    id: 123
    userName: 'HappyLand'
    color:
      definition: '#7ff'
    day: 'Mon'
    month: 'Aug'

  theExpectedOutput = ->
    id: 123
    name: 'HappyLand'
    base:
      color: '#7FF'
      type: 'default'
      time: 'Mon - Aug'


  describe 'basic behaviour', ->

    it 'should translate a basic Object', ->
      assert.deepEqual map(anInput(), testSchema), theExpectedOutput()

    it 'should return null rather than an empty object', ->
      assert !map {}, unused: from 'nothing'

    it 'should reject strings as schema definitions', ->
      assert.throws (-> map {}, name: 'name'), /invalid schema for `name`/

    it 'should interrupt the chain if a defaulted value is not provided', ->
      input = anInput()
      delete input.userName
      output = map input, testSchema
      assert.equal output.name, 0

    it 'should follow the filter chain if an optional attribute is provided', ->
      input = anInput()
      input.failure = false

      expectedOutput = theExpectedOutput()
      expectedOutput.failure = 'hello'

      assert.deepEqual map(input, testSchema), expectedOutput

      input.failure = 'Whooop'
      assert.throws (-> map input, testSchema), /Whooop should be falsy/

    it 'should handle undeclared nested objects', ->
      assert.deepEqual map({}, a: from 'a.b.c.d'), undefined

    it 'should be unfazed by undefined input', ->
      assert.equal map(undefined, undefined), undefined
      assert.equal map(undefined, {}), undefined
      assert.equal map(undefined, a: same filters.optional), undefined


  describe 'array behaviour', ->

    it 'should translate an array', ->
      assert.deepEqual mapArray([1], [filters.isNumber, (v) -> v * 2]), [2]

    it 'should translate an array of objects', ->
      assert.deepEqual mapArray([anInput()], testSchema), [theExpectedOutput()]


  describe 'error reporting', ->

    it 'should produce a descriptive error', ->
      input =
        id: 123
        userName: 456

      try map input, testSchema
      catch err
        assert /userName: must be a string/.test err
        assert err instanceof CartographyError
        assert isCartographyError err
        return

      throw new Error 'no error produced'

    it 'should let normal errors pass', ->
      schema = id: same -> throw new Error 'BLAAAH!'
      try map {}, schema
      catch err
        assert !(err instanceof CartographyError)
        assert err instanceof Error
        assert /BLAAAH/.test err
        return

      throw new Error 'no error produced'

    it 'should produce a well-formatted error for nested attributes', ->
      input =
        id: '111'
        location:
          type: 'high noise'
          colors: [0, 11, '3']

      schema =
        id: same()
        address: from 'location', filters.object
          type: same()
          colors: same filters.array filters.isNumber

      assert.throws (-> map input, schema), /location.colors\[2\]: must be a number/


  describe 'helpers', ->

    f1 = -> 1
    f2 = -> 2
    f3 = -> 3


    describe 'isCartographyError()', ->

      it 'should work at least', ->
        assert isCartographyError new CartographyError
        assert !isCartographyError new Error


    describe 'same()', ->

      it 'should return a flat array', ->
        assert.deepEqual same(f3, [[f2], f1]), [f3, f2, f1]

      it 'should produce an error if a filter is invalid', ->
        assert.throws (-> same {}), /filter must be function or Array/


    describe 'from()', ->

      it 'should return a flat array', ->
        assert.deepEqual from('meh', [f1, f2], f3), ['meh', f1, f2, f3]

      it 'should produce an error if a filter is invalid', ->
        assert.throws (-> from 'meh', {}), /filter must be function or Array/

      it 'should produce an error if path is invalid', ->
        assert.throws (-> from (->)), /string/


  describe 'default filters', ->

    # Some filters are actualy filter factories.
    # For testing purposes it's ok to monkey-patch `filters` with a product of theirs:
    filters.isArrayOfInts = filters.array filters.isInteger
    filters.isVowel = filters.isOneOf ['a', 'e', 'i', 'o', 'u']
    filters.defaultsHi = filters.defaults 'Hi!'

    filterTestsByFilterName =

      required: [
        {input: '', output: '', verb: 'pass an empty string'}
        {input: null, error: /required/, verb: 'fail null'}
        {input: undefined, error: /required/, verb: 'reject undefined'}
      ]

      parseJSON: [
        {input: '{"A":1, "b":"2"}', output: {A: 1, b: '2'}, verb: 'pass valid JSON'}
        {input: '''{"A":1, "b":'2'}''', error: /invalid JSON/, verb: 'reject malformed JSON'}
      ]

      isString: [
        {input: 'b', output: 'b', verb: 'pass a string'}
        {input: 1, error: /string/, verb: 'reject a non-string'}
      ]

      isNumber: [
        {input: -.33, output: -.33, verb: 'pass a number'}
        {input: NaN, error: /number/, verb: 'reject NaN'}
        {input: '1', error: /number/, verb: 'reject a string that looks like a number'}
      ]

      isInteger: [
        {input: -3, output: -3, verb: 'pass a number'}
        {input: -.33, error: /integer/, verb: 'reject a decimal number'}
        {input: NaN, error: /number/, verb: 'reject NaN'}
        {input: '1', error: /number/, verb: 'reject a string that looks like a number'}
      ]

      isArrayOfInts: [
        {input: {}, error: /Array/, verb: 'reject Objects'}
        {input: (->), error: /Array/, verb: 'reject functions'}
        {input: '', error: /Array/, verb: 'reject strings'}
        {input: 1, error: /Array/, verb: 'reject numbers'}
        {input: [], output: [], verb: 'pass an empty Array'}
        {input: [1, 2, 3.1, 4, 5], error: /\[2\]/, verb: 'reject an array with a non-integer'}
        {input: [1, 2, 3, 4, 5], output: [1, 2, 3, 4, 5], verb: 'accept an array of ints'}
      ]

      isVowel: [
        {input: 'b', error: /value/, verb: 'rejects a consonant'}
        {input: 'e', output: 'e', verb: 'accepts an italian vowel'}
        {input: 'u', output: 'u', verb: 'accepts an italian vowel'}
      ]

      defaultsHi: [
        {input: undefined, error: /./, verb: 'overrides undefined'}
        {input: null, error: /./, verb: 'overrides null'}
        {input: '', output: '', verb: "passes ''"}
        {input: 0, output: 0, verb: 'passes 0'}
        {input: {}, output: {}, verb: 'passes {}'}
        {input: 11, output: 11, verb: 'passes 11'}
      ]


    # describe ->
    for filterName, tests of filterTestsByFilterName then do (filterName, tests) -> describe "#{filterName}()", ->

        # it ->
        for test in tests then do (test) -> it "should #{test.verb}", ->

          if test.error?
            assert.throws (-> filters[filterName](test.input)), test.error
          else
            assert.deepEqual filters[filterName](test.input), test.output ? test.input


  describe 'README.md', ->

    fs.readFileSync('./README.md').toString()
      .split('```javascript')[1..]
      .map((t) -> t.replace /```[\s\S]*/g, '')
      .forEach (snippet, index) ->
        describe "snipped #{index}", -> it 'should actually work', ->
          eval snippet
