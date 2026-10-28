import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Login from './pages/Login'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Applications from './pages/Applications'
import ApplicationDetail from './pages/ApplicationDetail'
import Alerts from './pages/Alerts'
import Escalations from './pages/Escalations'
import Compliance from './pages/Compliance'
import Evc from './pages/Evc'
import AuditLogs from './pages/AuditLogs'
export default function App() {
  return (<Routes><Route path="/" element={<Home />} /><Route path="/login" element={<Login />} /><Route element={<RequireAuth />}><Route element={<Layout />}><Route path="/dashboard" element={<Dashboard />} /><Route path="/applications" element={<Applications />} /><Route path="/applications/:id" element={<ApplicationDetail />} /><Route path="/alerts" element={<Alerts />} /><Route path="/escalations" element={<Escalations />} /><Route path="/compliance" element={<Compliance />} /><Route path="/evc" element={<Evc />} /><Route path="/audit-logs" element={<AuditLogs />} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Route></Route></Routes>)
}
