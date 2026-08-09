import { renderAppIcon } from "@/lib/app-icon";

// The icon iOS uses on the home screen (apple-touch-icon).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(180);
}
