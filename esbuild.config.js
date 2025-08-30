import * as esbuild from 'esbuild';
import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import { mkdir, copyFile } from 'fs/promises';

const isServe = process.argv.includes('--serve');
const buildConfig = {
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  logLevel: 'info',
  color: true,
  outdir: 'dist',
  plugins: [buildZIP()]
};

// Main function to handle both serve and production builds
(async function () {
  if (isServe) {
    console.log('\nStarting development server...');

    // Watch and Serve Mode
    const ctx = await esbuild.context(buildConfig);

    await ctx.watch();
    const { host, port } = await ctx.serve({
      servedir: '.',
      port: 3000
    });
  } else {
    console.log('\nBuilding for production...');
    await esbuild.build(buildConfig);
    console.log('\nProduction build complete.');
  }
})();

function buildZIP(options = {}) {
  const { jsonPath = './plugin.json', outDir = 'dist', createZip = true, zipFileName = null } = options;

  return {
    name: 'build-zip',
    setup(build) {
      build.onEnd(async result => {
        if (result.errors.length > 0) return;

        try {
          const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

          await ensureDir(outDir);

          await copyFile(jsonPath, path.join(outDir, path.basename(jsonPath)));
          console.log(`✅ Copied ${jsonPath} to ${outDir}`);

          if (jsonContent.readme) await copyFileIfExists(jsonContent.readme, path.join(outDir, path.basename(jsonContent.readme)));
          if (jsonContent.changelog) await copyFileIfExists(jsonContent.changelog, path.join(outDir, path.basename(jsonContent.changelog)));
          if (jsonContent.icon) await copyFileIfExists(jsonContent.icon, path.join(outDir, path.basename(jsonContent.icon)));

          if (Array.isArray(jsonContent.files) && jsonContent.files.length > 0) {
            for (const file of jsonContent.files) {
              if (typeof file === 'string') {
                await copyFileIfExists(file, path.join(outDir, path.basename(file)));
              } else if (typeof file === 'object' && file.path) {
                const destPath = file.dest || path.basename(file.path);
                const fullDestPath = path.join(outDir, destPath);

                await ensureDir(path.dirname(fullDestPath));
                await copyFileIfExists(file.path, fullDestPath);
              }
            }
          }

          if (createZip) {
            const zipName = zipFileName || `${jsonContent.id || 'package'}-${jsonContent.version || '1.0.0'}.zip`;
            await createZipArchive(outDir, zipName);
          }

          console.log('📦 All files processed successfully');
        } catch (error) {
          console.error('Error in build Zip:', error);
        }
      });

      async function ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
          await mkdir(dirPath, { recursive: true });
        }
      }

      async function copyFileIfExists(src, dest) {
        try {
          if (fs.existsSync(src)) {
            await ensureDir(path.dirname(dest));
            await copyFile(src, dest);
            console.log(`✅ Copied ${src} to ${dest}`);
          } else {
            console.warn(`⚠️ File not found: ${src}`);
          }
        } catch (error) {
          console.error(`Error copying ${src} to ${dest}:`, error);
        }
      }

      async function createZipArchive(sourceDir, zipFileName) {
        return new Promise((resolve, reject) => {
          const output = fs.createWriteStream(zipFileName);
          const archive = archiver('zip', { zlib: { level: 9 } });

          output.on('close', () => {
            console.log(`📦 Created ${zipFileName} (${archive.pointer()} bytes)`);
            resolve();
          });

          archive.on('error', err => {
            reject(err);
          });

          archive.pipe(output);
          archive.directory(sourceDir, false);
          archive.finalize();
        });
      }
    }
  };
}
