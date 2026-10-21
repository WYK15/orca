// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PreviewMedia } from './FeatureWallPreview'

afterEach(cleanup)
it('uses a static poster even when an old caller requests animated media', () => {
  const { container } = render(
    <PreviewMedia
      posterUrl="https://example.invalid/poster.jpg"
      gifUrl="https://example.invalid/demo.gif"
      showGif
      workflowTitle="Welcome"
    />
  )
  const images = Array.from(container.querySelectorAll('img'))
  expect(images.map((image) => image.getAttribute('src'))).toEqual([
    'https://example.invalid/poster.jpg'
  ])
})
