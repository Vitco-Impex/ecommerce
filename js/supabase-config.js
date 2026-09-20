// Public values only. The publishable (anon) key is designed to ship in browser code and in a
// public repo — Row Level Security (see supabase/schema.sql) is what protects the data.
// NEVER put the secret / service_role key here.
//
// Leave both empty and visitors can still verify their number, but the profile page is unavailable
// and Buy Now falls back to a WhatsApp enquiry.
window.VITCO_SUPABASE = {
  url: "https://dvcpczxmbsfrebafjthf.supabase.co",
  anonKey: "sb_publishable_aJ-Fie53GdNdJdfElVWpbQ_qCzHCt_h"
};
