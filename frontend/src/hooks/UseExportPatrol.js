// frontend/src/hooks/useExportPatrol.js
// Two export functions:
//   exportPatrolList()          — full patrol list (active / upcoming / completed)
//   exportPatrolDetail(patrol, mapImage) — single patrol detail with map screenshot
//   previewPatrolDetail(patrol, mapImage) — returns a blob URL for preview modal

import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL;
const getToken = () => localStorage.getItem("token");

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
 * Fetches the PDF from the server and returns { blobUrl, filename, blob }.
 * Caller is responsible for revoking the blobUrl when done.
 */
async function fetchPdfBlob(endpoint, body, filename) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Export failed" }));
    throw new Error(err.message || "Export failed");
  }
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename, blob };
}

/**
 * @param {Array}    patrols   — full patrol list from PatrolScheduling state
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
  const [isExporting, setIsExporting]   = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  /**
   * Directly downloads the PDF without preview.
   * @param {object} patrol    — full patrol object
   * @param {string} mapImage  — base64 PNG of the map canvas (optional)
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

  /**
   * Fetches the PDF and returns a preview blob URL + download helper.
   * Returns null on failure.
   *
   * @param {object} patrol    — full patrol object
   * @param {string} mapImage  — base64 PNG of the map canvas (optional)
   * @returns {{ blobUrl: string, download: () => void, revoke: () => void } | null}
   */
  const previewPatrolDetail = async (patrol, mapImage = null) => {
    if (isPreviewing || !patrol) return null;
    setIsPreviewing(true);
    setLoading?.(true);
    try {
      const safeName = (patrol.patrol_name || "patrol").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename  = `patrol_${safeName}.pdf`;
      const { blobUrl, blob } = await fetchPdfBlob(
        "/patrol/export/detail",
        { patrol, mapImage },
        filename
      );

      /** Triggers the browser download from the already-fetched blob. */
      const download = () => {
        const link = document.createElement("a");
        link.href     = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      };

      /** Frees the object URL when the preview modal unmounts. */
      const revoke = () => URL.revokeObjectURL(blobUrl);

      return { blobUrl, download, revoke };
    } catch (err) {
      console.error("[useExportPatrolDetail] preview failed:", err);
      alert(err.message || "Failed to generate PDF preview");
      return null;
    } finally {
      setIsPreviewing(false);
      setLoading?.(false);
    }
  };

  return {
    exportPatrolDetail,
    isExporting,
    previewPatrolDetail,
    isPreviewing,
  };
}