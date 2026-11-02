import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) await checkDirectory(path);
    else if (/\.(js|mjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(path)], {
        stdio: 'inherit'
      });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
for (const folder of ['api/', 'server/', 'scripts/', 'public/']) {
  await checkDirectory(new URL(`../${folder}`, import.meta.url));
}
console.log('JavaScript syntax checks passed.');
