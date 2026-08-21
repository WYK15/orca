export function agentBrowserBinaryName(hostPlatform: string, hostArch: string): string {
  // Windows ARM64 runs the published x64 helper through system emulation.
  const binaryArch = hostPlatform === 'win32' && hostArch === 'arm64' ? 'x64' : hostArch
  const extension = hostPlatform === 'win32' ? '.exe' : ''
  return `agent-browser-${hostPlatform}-${binaryArch}${extension}`
}
