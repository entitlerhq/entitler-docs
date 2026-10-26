import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse } from 'yaml'

export const CONTENT_DIR = join(import.meta.dir, '..', 'content', 'docs')
export const API_REFERENCE_URL = '/api-reference'
export const NAV_LINK = /^\[[^\]]+\]\(([^)]+)\)$/
export const NAV_SEPARATOR = /^---.+---$/
export const HEADING_ID = /\s\[#([a-z0-9-]+)]\s*$/
export const ENTRY_NAME = /^(?!\.+$)[a-z0-9_.()-]+$/

export type Page = {
  file: string
  url: string
  frontmatter: unknown
  body: string
  bodyLine: number
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

export function contentFiles(extension: string) {
  return walk(CONTENT_DIR)
    .filter((file) => file.endsWith(extension))
    .sort()
}

export function urlOf(file: string) {
  const parts = relative(CONTENT_DIR, file).replace(/\.mdx$/, '').split(sep)
  if (parts.at(-1) === 'index') parts.pop()
  return `/${parts.join('/')}`
}

export function readPage(file: string): Page {
  const source = readFileSync(file, 'utf8')
  const match = FRONTMATTER.exec(source)
  if (!match) {
    return { file, url: urlOf(file), frontmatter: undefined, body: source, bodyLine: 1 }
  }
  return {
    file,
    url: urlOf(file),
    frontmatter: parse(match[1] ?? ''),
    body: source.slice(match[0].length),
    bodyLine: match[0].split('\n').length,
  }
}

export function display(file: string) {
  return relative(join(CONTENT_DIR, '..', '..'), file)
}
