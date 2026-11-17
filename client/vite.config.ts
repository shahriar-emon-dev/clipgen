import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const customLogger = createLogger();
const originalError = customLogger.error.bind(customLogger);

customLogger.error = (msg, options) => {
  // Suppress expected client socket disconnect / reconnect / refused errors from Vite WS proxy on Windows
  if (
    typeof msg === 'string' &&
    (msg.includes('ws proxy') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ECONNABORTED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('EPIPE'))
  ) {
    return;
  }
  if (
    options?.error &&
    typeof options.error === 'object'
  ) {
    const errObj = options.error as any;
    const errCode = errObj.code;
    const isConnRefused =
      errCode === 'ECONNREFUSED' ||
      (errObj.errors && Array.isArray(errObj.errors) && errObj.errors.some((e: any) => e.code === 'ECONNREFUSED'));
    if (isConnRefused || ['ECONNABORTED', 'ECONNRESET', 'EPIPE'].includes(errCode)) {
      return;
    }
  }
  originalError(msg, options);
};

export default defineConfig({
  customLogger,
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
        },
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
          proxy.on('proxyReqWsError', () => {});
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', () => {});
          });
        },
      },
    },
  },
});
