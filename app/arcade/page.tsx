import type { Metadata } from "next";
import { ArcadeLoader } from "./loader";

export const metadata: Metadata = {
  title: "Arcade · Product Line",
  description: "Spin a prize wheel for an Arcade category, style, and palette, then watch the cabinet print a real product.",
};

export default function ArcadePage() {
  return <ArcadeLoader />;
}
