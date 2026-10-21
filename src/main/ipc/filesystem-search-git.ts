import type { SearchOptions, SearchResult } from '../../shared/types'
import {
  buildGitGrepArgs,
  buildSubmatchRegex,
  createAccumulator,
  finalize,
  ingestGitGrepLine,
  SEARCH_TIMEOUT_MS
} from '../../shared/text-search'
import { gitSpawn } from '../git/runner'
import {
  buildFolderGitGrepArgs,
  isGitGrepOutsideRepository
} from '../../shared/git-grep-folder-fallback'

/**
 * Fallback text search using git grep. Used when rg is not available.
 *
 * Why: On Linux, rg may not be installed or may not be in PATH when the app
 * is launched from a desktop entry (which inherits a minimal system PATH).
 * git grep is always available since this is a git-focused app.
 */
export function searchWithGitGrep(
  rootPath: string,
  args: SearchOptions,
  maxResults: number,
  localGitOptions: { wslDistro?: string } = {},
  outsideRepository = false
): Promise<SearchResult> {
  return new Promise((resolve) => {
    const gitArgs = outsideRepository
      ? buildFolderGitGrepArgs(args.query, args)
      : buildGitGrepArgs(args.query, args)
    const matchRegex = buildSubmatchRegex(args.query, args)
    const acc = createAccumulator()
    let stdoutBuffer = ''
    let stderr = ''
    let done = false

    const child = gitSpawn(gitArgs, {
      cwd: rootPath,
      ...(localGitOptions.wslDistro ? { wslDistro: localGitOptions.wslDistro } : {}),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let killTimeout: ReturnType<typeof setTimeout>

    function resolveOnce(retryOutsideRepository = false): void {
      if (done) {
        return
      }
      done = true
      clearTimeout(killTimeout)
      // Why: child.kill() is advisory. If git ignores it, detach our
      // closures so repeated fallback searches do not retain old scans.
      child.stdout!.off('data', handleStdoutData)
      child.stderr!.off('data', handleStderrData)
      child.off('error', handleError)
      child.off('close', handleClose)
      resolve(
        retryOutsideRepository
          ? searchWithGitGrep(rootPath, args, maxResults, localGitOptions, true)
          : finalize(acc)
      )
    }

    function processLine(line: string): void {
      const verdict = ingestGitGrepLine(line, rootPath, matchRegex, acc, maxResults)
      if (verdict === 'stop') {
        child.kill()
      }
    }

    function handleStdoutData(chunk: string): void {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''
      for (const l of lines) {
        processLine(l)
      }
    }

    function handleStderrData(chunk: Buffer | string): void {
      stderr = (stderr + chunk.toString()).slice(-4096)
    }

    function handleError(): void {
      resolveOnce()
    }

    function handleClose(code: number | null): void {
      if (stdoutBuffer) {
        processLine(stdoutBuffer)
      }
      resolveOnce(!outsideRepository && isGitGrepOutsideRepository(code, stderr))
    }

    child.stdout!.setEncoding('utf-8')
    child.stdout!.on('data', handleStdoutData)
    child.stderr!.on('data', handleStderrData)
    child.once('error', handleError)
    child.once('close', handleClose)

    killTimeout = setTimeout(() => {
      acc.truncated = true
      child.kill()
      resolveOnce()
    }, SEARCH_TIMEOUT_MS)
  })
}
