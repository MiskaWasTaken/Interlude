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
        <div className="spinner-lg border-accent-primary" />
      </div>
    );
  }

  return (
    <div className="page-centered scrollbar-thin">
      <div className="page-content">
        <h1 className="section-title text-3xl">Profile Settings</h1>
        <p className="section-subtitle">
          Manage your account preferences and personal information
        </p>

        {/* UID Badge */}
        {profile?.uid && (
          <div className="mb-14 flex items-center gap-5">
            <div className="badge-accent px-6 py-3">
              <span className="font-mono text-lg font-bold">
                #{formatUID(profile.uid)}
              </span>
            </div>
            <span className="text-text-secondary">
              Your unique Interlude ID
            </span>
          </div>
        )}

        {/* Message */}
        {message && (
          <div
            className={`mb-12 ${
              message.type === "success" ? "alert-success" : "alert-error"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-12">
          {/* Avatar Section */}
          <div className="card flex items-start gap-10">
            <div className="relative group">
              <button
                onClick={handleAvatarClick}
                className="avatar-lg avatar-interactive"
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
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
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
            <div className="flex-1 py-3">
              <h3 className="text-text-primary font-semibold text-lg mb-3">
                Profile Picture
              </h3>
              <p className="text-text-secondary text-sm mb-5 leading-relaxed">
                Click to upload a new profile picture. Max size: 2MB
              </p>
              {avatarFile && (
                <button
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview(profile?.avatar_url || null);
                  }}
                  className="btn-danger btn-sm"
                >
                  Remove new image
                </button>
              )}
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="label">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              className="input"
              maxLength={50}
            />
            <p className="helper-text">{displayName.length}/50 characters</p>
          </div>

          {/* Bio */}
          <div>
            <label className="label">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself and your music taste..."
              rows={4}
              className="textarea"
              maxLength={200}
            />
            <p className="helper-text">{bio.length}/200 characters</p>
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={profile?.email || ""}
              disabled
              className="input input-disabled"
            />
            <p className="helper-text">Email cannot be changed</p>
          </div>

          {/* Tracking Preferences */}
          <div className="card">
            <div className="flex items-start justify-between gap-8">
              <div className="flex-1">
                <h3 className="text-text-primary font-semibold text-lg mb-3">
                  Listening Tracking
                </h3>
                <p className="text-text-secondary leading-relaxed">
                  Track your listening history and statistics to get
                  personalized insights
                </p>
              </div>
              <button
                onClick={() => setTrackingEnabled(!trackingEnabled)}
                className={`toggle ${
                  trackingEnabled ? "bg-accent-primary" : "bg-amoled-border"
                }`}
              >
                <span
                  className={`toggle-thumb ${
                    trackingEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {trackingEnabled && profile && (
              <div className="mt-8 pt-8 border-t border-amoled-border grid grid-cols-2 gap-6">
                <div className="stat-card">
                  <p className="stat-label">Total Listening Time</p>
                  <p className="stat-value">
                    {formatListeningTime(profile.total_listening_time || 0)}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Tracks Played</p>
                  <p className="stat-value">{profile.tracks_played || 0}</p>
                </div>
              </div>
            )}
          </div>

          {/* Account Info */}
          <div className="card">
            <h3 className="text-text-primary font-semibold text-lg mb-6">
              Account Information
            </h3>
            <div className="space-y-5">
              <div className="flex justify-between items-center py-3">
                <span className="text-text-secondary">Member since</span>
                <span className="text-text-primary font-medium">
                  {profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-text-secondary">User ID</span>
                <span className="text-text-primary font-mono text-xs bg-amoled-surface px-4 py-2 rounded-lg">
                  {profile?.id?.slice(0, 8)}...{profile?.id?.slice(-4)}
                </span>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-6">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary w-full"
            >
              {isSaving ? (
                <>
                  <div className="spinner-sm border-black" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
