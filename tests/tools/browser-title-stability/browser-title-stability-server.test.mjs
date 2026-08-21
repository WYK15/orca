import { afterEach, describe, expect, it } from 'vitest'
import { startBrowserTitleStabilityServer } from '../../manual/browser-title-stability/browser-title-stability-server.mjs'

describe('browser title stability server', () => {
  let server

  afterEach(async () => {
    if (!server) {
      return
    }
    await new Promise((resolve) => server.close(resolve))
    server = undefined
  })

  it('serves the fixture and its allowlisted assets over loopback', async () => {
    const started = await startBrowserTitleStabilityServer({ port: 0 })
    server = started.server

    expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)

    const pageResponse = await fetch(started.url)
    expect(pageResponse.status).toBe(200)
    expect(pageResponse.headers.get('content-type')).toContain('text/html')
    expect(await pageResponse.text()).toContain('Browser title stability test')

    const moduleResponse = await fetch(`${started.url}browser-title-cycle.mjs`)
    expect(moduleResponse.status).toBe(200)
    expect(moduleResponse.headers.get('content-type')).toContain('text/javascript')

    const fontResponse = await fetch(`${started.url}assets/Geist-Variable.woff2`)
    expect(fontResponse.status).toBe(200)
    expect(fontResponse.headers.get('content-type')).toBe('font/woff2')
  })

  it('rejects files outside the allowlist', async () => {
    const started = await startBrowserTitleStabilityServer({ port: 0 })
    server = started.server

    expect((await fetch(`${started.url}package.json`)).status).toBe(404)
    expect((await fetch(new URL('../package.json', started.url))).status).toBe(404)
  })

  it('rejects methods other than GET', async () => {
    const started = await startBrowserTitleStabilityServer({ port: 0 })
    server = started.server

    const response = await fetch(started.url, { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
  })
})
