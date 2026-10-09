import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { evaluate } from '@mdx-js/mdx'
import type { Root } from 'mdast'
import { createElement } from 'react'
import * as runtime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'

import { COMPONENTS, standIns } from './components'
import { contentFiles, display, readPage } from './pages'

const problems: string[] = []
const allowed = new Set<string>(COMPONENTS)

function report(file: string, problem: string) {
  problems.push(`${display(file)}: ${problem}`)
}

function onlyKnownComponents(file: string) {
  return () => (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return
      const name = node.name ?? '<>'
      if (!allowed.has(name)) {
        report(file, `line ${node.position?.start.line}: <${name}> is not one of ${COMPONENTS.join(', ')}.`)
      }
    })
    visit(tree, ['mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression'], (node) => {
      report(file, `line ${node.position?.start.line}: pages hold no imports, exports or {expressions}.`)
    })
  }
}

const PROPER_NOUNS = new Set(
  readFileSync(join(import.meta.dir, '..', 'styles', 'Entitler', 'Headings.yml'), 'utf8')
    .split('\n')
    .flatMap((line) => (line.startsWith('  - ') ? [line.slice(4).trim()] : [])),
)

function sentenceCaseProblem(title: string) {
  const words = title.split(/\s+/).slice(1)
  const capitalised = words.filter(
    (word) => /^[A-Z]/.test(word) && !PROPER_NOUNS.has(word.replace(/[^A-Za-z]/g, '')),
  )
  return capitalised.length > 0
    ? `title "${title}" is not in sentence case (${capitalised.join(', ')}).`
    : undefined
}

function checkFrontmatter(file: string, frontmatter: unknown) {
  if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
    report(file, 'starts with no frontmatter block (--- title: … ---).')
    return
  }
  const fields = frontmatter as Record<string, unknown>
  for (const key of Object.keys(fields)) {
    if (key !== 'title' && key !== 'description') {
      report(file, `frontmatter has "${key}"; only title and description are allowed.`)
    }
  }
  if (typeof fields.title !== 'string' || fields.title.trim() === '') {
    report(file, 'frontmatter needs a title.')
  } else {
    const problem = sentenceCaseProblem(fields.title)
    if (problem) report(file, problem)
  }
  for (const key of ['title', 'description']) {
    const value = fields[key]
    const word = typeof value === 'string' ? /\b(get|gets|getting|got|gotten)\b/i.exec(value) : null
    if (word) report(file, `${key} uses "${word[0]}": name the thing instead.`)
  }
  if (typeof fields.description !== 'string' || fields.description.trim() === '') {
    report(file, 'frontmatter needs a description, one sentence for search results and link previews.')
  }
}

async function checkPage(file: string) {
  const page = readPage(file)
  checkFrontmatter(file, page.frontmatter)
  const padding = '\n'.repeat(page.bodyLine - 1)
  try {
    const { default: Content } = await evaluate(padding + page.body, {
      ...runtime,
      remarkPlugins: [remarkGfm, onlyKnownComponents(file)],
    })
    renderToStaticMarkup(createElement(Content, { components: standIns }))
  } catch (error) {
    report(file, error instanceof Error ? error.message : String(error))
  }
}

const LINK = /^\[[^\]]+\]\([^)]+\)$/
const SEPARATOR = /^---.+---$/

function checkMeta(file: string) {
  let meta: unknown
  try {
    meta = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    report(file, `is not valid JSON: ${error instanceof Error ? error.message : error}`)
    return []
  }
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    report(file, 'must be a JSON object.')
    return []
  }
  const fields = meta as Record<string, unknown>
  for (const key of Object.keys(fields)) {
    if (key !== 'title' && key !== 'pages') report(file, `has "${key}"; only title and pages are allowed.`)
  }
  if (fields.title !== undefined && typeof fields.title !== 'string') report(file, 'title must be text.')
  if (!Array.isArray(fields.pages)) {
    report(file, 'needs pages, the list of its pages and folders in order.')
    return []
  }
  const dir = dirname(file)
  const listed: string[] = []
  for (const entry of fields.pages) {
    if (typeof entry !== 'string') {
      report(file, 'pages must all be text.')
      continue
    }
    if (LINK.test(entry) || SEPARATOR.test(entry)) continue
    const path = join(dir, entry)
    if (existsSync(`${path}.mdx`)) listed.push(`${path}.mdx`)
    else if (existsSync(path) && statSync(path).isDirectory()) listed.push(path)
    else report(file, `lists "${entry}", which is neither a page nor a folder here.`)
  }
  return listed
}

const pages = contentFiles('.mdx')
const metas = contentFiles('meta.json')
const listed = new Set(metas.flatMap(checkMeta))
for (const page of pages) {
  const dir = dirname(page)
  const hasMeta = existsSync(join(dir, 'meta.json'))
  if (hasMeta && !listed.has(page)) report(page, `is missing from ${display(join(dir, 'meta.json'))}.`)
}
for (const page of pages) await checkPage(page)

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n\n${problems.length} problem(s) in the pages.\n`)
  process.exit(1)
}
process.stdout.write(`${pages.length} pages and ${metas.length} navigation files are valid.\n`)
