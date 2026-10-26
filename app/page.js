"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    sb().auth.getSession().then(({ data }) => router.replace(data.session ? "/forms" : "/login"));
  }, [router]);
  return <div className="empty">Carregando...</div>;
}
