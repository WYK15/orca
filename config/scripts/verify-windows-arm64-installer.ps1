$ErrorActionPreference = 'Stop'

$installer = (Resolve-Path 'dist/orcaw-windows-arm64-setup.exe').Path
$installDir = Join-Path $env:RUNNER_TEMP 'orcaw-arm64-install-smoke'
if (Test-Path $installDir) {
  throw "Smoke installation directory already exists: $installDir"
}

$process = Start-Process -FilePath $installer -ArgumentList "/S /D=$installDir" -Wait -PassThru
if ($process.ExitCode -ne 0) {
  throw "Windows ARM64 installer exited with code $($process.ExitCode)"
}

$files = @(
  'Orcaw.exe',
  'ffmpeg.dll',
  'resources/node_modules/node-pty/build/Release/conpty.node',
  (
    'resources/node_modules/node-pty/prebuilds/' +
    'win32-arm64/conpty_console_list.node'
  )
)
foreach ($file in $files) {
  $installedPath = Join-Path $installDir $file
  if (-not (Test-Path $installedPath -PathType Leaf)) {
    throw "Windows ARM64 installer did not install $file at $installDir"
  }
}

$exePath = Join-Path $installDir 'Orcaw.exe'
$bytes = [System.IO.File]::ReadAllBytes($exePath)
$header = [System.BitConverter]::ToInt32($bytes, 0x3C)
$machine = [System.BitConverter]::ToUInt16($bytes, $header + 4)
if ($machine -ne 0xAA64) {
  throw "Installed Orcaw.exe is not ARM64; machine=0x$($machine.ToString('X4'))"
}
