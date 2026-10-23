import { Clapperboard } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return (
    <ComingSoon
      title="YouTube"
      subtitle="Connect the YouTube channels you upload to."
      icon={<Clapperboard size={22} />}
      planned={[
        "Sign in with Google and connect one or more channels",
        "Subscriber and video counts at a glance",
        "Option to use your own Google Cloud project for higher upload limits",
      ]}
    />
  );
}
