export const textSelectionCases = [
  ['plain', 'Plain selectedWord tail.', 'selectedWord', 'selectedWord'],
  ['chinese', 'Plain 中文文字 tail.', '中文文字', '中文文字'],
  ['emoji', 'Before 😀 emoji tail.', '😀', '😀'],
  ['bold partial', 'Before **bold words** after.', 'old wor', 'old wor', 'strong'],
  ['bold whole', 'Before **bold words** after.', 'bold words', '**bold words**', 'strong'],
  ['italic partial', 'Before *italic words* after.', 'talic wor', 'talic wor', 'em'],
  ['italic whole', 'Before *italic words* after.', 'italic words', '*italic words*', 'em'],
  ['strike partial', 'Before ~~deleted words~~ after.', 'leted wor', 'leted wor', 'del'],
  ['inline partial', 'Before `sampleQueryStatus` after.', 'mpleQueryStat', 'mpleQueryStat', 'code'],
  [
    'inline whole',
    'Before `sampleQueryStatus` after.',
    'sampleQueryStatus',
    '`sampleQueryStatus`',
    'code'
  ],
  ['bold to plain', 'Before **bold words** after tail.', 'words** after', 'words after', 'strong'],
  ['plain to bold', 'Before **bold words** after.', 'Before **bold', 'Before bold', 'strong'],
  ['nested partial', 'Before **bold *nested words* end** after.', 'sted wor', 'sted wor', 'em'],
  ['list inline', '- `listCodeAlpha`\n- beta', 'listCodeAlpha', 'listCodeAlpha', 'code'],
  ['list bold partial', '- **bold list gamma**\n- beta', 'list gamma', 'list gamma', 'strong'],
  ['ordered list', '9. alpha\n10. beta words\n11. gamma', 'beta words', 'beta words'],
  ['tasks', '- [ ] unchecked words\n- [x] checked words', 'checked words', 'checked words'],
  [
    'link whole',
    'Before [Link label](https://example.invalid/path) after.',
    'Link label',
    'Link label',
    'a'
  ],
  [
    'link partial',
    'Before [Link label](https://example.invalid/path) after.',
    'ink lab',
    'ink lab',
    'a'
  ],
  [
    'reference link',
    'Before [reference label][target] after.\n\n[target]: https://example.invalid/',
    'reference label',
    'reference label',
    'a'
  ],
  ['cross paragraph', 'alpha first\n\nsecond beta', 'first\n\nsecond', 'first\n\nsecond'],
  ['cross list', '- alpha\n- beta\n- gamma', 'alpha\n- beta', 'alpha\nbeta'],
  ['blockquote', '> quoted words\n> next words', 'oted wor', 'oted wor'],
  [
    'code literal',
    '```text\nalpha *literal* -> &amp; <tag>\n  next\n```',
    '*literal* -> &amp; <tag>',
    '*literal* -> &amp; <tag>',
    'code'
  ],
  [
    'code blank lines',
    '```text\nfirst  \n\n  last\n```',
    'first  \n\n  last',
    'first  \n\n  last',
    'code'
  ],
  [
    'code wrapped',
    `\`\`\`text\n${'wrapping words '.repeat(18)}\n\`\`\``,
    'words wrapping words wrapping words wrapping words wrapping words wrapping words wrapping words wrapping',
    'words wrapping words wrapping words wrapping words wrapping words wrapping words wrapping words wrapping',
    'code'
  ]
]
