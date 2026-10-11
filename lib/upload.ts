import type { PreparedImage } from "./images";
import type { Portfolio } from "./types";

const GENERIC_TITLE = "Uploaded portfolio";

export function portfolioFromUpload(images: PreparedImage[], note: string): Portfolio {
  const bio = note.trim();
  const title = bio.split("\n")[0]?.trim().slice(0, 80) || GENERIC_TITLE;
  const names = images.map((img) => img.name.split("/").pop()).filter(Boolean);
  const fileNote = names.length ? `Files: ${names.join(", ")}` : "";
  return {
    url: "https://upload.local/portfolio",
    title,
    description: bio.slice(0, 500),
    text: [bio, fileNote].filter(Boolean).join("\n\n").slice(0, 6000),
    images: images.map((img) => img.dataUrl),
  };
}
