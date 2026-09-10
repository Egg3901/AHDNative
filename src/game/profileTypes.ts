export interface ProfileUpdate {
  bio?: string;
  avatarUrl?: string | null;
}

export interface ProfileView {
  name: string;
  bio: string;
  avatarUrl: string | null;
  country: { id: string; name: string };
  homeRegion: { id: string; name: string } | null;
  party: { id: string; name: string; color: string } | null;
  office: string | null;
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
