// Pins a full-screen app view (mail, contacts) to the visible viewport so
// its panes scroll internally instead of the page growing. On mobile use
// fixed positioning (tracks the real visual viewport even under iOS Safari
// page zoom, where svh/vh units over-report height) with a bottom offset
// that clears the fixed app tray (3.5rem + safe area); on desktop a
// viewport-unit height is reliable and respects the sidebar.
export function PinnedPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden max-md:fixed max-md:inset-x-0 max-md:top-9 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:h-[calc(100svh-2.25rem)]">
      {children}
    </div>
  );
}
