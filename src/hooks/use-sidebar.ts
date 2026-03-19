"use client";

import { createContext, useContext } from "react";

export interface SidebarContextType {
  expanded: boolean;
  pinned: boolean;
  mobileOpen: boolean;
  activeItem: string;
  setExpanded: (expanded: boolean) => void;
  setPinned: (pinned: boolean) => void;
  toggle: () => void;
  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
  setActiveItem: (id: string) => void;
}

export const SidebarContext = createContext<SidebarContextType>({
  expanded: false,
  pinned: false,
  mobileOpen: false,
  activeItem: "office",
  setExpanded: () => {},
  setPinned: () => {},
  toggle: () => {},
  openMobile: () => {},
  closeMobile: () => {},
  toggleMobile: () => {},
  setActiveItem: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

