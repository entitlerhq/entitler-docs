import GithubSlugger from 'github-slugger'
import type { Root } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

import { API_REFERENCE_URL, contentFiles, display, readPage } from './pages'

type Link = { file: string; line: number; href: string }

const parser = unified().use(remarkParse).use(remarkMdx).use(remarkGfm)
const anchors = new Map<string, Set<string>>()
const links: Link[] = []

for (const file of contentFiles('.mdx')) {
  const page = readPage(file)
  const tree = parser.parse(page.body) as Root
  const slugger = new GithubSlugger()
  const ids = new Set<string>()
  visit(tree, 'heading', (node) => {
    ids.add(slugger.slug(toString(node)))
  })
  anchors.set(page.url, ids)
  const line = (offset: number | undefined) => (offset ?? 1) + page.bodyLine - 1
  visit(tree, 'link', (node) => {
    links.push({ file, line: line(node.position?.start.line), href: node.url })
  })
  visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node) => {
    if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return
    for (const attribute of node.attributes) {
      if (attribute.type === 'mdxJsxAttribute' && attribute.name === 'href') {
        if (typeof attribute.value === 'string') {
          links.push({ file, line: line(node.position?.start.line), href: attribute.value })
        }
      }
    }
  })
}

function problemWith(link: Link, fromUrl: string) {
  const { href } = link
  if (/^(https?:|mailto:)/.test(href)) return undefined
  if (!href.startsWith('/') && !href.startsWith('#')) {
    return `"${href}" is relative; start internal links with / or #.`
  }
  const [path = '', hash] = href.split('#', 2)
  const target = path === '' ? fromUrl : path.replace(/\/$/, '') || '/'
  if (target === API_REFERENCE_URL) {
    return hash ? `"${href}" links to an anchor in the generated API reference.` : undefined
  }
  if (target.startsWith(`${API_REFERENCE_URL}/`)) {
    return `"${href}" links into the generated API reference; link to ${API_REFERENCE_URL} instead.`
  }
  const ids = anchors.get(target)
  if (!ids) return `"${href}" leads to no page.`
  if (hash && !ids.has(hash)) return `"${href}" names no heading on ${target}.`
  return undefined
}

const problems = links.flatMap((link) => {
  const problem = problemWith(link, readPage(link.file).url)
  return problem ? [`${display(link.file)}:${link.line}: ${problem}`] : []
})

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n\n${problems.length} broken link(s).\n`)
  process.exit(1)
}
process.stdout.write(`${links.length} links across ${anchors.size} pages resolve.\n`)
