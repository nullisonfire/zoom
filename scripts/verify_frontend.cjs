const fs = require('fs');
const path = require('path');
const babel = require('/usr/share/nodejs/@babel/core');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const frontendDir = path.resolve(__dirname, '../frontend/src');
const files = walk(frontendDir);

console.log(`Verifying and compiling ${files.length} frontend React TypeScript files...`);

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  try {
    babel.transformSync(code, {
      filename: path.basename(file),
      presets: [
        '/usr/share/nodejs/@babel/preset-typescript',
        '/usr/share/nodejs/@babel/preset-react',
      ],
    });
    console.log(`   ✓ ${path.relative(frontendDir, file)} compiled successfully`);
  } catch (err) {
    console.error(`   ✗ Error in ${file}:`, err.message);
    process.exit(1);
  }
}

console.log('\nAll frontend React TypeScript components compiled without error!');
