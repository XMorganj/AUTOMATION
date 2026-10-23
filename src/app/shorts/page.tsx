import { Scissors } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return (
    <ComingSoon
      title="Make Shorts"
      subtitle="Turn a long video into vertical Shorts with captions and titles."
      icon={<Scissors size={22} />}
      planned={[
        "Pick the best moments from a finished video automatically",
        "Vertical reframing with word-by-word captions",
        "Titles and hashtags for each Short",
        "One-click scheduling to YouTube Shorts",
      ]}
    />
  );
}
