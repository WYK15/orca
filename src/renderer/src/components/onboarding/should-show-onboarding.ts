import type { OnboardingState } from '../../../../shared/types'
import { ONBOARDING_ENABLED } from '../../../../shared/fork-feature-policy'

// Why: split out so App.tsx can gate the lazy <OnboardingFlow> without an
// eager static import path that pulls the whole flow into the main chunk.
export function shouldShowOnboarding(onboarding: OnboardingState | null): boolean {
  return ONBOARDING_ENABLED && onboarding !== null && onboarding.closedAt === null
}
