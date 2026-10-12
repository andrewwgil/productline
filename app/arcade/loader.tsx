"use client";

import dynamic from "next/dynamic";

const Experience = dynamic(() => import("./experience"), {
  ssr: false,
  loading: () => <div className="arcade-boot">Warming up the cabinet</div>,
});

export function ArcadeLoader() {
  return <Experience />;
}
