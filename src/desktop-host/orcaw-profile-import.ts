import { randomUUID } from 'node:crypto'
import { copyFile, chmod, mkdir, open, readFile, rename, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { getDefaultPersistedState } from '../shared/constants'
import {
  findOrcawProfile,
  parseOrcawProfileSnapshot,
  readOrcawProfile
} from './orcaw-profile-source'
import { mergeOrcawProfile } from './orcaw-profile-merge'

type ImportOptions = {
  sourceDirectory?: string
  targetDirectory: string
  home: string
  confirm: (request: {
    title: string
    message: string
    accept: string
    cancel: string
  }) => Promise<boolean>
}

async function writeImportFile(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(value))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function importOrcawProfile(options: ImportOptions): Promise<void> {
  if (!options.sourceDirectory) {
    return
  }
  const marker = join(options.targetDirectory, 'orcaw-profile-import.json')
  try {
    await readFile(marker)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  const source = await findOrcawProfile(options.sourceDirectory)
  if (!source) {
    return
  }
  await mkdir(options.targetDirectory, { recursive: true })
  const destination = join(options.targetDirectory, 'orca-data.json')
  let target
  let existingFile = true
  try {
    if ((await realpath(destination)) === source.file) {
      throw new Error('Orcaw and Tauri must use separate data directories')
    }
    target = await readOrcawProfile(destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    target = parseOrcawProfileSnapshot(JSON.stringify(getDefaultPersistedState(options.home)))
    existingFile = false
  }
  const merged = mergeOrcawProfile(source.snapshot, target)
  const chinese = String(
    source.snapshot.settings.uiLanguage && source.snapshot.settings.uiLanguage !== 'auto'
      ? source.snapshot.settings.uiLanguage
      : Intl.DateTimeFormat().resolvedOptions().locale
  ).startsWith('zh')
  const confirmed = await options.confirm(
    chinese
      ? {
          title: '导入 Orcaw 的项目和设置',
          message: `检测到 Orcaw 配置“${source.profileName}”。将新增 ${merged.importedRepos} 个项目和 ${merged.importedFolders} 个文件夹工作区，保留 Tauri 已有项目，并采用 Orcaw 的常规设置。\n\n导入前会备份 Tauri 配置，原 Orcaw 数据保持不变。旧版加密凭据（含代理地址）、托管账号和运行中的终端不会导入，相关账号及代理可能需要重新配置。`,
          accept: '导入',
          cancel: '稍后'
        }
      : {
          title: 'Import Orcaw projects and settings',
          message: `Found the Orcaw profile “${source.profileName}”. Add ${merged.importedRepos} projects and ${merged.importedFolders} folder workspaces, keep existing Tauri projects, and use Orcaw's regular settings.\n\nTauri settings will be backed up. Orcaw data stays intact. Encrypted credentials (including proxy URLs), managed accounts and running terminals are excluded; some accounts and proxies need to be configured again.`,
          accept: 'Import',
          cancel: 'Later'
        }
  )
  if (!confirmed) {
    return
  }
  const backup = existingFile ? `${destination}.before-orcaw-import-${randomUUID()}` : null
  if (backup) {
    await copyFile(destination, backup)
    await chmod(backup, 0o600)
  }
  await writeImportFile(destination, merged.snapshot)
  await writeImportFile(marker, {
    version: 1,
    importedAt: Date.now(),
    source: source.file,
    profileName: source.profileName,
    importedRepos: merged.importedRepos,
    importedFolders: merged.importedFolders,
    backup
  })
}
