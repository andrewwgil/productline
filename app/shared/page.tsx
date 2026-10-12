import type { Metadata } from "next";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "My Arcade",
  description: "Surprise products saved to your Arcade account, newest first.",
};

export default function SharedPage() {
  return <Gallery />;
}
