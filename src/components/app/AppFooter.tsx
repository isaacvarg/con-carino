export default function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto flex flex-col gap-3 border-t border-base-300 px-4 py-5 text-sm text-base-content/70 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="m-0 text-base-content/70">
          Copyright © {year} Con cariño
        </p>
        <a href="#" className="link link-hover text-base-content/70">
          Privacy Policy
        </a>
        <a href="#" className="link link-hover text-base-content/70">
          Terms and conditions
        </a>
        <a href="#" className="link link-hover text-base-content/70">
          Contact
        </a>
      </div>
    </footer>
  )
}
