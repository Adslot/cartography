const assert = require('assert');
const cartography = require('../index');

describe('cartography', function () {
  const { map, mapArray, from, same, filters, isCartographyError, CartographyError } = cartography;

  const testSchema = {
    id: same(),
    name: from('userName', filters.defaults(0), filters.isString),
    base: {
      color: from('color.definition', filters.isString, (v) => v.toUpperCase()),
      type() {
        return 'default';
      },
      time(input) {
        return `${input.day} - ${input.month}`;
      },
    },
    failure: same(
      filters.optional,
      filters.assert(
        (v) => !v,
        (v) => `${v} should be falsy`
      ),
      () => 'hello'
    ),
  };

  const anInput = () => ({
    id: 123,
    userName: 'HappyLand',

    color: {
      definition: '#7ff',
    },

    day: 'Mon',
    month: 'Aug',
  });

  const theExpectedOutput = () => ({
    id: 123,
    name: 'HappyLand',

    base: {
      color: '#7FF',
      type: 'default',
      time: 'Mon - Aug',
    },
  });

  describe('basic behaviour', function () {
    it('should translate a basic Object', () =>
      assert.deepStrictEqual(map(anInput(), testSchema), theExpectedOutput()));

    it('should return null rather than an empty object', () => assert(!map({}, { unused: from('nothing') })));

    it('should reject strings as schema definitions', () =>
      assert.throws(() => map({}, { name: 'name' }), /invalid schema for `name`/));

    it('should interrupt the chain if a defaulted value is not provided', function () {
      const input = anInput();
      delete input.userName;
      const output = map(input, testSchema);
      assert.strictEqual(output.name, 0);
    });

    it('should follow the filter chain if an optional attribute is provided', function () {
      const input = anInput();
      input.failure = false;

      const expectedOutput = theExpectedOutput();
      expectedOutput.failure = 'hello';

      assert.deepStrictEqual(map(input, testSchema), expectedOutput);

      input.failure = 'Whooop';
      assert.throws(() => map(input, testSchema), /Whooop should be falsy/);
    });

    it('should handle undeclared nested objects', () =>
      assert.deepStrictEqual(map({}, { a: from('a.b.c.d') }), undefined));

    it('should be unfazed by undefined input', function () {
      assert.strictEqual(map(undefined, undefined), undefined);
      assert.strictEqual(map(undefined, {}), undefined);
      assert.strictEqual(map(undefined, { a: same(filters.optional) }), undefined);
    });
  });

  describe('array behaviour', function () {
    it('should translate an array', () => assert.deepStrictEqual(mapArray([1], [filters.isNumber, (v) => v * 2]), [2]));

    it('should translate an array with array filters', () =>
      assert.deepStrictEqual(
        mapArray([1, 2], [filters.isNumber, (v) => v * 2], [(array) => array.filter((v) => v % 2 === 0)]),
        [4]
      ));

    it('should translate an array of objects', () =>
      assert.deepStrictEqual(mapArray([anInput()], testSchema), [theExpectedOutput()]));

    it('should be able to handle undefined result', () =>
      assert.strictEqual(mapArray([], testSchema, [() => undefined, filters.optional]), undefined));
  });

  describe('error reporting', function () {
    it('should produce a descriptive error', function () {
      const input = {
        id: 123,
        userName: 456,
      };

      try {
        map(input, testSchema);
      } catch (err) {
        assert(/userName: must be a string/.test(err));
        assert(err instanceof CartographyError);
        assert(isCartographyError(err));
        return;
      }

      throw new Error('no error produced');
    });

    it('should let normal errors pass', function () {
      const schema = {
        id: same(function () {
          throw new Error('BLAAAH!');
        }),
      };
      try {
        map({}, schema);
      } catch (err) {
        assert(!(err instanceof CartographyError));
        assert(err instanceof Error);
        assert(/BLAAAH/.test(err));
        return;
      }

      throw new Error('no error produced');
    });

    it('should produce a well-formatted error for nested attributes', function () {
      const input = {
        id: '111',
        location: {
          type: 'high noise',
          colors: [0, 11, '3'],
        },
      };

      const schema = {
        id: same(),
        address: from(
          'location',
          filters.object({
            type: same(),
            colors: same(filters.array(filters.isNumber)),
          })
        ),
      };

      assert.throws(() => map(input, schema), /location.colors\[2\]: must be a number/);
    });
  });

  describe('helpers', function () {
    const f1 = () => 1;
    const f2 = () => 2;
    const f3 = () => 3;

    describe('isCartographyError()', () =>
      it('should work at least', function () {
        assert(isCartographyError(new CartographyError()));
        assert(!isCartographyError(new Error()));
      }));

    describe('same()', function () {
      it('should return a flat array', () => assert.deepStrictEqual(same(f3, [[f2], f1]), [f3, f2, f1]));

      it('should produce an error if a filter is invalid', () =>
        assert.throws(() => same({}), /filter must be function or Array/));
    });

    describe('from()', function () {
      it('should return a flat array', () => assert.deepStrictEqual(from('meh', [f1, f2], f3), ['meh', f1, f2, f3]));

      it('should produce an error if a filter is invalid', () =>
        assert.throws(() => from('meh', {}), /filter must be function or Array/));

      it('should produce an error if path is invalid', () => assert.throws(() => from(function () {}), /string/));
    });
  });

  describe('default filters', function () {
    // Some filters are actualy filter factories.
    // For testing purposes it's ok to monkey-patch `filters` with a product of theirs:
    filters.isArrayOfInts = filters.array(filters.isInteger);
    filters.isVowel = filters.isOneOf(['a', 'e', 'i', 'o', 'u']);
    filters.defaultsHi = filters.defaults('Hi!');

    const filterTestsByFilterName = {
      required: [
        { input: '', output: '', verb: 'pass an empty string' },
        { input: null, error: /required/, verb: 'fail null' },
        { input: undefined, error: /required/, verb: 'reject undefined' },
      ],

      parseJSON: [
        { input: '{"A":1, "b":"2"}', output: { A: 1, b: '2' }, verb: 'pass valid JSON' },
        { input: '{"A":1, "b":\'2\'}', error: /invalid JSON/, verb: 'reject malformed JSON' },
      ],

      isString: [
        { input: 'b', output: 'b', verb: 'pass a string' },
        { input: 1, error: /string/, verb: 'reject a non-string' },
      ],

      isNumber: [
        { input: -0.33, output: -0.33, verb: 'pass a number' },
        { input: NaN, error: /number/, verb: 'reject NaN' },
        { input: '1', error: /number/, verb: 'reject a string that looks like a number' },
      ],

      isInteger: [
        { input: -3, output: -3, verb: 'pass a number' },
        { input: -0.33, error: /integer/, verb: 'reject a decimal number' },
        { input: NaN, error: /number/, verb: 'reject NaN' },
        { input: '1', error: /number/, verb: 'reject a string that looks like a number' },
      ],

      isEmail: [
        { input: 'name@test.com', output: 'name@test.com', verb: 'pass an email' },
        { input: 'name.extra@test.com', output: 'name.extra@test.com', verb: 'pass an email with period' },
        { input: 'name+extra@test.com', output: 'name+extra@test.com', verb: 'pass an email with +' },
        { input: 'name@sub.test.com', output: 'name@sub.test.com', verb: 'pass an email with subdomain' },
        { input: 'name@sub.test.qwe', output: 'name@sub.test.qwe', verb: 'pass an email any domain' },
        { input: 'name@[203.203.203.203]', output: 'name@[203.203.203.203]', verb: 'pass an email with ip address' },
        { input: null, error: /must be a valid email address/, verb: 'reject null' },
        { input: undefined, error: /must be a valid email address/, verb: 'reject undefined' },
        { input: '', error: /must be a valid email address/, verb: 'reject empty string' },
        { input: 'just_a_string', error: /must be a valid email address/, verb: 'reject just a string' },
        {
          input: 'name@[203.203.203.2031]',
          error: /must be a valid email address/,
          verb: 'reject an email with invalid ip address',
        },
        {
          input: 'name@203.203.203.203',
          error: /must be a valid email address/,
          verb: 'reject an email with ip address without brackets',
        },
        {
          input: 'name@test',
          error: /must be a valid email address/,
          verb: 'reject an email with no domain extension',
        },
        {
          input: 'name@test++.com',
          error: /must be a valid email address/,
          verb: 'reject an email with invalid domain',
        },
      ],

      isUrl: [
        { input: 'http://test.com', output: 'http://test.com', verb: 'pass a http url' },
        { input: 'https://test.com', output: 'https://test.com', verb: 'pass a https url' },
        { input: 'https://www.test.com', output: 'https://www.test.com', verb: 'pass a https url with www' },
        { input: 'https://sub.test.com', output: 'https://sub.test.com', verb: 'pass an url with subdomain' },
        { input: 'https://test.com/', output: 'https://test.com/', verb: 'pass an url with trailing slash' },
        {
          input: 'https://www.test.com.au',
          output: 'https://www.test.com.au',
          verb: 'pass an url with double extenstion',
        },
        { input: 'https://test.com:3000', output: 'https://test.com:3000', verb: 'pass an url with port' },
        { input: 'https://203.203.203.203', output: 'https://203.203.203.203', verb: 'pass an url ip address' },
        { input: 'https://test.com/#id', output: 'https://test.com/#id', verb: 'pass an url with anchor' },
        { input: 'https://test.com/#!id', output: 'https://test.com/#!id', verb: 'pass an url with hashbang' },
        {
          input: 'https://test.com/path/subpath',
          output: 'https://test.com/path/subpath',
          verb: 'pass an url with path',
        },
        {
          input: 'https://test.com/path/subpath?query=string',
          output: 'https://test.com/path/subpath?query=string',
          verb: 'pass an url with path and query string',
        },
        {
          input: 'https://test.com/path/subpath?query=string#id',
          output: 'https://test.com/path/subpath?query=string#id',
          verb: 'pass an url with path, query string and anchor',
        },
        {
          input: 'https://test.com/path/subpath?query=some%20string',
          output: 'https://test.com/path/subpath?query=some%20string',
          verb: 'pass an url with query string (encoded)',
        },
        { input: null, error: /must be a valid URL/, verb: 'reject null' },
        { input: undefined, error: /must be a valid URL/, verb: 'reject undefined' },
        { input: '', error: /must be a valid URL/, verb: 'reject empty string' },
        { input: 'just_a_string', error: /must be a valid URL/, verb: 'reject just a string' },
        {
          input: 'https://test.com/path/subpath?query=some string',
          error: /must be a valid URL/,
          verb: 'reject an url with query string (not encoded)',
        },
      ],

      isArrayOfInts: [
        { input: {}, error: /Array/, verb: 'reject Objects' },
        { input() {}, error: /Array/, verb: 'reject functions' },
        { input: '', error: /Array/, verb: 'reject strings' },
        { input: 1, error: /Array/, verb: 'reject numbers' },
        { input: [], output: [], verb: 'pass an empty Array' },
        { input: [1, 2, 3.1, 4, 5], error: /\[2\]/, verb: 'reject an array with a non-integer' },
        { input: [1, 2, 3, 4, 5], output: [1, 2, 3, 4, 5], verb: 'accept an array of ints' },
      ],

      isVowel: [
        { input: 'b', error: /value/, verb: 'rejects a consonant' },
        { input: 'e', output: 'e', verb: 'accepts an italian vowel' },
        { input: 'u', output: 'u', verb: 'accepts an italian vowel' },
      ],

      defaultsHi: [
        { input: undefined, error: /./, verb: 'overrides undefined' },
        { input: null, error: /./, verb: 'overrides null' },
        { input: '', output: '', verb: "passes ''" },
        { input: 0, output: 0, verb: 'passes 0' },
        { input: {}, output: {}, verb: 'passes {}' },
        { input: 11, output: 11, verb: 'passes 11' },
      ],
    };

    // describe ->
    return (() => {
      const result = [];
      for (let filterName in filterTestsByFilterName) {
        const filterTests = filterTestsByFilterName[filterName];
        result.push(
          ((name, tests) =>
            describe(`${name}()`, () =>
              // it ->
              Array.from(tests).map((filterTest) =>
                ((test) =>
                  it(`should ${test.verb}`, function () {
                    if (test.error != null) {
                      return assert.throws(() => filters[name](test.input), test.error);
                    } else {
                      return assert.deepStrictEqual(
                        filters[name](test.input),
                        test.output != null ? test.output : test.input
                      );
                    }
                  }))(filterTest)
              )))(filterName, filterTests)
        );
      }
      return result;
    })();
  });
});
