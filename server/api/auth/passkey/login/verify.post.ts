import { type AuthenticationResponseJSON, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'

// Step 2 of signing in with a passkey. Every failure, whatever the reason
// (unknown credential, bad signature, replayed counter, no longer a member),
// is the same 401, so the endpoint says nothing about who is a member.
export default defineEventHandler(async (event) => {
  // Every failure is logged with its reason (audit) and answered the same way.
  const fail = (reason: string, stored?: { id: string; personId: string }) => {
    auditPasskey('login_failed', { reason, personId: stored?.personId, credentialRowId: stored?.id })
    return createError({ statusCode: 401, message: 'Sign-in failed' })
  }

  const body = await readBody<{ response?: AuthenticationResponseJSON }>(event)
  const response = body?.response
  if (!response || typeof response.id !== 'string' || response.id.length > MAX_CREDENTIAL_ID_LENGTH) {
    throw fail('bad_request')
  }
  // Reads the cookie and spends the challenge (one-shot).
  const challenge = await takePasskeyChallenge(event, 'login')
  if (!challenge) throw fail('challenge_invalid_or_spent')

  const stored = await findCredential(response.id)
  if (!stored) throw fail('unknown_credential')

  // The authenticator also returns the user handle we set at registration (the
  // person id). It must name the credential's owner.
  const userHandle = response.response?.userHandle
  if (userHandle && userHandle !== isoBase64URL.fromUTF8String(stored.personId)) {
    throw fail('user_handle_mismatch', stored)
  }

  const { rpID, origins } = relyingParty(event)
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: stored.publicKey,
        counter: stored.counter,
        transports: stored.transports,
      },
      // See register/verify: a passkey is a sign-in factor on its own here.
      requireUserVerification: true,
    })
  } catch {
    // Includes a counter that did not move forward (possible cloned authenticator).
    throw fail('verification_failed', stored)
  }
  if (!verification.verified) throw fail('verification_failed', stored)

  // The login gate, the same one the magic link and every /api/member/ request use.
  if (!(await isPortalMember(stored.personId))) throw fail('not_portal_member', stored)

  const { newCounter, credentialDeviceType, credentialBackedUp } = verification.authenticationInfo
  if (!(await recordPasskeyUse(stored.id, newCounter, credentialDeviceType, credentialBackedUp))) {
    throw fail('counter_race', stored)
  }

  const sql = useDatabase()
  const persons = await sql`SELECT name FROM persons WHERE id = ${stored.personId}`
  issueSession(event, stored.personId, persons[0]?.name ?? '')
  auditPasskey('login_ok', { personId: stored.personId, credentialRowId: stored.id })

  return { ok: true }
})
