"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionSafe } from "@/lib/session";
import Offline from "@/components/Offline";

export default function Home() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getSessionSafe().then((r) => {
      if (r.timeout) return setFailed(true);
      router.replace(r.session ? "/forms" : "/login");
    });
  }, [router]);
  if (failed) return <Offline />;
  return <div className="empty">Carregando...</div>;
}
