import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const productIdentity = require('../orcaw-product-identity.json')

export function macOSComputerHelperAppPath(repoRoot) {
  return path.join(
    repoRoot,
    'native',
    'computer-use-macos',
    '.build',
    'release',
    `${productIdentity.computerUseAppName}.app`
  )
}
