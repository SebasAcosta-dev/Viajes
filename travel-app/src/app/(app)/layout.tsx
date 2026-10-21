import { SiteNavigation } from "@/components/layout/site-navigation";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNavigation />
      {children}
    </>
  );
}
