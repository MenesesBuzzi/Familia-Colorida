// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/functions/*'],
  },
  {
    // As telas carregam dados do Supabase dentro de useEffect (padrão clássico de fetch).
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
]);
