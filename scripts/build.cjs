const fs = require('fs');
const path = require('path');
const babel = require('/usr/share/nodejs/@babel/core');

const srcDir = path.resolve(__dirname, '../worker/src');
const outDir = path.resolve(__dirname, '../dist/worker');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts'));

console.log(`Compiling ${files.length} TypeScript files from worker/src...`);

for (const file of files) {
  const filePath = path.join(srcDir, file);
  const code = fs.readFileSync(filePath, 'utf8');

  const transformed = babel.transformSync(code, {
    filename: file,
    presets: [
      '/usr/share/nodejs/@babel/preset-typescript',
      ['/usr/share/nodejs/@babel/preset-env', { targets: { node: 'current' } }],
    ],
  });

  const outFileName = file.replace(/\.ts$/, '.js');
  const outFilePath = path.join(outDir, outFileName);
  fs.writeFileSync(outFilePath, transformed.code, 'utf8');
  console.log(` Transpiled: ${file} -> dist/worker/${outFileName}`);
}

console.log('Build completed successfully.');
