import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return (
    <ComingSoon
      title="Calendar"
      subtitle="See what's planned, scheduled and uploaded."
      icon={<CalendarDays size={22} />}
      planned={[
        "Monthly view with every planned and scheduled video",
        "Drag a video onto a day to schedule it",
        "Auto-plan a month of uploads in one click",
      ]}
    />
  );
}
