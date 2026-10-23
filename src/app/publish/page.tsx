import { UploadCloud } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return (
    <ComingSoon
      title="Publish your own video"
      subtitle="Bring a video you already made and let the studio handle the rest."
      icon={<UploadCloud size={22} />}
      planned={[
        "Drop in a video file and get auto captions",
        "Title options, description with chapters, and tags",
        "Thumbnail prompt and upload",
        "Publish now or schedule to your channel",
      ]}
    />
  );
}
