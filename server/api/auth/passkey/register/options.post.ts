import { generateRegistrationOptions } from '@simplewebauthn/server'

// Step 1 of adding a passkey, from inside a session. The member's existing
// passkeys go in excludeCredentials so the same authenticator is not registered
// twice. residentKey 'required' makes it a discoverable credential, which is what
// lets the login screen offer it without asking for an email first.
export default defineEventHandler(async (event) => {
  const session = await requirePortalSession(event)
  const { rpID } = relyingParty(event)

  const sql = useDatabase()
  const emails = await sql`
    SELECT value FROM contact_infos
    WHERE person_id = ${session.personId} AND type = 'email'
    ORDER BY is_primary DESC
    LIMIT 1
  `

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    // The user handle is the person id: opaque, stable, and what login/verify
    // cross-checks against the credential's owner.
    userID: new TextEncoder().encode(session.personId),
    userName: emails[0]?.value || session.name,
    userDisplayName: session.name,
    attestationType: 'none',
    excludeCredentials: await listCredentialDescriptors(session.personId),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  })

  setPasskeyChallenge(event, options.challenge, 'register', session.personId)
  return options
})
