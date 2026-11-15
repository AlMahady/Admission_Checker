import { spawn } from 'node:child_process';
import { cp, copyFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackage } from '@electron/asar';

if (process.platform !== 'win32') throw new Error('Windows packaging requires Windows');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'release');
const stage = path.join(output, 'stage');
const unpacked = path.join(output, 'win-unpacked');
const insideWorkspace = target => {
  const relative = path.relative(root, path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing to modify outside workspace: ${target}`);
  return target;
};

await mkdir(output, { recursive: true });
await rm(insideWorkspace(stage), { recursive: true, force: true });
await rm(insideWorkspace(unpacked), { recursive: true, force: true });
await mkdir(path.join(stage, 'apps', 'desktop'), { recursive: true });
await cp(path.join(root, 'node_modules', 'electron', 'dist'), unpacked, { recursive: true });
await rm(path.join(unpacked, 'debug.log'), { force: true });
await cp(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
await cp(path.join(root, 'apps', 'desktop', 'electron'), path.join(stage, 'apps', 'desktop', 'electron'), { recursive: true });
await copyFile(path.join(root, 'package.json'), path.join(stage, 'package.json'));
await rm(path.join(unpacked, 'resources', 'default_app.asar'));
await rename(path.join(unpacked, 'electron.exe'), path.join(unpacked, 'JU Admission Checker.exe'));
await createPackage(stage, path.join(unpacked, 'resources', 'app.asar'));
await rm(insideWorkspace(stage), { recursive: true });

const builder = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [builder, '--win', 'nsis', '--prepackaged', unpacked], { cwd: root, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => resolve(code));
});
if (code !== 0) process.exit(code || 1);
