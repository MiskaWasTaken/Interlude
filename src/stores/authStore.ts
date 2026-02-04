import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingInviteCode: string | null;

  // Actions
  initialize: () => Promise<void>;
  validateInviteCode: (code: string) => Promise<boolean>;
  signUpWithGoogle: (inviteCode: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  handleAuthCallback: () => Promise<{ isNewUser: boolean }>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,
      pendingInviteCode: null,

      initialize: async () => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.user) {
            // Check if user has a profile (completed signup)
            const { data: profile } = await supabase
              .from("user_profiles")
              .select("*")
              .eq("id", session.user.id)
              .single();

            if (profile) {
              set({
                user: session.user,
                session,
                isAuthenticated: true,
                isLoading: false,
              });
            } else {
              // User authenticated but no profile - they need to complete signup
              await supabase.auth.signOut();
              set({
                user: null,
                session: null,
                isAuthenticated: false,
                isLoading: false,
              });
            }
          } else {
            set({ isLoading: false });
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "SIGNED_OUT") {
              set({
                user: null,
                session: null,
                isAuthenticated: false,
                pendingInviteCode: null,
              });
            }
          });
        } catch (error) {
          console.error("Auth initialization error:", error);
          set({ isLoading: false });
        }
      },

      validateInviteCode: async (code: string) => {
        const normalizedCode = code.toUpperCase().trim();

        const { data, error } = await supabase
          .from("invite_codes")
          .select("*")
          .eq("code", normalizedCode)
          .eq("is_used", false)
          .single();

        if (error || !data) {
          return false;
        }

        return true;
      },

      signUpWithGoogle: async (inviteCode: string) => {
        const isValid = await get().validateInviteCode(inviteCode);

        if (!isValid) {
          throw new Error("Invalid or already used invite code");
        }

        // Store the invite code for after OAuth callback
        set({ pendingInviteCode: inviteCode.toUpperCase().trim() });
        localStorage.setItem(
          "pendingInviteCode",
          inviteCode.toUpperCase().trim(),
        );
        localStorage.setItem("authMode", "signup");

        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });

        if (error) {
          localStorage.removeItem("pendingInviteCode");
          localStorage.removeItem("authMode");
          throw error;
        }
      },

      signInWithGoogle: async () => {
        localStorage.setItem("authMode", "signin");
        localStorage.removeItem("pendingInviteCode");

        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) {
          throw error;
        }
      },

      handleAuthCallback: async () => {
        // Get URL parameters - Supabase puts tokens in hash fragment
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1),
        );
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        let session;

        if (accessToken && refreshToken) {
          // Set session from URL hash tokens
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error("Set session error:", error);
            throw new Error("Authentication failed");
          }
          session = data.session;
        } else {
          // Try to get existing session
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session?.user) {
            throw new Error("Authentication failed");
          }
          session = data.session;
        }

        if (!session?.user) {
          throw new Error("Authentication failed");
        }

        const authMode = localStorage.getItem("authMode");
        const pendingInviteCode = localStorage.getItem("pendingInviteCode");

        // Check if user profile exists
        const { data: existingProfile } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (existingProfile) {
          // Existing user - just sign in
          localStorage.removeItem("authMode");
          localStorage.removeItem("pendingInviteCode");

          set({
            user: session.user,
            session,
            isAuthenticated: true,
            pendingInviteCode: null,
          });

          return { isNewUser: false };
        }

        // New user - must have invite code
        if (authMode !== "signup" || !pendingInviteCode) {
          // They tried to sign in but don't have an account
          await supabase.auth.signOut();
          localStorage.removeItem("authMode");
          localStorage.removeItem("pendingInviteCode");
          throw new Error(
            "No account found. Please sign up with an invite code first.",
          );
        }

        // Validate and use the invite code
        const { data: inviteCode, error: codeError } = await supabase
          .from("invite_codes")
          .select("*")
          .eq("code", pendingInviteCode)
          .eq("is_used", false)
          .single();

        if (codeError || !inviteCode) {
          await supabase.auth.signOut();
          localStorage.removeItem("authMode");
          localStorage.removeItem("pendingInviteCode");
          throw new Error("Invalid or already used invite code");
        }

        // Create user profile
        const { error: profileError } = await supabase
          .from("user_profiles")
          .insert({
            id: session.user.id,
            email: session.user.email,
            display_name:
              session.user.user_metadata?.full_name || session.user.email,
            avatar_url: session.user.user_metadata?.avatar_url,
            invite_code_used: pendingInviteCode,
          });

        if (profileError) {
          console.error("Profile creation error:", profileError);
          await supabase.auth.signOut();
          throw new Error("Failed to create user profile");
        }

        // Mark invite code as used
        await supabase
          .from("invite_codes")
          .update({
            is_used: true,
            used_by: session.user.id,
            used_at: new Date().toISOString(),
          })
          .eq("code", pendingInviteCode);

        localStorage.removeItem("authMode");
        localStorage.removeItem("pendingInviteCode");

        // Sign out so user has to sign in again after account creation
        await supabase.auth.signOut();

        set({
          user: null,
          session: null,
          isAuthenticated: false,
          pendingInviteCode: null,
        });

        return { isNewUser: true };
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({
          user: null,
          session: null,
          isAuthenticated: false,
          pendingInviteCode: null,
        });
      },
    }),
    {
      name: "interlude-auth",
      partialize: (state) => ({
        // Only persist minimal data
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
