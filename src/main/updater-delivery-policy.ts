import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getReleaseNotesUrlForVersion } from '../shared/release-channel'
import type { ChangelogData, UpdateStatus } from '../shared/update-status-types'

export type ReleaseUpdateDelivery = 'automatic' | 'manual'

export function getReleaseUpdateDelivery(
  platform: NodeJS.Platform,
  releaseAutoUpdateEnabled: boolean
): ReleaseUpdateDelivery {
  return platform === 'linux' || releaseAutoUpdateEnabled ? 'automatic' : 'manual'
}

export function readPackagedReleaseAutoUpdateEnabled(
  appPath: string,
  platform: NodeJS.Platform
): boolean {
  if (platform === 'linux') {
    return true
  }

  try {
    const metadata = JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')) as {
      orcawMacAutoUpdate?: unknown
      orcawReleaseAutoUpdate?: unknown
    }
    if (typeof metadata.orcawReleaseAutoUpdate === 'boolean') {
      return metadata.orcawReleaseAutoUpdate
    }
    return platform === 'darwin' && metadata.orcawMacAutoUpdate === true
  } catch {
    return false
  }
}

export function createAvailableReleaseStatus(
  version: string,
  changelog: ChangelogData | null,
  delivery: ReleaseUpdateDelivery
): { releaseUrl: string; status: UpdateStatus } {
  const releaseUrl = getReleaseNotesUrlForVersion(version)
  return {
    releaseUrl,
    status: {
      state: 'available',
      version,
      changelog,
      ...(delivery === 'manual' ? { delivery, releaseUrl } : {})
    }
  }
}
