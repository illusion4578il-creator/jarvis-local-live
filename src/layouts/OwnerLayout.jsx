import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useOwnerLayoutData } from '@/hooks/useOwnerLayoutData';
import { APP_CONFIG } from '@/config/app.config';
import { cn } from '@/lib/utils';
import ApperIcon from '@/components/ApperIcon';
import UserMenu from '@/components/UserMenu';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Badge } from '@/components/ui/badge';

export default function OwnerLayout() {
  const { user, logout, homeRoute, navItems, initials, displayName, counts } = useOwnerLayoutData();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-svh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-(--z-sticky) border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-(--spacing-header) max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            to={homeRoute}
            className="flex items-center gap-2.5 font-heading text-lg font-bold tracking-tight text-sidebar-foreground"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ApperIcon name={APP_CONFIG.icon || 'Cpu'} size={18} />
            </span>
            <span>{APP_CONFIG.name}</span>
            <Badge variant="outline" className="hidden sm:inline-flex border-highlight bg-highlight/15 text-foreground text-[11px]">
              100% Local Hinglish AI
            </Badge>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-4 h-full">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-full items-center gap-2 px-3.5 text-sm font-medium transition-colors duration-(--transition-fast)',
                    isActive
                      ? 'text-primary border-b-2 border-highlight font-semibold'
                      : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
                  )
                }
              >
                <ApperIcon name={item.icon ?? 'Circle'} size={16} />
                <span>{item.label}</span>
                {counts[item.to] != null && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {counts[item.to]}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent md:hidden"
              aria-label="Toggle navigation"
              onClick={() => setNavOpen((prev) => !prev)}
            >
              <ApperIcon name={navOpen ? 'X' : 'Menu'} size={20} />
            </button>
            <UserMenu user={user} initials={initials} displayName={displayName} logout={logout} />
          </div>
        </div>

        {navOpen && (
          <nav className="flex flex-col gap-1 border-t border-sidebar-border bg-sidebar px-4 py-3 md:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setNavOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium',
                    isActive
                      ? 'bg-sidebar-accent text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                  )
                }
              >
                <span className="flex items-center gap-2.5">
                  <ApperIcon name={item.icon ?? 'Circle'} size={17} />
                  <span>{item.label}</span>
                </span>
                {counts[item.to] != null && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {counts[item.to]}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1 w-full">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
