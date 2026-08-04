import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getReleaseNotesUrlForVersion } from '../shared/release-channel'
import type { ChangelogData, UpdateStatus } from '../shared/types'

export type ReleaseUpdateDelivery = 'automatic' | 'manual'

export function getReleaseUpdateDelivery(
  platform: NodeJS.Platform,
  macAutoUpdateEnabled: boolean
): ReleaseUpdateDelivery {
  return platform === 'darwin' && !macAutoUpdateEnabled ? 'manual' : 'automatic'
}

export function readPackagedMacAutoUpdateEnabled(appPath: string): boolean {
  try {
    const metadata = JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')) as {
      orcawMacAutoUpdate?: unknown
    }
    return metadata.orcawMacAutoUpdate === true
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
