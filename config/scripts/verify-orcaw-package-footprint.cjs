const { existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

function verifyOrcawPackageFootprint(resourcesDir, asar = require('@electron/asar')) {
  const entries = asar
    .listPackage(join(resourcesDir, 'app.asar'))
    .map((entry) => entry.replace(/\\/g, '/').replace(/^\/+/, ''))
  const unwanted = entries.filter(
    (entry) =>
      /^out\/(web|relay)(\/|$)/.test(entry) ||
      entry === 'out/main/stt-worker.js' ||
      entry.startsWith('node_modules/sherpa-onnx')
  )
  if (unwanted.length) {
    throw new Error(`Unwanted packaged resources: ${unwanted.join(', ')}`)
  }
  if (existsSync(join(resourcesDir, 'serve-sim'))) {
    throw new Error('Duplicate serve-sim resource directory')
  }
  const modules = join(resourcesDir, 'node_modules')
  if (existsSync(modules) && readdirSync(modules).some((name) => name.startsWith('sherpa-onnx'))) {
    throw new Error('Unwanted packaged speech libraries')
  }
  const previews = join(resourcesDir, 'onboarding', 'feature-wall')
  if (existsSync(previews) && readdirSync(previews).some((name) => name.endsWith('.gif'))) {
    throw new Error('Unwanted packaged welcome animation')
  }
  if (!existsSync(join(resourcesDir, 'relay'))) {
    throw new Error('Missing packaged SSH relay')
  }
}

module.exports = { verifyOrcawPackageFootprint }
