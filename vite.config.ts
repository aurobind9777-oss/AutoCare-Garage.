import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const REQUIRED_FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_FIRESTORE_DATABASE_ID',
] as const;

const ENV_TO_APPLET_KEY: Record<(typeof REQUIRED_FIREBASE_ENV_KEYS)[number], string> = {
  VITE_FIREBASE_API_KEY: 'apiKey',
  VITE_FIREBASE_AUTH_DOMAIN: 'authDomain',
  VITE_FIREBASE_PROJECT_ID: 'projectId',
  VITE_FIREBASE_STORAGE_BUCKET: 'storageBucket',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'messagingSenderId',
  VITE_FIREBASE_APP_ID: 'appId',
  VITE_FIREBASE_FIRESTORE_DATABASE_ID: 'firestoreDatabaseId',
};

function validateProductionFirebaseConfig(mode: string) {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  const appletConfigPath = path.resolve(import.meta.dirname, 'firebase-applet-config.json');
  let localAppletConfig: Record<string, unknown> = {};

  if (fs.existsSync(appletConfigPath)) {
    try {
      localAppletConfig = JSON.parse(fs.readFileSync(appletConfigPath, 'utf8')) as Record<string, unknown>;
    } catch {
      localAppletConfig = {};
    }
  }

  const missingKeys = REQUIRED_FIREBASE_ENV_KEYS.filter((envKey) => {
    const envVal = (env[envKey] || process.env[envKey] || '').trim();
    const localVal = String(localAppletConfig[ENV_TO_APPLET_KEY[envKey]] || '').trim();
    return !envVal && !localVal;
  });

  if (missingKeys.length > 0) {
    throw new Error(
      [
        '',
        '[AutoCare Garage Build Error] Missing required Firebase client configuration for production build:',
        ...missingKeys.map((k) => `  - ${k}`),
        '',
        'Add these VITE_FIREBASE_* environment variables in Vercel Project Settings -> Environment Variables',
        '(enable Production and Preview scopes), or provide them in a local .env file, then redeploy without build cache.',
        '',
      ].join('\n'),
    );
  }
}

export default defineConfig(({command, mode}) => {
  if (command === 'build') {
    validateProductionFirebaseConfig(mode);
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
