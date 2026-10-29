/**
 * 构建浏览器半：把 src/client 打成 DSH 的 closure-factory 产物 lib/client.js。
 *
 * 目标格式（与官方 client bundle 一致）：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ...; return module.exports } })
 *
 * React 与 @deepseek-ai/* 一律外置，由宿主的模块表通过 require 提供。
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'lib/client.js');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

const result = await build({
  entryPoints: [resolve(root, 'src/client/index.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // 宿主模块表提供的运行时：框架本体与所有 @deepseek-ai 包都不打包
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', '@deepseek-ai/*'],
  sourcemap: false,
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
});

const body = result.outputFiles[0].text.trimEnd();
const indented = body.split('\n').map((line) => (line.length ? `\t\t${line}` : line)).join('\n');

const wrapped = [
  'window.__ModuleLoader__.load({',
  `\tid: ${JSON.stringify(pkg.name)},`,
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  indented,
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '',
].join('\n');

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, wrapped);
console.log(`client bundle: ${outFile} (${String(Buffer.byteLength(wrapped))} bytes)`);

// The standalone page and Harness panel share the exact same components.
await build({
  entryPoints: [resolve(root, 'src/client/standalone.tsx')],
  outfile: resolve(root, 'lib/standalone.js'),
  bundle: true, format: 'iife', platform: 'browser', target: 'es2022', jsx: 'automatic',
  minify: true, define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none',
});
