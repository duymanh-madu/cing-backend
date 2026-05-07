const { createClient } =
require("@supabase/supabase-js");

const supabase =
createClient(

  "https://koqmjpkjtieabojujnac.supabase.co",

  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW1qcGtqdGllYWJvanVqbmFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE3NDI0MiwiZXhwIjoyMDkzNzUwMjQyfQ.XsL46zmJcR993hABRtMEsx_ExKGAJzqsAY1o6dDL7w0"

);

module.exports = supabase;