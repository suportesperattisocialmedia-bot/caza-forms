"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sb } from "@/lib/supabase";

export function Brand() {
  return (
    <Link href="/forms" className="brand">
      <span className="brand-mark" />
      <span>Caza Forms</span>
      <small>Caza Millennium</small>
    </Link>
  );
}

export default function Shell({ children, bare = false }) {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    sb().auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) router.replace("/login");
    });
    const { data: sub } = sb().auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!session) return <div className="empty">Carregando...</div>;

  return (
    <>
      <header className="topbar">
        <Brand />
        <nav className="nav">
          <Link href="/forms" className={path === "/forms" ? "active" : ""}>Formulários</Link>
          <Link href="/equipe" className={path === "/equipe" ? "active" : ""}>Equipe</Link>
        </nav>
        <div style={{ marginLeft: "auto" }} className="row">
          <span className="muted small" style={{ display: "none" }}>{session.user.email}</span>
          <button className="btn ghost sm" onClick={() => sb().auth.signOut()}>Sair</button>
        </div>
      </header>
      {bare ? children : <main className="page">{children}</main>}
    </>
  );
}
