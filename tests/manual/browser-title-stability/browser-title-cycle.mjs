export const STABLE_TITLE = 'Orcaw title stability test'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function emitTransientTitlePair(documentObject, frameIndex) {
  const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]
  documentObject.title = `${frame} π - title-jitter-test`
  documentObject.title = STABLE_TITLE
  return STABLE_TITLE
}
