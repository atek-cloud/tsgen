
export function toSafeString (str: string): string {
  return (
    str
      .replace(/(^\s*[^a-zA-Z_$])|([^a-zA-Z_$\d])/g, ' ')
      // uppercase leading underscores followed by lowercase
      .replace(/^_[a-z]/g, (match) => match.toUpperCase())
      // remove non-leading underscores followed by lowercase (convert snake_case)
      .replace(/_[a-z]/g, (match) => match.substr(1, match.length).toUpperCase())
      // uppercase letters after digits, dollars
      .replace(/([\d$]+[a-zA-Z])/g, (match) => match.toUpperCase())
      // uppercase first letter after whitespace
      .replace(/\s+([a-zA-Z])/g, (match) => match.toUpperCase())
      // remove remaining whitespace
      .replace(/\s/g, '')
      .replace(/^[a-z]/, (match) => match.toUpperCase())
  );
}

const IMPORT_RE = /import\(\"[^\"]+\"\)\./g
export function removeImport (str: string): string {
  return str.replace(IMPORT_RE, '')
}

const GENERIC_WRAPPER_RE = /[^\<]*\<([^\>]+)\>/
export function removeGenerics (str: string): string {
  while (GENERIC_WRAPPER_RE.test(str)) {
    const matches = GENERIC_WRAPPER_RE.exec(str)
    if (matches) str = matches[1]
  }
  return str
}

const QUOTES_WRAPPER_RE = /^['"]+(.*)['"]+$/
export function removeQuotes (str: string): string {
  const match = QUOTES_WRAPPER_RE.exec(str)
  if (match) return match[1]
  return str
}