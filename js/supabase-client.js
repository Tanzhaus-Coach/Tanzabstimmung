// js/supabase-client.js
// Konfiguration für die Verbindung zur Datenbank

const SUPABASE_URL = 'https://qldxygkbcsmqoeurmhcj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__z1ShCBQAtTeG37rysHYEA_gptwN9fV';

// Initialisiert den Client. 
// (Das 'supabase' Objekt wird später via CDN im HTML geladen und ist hier global verfügbar)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
