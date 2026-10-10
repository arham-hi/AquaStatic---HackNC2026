// Client-safe constants shared by server services and browser components. No Node imports here.

export const INTERESTS = ["academics", "social", "free_food", "sports", "career", "community", "transit", "news", "culture"] as const;
export type Interest = (typeof INTERESTS)[number];
export const INTEREST_LABELS: Record<Interest, string> = {
  academics: "Academics", social: "Social events", free_food: "Free food", sports: "Sports", career: "Career events",
  community: "Community needs", transit: "Transit", news: "Local news", culture: "Campus culture",
};

export const OFFICIAL_TRACKING_URL = "https://mychtransit.org/";
export const OFFICIAL_ROUTES_URL = "https://www.chapelhillnc.gov/Transportation-and-Parking/Bus-Routes-and-Schedules";
export const OFFICIAL_ALERTS_URL = "https://alertcarolina.unc.edu/";
