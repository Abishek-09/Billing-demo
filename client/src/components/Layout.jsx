import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import ToastContainer from './ToastContainer.jsx';

/**
 * Main app layout — sidebar + content area.
 * Full viewport height, no scroll on outer shell.
 */
export default function Layout() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-cream">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}
