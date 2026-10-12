import type { Metadata } from "next";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Shared",
  description: "Recent shares, and the Arcade products inspired by them.",
};

export default function SharedPage() {
  return <Gallery />;
}
