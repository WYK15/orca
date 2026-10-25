import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '../../..')
const directory = mkdtempSync(resolve(tmpdir(), 'orcaw-markdown-live-'))
const file = resolve(directory, 'manual.md')
const initial = process.env.ORCA_MARKDOWN_FIXTURE_PATH
  ? readFileSync(process.env.ORCA_MARKDOWN_FIXTURE_PATH, 'utf8')
  : '# Markdown 编辑器\r\n\r\n这是一段 **加粗**、*斜体* 和 `inline code`。\n\n## 列表\r\n\r\n- first\r\n- second\r\n\r\n## 代码\n\n```javascript\nconst message = "hello";\nconsole.log(message);\n```\n\n## 表格\r\n\r\n|  Name   | Description       |\r\n| :------ | ----------------: |\r\n| one     | http old          |\r\n| two     | -> &gt;           |\r\n\r\n## 图片\n\n![privacy](./privacy.png)\n\n<details>\n<summary>兼容 HTML</summary>\n原文保持不变。\n</details>\n'
writeFileSync(file, initial)
export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: { '@': resolve(root, 'src/renderer/src') } },
  plugins: [
    react(),
    tailwind(),
    {
      name: 'markdown-fixture',
      configureServer(server) {
        server.middlewares.use('/fixture', (req, res) => {
          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => (body += chunk))
            req.on('end', () => {
              writeFileSync(file, body)
              res.end('saved')
            })
          } else {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ source: readFileSync(file, 'utf8'), file }))
          }
        })
      }
    }
  ],
  server: { host: '127.0.0.1', port: 4181, strictPort: true, fs: { allow: [root] } }
})
