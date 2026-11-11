import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Onde o Vite vai procurar o ficheiro .env. 
  // '..' significa "uma pasta acima", ou seja, a raiz do projeto.
  const envDir = path.resolve(__dirname, '..'); 

  // Carrega as variáveis da pasta raiz
  const env = loadEnv(mode, envDir, '');

  // The desktop build is served by the backend itself, and never gets the values of the .env file.
  const isDesktop = mode === 'desktop';

  return {
    // --- ADICIONA ESTA LINHA ---
    envDir: envDir, 
    // ---------------------------
    
    plugins: [
      react(), 
      svgr({ 
        svgrOptions: { icon: true }
      })
    ],
    resolve: {
      alias: {
        src: path.resolve(__dirname, './src'),
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
          // Agora ele consegue ler a variável que está na pasta raiz!
          target: env.REACT_APP_API_BASE_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    test: {
      // App.test.js is the Create React App boilerplate (JSX in a .js file, "learn react" link); it never ran here.
      exclude: ['node_modules/**', 'build/**', 'src/App.test.js'],
    },
    build: {
      outDir: 'build',
      sourcemap: !isDesktop,
    },
    define: {
      'process.env': isDesktop
        ? { REACT_APP_API_BASE_URL: '/', NODE_ENV: 'production' }
        : env
    }
  };
});