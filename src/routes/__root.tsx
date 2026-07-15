import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { RouterContext } from '../router'
import { fetchSession } from '../server/auth'

import appCss from '../styles.css?url'

const SESSION_TTL_MS = 15_000

type SessionCache = {
  session: Awaited<ReturnType<typeof fetchSession>>
  fetchedAt: number
}

let sessionInFlight: Promise<SessionCache> | null = null
let sessionCache: SessionCache | null = null

async function getSessionCached() {
  if (typeof window === 'undefined') {
    return fetchSession()
  }
  const cached = sessionCache
  if (cached && Date.now() - cached.fetchedAt < SESSION_TTL_MS) {
    return cached.session
  }
  if (!sessionInFlight) {
    sessionInFlight = fetchSession()
      .then((session) => {
        sessionCache = { session, fetchedAt: Date.now() }
        return sessionCache
      })
      .finally(() => {
        sessionInFlight = null
      })
  }
  return (await sessionInFlight).session
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var themes=['concarino','light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk'];var darkThemes={dark:1,synthwave:1,halloween:1,forest:1,black:1,luxury:1,dracula:1,business:1,night:1,coffee:1,dim:1,abyss:1,sunset:1};var selection=(stored==='system'||stored==='auto'||!stored)?'system':(themes.indexOf(stored)>=0?stored:'system');var root=document.documentElement;var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;if(selection==='system'){root.removeAttribute('data-theme');root.style.colorScheme=prefersDark?'dark':'light';}else{root.setAttribute('data-theme',selection);root.style.colorScheme=darkThemes[selection]?'dark':'light';}}catch(e){}})();`

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await getSessionCached()
    return { session }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'con-carino',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="bg-base-100 text-base-content font-sans antialiased [overflow-wrap:anywhere] selection:bg-primary/24">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
