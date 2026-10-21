/**
 * Start the dev server with process.cwd() set to the project root,
 * so Create React App always finds .env.local (same folder as package.json).
 * Use: npm start (which runs this script).
 */

const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const reactScriptsBin = path.join(projectRoot, 'node_modules', 'react-scripts', 'bin', 'react-scripts.js');

const child = spawn(
  process.execPath,
  [reactScriptsBin, 'start'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  }
);

child.on('exit', (code) => {
  process.exit(code != null ? code : 0);
});
