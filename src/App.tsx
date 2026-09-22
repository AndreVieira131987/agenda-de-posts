import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { CalendarioCliente } from './pages/CalendarioCliente'
import { Clientes } from './pages/Clientes'
import { Login } from './pages/Login'
import { PaginaPublica } from './pages/PaginaPublica'
import { PostForm } from './pages/PostForm'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/clientes" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/p/:token" element={<PaginaPublica />} />

        <Route
          path="/clientes"
          element={
            <ProtectedRoute>
              <Clientes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes/:clientId/calendario"
          element={
            <ProtectedRoute>
              <CalendarioCliente />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes/:clientId/posts/novo"
          element={
            <ProtectedRoute>
              <PostForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes/:clientId/posts/:postId/editar"
          element={
            <ProtectedRoute>
              <PostForm />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/clientes" replace />} />
      </Routes>
    </AuthProvider>
  )
}
