import React, { useState, useEffect } from 'react';

function App() {
  const [config, setConfig] = useState({ url: '', key: '', adminEmail: '' });
  const [isConfigured, setIsConfigured] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [libReady, setLibReady] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("idle"); 
  const [policies, setPolicies] = useState([]);
  const [vendorId, setVendorId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // --- ADMIN STATE (GOD MODE) ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [globalPolicies, setGlobalPolicies] = useState([]);
  const [nagStatus, setNagStatus] = useState('');

  // --- LOGIN STATE ---
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // --- LIBRARY INJECTION (Canvas Safe) ---
  useEffect(() => {
    if (window.supabase) {
      setLibReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => setLibReady(true);
    document.body.appendChild(script);
  }, []);

  // --- INITIALIZATION (Environment Variable Priority) ---
  useEffect(() => {
    if (!libReady) return;
    
    // Architect Security: Pulling from the shadow environment first, falling back to session storage
    const storedUrl = import.meta.env.VITE_SUPABASE_URL || sessionStorage.getItem('sb_url');
    const storedKey = import.meta.env.VITE_SUPABASE_ANON_KEY || sessionStorage.getItem('sb_key');
    const storedAdmin = import.meta.env.VITE_ADMIN_EMAIL || sessionStorage.getItem('sb_admin_email') || '';
    
    if (storedUrl && storedKey) {
      initializeSupabase(storedUrl, storedKey, storedAdmin);
    }
  }, [libReady]);

  const initializeSupabase = (url, key, adminEmail) => {
    try {
      if (!window.supabase) throw new Error("Supabase library not ready");
      const client = window.supabase.createClient(url, key);
      setSupabaseClient(client);
      setConfig({ url, key, adminEmail });
      setIsConfigured(true);
      
      // Only store in session if we aren't using hard environment variables
      if (!import.meta.env.VITE_SUPABASE_URL) {
        sessionStorage.setItem('sb_url', url);
        sessionStorage.setItem('sb_key', key);
        sessionStorage.setItem('sb_admin_email', adminEmail);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfigSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    initializeSupabase(formData.get('url'), formData.get('key'), formData.get('adminEmail'));
  };

  // --- IDENTITY INTEGRATION (The OAuth Radar) ---
  useEffect(() => {
    if (!supabaseClient || !isConfigured) return;

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) verifyIdentity(session.user.email);
    });

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session) {
        verifyIdentity(session.user.email);
      } else {
        setVendorId(null);
        setIsAdmin(false);
        setPolicies([]);
        setGlobalPolicies([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabaseClient, isConfigured]);

  // --- ZERO TRUST VERIFICATION & OVERRIDE ---
  const verifyIdentity = async (email) => {
    if (!supabaseClient) return;
    try {
      console.log("Verifying Google Identity:", email);
      
      // THE ARCHITECT OVERRIDE: Checking the secure environment variable
      const ARCHITECT_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || config.adminEmail; 
      
      if (ARCHITECT_EMAIL && email.toLowerCase() === ARCHITECT_EMAIL.toLowerCase()) {
        console.log("ARCHITECT RECOGNIZED. INITIATING COMMAND CENTER.");
        setIsAdmin(true);
        setLoginError('');
        fetchGlobalPolicies();
        return; 
      }

      const { data, error } = await supabaseClient
        .from('vendors')
        .select('id')
        .eq('contact_email', email.trim())
        .single();

      if (error || !data) {
        console.warn("Unauthorized Entity Detected.");
        setLoginError(`Access Denied: The email (${email}) is not registered in our vendor database.`);
        await supabaseClient.auth.signOut();
        setVendorId(null);
      } else {
        console.log("Identity Verified. Unlocking Vault for Vendor ID:", data.id);
        setVendorId(data.id);
        setLoginError('');
      }
    } catch (err) {
      console.error("Verification Error:", err);
    }
  };

  // --- COMPARTMENTALIZED DATA FETCHING (Vendors) ---
  useEffect(() => {
    if (!supabaseClient || !isConfigured) return;

    if (vendorId && !isAdmin) fetchPolicies();

    const channel = supabaseClient
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'policies' }, () => {
        if (vendorId) fetchPolicies();
        if (isAdmin) fetchGlobalPolicies();
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [vendorId, isAdmin, supabaseClient, isConfigured]);

  const fetchPolicies = async () => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('policies')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });
    if (data) setPolicies(data);
  };

  // --- GLOBAL DATA FETCHING (Architect) ---
  const fetchGlobalPolicies = async () => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('policies')
      .select('*, vendors(company_name)')
      .order('created_at', { ascending: false });
    if (data) setGlobalPolicies(data);
  };

  // --- MANUAL WEAPON TRIGGER ---
  const triggerNagEngine = async () => {
    setNagStatus('Firing engine...');
    try {
      const backendUrl = "https://your-python-backend.onrender.com/trigger-nag"; 
      const response = await fetch(backendUrl);
      const data = await response.json();
      setNagStatus(data.message || 'Cycle complete.');
      setTimeout(() => setNagStatus(''), 5000);
    } catch (error) {
      console.error(error);
      setNagStatus('Failed to reach the Eye.');
    }
  };

  // --- GOOGLE OAUTH ENGINE ---
  const handleGoogleLogin = async () => {
    if (!supabaseClient) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
    } catch (err) {
      setLoginError("OAuth Failed: " + err.message);
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    if (supabaseClient) await supabaseClient.auth.signOut(); 
  };

  // --- DRAG AND DROP PHYSICS ---
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) executeUpload(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) executeUpload(e.target.files[0]);
  };

  const executeUpload = async (file) => {
    if (!supabaseClient) return;
    try {
      setUploading(true); setStatus("idle");
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabaseClient.storage.from('cois').upload(fileName, file);
      if (uploadError) throw new Error(`Storage Error: ${uploadError.message}`);

      const payload = { document_url: fileName, processing_status: 'processing' };
      if (vendorId) payload.vendor_id = vendorId;

      const { error: dbError } = await supabaseClient.from('policies').insert([payload]);
      if (dbError) throw new Error(`Database Error: ${dbError.message}`);

      setStatus("success");
      if (vendorId) fetchPolicies();
      if (isAdmin) fetchGlobalPolicies();
    } catch (error) {
      setStatus("error");
      console.warn(`SYSTEM BLOCKED UPLOAD: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  if (!libReady) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p>Loading Engine...</p></div>;

  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full border border-gray-200">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Liability Shield Setup</h1>
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <p className="text-xs text-yellow-700 font-semibold">CANVAS SANDBOX DETECTED</p>
            <p className="text-xs text-yellow-600 mt-1">Configure your environment to test the Command Center safely within the preview.</p>
          </div>
          <form onSubmit={handleConfigSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Project URL</label>
              <input name="url" required className="w-full border border-gray-300 rounded-md p-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Anon Key</label>
              <input name="key" type="password" required className="w-full border border-gray-300 rounded-md p-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Admin Email (For God Mode)</label>
              <input name="adminEmail" required placeholder="admin@company.com" className="w-full border border-gray-300 rounded-md p-2 text-sm" />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700">
              Connect to Vault
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // UI RENDER: COMMAND CENTER (GOD MODE)
  // ==========================================
  if (isAdmin) {
    const expiredCount = globalPolicies.filter(p => p.processing_status === 'rejected').length;
    
    return (
      <div className="min-h-screen bg-slate-900 text-slate-300 font-sans p-8">
        <div className="max-w-6xl mx-auto">
          <header className="mb-8 border-b border-slate-800 pb-6 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Command Center <span className="text-slate-500 font-normal">| God Mode</span>
              </h1>
              <p className="mt-2 text-slate-400">Global System Overview & Manual Overrides</p>
            </div>
            <div className="flex gap-4 items-center">
              {!import.meta.env.VITE_SUPABASE_URL && (
                <button onClick={() => { sessionStorage.clear(); setIsConfigured(false); }} className="text-xs text-slate-500 hover:text-slate-300">Disconnect Sandbox</button>
              )}
              <button onClick={handleLogout} className="text-sm font-medium text-slate-500 hover:text-red-400 transition-colors border-l border-slate-700 pl-4">
                Sever Connection
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
              <h3 className="text-slate-400 text-sm font-semibold mb-1">Total Policies in Vault</h3>
              <p className="text-3xl text-white font-bold">{globalPolicies.length}</p>
            </div>
            <div className="bg-slate-800 p-6 rounded-xl border border-red-900/30 shadow-lg">
              <h3 className="text-red-400 text-sm font-semibold mb-1">Critical / Expired</h3>
              <p className="text-3xl text-red-500 font-bold">{expiredCount}</p>
            </div>
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg flex flex-col justify-center items-start">
               <button onClick={triggerNagEngine} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-3 rounded-lg transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                 FIRE ASSASSIN PROTOCOL (NAG VENDORS)
               </button>
               {nagStatus && <p className="text-xs text-blue-400 mt-2 text-center w-full">{nagStatus}</p>}
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h2 className="text-lg font-semibold text-white">Global Policy Feed</h2>
              <button onClick={fetchGlobalPolicies} className="text-xs text-slate-400 hover:text-white">Refresh Data</button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="py-3.5 pl-6 pr-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Vendor</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Insurer</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Expires</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Conf.</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700 bg-slate-900/50">
                  {globalPolicies.map((policy) => (
                    <tr key={policy.id} className="hover:bg-slate-800/80 transition-colors">
                      <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium text-white">
                        {policy.vendors?.company_name || <span className="text-slate-600">Unassigned</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-300">{policy.carrier_name || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-300">{policy.expiration_date || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-400">
                        {policy.ocr_confidence_score ? `${(policy.ocr_confidence_score * 100).toFixed(0)}%` : "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold 
                          ${policy.processing_status === 'active' ? 'bg-green-900/30 text-green-400 border-green-800' : 
                            policy.processing_status === 'processing' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-800 animate-pulse' : 
                            policy.processing_status === 'rejected' ? 'bg-red-900/30 text-red-400 border-red-800' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          {policy.processing_status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // UI RENDER: VENDOR PORTAL
  // ==========================================
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
          <div className="flex gap-4 items-center">
            {!vendorId && !import.meta.env.VITE_SUPABASE_URL && (
              <button onClick={() => { sessionStorage.clear(); setIsConfigured(false); }} className="text-xs text-gray-400 hover:text-red-600">Disconnect Sandbox</button>
            )}
            {vendorId && (
              <button onClick={handleLogout} className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors">
                Log Out
              </button>
            )}
          </div>
        </header>

        {vendorId && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900">Secure Vendor Portal</p>
            <p className="text-xs text-blue-700">Your identity is verified via Google. Documents uploaded here are automatically linked to your profile.</p>
          </div>
        )}

        {/* UPLOAD SECTION */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-12">
          <h2 className="text-xl font-semibold mb-4">Upload Certificate</h2>
          <div className="flex items-center justify-center w-full">
            <label 
              htmlFor="dropzone-file" 
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                isDragging ? 'border-blue-500 bg-blue-50' : status === 'error' ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                {uploading ? (
                  <div className="animate-pulse text-blue-600 font-medium">Uploading to Secure Vault...</div>
                ) : status === 'success' ? (
                  <div className="text-center">
                    <div className="text-green-600 font-bold text-lg mb-1">Upload Successful</div>
                    <p className="text-xs text-green-500">The Eye is extracting data.</p>
                  </div>
                ) : status === 'error' ? (
                  <div className="text-center">
                    <div className="text-red-600 font-bold text-lg mb-1">Upload Blocked</div>
                    <p className="text-xs text-red-500">Vault rejected the file.</p>
                  </div>
                ) : (
                  <>
                    <svg className={`w-10 h-10 mb-3 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                    <p className={`mb-2 text-sm ${isDragging ? 'text-blue-600' : 'text-gray-500'}`}><span className="font-semibold">Click to upload</span> or drag and drop</p>
                  </>
                )}
              </div>
              <input id="dropzone-file" type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileSelect} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* VENDOR DASHBOARD OR LOGIN PORTAL */}
        {vendorId ? (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Your Policy Status</h2>
              <button onClick={fetchPolicies} className="text-xs font-semibold bg-white border border-gray-300 text-gray-700 py-1.5 px-3 rounded shadow-sm hover:bg-gray-50">
                Force Refresh
              </button>
            </div>
            {policies.length === 0 ? (
              <div className="text-center p-8 bg-white rounded-xl border border-gray-200 text-gray-500">
                No policies found for your profile. Upload your first document above.
              </div>
            ) : (
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">ID</th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Insurer</th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Expires</th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {policies.map((policy) => (
                      <tr key={policy.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">{policy.id.slice(0, 8)}...</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{policy.carrier_name || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{policy.expiration_date || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 
                            ${policy.processing_status === 'active' ? 'bg-green-100 text-green-800' : 
                              policy.processing_status === 'processing' ? 'bg-yellow-100 text-yellow-800 animate-pulse' : 
                              policy.processing_status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                            {policy.processing_status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-8 bg-white rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Access Vendor Dashboard</h3>
            <p className="mt-2 text-sm text-gray-500 mb-6">
              Use your authorized company Google account to view your policy status and historical records.
            </p>
            
            <div className="max-w-sm mx-auto">
              {loginError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative text-sm text-left">
                  {loginError}
                </div>
              )}
              
              <button
                onClick={handleGoogleLogin} disabled={loginLoading}
                className="w-full bg-white border border-gray-300 text-gray-700 font-semibold py-2.5 px-4 rounded-md hover:bg-gray-50 disabled:bg-gray-100 transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {loginLoading ? "Connecting..." : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;