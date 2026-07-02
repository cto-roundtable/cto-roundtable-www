// GET /api/member/onboarding
// Personalized AI-onboarding bootstrap for the signed-in member. Derives a
// role from network group memberships (same convention as discounts:
// braintrust = board) and returns the toolset plus a copy-pasteable prompt
// that boots a fresh Claude Code install into the CTO Roundtable workspace.

interface RoleProfile {
  role: string
  label: string
  // What the person is being set up to do, phrased for the agent prompt.
  goal: string
  // Tools the /onboarding skill will configure for this role, with the
  // dedicated setup skill that owns each one.
  tools: string[]
  // Repo-less roles get the personal-hq folder; committee/developer flows
  // clone actual repos via /onboarding instead.
  repoless: boolean
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
    repoless: true,
  },
  'invest-committee': {
    role: 'invest-committee',
    label: 'Investeringskomite',
    goal: 'work with CTO Roundtable Invest deal flow: meetings, pitches and recommendations',
    tools: [
      'Slack MCP (via /slack-mcp-setup)',
      'gog CLI for Gmail og Kalender (via /gog-setup)',
      'Coda og Circleback MCP (settes opp av /onboarding)',
    ],
    repoless: false,
  },
  investor: {
    role: 'investor',
    label: 'Investor',
    goal: 'follow CTO Roundtable Invest as an investor',
    tools: ['Slack MCP (via /slack-mcp-setup)'],
    repoless: true,
  },
  member: {
    role: 'member',
    label: 'Medlem',
    goal: 'participate in the CTO Roundtable network',
    tools: ['Slack MCP (via /slack-mcp-setup)'],
    repoless: true,
  },
}

function buildPrompt(name: string, email: string | null, profile: RoleProfile): string {
  const identity = email ? `${name} <${email}>` : name
  const firstName = name.split(' ')[0]

  const workspaceStep = profile.repoless
    ? `3. Create the personal workspace folder:
   mkdir -p ~/code/ctoroundtable/personal-hq`
    : `3. Create the workspace root (the /onboarding skill clones the repos this role needs into it):
   mkdir -p ~/code/ctoroundtable`

  const restartFolder = profile.repoless ? '~/code/ctoroundtable/personal-hq' : '~/code/ctoroundtable'

  return `You are onboarding ${identity} into the CTO Roundtable AI workspace on this machine.
Role: ${profile.role}. Goal: ${profile.goal}.

Work step by step. Verify every step before moving to the next, and explain what you are doing in plain language: ${firstName} may not live in a terminal every day.

1. Prerequisites. Check that these exist and help install anything missing:
   - git
   - gh (GitHub CLI), authenticated: gh auth status
   - GitHub org access: gh api user/memberships/orgs/cto-roundtable --jq .state should print "active".
     If it does not, ${firstName} needs to accept the invite at https://github.com/orgs/cto-roundtable/invitation (or ask the board for one). Stop here until this works.

2. Register the CTO Roundtable shared skills. Merge these keys into the GLOBAL ~/.claude/settings.json (create the file if it does not exist; merge carefully, never drop existing keys):
   {
     "extraKnownMarketplaces": {
       "cto-roundtable": {
         "source": { "source": "git", "url": "https://github.com/cto-roundtable/cto-roundtable-skills.git" }
       }
     },
     "enabledPlugins": { "cto-roundtable@cto-roundtable": true }
   }

${workspaceStep}

4. Tell ${firstName} to restart Claude Code from that folder:
   cd ${restartFolder} && claude
   In the new session, type /onboarding and pick the "${profile.role}" role. The onboarding skill takes over and sets up, one by one:
${profile.tools.map((t) => `   - ${t}`).join('\n')}
   Each setup skill verifies its own tool. Nothing should be reported as done without a passing check.

If a step fails because access is missing (GitHub repo, Google secret, Neon invite), stop and tell ${firstName} exactly what to ask the board for, then continue once it is granted.`
}

export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  const person = await sql`
    SELECT p.name,
      (SELECT ci.value FROM contact_infos ci
       WHERE ci.person_id = p.id AND ci.type = 'email' AND ci.is_primary
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
