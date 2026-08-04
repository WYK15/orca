const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
    'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue ' +
    'cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey ' +
    'darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon ' +
    'darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen ' +
    'fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon ' +
    'lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey ' +
    'lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey ' +
    'lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
    'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite ' +
    'navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen ' +
    'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell ' +
    'sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow ' +
    'yellowgreen currentcolor'
  ).split(' ')
)

const FORBIDDEN_VALUE_PATTERN = /\\|!important|(?:url|var)\s*\(/i
const NUMBER_PATTERN = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`
const RGB_COMPONENT = `${NUMBER_PATTERN}%?`
const ALPHA_COMPONENT = `${NUMBER_PATTERN}%?`
const HUE_COMPONENT = `${NUMBER_PATTERN}(?:deg|grad|rad|turn)?`
const PERCENT_COMPONENT = `${NUMBER_PATTERN}%`
const RGB_PATTERN = new RegExp(
  `^rgba?\\(\\s*${RGB_COMPONENT}(?:\\s*,\\s*|\\s+)${RGB_COMPONENT}` +
    `(?:\\s*,\\s*|\\s+)${RGB_COMPONENT}(?:(?:\\s*\\/\\s*|\\s*,\\s*)${ALPHA_COMPONENT})?\\s*\\)$`,
  'i'
)
const HSL_PATTERN = new RegExp(
  `^hsla?\\(\\s*${HUE_COMPONENT}(?:\\s*,\\s*|\\s+)${PERCENT_COMPONENT}` +
    `(?:\\s*,\\s*|\\s+)${PERCENT_COMPONENT}(?:(?:\\s*\\/\\s*|\\s*,\\s*)${ALPHA_COMPONENT})?\\s*\\)$`,
  'i'
)

export function parseRichMarkdownSafeHtmlStyle(
  source: string
): Readonly<Record<string, string>> | null {
  if (!source.trim() || FORBIDDEN_VALUE_PATTERN.test(source)) {
    return null
  }
  const declarations = source.split(';')
  if (declarations.at(-1)?.trim() === '') {
    declarations.pop()
  }
  const styles: Record<string, string> = {}
  for (const declaration of declarations) {
    const separator = declaration.indexOf(':')
    if (separator <= 0) {
      return null
    }
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if (!value || property in styles || !isAllowedValue(property, value)) {
      return null
    }
    styles[property] = value
  }
  return styles
}

function isAllowedValue(property: string, value: string): boolean {
  switch (property) {
    case 'color':
    case 'background-color':
      return isColor(value)
    case 'background':
      return isColor(value)
    case 'font-size':
      return isFontSize(value)
    case 'font-weight':
      return /^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(value)
    case 'font-style':
      return /^(?:normal|italic|oblique)$/i.test(value)
    case 'text-decoration':
      return isTextDecoration(value)
    default:
      return false
  }
}

function isColor(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    NAMED_COLORS.has(normalized) ||
    /^#[\da-f]{3,4}(?:[\da-f]{2}){0,2}$/i.test(value) ||
    RGB_PATTERN.test(value) ||
    HSL_PATTERN.test(value)
  )
}

function isFontSize(value: string): boolean {
  const match = value.match(/^(\d+(?:\.\d+)?|\.\d+)(px|em|rem|%)$/i)
  if (!match) {
    return false
  }
  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  if (unit === 'px') {
    return amount >= 8 && amount <= 72
  }
  if (unit === '%') {
    return amount >= 50 && amount <= 400
  }
  return amount >= 0.5 && amount <= 4
}

function isTextDecoration(value: string): boolean {
  const tokens = value.toLowerCase().split(/\s+/)
  if (tokens.length === 1 && tokens[0] === 'none') {
    return true
  }
  const allowed = new Set(['underline', 'overline', 'line-through'])
  return (
    tokens.length > 0 &&
    new Set(tokens).size === tokens.length &&
    tokens.every((token) => allowed.has(token))
  )
}
