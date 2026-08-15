import type { NextConfig } from 'next';
import dotenv from 'dotenv';

// Load .env into process.env (dotenv.populate is used internally to inject)
dotenv.config({ path: '.env', override: true });

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    PROJECT_ID: process.env.HAPPYSEEDS_PROJECT_ID ?? '',
    REACTUS_BASE_URL: process.env.REACTUS_BASE_URL ?? '',
  },
  serverExternalPackages: [
    '@whiskeysockets/baileys',
    'blake3-wasm',
    'libsignal',
    'jimp',
    'sharp',
    'music-metadata',
    'pino',
  ],
  allowedDevOrigins: [
    '**.*.*',
  ],
};

export default nextConfig;
