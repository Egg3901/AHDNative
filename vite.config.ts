import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let revision = 'development';
try {
  revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Source archives can still run locally without Git metadata.
}

export default defineConfig({
  define: { __AHD_BUILD_LABEL__: JSON.stringify(`Preview ${version} · ${revision}`) },
  build: { target: ['chrome107', 'safari16.4'] },
});
