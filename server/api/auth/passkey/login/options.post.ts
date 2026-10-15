import { generateAuthenticationOptions } from '@simplewebauthn/server'

// Step 1 of signing in with a passkey. No email is asked for: allowCredentials
// is empty, so the browser offers whichever discoverable passkey the member has
// for this site. Nothing about any member is read or revealed here.
export default defineEventHandler(async (event) => {
  const { rpID } = relyingParty(event)
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [],
    userVerification: 'preferred',
  })
  setPasskeyChallenge(event, options.challenge, 'login')
  return options
})
