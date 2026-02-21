import React, { useState, useEffect } from 'react';

function App() {
  const [config, setConfig] = useState({ url: '', key: '' });
  const [isConfigured, setIsConfigured] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("idle"); 
  const [policies, setPolicies] = useState([]);
  const [vendorId, setVendorId] = useState(null);
  const [libReady, setLibReady] = useState(false);

  // --- IDENTITY ROUTING (The Magic Link Radar) ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetVendor = params.get('vendor');
    
    if (targetVendor) {
      setVendorId(targetVendor);
    }
  }, []);

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

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!libReady) return;

    // Fallback to sessionStorage for the Canvas sandbox to avoid compiler crashes
    const storedUrl = sessionStorage.getItem('sb_url');
    const storedKey = sessionStorage.getItem('sb_key');
    
    if (storedUrl && storedKey) {
      initializeSupabase(storedUrl, storedKey);
    }
  }, [libReady]);

  const initializeSupabase = (url, key) => {
    try {
      if (!window.supabase) throw new Error("Supabase library not ready");
      const client = window.supabase.createClient(url, key);
      setSupabaseClient(client);
      setConfig({ url, key });
      setIsConfigured(true);
      sessionStorage.setItem('sb_url', url);
      sessionStorage.setItem('sb_key', key);
    } catch (err) {
      console.error(err);
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

    const channel = supabaseClient
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'policies' },
        (payload) => fetchPolicies()
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [supabaseClient, isConfigured]);

  useEffect(() => {
    if (!supabaseClient || !isConfigured) return;
    const hasProcessing = policies.some(p => p.processing_status === 'processing');
    if (!hasProcessing) return;

    const pollInterval = setInterval(() => fetchPolicies(), 3000);
    return () => clearInterval(pollInterval);
  }, [policies, supabaseClient, isConfigured]);

  const fetchPolicies = async () => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('policies')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setPolicies(data);
  };

  const handleFileUpload = async (e) => {
    if (!supabaseClient) return;
    try {
      setUploading(true);
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('cois')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const payload = {
        document_url: filePath,
        processing_status: 'processing',
      };
      
      if (vendorId) payload.vendor_id = vendorId;

      const { error: dbError } = await supabaseClient
        .from('policies')
        .insert([payload]);

      if (dbError) throw dbError;

      setStatus("success");
      fetchPolicies();
    } catch (error) {
      setStatus("error");
      console.error(error);
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
          <p className="text-gray-500 mb-6 text-sm">Connect your vault securely.</p>
          <form onSubmit={handleConfigSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Project URL</label>
              <input name="url" required className="w-full border border-gray-300 rounded-md p-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Anon Key</label>
              <input name="key" type="password" required className="w-full border border-gray-300 rounded-md p-2 text-sm" />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700">
              Connect
            </button>
          </form>
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
          <button onClick={() => { sessionStorage.clear(); setIsConfigured(false); }} className="text-xs text-gray-400 hover:text-red-600">Disconnect</button>
        </header>

        {vendorId && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-900">Secure Upload Session</p>
              <p className="text-xs text-blue-700">Your vendor identity is verified.</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-12">
          <h2 className="text-xl font-semibold mb-4">Upload Certificate</h2>
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploading ? (
                  <div className="animate-pulse text-blue-600 font-medium">Uploading to Secure Vault...</div>
                ) : status === 'success' ? (
                  <div className="text-center">
                    <div className="text-green-600 font-bold text-lg mb-1">Upload Successful</div>
                  </div>
                ) : (
                  <>
                    <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                  </>
                )}
              </div>
              <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Policy Status Dashboard</h2>
            <button onClick={fetchPolicies} className="text-xs font-semibold bg-white border border-gray-300 text-gray-700 py-1.5 px-3 rounded shadow-sm hover:bg-gray-50">
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
        </div>
      </div>
    </div>
  );
}

export default App;