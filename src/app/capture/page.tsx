import { CaptureClient } from "./capture-client";

export const dynamic = "force-dynamic";
// "Save & Run" starts Easy Apply in the background from this route.
export const maxDuration = 300;

export default function CapturePage() {
  return <CaptureClient />;
}
