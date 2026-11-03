"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sb } from "@/lib/supabase";
import { getSessionSafe } from "@/lib/session";
import Offline from "@/components/Offline";

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getSessionSafe().then((r) => {
      if (r.timeout) return setFailed(true);
      setSession(r.session);
      if (!r.session) router.replace("/login");
    });
    const { data: sub } = sb().auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (failed && !session) return <Offline />;
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
