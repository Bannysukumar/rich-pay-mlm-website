import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { Toaster } from 'react-hot-toast'
import { AppRouter } from '@/app/router'
import { store } from '@/app/store'
import { useAuthBootstrap } from '@/hooks/useAuth'

function Bootstrap() {
  useAuthBootstrap()
  return <AppRouter />
}

export default function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <Bootstrap />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#0f1014',
              color: '#e4e4e7',
              border: '1px solid rgba(212, 175, 55, 0.25)',
            },
          }}
        />
      </BrowserRouter>
    </Provider>
  )
}
