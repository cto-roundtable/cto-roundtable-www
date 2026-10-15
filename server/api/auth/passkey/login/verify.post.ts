import { type AuthenticationResponseJSON, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'

// Step 2 of signing in with a passkey. Every failure, whatever the reason
// (unknown credential, bad signature, replayed counter, no longer a member),
// is the same 401, so the endpoint says nothing about who is a member.
export default defineEventHandler(async (event) => {
  const fail = () => createError({ statusCode: 401, message: 'Sign-in failed' })

  const body = await readBody<{ response?: AuthenticationResponseJSON }>(event)
  const challenge = takePasskeyChallenge(event, 'login')
  const response = body?.response
  if (!challenge || !response || typeof response.id !== 'string') throw fail()

  const stored = await findCredential(response.id)
  if (!stored) throw fail()

  // The authenticator also returns the user handle we set at registration (the
  // person id). It must name the credential's owner.
  const userHandle = response.response?.userHandle
  if (userHandle && userHandle !== isoBase64URL.fromUTF8String(stored.personId)) throw fail()

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
    throw fail()
  }
  if (!verification.verified) throw fail()

  // The login gate, the same one the magic link and every /api/member/ request use.
  if (!(await isPortalMember(stored.personId))) throw fail()

  const { newCounter, credentialDeviceType, credentialBackedUp } = verification.authenticationInfo
  if (!(await recordPasskeyUse(stored.id, newCounter, credentialDeviceType, credentialBackedUp))) throw fail()

  const sql = useDatabase()
  const persons = await sql`SELECT name FROM persons WHERE id = ${stored.personId}`
  issueSession(event, stored.personId, persons[0]?.name ?? '')

  return { ok: true }
})
