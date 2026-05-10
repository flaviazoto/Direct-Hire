import { Nav } from "@/components/Nav";
import BottomNav from "@/components/BottomNav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="pb-[72px] md:pb-0">
        {children}
      </div>
      <BottomNav />
    </>
  );
}
