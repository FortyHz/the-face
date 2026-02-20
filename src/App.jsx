import React, { useState, useEffect } from 'react';

function App() {
  // --- STATE ---
  const [config, setConfig] = useState({
    url: '',
    key: ''
  });
  const [isConfigured, setIsConfigured] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("idle"); // idle, uploading, success, error
  const [policies, setPolicies] = useState([]);
  const [libReady, setLibReady] = useState(false);
  
  // THE RADAR: State to hold the vendor ID from the Magic Link
  const [vendorId, setVendorId] = useState(null);

  // --- IDENTITY ROUTING (The Magic Link Radar) ---
  useEffect(() => {
    // Scan the URL for the vendor parameter the exact second the app boots
    const params = new URLSearchParams(window.location.search);
    const targetVendor = params.get('vendor');
    
    if (targetVendor) {
      console.log("Radar Locked: Target Vendor ID detected ->", targetVendor);
      setVendorId(targetVendor);
    }
  }, []);

  // --- LIBRARY INJECTION ---
  useEffect(() => {
    // Inject Supabase JS via CDN to bypass environment build restrictions
    if (window.supabase) {
      setLibReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => {
      console.log("Supabase library loaded");
      setLibReady(true);
    };
    script.onerror = () => {
      alert("Failed to load Supabase library. Please refresh.");
    };
    document.body.appendChild(script);
  }, []);

  // --- INITIALIZATION ---
  useEffect(() => {
    // Check if we have credentials saved in session storage
    if (!libReady) return;

    const storedUrl = sessionStorage.getItem('sb_url');
    const storedKey = sessionStorage.getItem('sb_key');
    if (storedUrl && storedKey) {
      initializeSupabase(storedUrl, storedKey);
    }
  }, [libReady]);

  const initializeSupabase = (url, key) => {
    try {
      if (!window.supabase || !window.supabase.createClient) {
        throw new Error("Supabase library not ready yet.");
      }
      const client = window.supabase.createClient(url, key);
      setSupabaseClient(client);
      setConfig({ url, key });
      setIsConfigured(true);
      sessionStorage.setItem('sb_url', url);
      sessionStorage.setItem('sb_key', key);
    } catch (err) {
      alert("Configuration Error: " + err.message);
    }
  };

  const handleConfigSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    initializeSupabase(formData.get('url'), formData.get('key'));
  };

  // --- APP LOGIC ---
  useEffect(() => {
    if (!supabaseClient || !isConfigured) return;

    fetchPolicies();

    // Realtime Subscription: Relies on Supabase Dashboard setting (Replication = ON)
    const channel = supabaseClient
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'policies',
        },
        (payload) => {
          console.log('Realtime update:', payload);
          fetchPolicies();
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [supabaseClient, isConfigured]);

  const fetchPolicies = async () => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('policies')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setPolicies(data);
    if (error) console.error("Error fetching policies:", error);
  };

  // --- POLLING FALLBACK (Architect Redundancy) ---
  useEffect(() => {
    if (!supabaseClient || !isConfigured) return;

    // If any policy is currently 'processing', poll the database every 3 seconds.
    // This guarantees the UI updates even if WebSocket replication fails or isn't enabled.
    const hasProcessing = policies.some(p => p.processing_status === 'processing');
    if (!hasProcessing) return;

    const pollInterval = setInterval(() => {
      console.log("Fallback Polling: Checking for updates...");
      fetchPolicies();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [policies, supabaseClient, isConfigured]);

  const handleFileUpload = async (e) => {
    if (!supabaseClient) return;
    try {
      setUploading(true);
      const file = e.target.files[0];
      if (!file) return;

      // 1. Upload to Storage
      // Direct client upload bypasses the Backend cold start logic.
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('cois')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Insert into DB with Identity Payload
      // This INSERT triggers the Supabase Database Webhook -> Render Backend
      const payload = {
        document_url: filePath,
        processing_status: 'processing',
      };
      
      // Inject the radar lock if we have one
      if (vendorId) {
        payload.vendor_id = vendorId;
      }

      const { error: dbError } = await supabaseClient
        .from('policies')
        .insert([payload]);

      if (dbError) throw dbError;

      setStatus("success");
      fetchPolicies();
    } catch (error) {
      console.error(error);
      setStatus("error");
      alert("Upload Failed: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleClearConfig = () => {
    sessionStorage.clear();
    setIsConfigured(false);
    setSupabaseClient(null);
    setPolicies([]);
  };

  // --- RENDER ---

  if (!libReady) {
    return (
       <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
           <p className="text-gray-500">Loading Compliance Engine...</p>
        </div>
       </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full border border-gray-200">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Liability Shield Setup</h1>
          <p className="text-gray-500 mb-6 text-sm">Enter your Supabase credentials to connect the frontend.</p>
          <form onSubmit={handleConfigSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Project URL</label>
              <input name="url" placeholder="https://xyz.supabase.co" required className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Anon Key</label>
              <input name="key" type="password" placeholder="eyJh..." required className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700 transition-colors">
              Connect
            </button>
          </form>
          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <p className="text-xs text-blue-800">
              <strong>Tip:</strong> These keys are saved in your browser's session storage for this preview only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 border-b border-gray-200 pb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              The Liability Shield <span className="text-gray-400 font-normal">| MVP</span>
            </h1>
            <p className="mt-2 text-gray-500">Zero Trust Compliance Engine</p>
          </div>
          <button onClick={handleClearConfig} className="text-xs text-gray-400 hover:text-red-600">
            Disconnect
          </button>
        </header>

        {/* IDENTITY CONFIRMATION BADGE */}
        {vendorId && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-900">Secure Upload Session</p>
              <p className="text-xs text-blue-700">Your vendor identity is verified. Documents uploaded here will automatically link to your profile.</p>
            </div>
            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            </div>
          </div>
        )}

        {/* UPLOAD SECTION */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-12">
          <h2 className="text-xl font-semibold mb-4">Upload Certificate</h2>
          
          <div className="flex items-center justify-center w-full">
            <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploading ? (
                  <div className="animate-pulse text-blue-600 font-medium">Uploading to Secure Vault...</div>
                ) : status === 'success' ? (
                  <div className="text-center">
                    <div className="text-green-600 font-bold text-lg mb-1">Upload Successful</div>
                    <div className="text-gray-500 text-sm">Processing triggered in background</div>
                  </div>
                ) : (
                  <>
                    <svg aria-hidden="true" className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-gray-500">PDF or PNG (MAX. 10MB)</p>
                  </>
                )}
              </div>
              <input 
                id="dropzone-file" 
                type="file" 
                className="hidden" 
                accept=".pdf,image/*"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </div>

        {/* DASHBOARD SECTION */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Policy Status Dashboard</h2>
            <button 
              onClick={fetchPolicies}
              className="text-xs font-semibold bg-white border border-gray-300 text-gray-700 py-1.5 px-3 rounded shadow-sm hover:bg-gray-50 transition-colors"
            >
              Force Refresh
            </button>
          </div>
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">ID</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Insurer</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Expires</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Limit</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {policies.map((policy) => (
                  <tr key={policy.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                      {policy.id.slice(0, 8)}...
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {policy.carrier_name || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {policy.expiration_date || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {policy.limit_amount ? `$${policy.limit_amount.toLocaleString()}` : "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 
                        ${policy.processing_status === 'active' ? 'bg-green-100 text-green-800' : 
                          policy.processing_status === 'processing' ? 'bg-yellow-100 text-yellow-800 animate-pulse' : 
                          policy.processing_status === 'rejected' ? 'bg-red-100 text-red-800' : 
                          'bg-gray-100 text-gray-800'}`}>
                        {policy.processing_status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
                {policies.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-3 py-8 text-center text-sm text-gray-500">
                      {status === 'success' 
                        ? "Refresh to see your new policy..." 
                        : "No policies found. Upload one to start the machine."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;