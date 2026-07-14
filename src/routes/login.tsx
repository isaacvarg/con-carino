import { createFileRoute, redirect, useSearch } from '@tanstack/react-router'
import { signIn } from '#/lib/auth-client'

type LoginSearch = {
  redirect?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.session) {
      throw redirect({ to: search.redirect ?? '/' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = useSearch({ from: '/login' })
  const callbackUrl = redirectTo ?? '/'

  return (
    <main className="flex min-h-[75vh] items-center justify-center bg-base-200 px-4 py-16">
      <div className="card w-full max-w-md bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-8 sm:p-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              className="inline-flex size-3 rounded-full bg-primary"
              aria-hidden="true"
            />
            <h1 className="font-sans text-3xl font-bold tracking-tight text-secondary sm:text-4xl">
              Con cariño
            </h1>
            <p className="text-sm text-base-content/60 sm:text-base">
              Sign in to manage your accounts and transactions.
            </p>
          </div>

          <div className="divider my-0 text-xs text-base-content/40">
            Continue with
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void signIn('google', callbackUrl)}
              className="btn btn-outline btn-block rounded-full"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => void signIn('discord', callbackUrl)}
              className="btn btn-secondary btn-block rounded-full"
            >
              <DiscordIcon />
              Continue with Discord
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.9a.07.07 0 0 0-.08.03c-.2.38-.44.87-.6 1.25a18.3 18.3 0 0 0-5.48 0 12.6 12.6 0 0 0-.6-1.25.08.08 0 0 0-.09-.03 19.7 19.7 0 0 0-4.9 1.47.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.29 1.22-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.12c.36.7.78 1.36 1.22 1.98a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.54-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.22 0 2.18 1.1 2.16 2.42 0 1.34-.94 2.42-2.16 2.42z" />
    </svg>
  )
}
