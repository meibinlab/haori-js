import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Haori',
      formats: ['es', 'cjs', 'iife'],
      fileName: fmt => `haori.${fmt}.js`,
    },
    sourcemap: true,
    rollupOptions: {
      external: [],
      output: {
        // Ensure Rollup uses named exports for the CJS bundle to avoid
        // consumers needing to access `.default` when requiring the package.
        exports: 'named',
      },
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
      insertTypesEntry: true,
    }),
  ],
});
