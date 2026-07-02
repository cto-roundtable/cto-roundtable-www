// GET /api/member/onboarding
// Personalized AI-onboarding bootstrap for the signed-in member. Derives a
// role from network group memberships (same convention as discounts:
// braintrust = board) and returns the toolset plus a copy-pasteable prompt
// that boots a fresh Claude Code install into the CTO Roundtable workspace.
//
// Every role routes through a clone of ctoroundtable-hq: the repo's checked-in
// .claude/settings.json registers the shared-skills plugin marketplace, and
// the /onboarding skill plus the per-tool setup skills all invoke
// ./infrastructure/*.sh scripts that only exist in that checkout. A repo-less
// bootstrap (the personal-hq idea) strands the agent on those scripts today;
// revisit once the skills ship self-contained setup.

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

  return `You are onboarding ${identity} into the CTO Roundtable AI workspace on this machine.
Role: ${profile.role}. Goal: ${profile.goal}.

Work step by step. Verify every step before moving to the next, and explain what you are doing in plain language: ${firstName} may not live in a terminal every day.

1. Prerequisites. Check that these exist and help install anything missing:
   - git
   - gh (GitHub CLI), authenticated: gh auth status
   - GitHub org access: gh api user/memberships/orgs/cto-roundtable --jq .state should print "active".
     If it does not, ${firstName} needs to accept the invite at https://github.com/orgs/cto-roundtable/invitation (or ask the board for one). Stop here until this works.
   - Let git reuse the gh credentials for private HTTPS repos: gh auth setup-git
     Then prove it works: git ls-remote https://github.com/cto-roundtable/cto-roundtable-skills.git should list refs, not fail. The shared skills are fetched from this repo on session start, so this must pass before the restart below.

2. Clone the workspace HQ repo. Its checked-in .claude/settings.json registers the shared skills, and its infrastructure/ scripts drive the tool setup:
   git clone https://github.com/cto-roundtable/ctoroundtable-hq.git ~/code/ctoroundtable/ctoroundtable-hq

3. Tell ${firstName} to restart Claude Code from that folder:
   cd ~/code/ctoroundtable/ctoroundtable-hq && claude
   On first start, accept the prompts to trust the folder and enable the cto-roundtable plugin.

4. In the new session, type /onboarding and pick the "${profile.role}" role. The onboarding skill walks through the tools for this role one at a time and verifies each one:
${profile.promptTools.map((t) => `   - ${t}`).join('\n')}
   If the skill offers any of these as optional, accept it: this list is what the role should end up with. Nothing should be reported as done without a passing check.

If a step fails because access is missing (a GitHub repo, a Google secret, a Neon invite), stop and tell ${firstName} exactly what to ask the board for, then continue once it is granted.`
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
