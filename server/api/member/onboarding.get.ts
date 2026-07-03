// GET /api/member/onboarding
// Personalized AI-onboarding bootstrap for the signed-in member. Derives a
// role from network group memberships (same convention as discounts:
// braintrust = board) and returns the toolset plus a copy-pasteable prompt
// that boots a fresh Claude Code install into the CTO Roundtable workspace.
//
// Every role bootstraps into ~/code/ctoroundtable/personal-hq, the default
// session home (skills repo 17594d5): setup scripts ship inside the plugin,
// credentials live machine-level, and org repos are wired in as
// additionalDirectories by /onboarding per role. The marketplace must be
// registered in the GLOBAL ~/.claude/settings.json before the restart, or a
// plain personal-hq folder never fetches the skills.

interface RoleProfile {
  role: string
  label: string
  // What the person is being set up to do, phrased for the agent prompt.
  goal: string
  // Norwegian tool list rendered on the member page.
  tools: string[]
  // English equivalents spliced into the generated agent prompt.
  promptTools: string[]
}

const PROFILES: Record<string, RoleProfile> = {
  board: {
    role: 'board',
    label: 'Styret (nettverksdrift)',
    goal: 'manage the CTO Roundtable network: read the member database, post to Slack, send email and manage the calendar with their own Google account, and manage Luma events',
    tools: [
      'Slack MCP (via /slack-mcp-setup)',
      'gog CLI for Gmail og Kalender (via /gog-setup)',
      'Neon MCP, lesetilgang til medlemsdatabasen (via /neon-mcp-setup)',
      'Luma CLI + MCP for events (via /luma-cli-setup)',
    ],
    promptTools: [
      'Slack MCP (via /slack-mcp-setup)',
      'gog CLI for Gmail and Calendar (via /gog-setup)',
      'Neon MCP with read access to the member database (via /neon-mcp-setup)',
      'Luma CLI + MCP for events (via /luma-cli-setup)',
    ],
  },
  'invest-committee': {
    role: 'invest-committee',
    label: 'Investeringskomite',
    goal: 'work with CTO Roundtable Invest deal flow: meetings, pitches and recommendations',
    tools: [
      'Slack MCP (via /slack-mcp-setup)',
      'gog CLI for Gmail og Kalender (via /gog-setup)',
      'Neon MCP, lesetilgang til medlemsdatabasen (via /neon-mcp-setup)',
      'Coda og Circleback MCP (kobles inn av /onboarding)',
    ],
    promptTools: [
      'Slack MCP (via /slack-mcp-setup)',
      'gog CLI for Gmail and Calendar (via /gog-setup)',
      'Neon MCP with read access to the member database (via /neon-mcp-setup)',
      'Coda and Circleback MCP (wired in by /onboarding)',
    ],
  },
  investor: {
    role: 'investor',
    label: 'Investor',
    goal: 'follow CTO Roundtable Invest as an investor',
    tools: ['Slack MCP (via /slack-mcp-setup)'],
    promptTools: ['Slack MCP (via /slack-mcp-setup)'],
  },
  member: {
    role: 'member',
    label: 'Medlem',
    goal: 'participate in the CTO Roundtable network',
    tools: ['Slack MCP (via /slack-mcp-setup)'],
    promptTools: ['Slack MCP (via /slack-mcp-setup)'],
  },
}

function buildPrompt(name: string, email: string | null, profile: RoleProfile): string {
  const identity = email ? `${name} <${email}>` : name
  const firstName = name.split(' ')[0]

  return `You are onboarding ${identity} into the CTO Roundtable AI workspace. Role: ${profile.role}. Goal: ${profile.goal}. Verify each step before moving on.

1. Prerequisites:
   - git
   - gh authenticated: gh auth status
   - org access: gh api user/memberships/orgs/cto-roundtable --jq .state prints "active". If not, accept the invite at https://github.com/orgs/cto-roundtable/invitation first.
   - gh auth setup-git, then confirm: git ls-remote https://github.com/cto-roundtable/cto-roundtable-skills.git (skills are fetched from there on session start).

2. Register the shared skills in the GLOBAL ~/.claude/settings.json (merge with jq or python, never overwrite existing keys):
   {
     "extraKnownMarketplaces": {
       "cto-roundtable": {
         "source": { "source": "git", "url": "https://github.com/cto-roundtable/cto-roundtable-skills.git" }
       }
     },
     "enabledPlugins": { "cto-roundtable@cto-roundtable": true }
   }

3. Create the session home (plain folder, not a git repo):
   mkdir -p ~/code/ctoroundtable/personal-hq

4. Restart Claude Code from it, accept the trust/plugin prompts:
   cd ~/code/ctoroundtable/personal-hq && claude

5. Run /onboarding and pick the "${profile.role}" role. It builds the session home (MCP config, settings, org repos per role as additional directories) and sets up and verifies:
${profile.promptTools.map((t) => `   - ${t}`).join('\n')}
   Accept anything from this list offered as optional.

If access is missing (GitHub repo, Neon invite), stop and tell ${firstName} exactly what to ask the board for.`
}

export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  const person = await sql`
    SELECT p.name,
      (SELECT ci.value FROM contact_infos ci
       WHERE ci.person_id = p.id AND ci.type = 'email'
       ORDER BY ci.is_primary DESC
       LIMIT 1) AS email
    FROM persons p
    WHERE p.id = ${session.personId}
    LIMIT 1
  `
  if (person.length === 0) {
    throw createError({ statusCode: 404, message: 'Member not found' })
  }

  const memberships = await sql`
    SELECT ng.slug
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE m.person_id = ${session.personId}
  `
  const slugs = new Set(memberships.map((m: any) => m.slug))

  let role = 'member'
  if (slugs.has('braintrust')) role = 'board'
  else if (slugs.has('current-komite')) role = 'invest-committee'
  else if ([...slugs].some((s) => s.startsWith('invest-'))) role = 'investor'

  const profile = PROFILES[role]!
  const name: string = person[0]!.name
  const email: string | null = person[0]!.email || null

  return {
    name,
    role: profile.role,
    roleLabel: profile.label,
    isBoard: role === 'board',
    tools: profile.tools,
    prompt: buildPrompt(name, email, profile),
  }
})
