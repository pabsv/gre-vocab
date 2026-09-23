import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { watchSystemTheme } from './lib/theme'
import { Layout } from './routes/Layout'
import { MistakesRoute } from './routes/Mistakes'
import { SessionRoute } from './routes/Session'
import { SettingsRoute } from './routes/Settings'
import { StatsRoute } from './routes/Stats'
import { Today } from './routes/Today'
import { WordsRoute } from './routes/Words'
import { useStore } from './state/store'

const router = createBrowserRouter([
  { path: '/session', element: <SessionRoute /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <Today /> },
      { path: 'words', element: <WordsRoute /> },
      { path: 'mistakes', element: <MistakesRoute /> },
      { path: 'stats', element: <StatsRoute /> },
      { path: 'settings', element: <SettingsRoute /> },
      { path: '*', element: <Today /> },
    ],
  },
])

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)

  useEffect(() => {
    init().catch((err) => useStore.setState({ error: String(err), ready: true }))
    return watchSystemTheme(() => useStore.getState().settings.theme)
  }, [init])

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="marker anim-fade font-display text-3xl font-semibold">Vocab</span>
      </div>
    )
  }
  return <RouterProvider router={router} />
}
