const attributePattern = (name: string): RegExp =>
  new RegExp(`\\s+${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')

export function readImageAttribute(source: string, name: string): string {
  const match = source.match(attributePattern(name))
  const value = match?.[1] ?? match?.[2] ?? match?.[3] ?? ''
  const text = document.createElement('textarea')
  text.innerHTML = value
  return text.value
}

export function escapeImageAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function setImageAttribute(source: string, name: string, value: string): string {
  const pattern = attributePattern(name)
  const replacement = value ? ` ${name}="${escapeImageAttribute(value)}"` : ''
  return pattern.test(source)
    ? source.replace(pattern, () => replacement)
    : source.replace(/\s*\/?>$/, (end) => `${replacement}${end}`)
}
