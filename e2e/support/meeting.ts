import { createHash, randomBytes } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { type APIRequestContext, request } from '@playwright/test'
import { e2eEnv } from './guard'
import type { Persona } from './personas'
import { cookieHeader, persona } from './run'

// Helpers for the vote specs (meeting.spec.ts, deal-vote.spec.ts). Everything
// here writes to the e2e BRANCH only: e2eEnv() refuses production first.

export const db = () => neon(e2eEnv().databaseUrl)

/** An API client signed in as a persona (the same forged session the views use). */
export async function apiAs(key: string): Promise<APIRequestContext & { persona: Persona }> {
  const p = persona(key)
  const ctx = await request.newContext({
    baseURL: e2eEnv().baseUrl,
    extraHTTPHeaders: { cookie: cookieHeader(p) },
  })
  return Object.assign(ctx, { persona: p })
}

export async function anonymous(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: e2eEnv().baseUrl })
}

/**
 * A bearer token for the admin API, owned by a persona, inserted straight into the
 * branch's api_tokens (the device flow needs a person at a browser). Same shape
 * as scripts/mint-api-token.mjs: ctr_ + 43 base64url chars, only the sha256 stored.
 */
export async function branchApiToken(ownerKey: string, scopes: string[]): Promise<string> {
  const token = `ctr_${randomBytes(32).toString('base64url')}`
  const hash = createHash('sha256').update(token).digest('hex')
  await db()`
    INSERT INTO api_tokens (name, owner_person_id, token_hash, scopes, expires_at)
    VALUES (${`e2e ${ownerKey}`}, ${persona(ownerKey).personId}, ${hash}, ${scopes}, NOW() + interval '1 day')
  `
  return token
}
