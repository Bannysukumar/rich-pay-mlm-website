import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { AppRouter } from '@/app/router'
import { store } from '@/app/store'
import { BodyToaster } from '@/components/system/BodyToaster'
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
        <BodyToaster />
      </BrowserRouter>
    </Provider>
  )
}
