import { Nav } from "@/components/Nav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="min-h-screen pt-16">{children}</main>
    </>
  );
}
