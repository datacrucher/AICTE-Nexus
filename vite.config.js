import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// In development the browser calls /api on the Vite origin and Vite forwards it to the FastAPI backend (no CORS needed).
export default defineConfig({ plugins: [react()], server: { proxy: { '/api': { target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000', changeOrigin: true } } } })
