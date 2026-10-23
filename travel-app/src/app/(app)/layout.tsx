import { SiteNavigation } from "@/components/layout/site-navigation";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <SiteNavigation />
      <div className="app-content">{children}</div>
    </div>
  );
}
