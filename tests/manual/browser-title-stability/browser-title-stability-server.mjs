import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const fixtureDirectory = import.meta.dirname
const repositoryRoot = resolve(fixtureDirectory, '..', '..', '..')

const pageAsset = {
  path: join(fixtureDirectory, 'index.html'),
  type: 'text/html; charset=utf-8'
}

const assetPaths = new Map([
  ['/', pageAsset],
  ['/index.html', pageAsset],
  [
    '/browser-title-cycle.mjs',
    {
      path: join(fixtureDirectory, 'browser-title-cycle.mjs'),
      type: 'text/javascript; charset=utf-8'
    }
  ],
  [
    '/assets/Geist-Variable.woff2',
    {
      path: join(
        repositoryRoot,
        'src',
        'renderer',
        'src',
        'assets',
        'fonts',
        'Geist-Variable.woff2'
      ),
      type: 'font/woff2'
    }
  ]
])

export function createBrowserTitleStabilityServer() {
  return createServer(async (request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' })
      response.end('Method Not Allowed')
      return
    }

    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const asset = assetPaths.get(pathname)

    if (!asset) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }

    try {
      const content = await readFile(asset.path)
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': asset.type
      })
      response.end(content)
    } catch (error) {
      console.error(error)
      response.writeHead(500)
      response.end('Fixture asset unavailable')
    }
  })
}

export async function startBrowserTitleStabilityServer({
  host = '127.0.0.1',
  port = Number(process.env.PORT ?? 4174)
} = {}) {
  const server = createBrowserTitleStabilityServer()

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, host, resolveListen)
  })

  const address = server.address()
  return {
    server,
    url: `http://${host}:${address.port}/`
  }
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''

if (entryPath === import.meta.url) {
  startBrowserTitleStabilityServer()
    .then(({ url }) => {
      console.log(`标题稳定性测试地址：${url}`)
      console.log('先在旧版 Orcaw 中打开该地址；关闭旧版后，再用修复版打开同一地址。')
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
