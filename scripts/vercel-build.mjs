import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const output = join(root, 'dist');
const exportedAssets = join(output, 'assets', 'node_modules');
const publicFonts = join(output, 'assets', 'fonts');
const publicIcons = join(output, 'assets', 'icons');

rmSync(output, { recursive: true, force: true });
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], { cwd: root, stdio: 'inherit' });
mkdirSync(publicFonts, { recursive: true });
mkdirSync(publicIcons, { recursive: true });

const copyFiles = (source, destination) => {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    if (entry.isDirectory()) copyFiles(sourcePath, destination);
    else if (entry.name.endsWith('.ttf')) cpSync(sourcePath, join(destination, entry.name));
  }
};

copyFiles(join(exportedAssets, '@expo-google-fonts', 'manrope'), publicFonts);
copyFiles(join(exportedAssets, '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'Fonts'), publicIcons);
cpSync(join(root, 'public'), output, { recursive: true });

const bundleDir = join(output, '_expo', 'static', 'js', 'web');
for (const file of readdirSync(bundleDir).filter((name) => name.endsWith('.js'))) {
  const bundlePath = join(bundleDir, file);
  const bundle = readFileSync(bundlePath, 'utf8')
    .replace(/assets\/node_modules\/@expo-google-fonts\/manrope\/[^/]+\//g, 'assets/fonts/')
    .replaceAll('assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/', 'assets/icons/');
  writeFileSync(bundlePath, bundle);
}

console.log(`Prepared ${relative(root, publicFonts)}, ${relative(root, publicIcons)}, privacy, and account-deletion pages for Vercel.`);
