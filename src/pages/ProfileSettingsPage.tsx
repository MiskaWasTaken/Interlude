import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../stores/authStore";
import { supabase } from "../lib/supabase";

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  uid: number;
  tracking_enabled: boolean;
  total_listening_time: number;
  tracks_played: number;
  created_at: string;
}

export default function ProfileSettingsPage() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      setProfile(data);
      setDisplayName(data.display_name || "");
      setBio(data.bio || "");
      setTrackingEnabled(data.tracking_enabled ?? true);
      setAvatarPreview(data.avatar_url);
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setMessage({ type: "error", text: "Image must be less than 2MB" });
        return;
      }

      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return profile?.avatar_url || null;

    const fileExt = avatarFile.name.split(".").pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, avatarFile, { upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload avatar");
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setMessage(null);

    try {
      let avatarUrl = profile?.avatar_url;

      // Upload new avatar if selected
      if (avatarFile) {
        avatarUrl = await uploadAvatar();
      }

      const { error } = await supabase
        .from("user_profiles")
        .update({
          display_name: displayName.trim() || profile?.email,
          bio: bio.trim() || null,
          avatar_url: avatarUrl,
          tracking_enabled: trackingEnabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setMessage({ type: "success", text: "Profile updated successfully!" });
      setAvatarFile(null);
      loadProfile();
    } catch (error: any) {
      console.error("Save error:", error);
      setMessage({
        type: "error",
        text: error.message || "Failed to save profile",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const formatUID = (uid: number) => {
    return String(uid).padStart(4, "0");
  };

  const formatListeningTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-8">
        Profile Settings
      </h1>

      {/* UID Badge */}
      {profile?.uid && (
        <div className="mb-8 flex items-center gap-3">
          <div className="px-4 py-2 bg-accent-primary/20 rounded-lg border border-accent-primary/30">
            <span className="text-accent-primary font-mono text-lg font-bold">
              #{formatUID(profile.uid)}
            </span>
          </div>
          <span className="text-text-secondary text-sm">
            Your unique Interlude ID
          </span>
        </div>
      )}

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-500/20 border border-green-500/30 text-green-400"
              : "bg-red-500/20 border border-red-500/30 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-8">
        {/* Avatar Section */}
        <div className="flex items-start gap-6">
          <div className="relative group">
            <button
              onClick={handleAvatarClick}
              className="w-24 h-24 rounded-full overflow-hidden bg-amoled-card border-2 border-amoled-border hover:border-accent-primary transition-colors"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-muted">
                  <svg
                    className="w-10 h-10"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-text-primary font-medium mb-1">
              Profile Picture
            </h3>
            <p className="text-text-secondary text-sm mb-3">
              Click to upload a new profile picture. Max size: 2MB
            </p>
            {avatarFile && (
              <button
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview(profile?.avatar_url || null);
                }}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Remove new image
              </button>
            )}
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-text-primary font-medium mb-2">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your display name"
            className="w-full px-4 py-3 bg-amoled-card border border-amoled-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
            maxLength={50}
          />
          <p className="text-text-muted text-sm mt-1">
            {displayName.length}/50 characters
          </p>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-text-primary font-medium mb-2">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself and your music taste..."
            rows={4}
            className="w-full px-4 py-3 bg-amoled-card border border-amoled-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors resize-none"
            maxLength={200}
          />
          <p className="text-text-muted text-sm mt-1">
            {bio.length}/200 characters
          </p>
        </div>

        {/* Email (Read-only) */}
        <div>
          <label className="block text-text-primary font-medium mb-2">
            Email
          </label>
          <input
            type="email"
            value={profile?.email || ""}
            disabled
            className="w-full px-4 py-3 bg-amoled-surface border border-amoled-border rounded-lg text-text-secondary cursor-not-allowed"
          />
          <p className="text-text-muted text-sm mt-1">
            Email cannot be changed
          </p>
        </div>

        {/* Tracking Preferences */}
        <div className="border border-amoled-border rounded-lg p-5 bg-amoled-card">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-text-primary font-medium mb-1">
                Listening Tracking
              </h3>
              <p className="text-text-secondary text-sm">
                Track your listening history and statistics to get personalized
                insights
              </p>
            </div>
            <button
              onClick={() => setTrackingEnabled(!trackingEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                trackingEnabled ? "bg-accent-primary" : "bg-amoled-border"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  trackingEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {trackingEnabled && profile && (
            <div className="mt-4 pt-4 border-t border-amoled-border grid grid-cols-2 gap-4">
              <div className="bg-amoled-surface rounded-lg p-4">
                <p className="text-text-muted text-sm mb-1">
                  Total Listening Time
                </p>
                <p className="text-text-primary text-xl font-semibold">
                  {formatListeningTime(profile.total_listening_time || 0)}
                </p>
              </div>
              <div className="bg-amoled-surface rounded-lg p-4">
                <p className="text-text-muted text-sm mb-1">Tracks Played</p>
                <p className="text-text-primary text-xl font-semibold">
                  {profile.tracks_played || 0}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Account Info */}
        <div className="border border-amoled-border rounded-lg p-5 bg-amoled-card">
          <h3 className="text-text-primary font-medium mb-3">
            Account Information
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Member since</span>
              <span className="text-text-primary">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">User ID</span>
              <span className="text-text-primary font-mono text-xs">
                {profile?.id?.slice(0, 8)}...{profile?.id?.slice(-4)}
              </span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3 px-6 bg-accent-primary text-black font-semibold rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </div>
  );
}
