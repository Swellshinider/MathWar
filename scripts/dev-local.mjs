import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

function start(label, args) {
  const child = spawn(npmCommand, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
  });
  children.push(child);

  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChildren(child);
    process.exitCode = code ?? (signal ? 1 : 0);
  });

  return child;
}

function stopChildren(except) {
  for (const child of children) {
    if (child === except || child.killed) continue;
    child.kill('SIGTERM');
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChildren();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start('server', ['run', 'server:dev:memory']);
start('ui', ['start', '--', '--host', '127.0.0.1']);
