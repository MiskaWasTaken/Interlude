import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";
import { useNavigate } from "react-router-dom";

interface InviteCode {
  id: string;
  code: string;
  is_used: boolean;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

// Add your admin email(s) here
const ADMIN_EMAILS = ["aaryamungli@gmail.com"];

export default function AdminInviteCodesPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [filter, setFilter] = useState<"all" | "available" | "used">(
    "available",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }

    if (!isAdmin) {
      navigate("/");
      return;
    }

    fetchCodes();
  }, [isAuthenticated, isAdmin, navigate]);

  const fetchCodes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("invite_codes")
      .select("*")
      .order("is_used", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && data) {
      setCodes(data);
    }
    setIsLoading(false);
  };

  const filteredCodes = codes.filter((code) => {
    if (filter === "available") return !code.is_used;
    if (filter === "used") return code.is_used;
    return true;
  });

  const availableCount = codes.filter((c) => !c.is_used).length;
  const usedCount = codes.filter((c) => c.is_used).length;

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyAllAvailable = async () => {
    const availableCodes = codes
      .filter((c) => !c.is_used)
      .map((c) => c.code)
      .join("\n");
    await navigator.clipboard.writeText(availableCodes);
    setCopiedCode("all");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-amoled-black p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Invite Codes
            </h1>
            <p className="text-text-secondary mt-1">
              {availableCount} available · {usedCount} used · {codes.length}{" "}
              total
            </p>
          </div>
          <button
            onClick={copyAllAvailable}
            className="px-4 py-2 bg-accent-primary text-black rounded-lg font-medium hover:bg-accent-primary/90 transition-colors"
          >
            {copiedCode === "all" ? "Copied!" : "Copy All Available"}
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(["available", "used", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-accent-primary text-black"
                  : "bg-amoled-card text-text-secondary hover:text-text-primary"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "available" && ` (${availableCount})`}
              {f === "used" && ` (${usedCount})`}
            </button>
          ))}
        </div>

        {/* Codes List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-amoled-card rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-text-secondary text-sm font-medium px-4 py-3">
                    Code
                  </th>
                  <th className="text-left text-text-secondary text-sm font-medium px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-text-secondary text-sm font-medium px-4 py-3">
                    Used At
                  </th>
                  <th className="text-right text-text-secondary text-sm font-medium px-4 py-3">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCodes.map((code) => (
                  <tr
                    key={code.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <code className="text-text-primary font-mono text-sm">
                        {code.code}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      {code.is_used ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                          Used
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-sm">
                      {code.used_at
                        ? new Date(code.used_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!code.is_used && (
                        <button
                          onClick={() => copyCode(code.code)}
                          className="text-accent-primary hover:text-accent-primary/80 text-sm font-medium transition-colors"
                        >
                          {copiedCode === code.code ? "Copied!" : "Copy"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredCodes.length === 0 && (
              <div className="text-center py-12 text-text-muted">
                No {filter === "all" ? "" : filter} codes found
              </div>
            )}
          </div>
        )}

        {/* Quick Copy Section */}
        {filter === "available" && availableCount > 0 && (
          <div className="mt-6 p-4 bg-amoled-card rounded-xl border border-white/5">
            <h3 className="text-text-primary font-medium mb-3">Quick Share</h3>
            <p className="text-text-secondary text-sm mb-3">
              Click any code below to copy it:
            </p>
            <div className="flex flex-wrap gap-2">
              {codes
                .filter((c) => !c.is_used)
                .slice(0, 10)
                .map((code) => (
                  <button
                    key={code.id}
                    onClick={() => copyCode(code.code)}
                    className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${
                      copiedCode === code.code
                        ? "bg-green-500 text-white"
                        : "bg-amoled-surface text-text-primary hover:bg-white/10"
                    }`}
                  >
                    {copiedCode === code.code ? "✓ Copied" : code.code}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
