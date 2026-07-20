import { Link, createFileRoute } from '@tanstack/react-router'

// authConfig.pages.verifyRequest points here: Auth.js redirects to this route
// after accepting an email address and dispatching the magic link.
export const Route = createFileRoute('/verify-request')({
  component: VerifyRequestPage,
})

function VerifyRequestPage() {
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
              Check your email
            </h1>
            <p className="text-sm text-base-content/60 sm:text-base">
              We sent you a sign-in link. Open it on this device to finish
              signing in — the link works once and expires shortly.
            </p>
          </div>

          <Link to="/login" className="btn btn-outline btn-block rounded-full">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
