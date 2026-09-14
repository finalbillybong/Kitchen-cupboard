import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ListsPage from './pages/ListsPage';
import ListDetailPage from './pages/ListDetailPage';
import SettingsPage from './pages/SettingsPage';
import LibraryPage from './pages/LibraryPage';
import { RecipeDetailPage } from './pages/RecipeLibrary';
import PlannerPage from './pages/PlannerPage';

function LegacyRecipeRoute() {
  const { mealId } = useParams();
  return <Navigate replace to={`/library/recipes/${mealId}`} />;
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-navy-950">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<ListsPage />} />
        <Route path="list/:listId" element={<ListDetailPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="recipes" element={<Navigate replace to="/library" />} />
        <Route path="recipes/:mealId" element={<LegacyRecipeRoute />} />
        <Route path="library/recipes/:mealId" element={<RecipeDetailPage />} />
        <Route path="planner" element={<PlannerPage />} />
        <Route
          path="pantry"
          element={
            <Navigate replace to="/library?tab=ingredients&usually=true" />
          }
        />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
