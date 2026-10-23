import { Tv } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return (
    <ComingSoon
      title="Channels"
      subtitle="Each channel keeps its own niche, style, voice and rules."
      icon={<Tv size={22} />}
      planned={[
        "Create channels from a niche picker with preset script format, art style and voice",
        "Per-channel safety rules and brand kit",
        "Switch channels from anywhere in the studio",
      ]}
    />
  );
}
