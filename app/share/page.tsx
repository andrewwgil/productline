import type { Metadata } from "next";
import { Suspense } from "react";
import { ShareApp } from "./share-app";

export const metadata: Metadata = {
  title: "Share to My Arcade",
  description: "Share a photo or a post. A surprise product appears in your Arcade account.",
};

export default function SharePage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-paper" />}>
      <ShareApp />
    </Suspense>
  );
}
