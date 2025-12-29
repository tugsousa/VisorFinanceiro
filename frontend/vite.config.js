import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(), 
      svgr({ 
        svgrOptions: { icon: true }
      })
    ],
    resolve: {
      alias: {
        src: path.resolve(__dirname, './src'),
        // Explicit aliases to match your current jsconfig/imports
        features: path.resolve(__dirname, './src/features'),
        lib: path.resolve(__dirname, './src/lib'),
        constants: path.resolve(__dirname, './src/constants.js'),
        components: path.resolve(__dirname, './src/components'),
        layouts: path.resolve(__dirname, './src/layouts'),
      },
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: env.REACT_APP_API_BASE_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      outDir: 'build', // Keeps the output folder name consistent with CRA
      sourcemap: true,
    },
    // This allows you to keep using process.env.REACT_APP_... in your code
    define: {
      'process.env': env
    }
  };
});