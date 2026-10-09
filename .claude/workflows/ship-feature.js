export const meta = {
  name: 'ship-feature',
  description: 'Build features from their spec, fact-check and visually QA them, fix findings, re-verify',
  whenToUse: 'Building or substantially changing a portfolio feature that has a docs/features/*.md spec',
  phases: [
    { title: 'Build', detail: 'builder agent per feature, scoped quality gate' },
    { title: 'Check', detail: 'verifier (fact-check vs installed APIs + spec) and ui-qa in parallel' },
    { title: 'Fix', detail: 'builder fixes blocking and should-fix findings' },
    { title: 'Re-verify', detail: 'confirm blocking findings are gone' },
  ],
}

// args: { repo: '/abs/path', features: [{ key, word, spec, routes: [], e2e }] }
const REPO = args.repo
const role = (name) =>
  `Work in ${REPO} (cd there for every command). First read ${REPO}/CLAUDE.md and ` +
  `${REPO}/.claude/agents/${name}.md, and act exactly as that agent definition says, ` +
  `including its output format.`

const hasIssues = (text, levels) => !!text && levels.some((l) => text.includes(`[${l}]`))

const results = await pipeline(
  args.features,

  (f) =>
    agent(
      `${role('builder')}\n\nTask: implement the feature specified in ${f.spec}, completely, ` +
        `meeting every acceptance criterion. Scope word: \`${f.word}\`. ` +
        `Gate: \`scripts/check.sh --scope ${f.word}\`.`,
      { label: `build:${f.key}`, phase: 'Build', model: 'sonnet' },
    ),

  async (build, f) => {
    const [verify, ui] = await parallel([
      () =>
        agent(
          `${role('verifier')}\n\nVerify the feature specified in ${f.spec}. Scope word: ` +
            `\`${f.word}\`. Builder's summary:\n${build}`,
          { label: `verify:${f.key}`, phase: 'Check' },
        ),
      () =>
        agent(
          `${role('ui-qa')}\n\nQA feature \`${f.word}\`. Routes: ${f.routes.join(' ')}. ` +
            `E2E spec: ${f.e2e}. Spec for intent: ${f.spec}.`,
          { label: `ui-qa:${f.key}`, phase: 'Check', model: 'sonnet' },
        ),
    ])
    return { build, verify, ui }
  },

  async (r, f) => {
    const needsFix =
      hasIssues(r.verify, ['blocking', 'should-fix']) || hasIssues(r.ui, ['blocking', 'should-fix'])
    if (!needsFix) return { ...r, fix: null }
    const fix = await agent(
      `${role('builder')}\n\nFix the findings below for the feature in ${f.spec}. Fix every ` +
        `[blocking] and [should-fix]; fix a [nit] only if it is a one-line change. If you ` +
        `disagree with a finding, leave it and say why in one line. Gate: ` +
        `\`scripts/check.sh --scope ${f.word}\`.\n\n## Verifier findings\n${r.verify}\n\n` +
        `## UI QA findings\n${r.ui}`,
      { label: `fix:${f.key}`, phase: 'Fix', model: 'sonnet' },
    )
    return { ...r, fix }
  },

  async (r, f) => {
    const hadBlocking = hasIssues(r.verify, ['blocking']) || hasIssues(r.ui, ['blocking'])
    if (!r.fix || !hadBlocking) return { ...r, reverify: null }
    const reverify = await agent(
      `${role('verifier')}\n\nRe-verify only these previously reported findings for ` +
        `${f.spec} (scope \`${f.word}\`). Run the gate, then for each [blocking] finding ` +
        `state fixed / not fixed with evidence. Report any new defect the fix introduced.\n\n` +
        `## Earlier findings\n${r.verify}\n\n${r.ui}\n\n## Fixer's summary\n${r.fix}`,
      { label: `reverify:${f.key}`, phase: 'Re-verify' },
    )
    return { ...r, reverify }
  },
)

return results.map((r, i) => ({ feature: args.features[i].key, ...r }))
