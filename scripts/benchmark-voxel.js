// Load the pure TypeScript mesher with the project's existing compiler.
const fs = require('fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { initialVoxel, listChunks, meshChunk } = require('../src/utils/voxel.ts');
for (const resolution of [16, 32, 64]) {
  const settings = { ...initialVoxel, resolution };
  const chunks = listChunks(settings);
  let meshBytes = 0, triangles = 0, peakDensityBytes = 0;
  const start = performance.now();
  for (const chunk of chunks) {
    const mesh = meshChunk(chunk, settings);
    triangles += mesh.indices.length / 3;
    meshBytes += mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength;
    peakDensityBytes = Math.max(peakDensityBytes, mesh.sampleBytes);
  }
  console.log(JSON.stringify({ resolution, chunks: chunks.length, triangles, meshBytes, peakDensityBytes, cpuMs: +(performance.now() - start).toFixed(1) }));
}
