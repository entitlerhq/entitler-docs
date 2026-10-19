# Entitler docs content

Instructions for coding agents working in this repository.

The public pages of docs.entitler.dev: MDX in `content/docs`, navigation in `meta.json` files and
the checks in `scripts/` and `styles/`. The site, the API reference and search are built from this
content elsewhere; nothing here is site code. CONTRIBUTING.md is the full guide: follow it.

## Copy

- Australian English, sentence case for titles and headings, no emoji.
- Never write "get" ("get started", "what a customer gets", "the answer your app gets"): name the
  thing, such as "Quick start", "the customer's entitlements", "the answer your app receives".
  Questions ("What happens when…?") are fine.
- No vague "what" clauses ("what they can use", "what each plan includes"): name the thing, such as
  "their features and limits".
- Every fact must match the live API: the OpenAPI documents at
  `https://api.entitler.dev/customers/openapi.json` and `https://api.entitler.dev/keys/openapi.json`.
  Read them before writing about a route; never describe behaviour they do not.
- Describe the product and the public API only: no internal names, file paths, plans or roadmap.

## Components

Pages use only these components, with only these props:

- `<Callout type="note|tip|warning" title="…">`: a note or warning; both props optional.
- `<Tabs items={["A", "B"]}>` holding `<Tab value="A">`: alternatives, such as one example in
  several languages.
- `<Cards>` holding `<Card title="…" href="…">`: links to other pages, each with a sentence.

Label every code block with `bash`, `javascript`, `typescript`, `json`, `kotlin` or `swift`, the
languages the site highlights. No imports, exports, `{expressions}` or HTML elements. Every page has frontmatter with exactly a
`title` and a `description`, and is listed in its folder's `meta.json`. Link to pages by their
address from the root (`/guides/first-page#a-heading`) and to the API reference as
`/api-reference` only.

## Commands

From the repository root, with Bun and Vale installed:

- `bun install`
- `bun run check:pages`: every page compiles as MDX with stand-in components; frontmatter and
  navigation files are valid.
- `bun run check:links`: internal links and anchors resolve.
- `bun run check:prose`: Vale, with the Australian English dictionary, sentence-case headings and
  the "get" rule.
- `bun run check`: all three. Run it before every push.

## Pull requests and CI

- Every pull request runs `.github/workflows/ci.yml` on GitHub-hosted runners. Its one required
  check is **All checks passed**, which fails unless every other job succeeded. Never add an `if:`,
  `continue-on-error` or path filter to the other jobs, and never weaken a check to make it pass.
- Pin every action to a full commit SHA with its version in a trailing comment, set
  `permissions: contents: read` and `persist-credentials: false` on every checkout.
- `main` takes changes only through pull requests merged with the rebase method. A push to `main`
  runs `.github/workflows/deploy.yml`, which asks Workers Builds to rebuild the site through the
  `DOCS_DEPLOY_HOOK` secret.

## Authorship

- Commit as the repository owner: `git config user.name "Romain Francez"` and
  `git config user.email "1330814+romainfrancez@users.noreply.github.com"` before the first commit.
- Commit messages carry no `Co-Authored-By` or session trailers, no "Generated with" line, no
  session link and no model name. Check `git log --format='%an <%ae>%n%b'` before every push.
- Pull request descriptions carry no attribution either.
