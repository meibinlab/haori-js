import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Haori',
      formats: ['es', 'cjs'],
      fileName: fmt => `haori.${fmt}.js`,
    },
    sourcemap: true,
    rollupOptions: {
      external: [],
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
      insertTypesEntry: true,
    }),
  ],
});
