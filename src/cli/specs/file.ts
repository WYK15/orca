import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const FILE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'open'],
    summary: 'Open a workspace file in the Orca editor',
    usage: 'orcaw file open <path> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'worktree'],
    positionalArgs: ['path'],
    notes: [
      'The path may be relative to the selected worktree or an absolute path inside that worktree. When --worktree is omitted, local CLI calls infer the current Orca worktree from cwd.'
    ],
    examples: [
      'orcaw file open src/App.tsx',
      'orcaw file open --path docs/readme.md --worktree active'
    ]
  },
  {
    path: ['file', 'diff'],
    summary: 'Open a workspace file diff in the Orca editor',
    usage: 'orcaw file diff <path> [--staged] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'staged', 'worktree'],
    positionalArgs: ['path'],
    notes: [
      'Diffs default to unstaged changes. Pass --staged to open the staged source-control diff.',
      'The path may be relative to the selected worktree or an absolute path inside that worktree.'
    ],
    examples: [
      'orcaw file diff src/App.tsx',
      'orcaw file diff --path package.json --staged --worktree branch:feature'
    ]
  },
  {
    path: ['file', 'open-changed'],
    summary: 'Open all git-changed files for a workspace',
    usage: 'orcaw file open-changed [--mode edit|diff|both] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'mode', 'worktree'],
    notes: [
      'For v1, changed files come from git status for the selected worktree.',
      'The default mode is diff. Edit mode skips deleted files because there is no file to open.'
    ],
    examples: [
      'orcaw file open-changed',
      'orcaw file open-changed --mode both',
      'orcaw file open-changed --mode diff --worktree active'
    ]
  }
]
