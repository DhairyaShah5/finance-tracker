import { renderAppIcon } from "@/lib/app-icon";

// Served at /icons/icon-192.png (a stable, hash-free URL for the manifest).
export function GET() {
  return renderAppIcon(192);
}
