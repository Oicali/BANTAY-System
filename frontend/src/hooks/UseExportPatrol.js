// frontend/src/hooks/useExportPatrol.js
// Two export functions:
//   exportPatrolList()          — full patrol list (active / upcoming / completed)
//   exportPatrolDetail(patrol, mapRef) — single patrol detail with map screenshot

import { useState } from "react";
import html2canvas from "html2canvas";

const API_BASE = import.meta.env.VITE_API_URL;
const getToken = () => localStorage.getItem("token");

/**
 * Captures a DOM element as a base64 PNG string.
 * Returns null if the element is missing or capture fails.
 */
async function captureElement(ref) {
  if (!ref?.current) return null;
  try {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const canvas = await html2canvas(ref.current, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL("image/png").split(",")[1];
  } catch (err) {
    console.warn("[useExportPatrol] captureElement failed:", err);
    return null;
  }
}

async function downloadPdf(response, filename) {
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Export failed" }));
    throw new Error(err.message || "Export failed");
  }
  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {Array}    patrols  — full patrol list from PatrolScheduling state
 * @param {function} setLoading — optional loading state setter from parent
 */
export function useExportPatrolList(patrols, setLoading) {
  const [isExporting, setIsExporting] = useState(false);

  const exportPatrolList = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setLoading?.(true);
    try {
      const response = await fetch(`${API_BASE}/patrol/export/list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ patrols }),
      });
      const dateStr = new Date().toISOString().slice(0, 10);
      await downloadPdf(response, `patrol_list_${dateStr}.pdf`);
    } catch (err) {
      console.error("[useExportPatrolList]", err);
      alert(err.message || "Failed to export patrol list");
    } finally {
      setIsExporting(false);
      setLoading?.(false);
    }
  };

  return { exportPatrolList, isExporting };
}

/**
 * @param {function} setLoading — optional loading state setter from parent
 */
export function useExportPatrolDetail(setLoading) {
  const [isExporting, setIsExporting] = useState(false);

  /**
   * @param {object} patrol  — full patrol object (same shape as from getPatrols)
   * @param {React.RefObject} mapRef — ref attached to the Mapbox map container div
   */
const exportPatrolDetail = async (patrol, mapImage = null) => {
  if (isExporting || !patrol) return;
  setIsExporting(true);
  setLoading?.(true);
  try {
    const response = await fetch(`${API_BASE}/patrol/export/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ patrol, mapImage }),
    });
    const safeName = (patrol.patrol_name || "patrol").replace(/[^a-zA-Z0-9_-]/g, "_");
    await downloadPdf(response, `patrol_${safeName}.pdf`);
  } catch (err) {
    console.error("[useExportPatrolDetail]", err);
    alert(err.message || "Failed to export patrol detail");
  } finally {
    setIsExporting(false);
    setLoading?.(false);
  }
};

  return { exportPatrolDetail, isExporting };
}