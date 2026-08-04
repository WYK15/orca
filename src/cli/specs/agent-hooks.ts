import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether Orca-managed agent status hooks are enabled',
    usage: 'orcaw agent hooks status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orcaw agent hooks status', 'orcaw agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable Orca-managed agent status hooks and remove local hook entries',
    usage: 'orcaw agent hooks off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orcaw agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable Orca-managed agent status hooks',
    usage: 'orcaw agent hooks on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orcaw agent hooks on']
  }
]
