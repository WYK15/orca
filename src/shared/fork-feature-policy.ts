// Keep legacy settings readable while excluding unused features from this fork.
export const SPEECH_ENABLED = false
export const WEB_CLIENT_ENABLED = false
export const WELCOME_ANIMATIONS_ENABLED = false

declare const ORCA_EMBEDDED_BROWSER_ENABLED: boolean | undefined
export const EMBEDDED_BROWSER_ENABLED =
  typeof ORCA_EMBEDDED_BROWSER_ENABLED === 'undefined' || ORCA_EMBEDDED_BROWSER_ENABLED
