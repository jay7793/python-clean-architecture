import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const inwardOnly = 'Dependencies point inward: ui -> application -> domain. Wire adapters in src/main.tsx.'

const frameworkImports = [
  { group: ['react', 'react-*', 'react/*', '@base-ui/*', 'lucide-react', 'zod'], message: 'domain and application stay framework-free.' },
  { group: ['openapi-fetch'], message: 'HTTP lives in infrastructure.' },
  { group: ['**/infrastructure/**', '**/ui/**'], message: inwardOnly },
]

const browserGlobals = ['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator', 'location'].map(
  (name) => ({ name, message: 'domain and application cannot touch the DOM or the network.' }),
)

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: frameworkImports }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...frameworkImports, { group: ['**/application/**'], message: inwardOnly }] }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/infrastructure/**'], message: inwardOnly }] }],
    },
  },
)
