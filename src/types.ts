export type Confidence = "low" | "medium" | "high";

export type Source = {
  field: string;
  url: string;
  title?: string;
  confidence: Confidence;
};

export type ProfileExperience = {
  title?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string | null;
};

export type ProfileEducation = {
  institution?: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string | null;
};

export type ProfileImages = {
  profile?: string;
  background?: string;
};

export type Profile = {
  name?: string;
  headline?: string;
  location?: string;
  about?: string;
  experience: ProfileExperience[];
  education: ProfileEducation[];
  skills: string[];
  certifications: string[];
  languages: string[];
  images: ProfileImages;
};

export type ProfileResponse = {
  inputUrl: string;
  canonicalUrl: string;
  publicIdentifier: string;
  profile: Profile;
  sources: Source[];
  warnings: string[];
  provider: "exa";
  cache: {
    hit: boolean;
    namespace: string;
  };
  fetchedAt: string;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
