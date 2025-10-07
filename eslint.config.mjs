import eslintConfigAdslot from 'eslint-config-adslot';
import globals from 'globals';

export default [
  ...eslintConfigAdslot,
  {
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
      sourceType: 'commonjs',
    },
  },
];
