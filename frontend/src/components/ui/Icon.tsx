"use client";

import { forwardRef, type SVGAttributes } from "react";
import { cn } from "@/lib/utils";

// Stroke-icon path set (24x24 viewBox, currentColor). Reused across the app
// so we stop pasting raw `d=""` strings into pages.
export const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5",
  messageSquare: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  palette: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  globe: "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
  alertTriangle: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  trash2: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  chart: "M3 3v18h18M7 14l4-4 3 3 5-6",
  receipt:
    "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
  tag: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  cog: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15a1.65 1.65 0 0 0-1.51-1H2a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 3.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 16 4.6a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 13z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  userPlus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 11h.01M21 14h-3M18 17h.01",
  lock: "M12 15v-5a3 3 0 1 1 6 0v5M7 15h14M12 22H8a2 2 0 0 1 0-4h8a2 2 0 0 1 0 4z",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 2.83-2.83M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M2 2l20 20",
  alert: "M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  bulb: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 19h6",
  x: "M18 6 6 18M6 6l12 12",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  chevronLeft: "M15 18l-6-6 6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 15v12",
  filter: "M3 3h18v1.5H3zM7 9h10M12 16h3M21 21H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z",
  search: "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
  target: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4z",
  shield: "M12 22s8-4 8-10V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7c0 6 8 10 8 10z",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  chevronUp: "M18 15l-6-6-6 6",
  check: "M20 6 9 17l-5-5",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  calendar: "M8 2v4M16 2v4M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7M3 10h18",
  creditCard: "M21 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h7M12 17v-5M15 14h-6",
  menu: "M3 12h18M3 6h18M3 18h18",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  downloadCloud: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  fileText: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  command: "M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3z",
  barChart: "M3 3v18h18M7 16h4M12 12h4M17 8h4",
  lightning: "M13 2L3 14h12l-1 8 10-12h-12l1-8z",
  sparkles: "M12 2v2M17 5l-1 1M22 12h-2M17 19l-1-1M12 22v-2M7 19l1-1M2 12h2M7 5l1 1",
  barChart2: "M3 3v18h18m-4-16v12m4-12v8m4-16v4",
  arrowUpRight: "M7 17l10-10M17 7h-10v10",
  arrowDownRight: "M7 7l10 10M17 17h-10v-10",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  copy: "M8 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 10h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2v-2M8 4v12",
  clipboard: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
  refreshCw: "M21 12a9 9 0 0 0-9-9 9 9 0 0 0-6 15 9 9 0 0 1 12-9 3 3 0 0 1 3 3M21 3v5h-5",
  layoutDashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
  trendUp: "M16 19h6v-6M22 13l-7-7-7 7",
  trendDown: "M16 5h6v6M16 5l-7 7-7-7",
  plusCircle: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v8M8 12h8",
  minusCircle: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8",
  checkCircle: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
  xCircle: "M22 11.08V12a10 10 0 1 1-5.93-9.14M15 9l-6 6M9 9l6 6",
  info: "M13 16h-2v-4h2M13 12h-2v-2h2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  helpCircle: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37zM12 17h.01M12 12h.01",
  wallet: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h14",
  dollarSign: "M15 12a3 3 0 1 0-2.83-2H9M21 12c0 1.5-4 5-8 5s-8-3.5-8-5a3 3 0 1 1 4.24-4.48M12 3v18M3 12h18",
  percent: "M19 5 5 19M17 9a4 4 0 0 1 0 8M5 15a4 4 0 0 1 8 0",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22h16",
  heart: "M19.5 12.572A5.71 5.71 0 0 1 12 21.35a5.71 5.71 0 0 1-7.5-8.778 5.73 5.73 0 0 1 2.03-4.22A5.95 5.95 0 0 1 12 3.95a5.95 5.95 0 0 1 5.47 4.39 5.73 5.73 0 0 1 2.03 4.22z",
  award: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  share2: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 21l-3-3-3 3M21 12h-2a4 4 0 0 0-4 4v2",
  externalLink: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  maximize2: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  minimize2: "M3 3h6v6M17 17h-6v-6M21 3l-7 7M3 21l7-7",
  grid: "M3 9l0 10 10 0M3 3l0 10 10 0M21 9l-10 0 0 10M21 21l-10 0 0-10",
  layout: "M3 3h4v4H3V3zm8 0h4v4h-4V3zm8 0h4v4h-4V3zm0 8h4v4h-4V11zm-8 0h4v4H11V11zM3 11h4v4H3V11zM3 19h4v4H3v-4z",
  activity: "M22 12h-4l-3 4L9 6l-3 4H2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
  barChart3: "M3 3v18h18M7 16h4M12 12h4M17 8h4",
  pieChart: "M21 21v-8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8M21 21l-9-9",
  Schiller: "M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16M3 21h18M5 21h14",
  folder: "M20 21H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2zM6 5H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  folderOpen: "M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2",
  folderPlus: "M20 21H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2zM12 15v6M9 18h6",
  filePlus: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 15v-6M9 12h6",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6",
  inbox: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4zM4 6h16v2H4V6z",
  paperclip: "M21.44 11.05a.83.83 0 0 1 0 1.28l-8.5 8.5a.83.83 0 0 1-1.28 0l-6.5-6.5a.83.83 0 0 1 0-1.28l6.5-6.5a.83.83 0 0 1 1.28 0l8.5 8.5z",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  link2: "M7 17l-3 3a2 2 0 0 0 0 2.83l4 4a2 2 0 0 0 2.83 0l3-3m0 0l3-3a2 2 0 0 0 0-2.83l-4-4a2 2 0 0 0-2.83 0l-3 3",
  userCheck: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 6l-5 5M13 11l4 4",
  userMinus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 13h-8",
  userX: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 13l-6-6M16 7l-6 6",
  spark: "M12 2v2M17 5l-1 1M22 12h-2M17 19l-1-1M12 22v-2M7 19l1-1M2 12h2M7 5l1 1",
  rotateCcw: "M21 12a9 9 0 0 1-9 9 9 9 0 0 1 6-15 9 9 0 0 0-12 9 3 3 0 0 0-3 3M3 3v5h5",
  clock: "M12 6v6l4 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z",
  calendarDays: "M8 2v4M16 2v4M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7M3 10h18M16 19h2M8 19h2",
  briefcase: "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M22 19V9a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2M12 3v4",
  fileSpreadsheet: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM8 13h8M8 17h8M8 9h8",
  fileBarChart: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM8 13h8M8 17h8M8 9h8M12 7v10",
  fileChartLine: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileAlert: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 9v4M12 17h.01",
  fileCheck: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13l-5 5m-5-5l5 5",
  fileX: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M15 6l-6 6M15 12l-6-6",
  fileQuestion: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M13 16h-2v-4h2M13 12h-2v-2h2",
  fileKey: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileLock: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileMinus: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 12h6",
  fileSearch: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileText2: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  fileType: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  fileCode: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8M10 13l-3 3 3 3M18 10l-3 3 3 3",
  fileJson: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileCsv: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileAudio: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileVideo: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileImage: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  filePdf: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileZip: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileSignature: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileSliders: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileStack: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileSymlink: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileInput: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileOutput: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileTemplate: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileDiff: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileWarning: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 9v4M12 17h.01",
  fileUser: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h8",
  fileHeart: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M19.5 12.572A5.71 5.71 0 0 1 12 21.35a5.71 5.71 0 0 1-7.5-8.778 5.73 5.73 0 0 1 2.03-4.22A5.95 5.95 0 0 1 12 3.95a5.95 5.95 0 0 1 5.47 4.39 5.73 5.73 0 0 1 2.03 4.22z",
  fileStar: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 17.27L18.18 21l-1.64-7.03L22 9.27l-7.19-.61L12 2 9.19 8.66 2 9.27l5.46 4.73L5.82 21z",
  fileAward: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  fileBell: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  fileMusic: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2M15 11V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2",
  filePlay: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 11v10l7-5-7-5z",
  fileVideo2: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 11v10l7-5-7-5zM20 7l-5 4 5 4V7z",
  sun: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  moonStar: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9ZM22 11V5m-4 6h4m4-4v4M11 22v-4m0-4v4M5 16v4m4-4v4",
};

export type IconName = keyof typeof ICONS;

interface IconProps extends SVGAttributes<SVGSVGElement> {
  name: IconName;
  className?: string;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ name, className, ...props }, ref) => {
    const path = ICONS[name];
    if (!path) return null;

    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("h-5 w-5", className)}
        {...props}
      >
        <path d={path} />
      </svg>
    );
  }
);

Icon.displayName = "Icon";

export const LogoMark = ({ className, ...props }: SVGAttributes<SVGSVGElement>) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    className={cn("h-7 w-7", className)}
    {...props}
  >
    <path
      d="M16 2L4 8v16l12 6 12-6V8L16 2zm0 2.5L25.5 8.75V23.25L16 29.5 6.5 23.25V8.75L16 4.5z"
      fill="currentColor"
    />
    <path
      d="M16 10v12M10 16h12"
      stroke="white"
      strokeWidth={2.5}
      strokeLinecap="round"
    />
  </svg>
);