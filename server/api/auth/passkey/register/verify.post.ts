import { type RegistrationResponseJSON, verifyRegistrationResponse } from '@simplewebauthn/server'

// Step 2 of adding a passkey: verify the authenticator's response against the
// challenge we signed in step 1, for the same person, and store the public key.
export default defineEventHandler(async (event) => {
  const session = await requirePortalSession(event)
  const body = await readBody<{ response?: RegistrationResponseJSON; name?: unknown }>(event)
  const challenge = takePasskeyChallenge(event, 'register')

  if (!challenge || challenge.personId !== session.personId || !body?.response) {
    throw createError({ statusCode: 400, message: 'Registration failed' })
  }

  const { rpID, origins } = relyingParty(event)
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      // The options ask for 'preferred', but a passkey here replaces the email
      // as a sign-in factor, so we only keep one the authenticator verified
      // (Face ID, fingerprint, PIN). Platform passkeys always do.
      requireUserVerification: true,
    })
  } catch {
    throw createError({ statusCode: 400, message: 'Registration failed' })
  }
  if (!verification.verified) {
    throw createError({ statusCode: 400, message: 'Registration failed' })
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const id = await insertCredential({
    personId: session.personId,
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    name: cleanPasskeyName(body.name),
  })
  if (!id) {
    throw createError({ statusCode: 409, message: 'This passkey is already registered' })
  }

  return { ok: true, id }
})
