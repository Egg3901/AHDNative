export interface ProfileUpdate {
  bio?: string;
  avatarUrl?: string | null;
  campaignSongUrl?: string;
  campaignSongAutoplay?: boolean;
}

export interface ProfileView {
  name: string;
  bio: string;
  avatarUrl: string | null;
  campaignSongUrl: string;
  campaignSongAutoplay: boolean;
  country: { id: string; name: string };
  homeRegion: { id: string; name: string } | null;
  party: { id: string; name: string; color: string } | null;
  office: string | null;
  officeDestination: { route: "legislature" | "policy"; id?: string } | null;
  policies: { economic: number; social: number } | null;
  stats: { energy: number | null; debate: number | null } | null;
  careerHistory: Array<{ id: string; office: string; result: string; turn: number }>;
  achievements: Array<{ slug: string; name: string; description: string }>;
  standing: {
    actions: number; actionCap: number; actionGain: number;
    politicalInfluence: number; nationalInfluence: number | null;
    favorability: number; infamy: number; partyInfluence: number | null;
  };
  finances: {
    currency: string; cash: number; savings: number; funds: number;
    donorBaseLevel: number; regularIncome: number; donorIncome: number;
  };
}
