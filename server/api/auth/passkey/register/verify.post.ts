import { type RegistrationResponseJSON, verifyRegistrationResponse } from '@simplewebauthn/server'

// Step 2 of adding a passkey: verify the authenticator's response against the
// challenge we signed in step 1, for the same person, and store the public key.
export default defineEventHandler(async (event) => {
  const session = await requirePortalSession(event)
  if (!isRecentSession(session)) {
    setResponseStatus(event, 403)
    return { code: 'reauth' }
  }

  const body = await readBody<{ response?: RegistrationResponseJSON; name?: unknown }>(event)
  const challenge = await takePasskeyChallenge(event, 'register')
  const response = body?.response

  if (
    !challenge ||
    challenge.personId !== session.personId ||
    !response ||
    typeof response.id !== 'string' ||
    response.id.length > MAX_CREDENTIAL_ID_LENGTH
  ) {
    throw createError({ statusCode: 400, message: 'Registration failed' })
  }
  if ((await countPasskeys(session.personId)) >= MAX_PASSKEYS) {
    setResponseStatus(event, 409)
    return { code: 'limit', max: MAX_PASSKEYS }
  }

  const { rpID, origins } = relyingParty(event)
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      // A passkey here replaces the email as a sign-in factor, so we only keep
      // one the authenticator verified (Face ID, fingerprint, PIN).
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

  auditPasskey('registered', { personId: session.personId, credentialRowId: id })
  sendNewPasskeyMail(event, session.personId, cleanPasskeyName(body.name)).catch((err) =>
    console.error('[passkey] failed to send new-passkey mail', err),
  )

  return { ok: true, id }
})
