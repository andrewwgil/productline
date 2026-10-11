import { imagesFromZip, isImageName, isZipName, prepareImages, type RawImage } from "@/lib/images";
import { portfolioFromUpload } from "@/lib/upload";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 40 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected a folder of images or a .zip" }, { status: 400 });
  }

  const note = String(form.get("note") ?? "");
  const files = form.getAll("file").filter((file): file is File => file instanceof File && file.size > 0);
  if (!files.length) return Response.json({ error: "upload a folder of images or a .zip" }, { status: 400 });

  const raw: RawImage[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) return Response.json({ error: `${file.name} is larger than 40MB` }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (isZipName(file.name, file.type)) {
      try {
        raw.push(...(await imagesFromZip(bytes)));
      } catch {
        return Response.json({ error: `could not read ${file.name}` }, { status: 400 });
      }
      continue;
    }
    if (isImageName(file.name) || file.type.startsWith("image/")) raw.push({ name: file.name || "image", bytes });
  }

  const prepared = await prepareImages(raw);
  if (!prepared.length) return Response.json({ error: "no images found in that upload" }, { status: 400 });
  return Response.json(portfolioFromUpload(prepared, note));
}
