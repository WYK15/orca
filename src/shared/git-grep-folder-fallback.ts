import { buildGitGrepArgs, type SearchOptionsLike } from './text-search'

export function isGitGrepOutsideRepository(code: number | null, stderr: string): boolean {
  return code === 128 && /^fatal: not a git repository(?:[ (:]|$)/m.test(stderr)
}

export function buildFolderGitGrepArgs(query: string, options: SearchOptionsLike): string[] {
  const args = buildGitGrepArgs(query, options)
  args.splice(args.indexOf('--untracked'), 1, '--no-index', '--exclude-standard')
  return args
}
