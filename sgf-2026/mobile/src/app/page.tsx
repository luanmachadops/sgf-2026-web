"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isDriverAuthenticated } from "@/lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (isDriverAuthenticated()) {
      router.replace("/home");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-dvh">
      <div className="spinner" />
    </div>
  );
}
