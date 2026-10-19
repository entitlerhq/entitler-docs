import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { evaluate } from '@mdx-js/mdx'
import type { Root } from 'mdast'
import { createElement } from 'react'
import * as runtime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { visitParents } from 'unist-util-visit-parents'

import { COMPONENT_PROPS, COMPONENTS, type Component, standIns } from './components'
import { contentFiles, display, NAV_LINK, NAV_SEPARATOR, readPage } from './pages'

const problems: string[] = []
const allowed = new Set<string>(COMPONENTS)
const CODE_LANGUAGES = ['bash', 'javascript', 'typescript', 'json', 'kotlin', 'swift']

function report(file: string, problem: string) {
  problems.push(`${display(file)}: ${problem}`)
}

function isElement(node: { type: string }) {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement'
}

function placementProblem(name: string, ancestors: readonly { type: string; name?: unknown }[]) {
  if (ancestors.some((ancestor) => ancestor.type === 'heading')) {
    return `<${name}> cannot sit in a heading, which the table of contents copies.`
  }
  if (ancestors.some((ancestor) => ancestor.type === 'footnoteDefinition')) {
    return `<${name}> cannot sit in a footnote, which renders after the page body.`
  }
  if (name === 'Tab' && ancestors.findLast(isElement)?.name !== 'Tabs') {
    return '<Tab> belongs directly inside <Tabs>.'
  }
  return undefined
}

function onlyKnownComponents(file: string) {
  return () => (tree: Root) => {
    visitParents(tree, (node, ancestors) => {
      if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return
      const problem = placementProblem(node.name ?? '<>', ancestors)
      if (problem) report(file, `line ${node.position?.start.line}: ${problem}`)
    })
    visit(tree, (node) => {
      if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return
      const name = node.name ?? '<>'
      const line = node.position?.start.line
      if (!allowed.has(name)) {
        report(file, `line ${line}: <${name}> is not one of ${COMPONENTS.join(', ')}.`)
        return
      }
      const props: readonly string[] = COMPONENT_PROPS[name as Component]
      for (const attribute of node.attributes) {
        if (attribute.type !== 'mdxJsxAttribute') {
          report(file, `line ${line}: <${name}> takes no spread props.`)
        } else if (!props.includes(attribute.name)) {
          const accepted = props.length > 0 ? props.join(', ') : 'no props'
          report(file, `line ${line}: <${name}> has "${attribute.name}"; it takes ${accepted}.`)
        } else if (typeof attribute.value !== 'string') {
          report(file, `line ${line}: <${name}> ${attribute.name} must be a quoted string.`)
        }
      }
    })
    visit(tree, 'code', (node) => {
      if (!node.lang || !CODE_LANGUAGES.includes(node.lang)) {
        report(
          file,
          `line ${node.position?.start.line}: label the code block with one of ${CODE_LANGUAGES.join(', ')}, not "${node.lang ?? ''}".`,
        )
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
    if (NAV_LINK.test(entry) || NAV_SEPARATOR.test(entry)) continue
    const path = join(dir, entry)
    if (existsSync(`${path}.mdx`)) listed.push(`${path}.mdx`)
    else if (existsSync(path) && statSync(path).isDirectory()) listed.push(path)
    else report(file, `lists "${entry}", which is neither a page nor a folder here.`)
  }
  return listed
}

const pages = contentFiles('.mdx')
const metas = contentFiles('meta.json')
for (const page of pages) {
  if (/^\(.+\)$/.test(basename(page, '.mdx'))) {
    report(page, 'a page name in brackets is a folder group, which only folders may be.')
  }
}
for (const file of contentFiles('.md')) {
  report(file, 'is a .md file; pages are .mdx files, and the site builds no other kind.')
}
const listed = new Set(metas.flatMap(checkMeta))
for (const page of pages) {
  const dir = dirname(page)
  const meta = join(dir, 'meta.json')
  if (!existsSync(meta)) report(page, `has no ${display(meta)} to list it in the navigation.`)
  else if (!listed.has(page)) report(page, `is missing from ${display(meta)}.`)
}
for (const page of pages) await checkPage(page)

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n\n${problems.length} problem(s) in the pages.\n`)
  process.exit(1)
}
process.stdout.write(`${pages.length} pages and ${metas.length} navigation files are valid.\n`)
