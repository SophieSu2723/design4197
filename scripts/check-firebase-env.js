/**
 * Debug script: check if Firebase env vars are present in .env.local / .env.
 * Run from project root: node scripts/check-firebase-env.js
 * (Or: npm run check-firebase-env)
 * Does not print secret values, only which variable names are set or missing.
 */

const fs = require('fs');
const path = require('path');

const REQUIRED = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID',
];

function findProjectRoot(dir) {
  const candidate = path.join(dir, 'package.json');
  if (fs.existsSync(candidate)) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return null;
  return findProjectRoot(parent);
}

function parseEnvFile(content) {
  const out = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const projectRoot = findProjectRoot(__dirname) || findProjectRoot(process.cwd());
if (!projectRoot) {
  console.error('Could not find project root (folder containing package.json).');
  process.exit(1);
}

console.log('Project root:', projectRoot);
console.log('');

const env = {};
for (const name of ['.env', '.env.local']) {
  const filePath = path.join(projectRoot, name);
  if (fs.existsSync(filePath)) {
    console.log('Found:', name);
    const content = fs.readFileSync(filePath, 'utf8');
    Object.assign(env, parseEnvFile(content));
  } else {
    console.log('Not found:', name);
  }
}
console.log('');

const found = [];
const missing = [];
for (const key of REQUIRED) {
  const val = env[key];
  if (val != null && String(val).trim() !== '') {
    found.push(key);
  } else {
    missing.push(key);
  }
}

console.log('Firebase env check:', found.length + '/' + REQUIRED.length, 'variables set');
if (missing.length) {
  console.log('Missing (or empty):', missing.join(', '));
  console.log('');
  console.log('Fix: ensure these are in .env.local or .env in the project root.');
  console.log('Then restart the dev server: npm start');
  process.exit(1);
} else {
  console.log('All required variables are set. If the app still says "not configured",');
  console.log('restart the dev server (Ctrl+C, then npm start) from this folder.');
  process.exit(0);
}
