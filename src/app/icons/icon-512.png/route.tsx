import { renderAppIcon } from "@/lib/app-icon";

// Served at /icons/icon-512.png (a stable, hash-free URL for the manifest).
export function GET() {
  return renderAppIcon(512);
}
