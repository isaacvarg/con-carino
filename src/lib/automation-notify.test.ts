import { describe, expect, it } from 'vitest'
import {
  buildAccountUrl,
  buildLowBalanceEmail,
} from '#/lib/automation-notify'

function build(
  overrides: Partial<Parameters<typeof buildLowBalanceEmail>[0]> = {},
) {
  return buildLowBalanceEmail({
    automationName: 'Pot floor',
    accountName: 'Vacation Pot',
    balance: 148.2,
    threshold: 200,
    accountUrl: 'https://enos.example.com/accounts/acct-pot',
    ...overrides,
  })
}

describe('buildLowBalanceEmail', () => {
  it('names the account and the floor in the subject', () => {
    expect(build().subject).toBe('Vacation Pot is below $200.00')
  })

  it('states the balance, the floor and the rule that set it', () => {
    const email = build()
    expect(email.text).toContain(
      'Vacation Pot is at $148.20, below the $200.00 floor set by “Pot floor”.',
    )
    expect(email.html).toContain('$148.20')
  })

  it('formats a negative balance', () => {
    expect(build({ balance: -12 }).text).toContain('-$12.00')
  })

  it('formats thousands with a separator', () => {
    expect(build({ balance: 1234.56, threshold: 2000 }).text).toContain('$1,234.56')
  })

  it('links to the account when an origin is known', () => {
    const email = build()
    expect(email.text).toContain(
      'Open the account: https://enos.example.com/accounts/acct-pot',
    )
    expect(email.html).toContain(
      '<a href="https://enos.example.com/accounts/acct-pot">',
    )
  })

  it('falls back to in-app instructions without a link', () => {
    const email = build({ accountUrl: null })
    expect(email.text).toContain('Open the account in the app to top it up.')
    expect(email.html).not.toContain('<a href')
  })

  it('escapes html in the account and automation names, but not in text', () => {
    const email = build({ accountName: 'Pot <b>&</b>' })
    expect(email.html).toContain('&lt;b&gt;&amp;&lt;/b&gt;')
    expect(email.html).not.toContain('<b>')
    expect(email.text).toContain('Pot <b>&</b>')
  })
})

describe('buildAccountUrl', () => {
  it('builds an account deep link', () => {
    expect(buildAccountUrl('https://enos.example.com', 'acct-1')).toBe(
      'https://enos.example.com/accounts/acct-1',
    )
  })

  it('strips a trailing slash from the origin', () => {
    expect(buildAccountUrl('https://enos.example.com/', 'acct-1')).toBe(
      'https://enos.example.com/accounts/acct-1',
    )
  })
})
