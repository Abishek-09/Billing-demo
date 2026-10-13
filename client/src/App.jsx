import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore.js';
import { I18nProvider } from './i18n/I18nContext.jsx';
import { seedDatabase } from './db/seed.js';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import StockCountPage from './pages/StockCountPage.jsx';
import DayClosePage from './pages/DayClosePage.jsx';
import TodayDayClosePage from './pages/TodayDayClosePage.jsx';
import AdminPortalPage from './pages/AdminPortalPage.jsx';
import ToastContainer from './components/ToastContainer.jsx';

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // Restore session from localStorage on mount
    restoreSession();
    // Seed database with demo data if empty
    seedDatabase().catch(console.error);
  }, []);

  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/billing" replace /> : <LoginPage />
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/billing" replace />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="stock" element={<StockCountPage />} />
            <Route path="day-close" element={<TodayDayClosePage />} />
            <Route path="day_close" element={<TodayDayClosePage />} />
          </Route>
          {/* Admin Portal routes */}
          <Route path="/billing/admin" element={<AdminPortalPage />} />
          <Route path="/admin" element={<Navigate to="/billing/admin" replace />} />
          <Route path="*" element={<Navigate to="/billing" replace />} />
        </Routes>
      </BrowserRouter>
      {/* Toast outside router so it shows on login page too */}
      {!isAuthenticated && <ToastContainer />}
    </I18nProvider>
  );
}
