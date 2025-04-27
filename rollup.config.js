import typescript from 'typescript'
import json from '@rollup/plugin-json'
import { terser } from 'rollup-plugin-terser'
import typescript2 from 'rollup-plugin-typescript2'
import copy from 'rollup-plugin-copy'

import { dependencies } from './package.json'

const external = Object.keys(dependencies || '')
const globals = external.reduce((prev, current) => {
  const newPrev = prev

  newPrev[current] = current
  return newPrev
}, {})

const defaultConfig = [{
  input: './src/index.ts',
  output: {
    file: './dist/index.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser(),
    copy({
      targets: [
        { src: 'githooks', dest: 'dist' }
      ],
      verbose: true,
      hook: 'writeBundle'
    })
  ]
},{
  input: './src/index-install.ts',
  output: {
    file: './dist/index-install.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser()
  ]
},{
  input: './src/index-update.ts',
  output: {
    file: './dist/index-update.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser()
  ]
},{
  input: './src/index-branch.ts',
  output: {
    file: './dist/index-branch.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser()
  ]
},{
  input: './src/index-merge.ts',
  output: {
    file: './dist/index-merge.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser()
  ]
},{
  input: './src/index-release.ts',
  output: {
    file: './dist/index-release.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser()
  ]
},{
  input: './src/index-tag.ts',
  output: {
    file: './dist/index-tag.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser()
  ]
},{
  input: './src/index-dev.ts',
  output: {
    file: './dist/index-dev.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser()
  ]
},{
  input: './src/index-hooks.ts',
  output: {
    file: './dist/index-hooks.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    globals
  },
  external,
  plugins: [
    typescript2({
      exclude: 'node_modules/**',
      useTsconfigDeclarationDir: true,
      typescript,
      tsconfig: './tsconfig.json'
    }),
    json(),
    terser()
  ]
}]

export default defaultConfig