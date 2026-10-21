type BinaryEnvelope = { __orcaw_wire_v1: 'bytes'; data: string }

export function encodeDesktopValue(value: unknown): unknown {
  if (value === undefined) {
    return { __orcaw_wire_v1: 'undefined' }
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    }
    return { __orcaw_wire_v1: 'bytes', data: btoa(binary) } satisfies BinaryEnvelope
  }
  if (Array.isArray(value)) {
    return value.map(encodeDesktopValue)
  }
  if (value && typeof value === 'object') {
    if (Object.hasOwn(value, '__orcaw_wire_v1')) {
      return {
        __orcaw_wire_v1: 'record',
        entries: Object.entries(value).map(([key, child]) => [key, encodeDesktopValue(child)])
      }
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encodeDesktopValue(entry)])
    )
  }
  return value
}

export function decodeDesktopValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeDesktopValue)
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.__orcaw_wire_v1 === 'undefined') {
      return undefined
    }
    if (record.__orcaw_wire_v1 === 'record' && Array.isArray(record.entries)) {
      return Object.fromEntries(
        (record.entries as [string, unknown][]).map(([key, child]) => [
          key,
          decodeDesktopValue(child)
        ])
      )
    }
    if (record.__orcaw_wire_v1 === 'bytes' && typeof record.data === 'string') {
      return Uint8Array.from(atob(record.data), (character) => character.charCodeAt(0))
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [key, decodeDesktopValue(entry)])
    )
  }
  return value
}
