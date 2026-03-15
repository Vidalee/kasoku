"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  BottomNavigation,
  BottomNavigationAction,
  useMediaQuery,
  useTheme,
  Tooltip,
  Divider,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import StyleIcon from "@mui/icons-material/Style";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import SearchIcon from "@mui/icons-material/Search";
import FolderIcon from "@mui/icons-material/Folder";
import BarChartIcon from "@mui/icons-material/BarChart";
import SettingsIcon from "@mui/icons-material/Settings";
import DownloadIcon from "@mui/icons-material/Download";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LogoutIcon from "@mui/icons-material/Logout";
import { useThemeMode } from "@/lib/ThemeContext";
import { SyncStatusChip } from "@/components/SyncStatus";

const DRAWER_WIDTH = 220;
const DRAWER_COLLAPSED = 64;

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: <DashboardIcon /> },
  { label: "Review", href: "/review", icon: <StyleIcon /> },
  { label: "Vocabulary", href: "/vocabulary", icon: <LibraryBooksIcon /> },
  { label: "Sentences", href: "/sentences", icon: <FormatListBulletedIcon /> },
  { label: "Analyze", href: "/analyze", icon: <SearchIcon /> },
  { label: "Decks", href: "/decks", icon: <FolderIcon /> },
  { label: "Stats", href: "/stats", icon: <BarChartIcon /> },
  { label: "Import", href: "/import", icon: <DownloadIcon /> },
  { label: "Settings", href: "/settings", icon: <SettingsIcon /> },
];

// Bottom nav shows the 5 most-used pages on mobile
const BOTTOM_NAV_ITEMS = NAV_ITEMS.slice(0, 5);

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { mode, toggle } = useThemeMode();

  const drawerWidth = expanded ? DRAWER_WIDTH : DRAWER_COLLAPSED;

  const drawerContent = (mobile = false) => (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        sx={{
          justifyContent: expanded || mobile ? "space-between" : "center",
          px: expanded || mobile ? 2 : 1,
        }}
      >
        {(expanded || mobile) && (
          <Typography variant="h6" fontWeight={700} color="primary">
            加速
          </Typography>
        )}
        {!mobile && (
          <IconButton onClick={() => setExpanded((e) => !e)} size="small">
            <MenuIcon />
          </IconButton>
        )}
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1, pt: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Tooltip
              key={item.href}
              title={!expanded && !mobile ? item.label : ""}
              placement="right"
            >
              <ListItemButton
                selected={active}
                onClick={() => {
                  router.push(item.href);
                  if (mobile) setMobileOpen(false);
                }}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  mb: 0.5,
                  justifyContent: expanded || mobile ? "flex-start" : "center",
                  px: expanded || mobile ? 2 : 1,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: expanded || mobile ? 40 : "auto",
                    color: active ? "primary.main" : "inherit",
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {(expanded || mobile) && (
                  <ListItemText primary={item.label} />
                )}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 1 }}>
        <Tooltip title={!expanded && !mobile ? "Toggle theme" : ""} placement="right">
          <ListItemButton
            onClick={toggle}
            sx={{ borderRadius: 2, justifyContent: expanded || mobile ? "flex-start" : "center" }}
          >
            <ListItemIcon sx={{ minWidth: expanded || mobile ? 40 : "auto" }}>
              {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </ListItemIcon>
            {(expanded || mobile) && <ListItemText primary="Toggle theme" />}
          </ListItemButton>
        </Tooltip>
        <Tooltip title={!expanded && !mobile ? "Logout" : ""} placement="right">
          <ListItemButton
            onClick={logout}
            sx={{ borderRadius: 2, justifyContent: expanded || mobile ? "flex-start" : "center" }}
          >
            <ListItemIcon sx={{ minWidth: expanded || mobile ? 40 : "auto" }}>
              <LogoutIcon />
            </ListItemIcon>
            {(expanded || mobile) && <ListItemText primary="Logout" />}
          </ListItemButton>
        </Tooltip>
        {(expanded || mobile) && (
          <Box sx={{ px: 2, pb: 1 }}>
            <SyncStatusChip />
          </Box>
        )}
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <AppBar position="fixed" elevation={0} color="default">
          <Toolbar>
            <IconButton onClick={() => setMobileOpen(true)} edge="start">
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" fontWeight={700} color="primary" sx={{ ml: 1 }}>
              {NAV_ITEMS.find((n) => n.href === pathname)?.label ?? "加速"}
            </Typography>
          </Toolbar>
        </AppBar>
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
        >
          <Box sx={{ width: DRAWER_WIDTH }}>{drawerContent(true)}</Box>
        </Drawer>
        <Box component="main" sx={{ flex: 1, mt: "56px", mb: "56px", p: 2 }}>
          {children}
        </Box>
        <BottomNavigation
          value={BOTTOM_NAV_ITEMS.findIndex((n) => n.href === pathname)}
          onChange={(_, i) => router.push(BOTTOM_NAV_ITEMS[i].href)}
          showLabels
          sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000 }}
        >
          {BOTTOM_NAV_ITEMS.map((item) => (
            <BottomNavigationAction
              key={item.href}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </BottomNavigation>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          transition: "width 0.2s",
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            overflowX: "hidden",
            transition: "width 0.2s",
          },
        }}
      >
        {drawerContent()}
      </Drawer>
      <Box component="main" sx={{ flex: 1, p: 3, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
