export type PublicEnvironment = {
  appMode?: string;
  dataMode?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  siteUrl?: string;
};

export type ServerEnvironment = {
  aiApiKey?: string;
  aiProvider?: string;
  aiModel?: string;
};
