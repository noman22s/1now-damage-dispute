/**
 * Turo's 24-hour damage reporting window starts when the trip ends.
 * Missing this window can void a damage claim entirely.
 *
 * Returns hours/minutes remaining (negative if expired), plus a severity
 * level the UI can color-code.
 */
export type DeadlineStatus = {
  isValid: boolean;
  hoursLeft: number;
  minutesLeft: number;
  expired: boolean;
  /** 'safe' (>12h), 'urgent' (<12h), 'critical' (<3h), 'expired' (<0) */
  severity: "safe" | "urgent" | "critical" | "expired";
  label: string;
  subLabel: string;
};

const WINDOW_HOURS = 24;

export function computeDeadline(
  tripEndDateISO: string,
  now: Date = new Date()
): DeadlineStatus {
  if (!tripEndDateISO) {
    return {
      isValid: false,
      hoursLeft: 0,
      minutesLeft: 0,
      expired: false,
      severity: "safe",
      label: "",
      subLabel: "",
    };
  }

  // Trip end is a calendar date; assume the trip ended at 23:59 local time
  // (most generous reading — gives operator the longest window)
  const end = new Date(tripEndDateISO + "T23:59:00");
  if (isNaN(end.getTime())) {
    return {
      isValid: false,
      hoursLeft: 0,
      minutesLeft: 0,
      expired: false,
      severity: "safe",
      label: "",
      subLabel: "",
    };
  }

  const deadline = new Date(end.getTime() + WINDOW_HOURS * 60 * 60 * 1000);
  const msLeft = deadline.getTime() - now.getTime();
  const totalMinutesLeft = Math.floor(msLeft / 60000);
  const hoursLeft = Math.floor(totalMinutesLeft / 60);
  const minutesLeft = totalMinutesLeft % 60;

  if (msLeft <= 0) {
    const hoursOver = Math.floor(-msLeft / 3600000);
    return {
      isValid: true,
      hoursLeft,
      minutesLeft,
      expired: true,
      severity: "expired",
      label: `Past Turo's 24-hour reporting window`,
      subLabel:
        hoursOver < 24
          ? `Window closed ${hoursOver} hour${hoursOver === 1 ? "" : "s"} ago. Claim may be denied.`
          : `Window closed over a day ago. Turo will likely reject this claim.`,
    };
  }

  let severity: DeadlineStatus["severity"] = "safe";
  if (hoursLeft < 3) severity = "critical";
  else if (hoursLeft < 12) severity = "urgent";

  const hoursWord = `${hoursLeft}h ${minutesLeft.toString().padStart(2, "0")}m`;
  return {
    isValid: true,
    hoursLeft,
    minutesLeft,
    expired: false,
    severity,
    label: `${hoursWord} left in Turo's 24-hour reporting window`,
    subLabel:
      severity === "critical"
        ? "File this dispute immediately. Turo enforces this deadline strictly."
        : severity === "urgent"
          ? "Less than 12 hours left. Get this filed today."
          : "You're within the safe window. File when ready.",
  };
}
