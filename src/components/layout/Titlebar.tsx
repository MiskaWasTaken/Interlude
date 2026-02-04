import { useNavigate, useLocation } from "react-router-dom";
import { appWindow } from "@tauri-apps/api/window";
import { useState } from "react";
import { clsx } from "clsx";
import { SettingsIcon } from "../icons";

export default function Titlebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };
  const handleClose = () => appWindow.close();

  const isSettingsPage = location.pathname === "/settings";

  return (
    <div
      data-tauri-drag-region
      className="h-11 flex items-center justify-between bg-amoled-black border-b border-amoled-border/30 select-none"
    >
      {/* Left - App branding & Navigation */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-3 h-full"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-3">
          <div className="relative w-7 h-7">
            {/* Gradient logo */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-accent-primary via-orange-400 to-pink-500" />
            <div className="absolute inset-0 rounded-lg flex items-center justify-center">
              <svg
                className="w-4 h-4 text-black"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          </div>
          <span
            data-tauri-drag-region
            className="text-sm font-bold text-text-primary tracking-wide hidden sm:block"
          >
            Interlude
          </span>
        </div>

        {/* Navigation Arrows */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full bg-amoled-card/80 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-amoled-hover transition-colors"
            title="Go back"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
          <button
            onClick={() => navigate(1)}
            className="w-8 h-8 rounded-full bg-amoled-card/80 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-amoled-hover transition-colors"
            title="Go forward"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Center - Drag region */}
      <div data-tauri-drag-region className="flex-1 h-full" />

      {/* Right - Actions and Window Controls */}
      <div className="flex items-center h-full">
        {/* Settings Button */}
        <button
          onClick={() => navigate("/settings")}
          className={clsx(
            "h-full px-3 flex items-center justify-center transition-colors",
            isSettingsPage
              ? "text-accent-primary bg-accent-primary/10"
              : "text-text-secondary hover:text-text-primary hover:bg-amoled-hover",
          )}
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-amoled-border/50 mx-1" />

        {/* Window Controls */}
        <div className="flex items-center">
          {/* Minimize */}
          <button
            onClick={handleMinimize}
            className="w-12 h-11 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-amoled-hover transition-colors"
            title="Minimize"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 14H4v-2h16v2z" />
            </svg>
          </button>

          {/* Maximize/Restore */}
          <button
            onClick={handleMaximize}
            className="w-12 h-11 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-amoled-hover transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M4 8h4V4h12v12h-4v4H4V8zm12 0v6h2V6H10v2h6zM6 10v8h8v-8H6z" />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" />
              </svg>
            )}
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            className="w-12 h-11 flex items-center justify-center text-text-secondary hover:text-white hover:bg-red-600 transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
