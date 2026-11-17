import React from 'react';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';

interface LayoutProps {
  children: React.ReactNode;
  onOpenCreateModal: () => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  onOpenCreateModal,
}) => {
  return (
    <div className="app-layout">
      <Sidebar onOpenCreateModal={onOpenCreateModal} />
      <div className="app-main">
        <Header />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
};
