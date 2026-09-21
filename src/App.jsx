import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './LoginPage';
import MainLayout from './MainLayout';
import IsinMaster from './IsinMaster';
import Company from './Company';
import Users from './Users';
import AddUser from './AddUser';
import EditUser from './EditUser';
import Roles from './Roles';
import LoginHistoryList from './LoginHistoryList';
import Profile from './Profile';

/*
 * ── How React Router works ──────────────────────────────────────────────────
 *
 * <Routes>   — a container that looks at the current URL and renders the first
 *              <Route> whose path matches it. Think of it as a switch statement
 *              for URLs.
 *
 * <Route>    — pairs a URL path (e.g. "/login") with a component to render
 *              (e.g. <LoginPage />). When the URL matches, that component appears.
 *              When it doesn't match, nothing renders for that Route.
 *
 * <Navigate> — immediately redirects to another path. Used here so that
 *              visiting "/" (the bare domain) automatically sends users to "/login"
 *              instead of showing a blank page.
 *
 * No page reloads happen — React Router swaps components in memory,
 * which is why the app feels instant when you navigate between pages.
 * ────────────────────────────────────────────────────────────────────────────
 */

/*
 * ProtectedRoute — guards pages that require authentication.
 *
 * We check localStorage for a "token" key before rendering the page.
 * If the token is missing, the user hasn't logged in (or their session was
 * cleared), so we redirect them to /login rather than letting them see
 * protected content. This is a client-side guard; the real security
 * enforcement happens on the server, which validates the JWT on every request.
 */
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/*
 * ProtectedPage stacks ProtectedRoute + MainLayout so each route declaration
 * stays a single line. Pass `breadcrumbs` (array) for multi-level breadcrumbs
 * like ['User-Management', 'User']; or `pageName` (string) for single-level.
 */
function ProtectedPage({ pageName, breadcrumbs, children }) {
  return (
    <ProtectedRoute>
      <MainLayout pageName={pageName} breadcrumbs={breadcrumbs}>
        {children}
      </MainLayout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <Routes>
      {/* "/" → redirect to /login so the app always has a starting point */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Login page — full screen, no sidebar */}
      <Route path="/login" element={<LoginPage />} />

      <Route path="/company" element={
        <ProtectedPage pageName="Company"><Company /></ProtectedPage>
      } />

      <Route path="/isin-master" element={
        <ProtectedPage pageName="ISIN Master"><IsinMaster /></ProtectedPage>
      } />

      {/* User Management sub-pages */}
      <Route path="/user-management/users" element={
        <ProtectedPage breadcrumbs={['User-Management', 'User']}><Users /></ProtectedPage>
      } />
      <Route path="/user-management/users/add" element={
        <ProtectedPage breadcrumbs={['User-Management', 'User', 'Add']}><AddUser /></ProtectedPage>
      } />
      <Route path="/user-management/users/:userId/edit" element={
        <ProtectedPage breadcrumbs={['User-Management', 'User', 'Edit']}><EditUser /></ProtectedPage>
      } />
      <Route path="/user-management/roles" element={
        <ProtectedPage breadcrumbs={['User-Management', 'Role']}><Roles /></ProtectedPage>
      } />
      <Route path="/user-management/login-history" element={
        <ProtectedPage breadcrumbs={['User-Management', 'Login History']}><LoginHistoryList /></ProtectedPage>
      } />
      <Route path="/profile" element={
        <ProtectedPage pageName="Profile"><Profile /></ProtectedPage>
      } />
    </Routes>
  );
}

export default App;
