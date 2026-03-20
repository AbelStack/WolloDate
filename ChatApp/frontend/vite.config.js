import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

const useHttps = process.env.VITE_USE_HTTPS === 'true';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https: useHttps,
    proxy: {
      "/api": "http://localhost:8000",
      "/storage": "http://localhost:8000",
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      }
    }
  },
  build: {
    minify: false
  }
});
