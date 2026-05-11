import { Nav } from "@/components/Nav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="min-h-screen pt-16">{children}</div>
    </>
  );
}
