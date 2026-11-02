"use client";

import { useState, type ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { CallOverlay } from "@/components/messages/CallOverlay";
import { RoomRuntimeProvider } from "@/components/voicing/RoomRuntime";
import { useI18n, useT } from "@/i18n/client";

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { dir } = useI18n();
  const t = useT();

  return (
    <div dir={dir} className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        {t("common.skip")}
      </a>
      {/* Keeps one voice room alive across page navigation (mic + peers + SSE). */}
      <RoomRuntimeProvider>
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className={dir === "rtl" ? "lg:pr-64" : "lg:pl-64"}>
          <Header onMenuClick={() => setNavOpen(true)} />
          <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
            {children}
          </main>
        </div>
        {/* Global call screen: rings on every page while someone is signed in. */}
        <CallOverlay />
      </RoomRuntimeProvider>
    </div>
  );
}
