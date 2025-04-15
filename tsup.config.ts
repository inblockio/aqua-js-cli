import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['aqua.ts'],
  format: ['cjs'],
  clean: true,
  dts: true,
  splitting: false,
  sourcemap: true,
  minify: true,
  target: 'node18',
  outDir: 'dist',
  noExternal: ['aqua-js-sdk'],
});