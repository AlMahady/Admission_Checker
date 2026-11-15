import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode})=>{
  const apiOrigin=loadEnv(mode,process.cwd(),'VITE_').VITE_API_ORIGIN||'http://127.0.0.1:3001';
  if(!/^https?:\/\/[a-zA-Z0-9.:-]+$/.test(apiOrigin))throw new Error('VITE_API_ORIGIN must be an HTTP(S) origin');
  return {
    plugins: [react(),{name:'api-csp-origin',transformIndexHtml:html=>html.replace('__API_ORIGIN__',apiOrigin)}],
    resolve: { alias: [{ find: /^react-native$/, replacement: 'react-native-web' }] },
    base: './',
    build: { outDir: 'dist' },
    test: { environment: 'node', exclude: ['dist-api/**','dist/**','release/**','node_modules/**'] }
  };
});
