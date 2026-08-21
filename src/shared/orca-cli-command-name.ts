export function getOrcaCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'orcaw-ide'
  }
  if (platform === 'win32') {
    return 'orcaw.cmd'
  }
  return 'orcaw'
}
