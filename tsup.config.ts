import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['aqua.ts'],
  format: ['esm', 'cjs'], // Build both formats
  dts: true,
  clean: true,
  outDir: 'dist',
  // This tells tsup to generate separate .mjs files for ESM
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
    };
  },
});