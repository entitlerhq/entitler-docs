import { Children, isValidElement, type ReactNode } from 'react'

export const COMPONENT_PROPS = {
  Callout: ['type', 'title'],
  Tabs: [],
  Tab: ['value'],
  Cards: [],
  Card: ['title', 'href'],
} as const satisfies Record<string, readonly string[]>

export type Component = keyof typeof COMPONENT_PROPS

export const COMPONENTS = Object.keys(COMPONENT_PROPS) as Component[]

const CALLOUT_TYPES = ['note', 'tip', 'warning']

function refuse(component: string, problem: string): never {
  throw new Error(`<${component}> ${problem}`)
}

function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: string
  title?: string
  children?: ReactNode
}) {
  if (!CALLOUT_TYPES.includes(type)) {
    refuse('Callout', `type must be one of ${CALLOUT_TYPES.join(', ')}, not "${type}".`)
  }
  if (title !== undefined && typeof title !== 'string') refuse('Callout', 'title must be text.')
  return (
    <aside>
      {title && <strong>{title}</strong>}
      {children}
    </aside>
  )
}

function Tabs({ children }: { children?: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement)
  if (tabs.length < 2) refuse('Tabs', 'needs two or more <Tab>s.')
  return <div>{children}</div>
}

function Tab({ value, children }: { value?: unknown; children?: ReactNode }) {
  if (typeof value !== 'string' || value.length === 0) {
    refuse('Tab', 'needs value, the name shown on its tab.')
  }
  return <section>{children}</section>
}

function Cards({ children }: { children?: ReactNode }) {
  return <div>{children}</div>
}

function Card({ title, href, children }: { title?: unknown; href?: unknown; children?: ReactNode }) {
  if (typeof title !== 'string' || title.length === 0) refuse('Card', 'needs a title.')
  if (typeof href !== 'string' || href.length === 0) refuse('Card', 'needs an href.')
  return (
    <a href={href}>
      {title}
      {children}
    </a>
  )
}

export const standIns = { Callout, Tabs, Tab, Cards, Card }
